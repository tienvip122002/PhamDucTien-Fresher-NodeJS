import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { randomInt } from 'crypto';
import { setTimeout as sleep } from 'timers/promises';
import { EnvironmentVariables } from '../config/env.validation';
import { OrderStatus } from '../orders/order-status.enum';
import { OrdersService } from '../orders/orders.service';
import {
  CLEANUP_EXPIRED_ORDERS_JOB,
  ORDER_PROCESSING_QUEUE,
  PROCESS_ORDER_JOB,
  ProcessOrderJobData,
} from './queue.constants';

/**
 * Consumer of the "order-processing" queue. Runs in the worker process.
 *
 * Retries: BullMQ re-runs a failed job with exponential backoff
 * (configured when the job is added, see OrderQueueService).
 * Idempotency: every step checks the order status first and every state
 * change is conditional, so a retried or duplicated job never confirms,
 * notifies or returns stock twice.
 */
@Processor(ORDER_PROCESSING_QUEUE)
export class OrderProcessingProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(OrderProcessingProcessor.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.get('WORKER_CONCURRENCY', {
      infer: true,
    });
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case PROCESS_ORDER_JOB:
        return this.processOrder(job as Job<ProcessOrderJobData>);
      case CLEANUP_EXPIRED_ORDERS_JOB:
        return this.cleanupExpiredOrders();
      default:
        // Retrying cannot fix an unknown job type.
        throw new UnrecoverableError(`Unknown job name: ${job.name}`);
    }
  }

  private async processOrder(job: Job<ProcessOrderJobData>) {
    const { orderId } = job.data;

    // Cancelled, already confirmed or already failed: nothing to do.
    const status = await this.ordersService.getStatus(orderId);
    if (status !== OrderStatus.PENDING) {
      return { orderId, skipped: true, status };
    }

    try {
      await this.simulateProcessing();
    } catch (error) {
      const maxAttempts = job.opts.attempts ?? 1;
      // attemptsMade counts the attempts that already failed before this one.
      if (job.attemptsMade + 1 >= maxAttempts) {
        const reason = error instanceof Error ? error.message : String(error);
        await this.ordersService.markFailed(
          orderId,
          `Processing failed after ${maxAttempts} attempts: ${reason}`,
        );
      }
      throw error; // let BullMQ record the failure and schedule the retry
    }

    const confirmed = await this.ordersService.confirm(orderId);
    return { orderId, confirmed };
  }

  /** Stands in for real work (payment check, warehouse call...): 3–5s, ~30% failures. */
  private async simulateProcessing(): Promise<void> {
    const minMs = this.config.get('ORDER_PROCESSING_MIN_MS', { infer: true });
    const maxMs = this.config.get('ORDER_PROCESSING_MAX_MS', { infer: true });
    await sleep(randomInt(minMs, maxMs + 1));

    if (
      Math.random() < this.config.get('ORDER_FAILURE_RATE', { infer: true })
    ) {
      throw new Error('Simulated processing error');
    }
  }

  private async cleanupExpiredOrders() {
    const ttl = this.config.get('PENDING_ORDER_TTL_MINUTES', { infer: true });
    const cancelled = await this.ordersService.cancelExpiredPending(ttl);
    if (cancelled > 0) {
      this.logger.log(`Cancelled ${cancelled} expired PENDING order(s)`);
    }
    return { cancelled };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    if (job.name === PROCESS_ORDER_JOB) {
      this.logger.log(
        `Job ${job.id} completed: ${JSON.stringify(job.returnvalue)}`,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    if (!job) {
      return;
    }
    const maxAttempts = job.opts.attempts ?? 1;
    const willRetry = job.attemptsMade < maxAttempts;
    this.logger.warn(
      `Job ${job.id} attempt ${job.attemptsMade}/${maxAttempts} failed: ${error.message}` +
        (willRetry ? ' (will retry)' : ' (no more retries)'),
    );
  }
}
