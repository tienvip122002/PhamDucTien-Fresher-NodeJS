import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { EnvironmentVariables } from '../config/env.validation';
import { OrderQueueService } from './order-queue.service';
import { ProcessOrderJobData } from './queue.constants';

describe('OrderQueueService.ensureProcessOrderJob', () => {
  const queue = { getJob: jest.fn(), add: jest.fn() };
  const config = {
    get: (key: string) =>
      ({ ORDER_JOB_ATTEMPTS: 3, ORDER_JOB_BACKOFF_MS: 1000 })[key],
  };
  const service = new OrderQueueService(
    queue as unknown as Queue<ProcessOrderJobData>,
    config as unknown as ConfigService<EnvironmentVariables, true>,
  );

  beforeEach(() => jest.clearAllMocks());

  it('does not add a second job when the order already has one', async () => {
    queue.getJob.mockResolvedValue({ id: 'order-7' });

    await expect(service.ensureProcessOrderJob(7)).resolves.toBe(false);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('adds the job (same fixed jobId, retry settings) when it is missing', async () => {
    queue.getJob.mockResolvedValue(undefined);

    await expect(service.ensureProcessOrderJob(7)).resolves.toBe(true);
    expect(queue.add).toHaveBeenCalledWith(
      'process-order',
      { orderId: 7 },
      expect.objectContaining({
        jobId: 'order-7',
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    );
  });
});
