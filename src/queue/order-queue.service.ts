import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { EnvironmentVariables } from '../config/env.validation';
import {
  ORDER_PROCESSING_QUEUE,
  PROCESS_ORDER_JOB,
  ProcessOrderJobData,
  processOrderJobId,
} from './queue.constants';

const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60;

export interface OrderJobInfo {
  id: string;
  name: string;
  /** waiting | delayed | active | completed | failed | unknown */
  state: string;
  attemptsMade: number;
  maxAttempts: number;
  failedReason: string | null;
  createdAt: string;
  processedAt: string | null;
  finishedAt: string | null;
}

/** Producer side of the "order-processing" queue, used by the API. */
@Injectable()
export class OrderQueueService {
  constructor(
    @InjectQueue(ORDER_PROCESSING_QUEUE)
    private readonly queue: Queue<ProcessOrderJobData>,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async enqueueProcessOrder(orderId: number): Promise<void> {
    await this.queue.add(
      PROCESS_ORDER_JOB,
      { orderId },
      {
        jobId: processOrderJobId(orderId),
        attempts: this.config.get('ORDER_JOB_ATTEMPTS', { infer: true }),
        backoff: {
          type: 'exponential',
          delay: this.config.get('ORDER_JOB_BACKOFF_MS', { infer: true }),
        },
        // Keep finished jobs for a week so GET /orders/:id/jobs can show them.
        removeOnComplete: { age: ONE_WEEK_IN_SECONDS },
        removeOnFail: { age: ONE_WEEK_IN_SECONDS },
      },
    );
  }

  /**
   * Adds the job only if the order has none yet (e.g. Redis was down when
   * the order was placed). Returns true when a job was added.
   * Even if two callers race here, the fixed jobId keeps a single job.
   */
  async ensureProcessOrderJob(orderId: number): Promise<boolean> {
    if (await this.queue.getJob(processOrderJobId(orderId))) {
      return false;
    }
    await this.enqueueProcessOrder(orderId);
    return true;
  }

  async getProcessOrderJob(orderId: number): Promise<OrderJobInfo | null> {
    const job = await this.queue.getJob(processOrderJobId(orderId));
    if (!job) {
      return null;
    }
    const toIso = (ms?: number) => (ms ? new Date(ms).toISOString() : null);
    return {
      id: job.id ?? processOrderJobId(orderId),
      name: job.name,
      state: await job.getState(),
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
      failedReason: job.failedReason || null,
      createdAt: new Date(job.timestamp).toISOString(),
      processedAt: toIso(job.processedOn),
      finishedAt: toIso(job.finishedOn),
    };
  }
}
