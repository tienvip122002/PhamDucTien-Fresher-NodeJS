import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { EnvironmentVariables } from '../config/env.validation';
import {
  CLEANUP_EXPIRED_ORDERS_JOB,
  ORDER_PROCESSING_QUEUE,
} from './queue.constants';

/**
 * Registers the repeatable cleanup job (every 5 minutes by default).
 * upsertJobScheduler is idempotent: restarting the worker or running
 * several workers keeps a single schedule in Redis.
 */
@Injectable()
export class CleanupScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(ORDER_PROCESSING_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      CLEANUP_EXPIRED_ORDERS_JOB,
      { every: this.config.get('CLEANUP_INTERVAL_MS', { infer: true }) },
      {
        name: CLEANUP_EXPIRED_ORDERS_JOB,
        opts: { removeOnComplete: 50, removeOnFail: 50 },
      },
    );
  }
}
