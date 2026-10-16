import { Module } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure.module';
import { OrdersModule } from './orders/orders.module';
import { CleanupScheduler } from './queue/cleanup.scheduler';
import { OrderProcessingProcessor } from './queue/order-processing.processor';
import { QueueModule } from './queue/queue.module';

/** Everything the background worker needs: no HTTP controllers. */
@Module({
  imports: [InfrastructureModule, OrdersModule, QueueModule],
  providers: [OrderProcessingProcessor, CleanupScheduler],
})
export class WorkerModule {}
