import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { OrderQueueService } from './order-queue.service';
import { ORDER_PROCESSING_QUEUE } from './queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: ORDER_PROCESSING_QUEUE })],
  providers: [OrderQueueService],
  exports: [BullModule, OrderQueueService],
})
export class QueueModule {}
