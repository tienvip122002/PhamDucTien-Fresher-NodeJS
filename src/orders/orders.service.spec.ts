import { ConflictException, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError } from 'typeorm';
import { InventoryService } from '../inventory/inventory.service';
import { OrderQueueService } from '../queue/order-queue.service';
import { Order } from './entities/order.entity';
import { OrderStatus } from './order-status.enum';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;

  // Fake transaction: runs the callback right away with a fake EntityManager.
  const manager = {
    create: jest.fn((_entity: unknown, data: object) => ({ ...data })),
    save: jest.fn(),
    update: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn((work: (m: typeof manager) => unknown) =>
      work(manager),
    ),
  };
  const ordersRepository = { findOne: jest.fn(), existsBy: jest.fn() };
  const inventory = {
    take: jest.fn(),
    recordTaken: jest.fn(),
    release: jest.fn(),
  };
  const orderQueue = {
    enqueueProcessOrder: jest.fn(),
    getProcessOrderJob: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Order), useValue: ordersRepository },
        { provide: InventoryService, useValue: inventory },
        { provide: OrderQueueService, useValue: orderQueue },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  describe('create', () => {
    const dto = {
      customerName: 'Nguyen Van A',
      customerEmail: 'a@example.com',
      items: [
        { productId: 2, quantity: 1 },
        { productId: 1, quantity: 2 },
        { productId: 1, quantity: 1 }, // same product again: merged
      ],
    };

    it('takes stock, saves a PENDING order with unit prices, then enqueues the job', async () => {
      inventory.take.mockResolvedValue(
        new Map([
          [1, 100],
          [2, 50.5],
        ]),
      );
      manager.save.mockImplementation((order: object) =>
        Promise.resolve({ ...order, id: 42 }),
      );
      const stored = { id: 42, status: OrderStatus.PENDING } as Order;
      ordersRepository.findOne.mockResolvedValue(stored);

      const result = await service.create(dto);

      const lines = [
        { productId: 2, quantity: 1 },
        { productId: 1, quantity: 3 },
      ];
      expect(inventory.take).toHaveBeenCalledWith(manager, lines);
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.PENDING,
          totalAmount: 350.5, // 1 × 50.5 + 3 × 100
          items: [
            expect.objectContaining({
              productId: 2,
              quantity: 1,
              unitPrice: 50.5,
            }),
            expect.objectContaining({
              productId: 1,
              quantity: 3,
              unitPrice: 100,
            }),
          ],
        }),
      );
      expect(inventory.recordTaken).toHaveBeenCalledWith(manager, 42, lines);
      expect(orderQueue.enqueueProcessOrder).toHaveBeenCalledWith(42);
      // The job is only enqueued after the order has been written.
      expect(
        orderQueue.enqueueProcessOrder.mock.invocationCallOrder[0],
      ).toBeGreaterThan(inventory.recordTaken.mock.invocationCallOrder[0]);
      expect(result).toEqual({ order: stored, created: true });
    });

    it('rejects the order and enqueues nothing when stock is insufficient', async () => {
      inventory.take.mockRejectedValue(
        new ConflictException({
          code: 'INSUFFICIENT_STOCK',
          message: 'Not enough stock for product 1',
        }),
      );

      await expect(service.create(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(manager.save).not.toHaveBeenCalled();
      expect(inventory.recordTaken).not.toHaveBeenCalled();
      expect(orderQueue.enqueueProcessOrder).not.toHaveBeenCalled();
    });

    it('still returns the order when the queue is unavailable', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      inventory.take.mockResolvedValue(
        new Map([
          [1, 100],
          [2, 50.5],
        ]),
      );
      manager.save.mockImplementation((order: object) =>
        Promise.resolve({ ...order, id: 43 }),
      );
      orderQueue.enqueueProcessOrder.mockRejectedValue(new Error('Redis down'));
      ordersRepository.findOne.mockResolvedValue({ id: 43 });

      await expect(service.create(dto)).resolves.toEqual({
        order: { id: 43 },
        created: true,
      });
    });

    it('returns the existing order for a repeated Idempotency-Key without taking stock again', async () => {
      const existing = { id: 5, status: OrderStatus.PENDING } as Order;
      ordersRepository.findOne
        .mockResolvedValueOnce({ id: 5 }) // lookup by key
        .mockResolvedValueOnce(existing); // full order

      await expect(service.create(dto, 'key-123')).resolves.toEqual({
        order: existing,
        created: false,
      });
      expect(inventory.take).not.toHaveBeenCalled();
      expect(orderQueue.enqueueProcessOrder).not.toHaveBeenCalled();
    });

    it('returns the winning order when two requests with the same key race', async () => {
      const existing = { id: 6, status: OrderStatus.PENDING } as Order;
      ordersRepository.findOne
        .mockResolvedValueOnce(null) // not there yet when this request starts
        .mockResolvedValueOnce({ id: 6 }) // the other request committed first
        .mockResolvedValueOnce(existing);
      inventory.take.mockResolvedValue(
        new Map([
          [1, 100],
          [2, 50.5],
        ]),
      );
      const duplicateKey = Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'UQ_orders_idempotency_key',
      });
      manager.save.mockRejectedValue(
        new QueryFailedError('INSERT INTO "orders" ...', [], duplicateKey),
      );

      await expect(service.create(dto, 'key-123')).resolves.toEqual({
        order: existing,
        created: false,
      });
      expect(orderQueue.enqueueProcessOrder).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancels a PENDING/CONFIRMED order and returns its stock', async () => {
      manager.update.mockResolvedValue({ affected: 1 });
      ordersRepository.findOne.mockResolvedValue({
        id: 7,
        status: OrderStatus.CANCELLED,
      });

      const result = await service.cancel(7);

      expect(manager.update).toHaveBeenCalledWith(
        Order,
        { id: 7, status: In([OrderStatus.PENDING, OrderStatus.CONFIRMED]) },
        {
          status: OrderStatus.CANCELLED,
          failureReason: 'Cancelled by request',
        },
      );
      expect(inventory.release).toHaveBeenCalledWith(manager, 7);
      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('returns 409 and leaves stock alone when the order is no longer cancellable', async () => {
      manager.update.mockResolvedValue({ affected: 0 });
      ordersRepository.findOne.mockResolvedValue({
        id: 8,
        status: OrderStatus.FAILED,
      });

      await expect(service.cancel(8)).rejects.toBeInstanceOf(ConflictException);
      expect(inventory.release).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('does nothing when the order is no longer PENDING (retried or duplicated job)', async () => {
      manager.update.mockResolvedValue({ affected: 0 });

      await expect(service.confirm(9)).resolves.toBe(false);
    });
  });
});
