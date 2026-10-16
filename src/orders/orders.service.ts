import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Paginated, paginate } from '../common/dto/pagination.dto';
import { InventoryService, StockLine } from '../inventory/inventory.service';
import { OrderJobInfo, OrderQueueService } from '../queue/order-queue.service';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import {
  NotificationLog,
  NotificationType,
} from './entities/notification-log.entity';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { OrderStatus } from './order-status.enum';

/** How many expired orders the cleanup job handles per run. */
const CLEANUP_BATCH_SIZE = 100;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    private readonly inventory: InventoryService,
    private readonly orderQueue: OrderQueueService,
  ) {}

  /**
   * Places an order in one transaction: take stock, save the order as
   * PENDING with the price at purchase time, write the stock ledger.
   * If any product is missing or short, everything rolls back.
   *
   * The background job is enqueued only after the commit, so the worker
   * never picks up an order that could still be rolled back.
   */
  async create(dto: CreateOrderDto): Promise<Order> {
    const lines = mergeLines(dto.items);

    const orderId = await this.dataSource.transaction(async (manager) => {
      const prices = await this.inventory.take(manager, lines);

      const items = lines.map(({ productId, quantity }) =>
        manager.create(OrderItem, {
          productId,
          quantity,
          unitPrice: prices.get(productId),
        }),
      );
      const totalAmount = roundMoney(
        items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      );

      const order = await manager.save(
        manager.create(Order, {
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          status: OrderStatus.PENDING,
          totalAmount,
          items,
        }),
      );
      await this.inventory.recordTaken(manager, order.id, lines);
      return order.id;
    });

    try {
      await this.orderQueue.enqueueProcessOrder(orderId);
    } catch (error) {
      // The order itself is safely stored. If Redis is unavailable it stays
      // PENDING and the cleanup job cancels it (returning the stock) after the TTL.
      this.logger.error(
        `Could not enqueue order ${orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return this.findOne(orderId);
  }

  async findAll(query: QueryOrdersDto): Promise<Paginated<Order>> {
    const { page, limit, status } = query;
    const [data, total] = await this.orders.findAndCount({
      where: status ? { status } : {},
      relations: { items: true },
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginate(data, total, query);
  }

  /** Order with its items and their products (including soft-deleted ones). */
  async findOne(id: number): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id },
      relations: { items: { product: true } },
      withDeleted: true,
    });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  /** Cancels a PENDING or CONFIRMED order and gives its stock back. */
  async cancel(id: number): Promise<Order> {
    const cancelled = await this.closeAndReleaseStock(
      id,
      [OrderStatus.PENDING, OrderStatus.CONFIRMED],
      OrderStatus.CANCELLED,
      'Cancelled by request',
    );
    if (!cancelled) {
      const order = await this.findOne(id); // 404 if it does not exist
      throw new ConflictException({
        code: 'ORDER_NOT_CANCELLABLE',
        message: `Order ${id} is ${order.status} and can no longer be cancelled`,
      });
    }
    return this.findOne(id);
  }

  async getJobs(
    id: number,
  ): Promise<{ orderId: number; jobs: OrderJobInfo[] }> {
    if (!(await this.orders.existsBy({ id }))) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    const job = await this.orderQueue.getProcessOrderJob(id);
    return { orderId: id, jobs: job ? [job] : [] };
  }

  // ---------------------------------------------------------------------
  // Used by the queue worker. Every transition below only happens if the
  // order is still in the expected status, so running it twice (job retry,
  // duplicated job, cancel racing with the worker) has no extra effect.
  // ---------------------------------------------------------------------

  async getStatus(orderId: number): Promise<OrderStatus | null> {
    const order = await this.orders.findOne({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    return order?.status ?? null;
  }

  /** PENDING → CONFIRMED and log the confirmation "email". */
  async confirm(orderId: number): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        Order,
        { id: orderId, status: OrderStatus.PENDING },
        { status: OrderStatus.CONFIRMED },
      );
      if (!result.affected) {
        return false; // already confirmed, cancelled or failed
      }

      const order = await manager.findOneByOrFail(Order, { id: orderId });
      await manager
        .createQueryBuilder()
        .insert()
        .into(NotificationLog)
        .values({
          orderId,
          type: NotificationType.ORDER_CONFIRMED,
          message: `Confirmation email for order #${orderId} sent to ${order.customerEmail}`,
        })
        .orIgnore() // UNIQUE (order_id, type): never log the same email twice
        .execute();
      return true;
    });
  }

  /** PENDING → FAILED (all attempts used up) and give the stock back. */
  async markFailed(orderId: number, reason: string): Promise<boolean> {
    return this.closeAndReleaseStock(
      orderId,
      [OrderStatus.PENDING],
      OrderStatus.FAILED,
      reason,
    );
  }

  /** Cancels PENDING orders older than the TTL and gives their stock back. */
  async cancelExpiredPending(ttlMinutes: number): Promise<number> {
    const expired = await this.orders
      .createQueryBuilder('order')
      .select('order.id')
      .where('order.status = :status', { status: OrderStatus.PENDING })
      .andWhere('order.createdAt < now() - make_interval(mins => :ttl)', {
        ttl: ttlMinutes,
      })
      .orderBy('order.id')
      .limit(CLEANUP_BATCH_SIZE)
      .getMany();

    let cancelled = 0;
    for (const { id } of expired) {
      const done = await this.closeAndReleaseStock(
        id,
        [OrderStatus.PENDING],
        OrderStatus.CANCELLED,
        `Expired: still PENDING after ${ttlMinutes} minutes`,
      );
      if (done) {
        cancelled++;
      }
    }
    return cancelled;
  }

  /**
   * The single place where an order is closed and its stock returned.
   *
   * The status UPDATE only matches if the order is still in one of
   * `from`; Postgres locks the row, so if cancel and the worker race,
   * only one of them wins and stock is released once. The stock ledger
   * (see InventoryService.release) is a second guard on top of that.
   */
  private async closeAndReleaseStock(
    orderId: number,
    from: OrderStatus[],
    to: OrderStatus,
    reason: string,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        Order,
        { id: orderId, status: In(from) },
        { status: to, failureReason: reason },
      );
      if (!result.affected) {
        return false;
      }
      await this.inventory.release(manager, orderId);
      return true;
    });
  }
}

/** Adds up quantities when the same product appears more than once. */
function mergeLines(items: OrderItemDto[]): StockLine[] {
  const quantities = new Map<number, number>();
  for (const { productId, quantity } of items) {
    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
  }
  return [...quantities].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
