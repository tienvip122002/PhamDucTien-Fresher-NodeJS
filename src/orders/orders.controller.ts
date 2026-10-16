import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Paginated } from '../common/dto/pagination.dto';
import { OrderJobInfo } from '../queue/order-queue.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { Order } from './entities/order.entity';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Places an order (status PENDING) and queues it for processing.
   * 409 INSUFFICIENT_STOCK if any product does not have enough stock.
   */
  @Post()
  create(@Body() dto: CreateOrderDto): Promise<Order> {
    return this.ordersService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryOrdersDto): Promise<Paginated<Order>> {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Order> {
    return this.ordersService.findOne(id);
  }

  /** Only PENDING or CONFIRMED orders can be cancelled; stock is returned. */
  @Patch(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number): Promise<Order> {
    return this.ordersService.cancel(id);
  }

  /** State of the background job for this order: attempts, last error... */
  @Get(':id/jobs')
  getJobs(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ orderId: number; jobs: OrderJobInfo[] }> {
    return this.ordersService.getJobs(id);
  }
}
