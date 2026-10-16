import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { EnvironmentVariables } from '../config/env.validation';
import { OrderStatus } from '../orders/order-status.enum';
import { OrdersService } from '../orders/orders.service';
import { OrderProcessingProcessor } from './order-processing.processor';
import { PROCESS_ORDER_JOB } from './queue.constants';

describe('OrderProcessingProcessor', () => {
  const ordersService = {
    getStatus: jest.fn(),
    confirm: jest.fn(),
    markFailed: jest.fn(),
  };

  /** Processing takes 0 ms here; failureRate decides whether it fails. */
  function createProcessor(failureRate: number) {
    const values: Record<string, number> = {
      ORDER_PROCESSING_MIN_MS: 0,
      ORDER_PROCESSING_MAX_MS: 0,
      ORDER_FAILURE_RATE: failureRate,
    };
    const config = { get: (key: string) => values[key] };
    return new OrderProcessingProcessor(
      ordersService as unknown as OrdersService,
      config as unknown as ConfigService<EnvironmentVariables, true>,
    );
  }

  function job(attemptsMade: number): Job {
    return {
      id: 'order-1',
      name: PROCESS_ORDER_JOB,
      data: { orderId: 1 },
      attemptsMade,
      opts: { attempts: 3 },
    } as unknown as Job;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    ordersService.getStatus.mockResolvedValue(OrderStatus.PENDING);
  });

  it('confirms the order when processing succeeds', async () => {
    ordersService.confirm.mockResolvedValue(true);

    await expect(createProcessor(0).process(job(0))).resolves.toEqual({
      orderId: 1,
      confirmed: true,
    });
  });

  it('rethrows so BullMQ retries, without failing the order, while attempts remain', async () => {
    await expect(createProcessor(1).process(job(0))).rejects.toThrow(
      'Simulated processing error',
    );
    expect(ordersService.markFailed).not.toHaveBeenCalled();
  });

  it('marks the order FAILED (and returns stock) on the last attempt', async () => {
    await expect(createProcessor(1).process(job(2))).rejects.toThrow();
    expect(ordersService.markFailed).toHaveBeenCalledWith(
      1,
      expect.stringContaining('after 3 attempts'),
    );
  });

  it('skips orders that are no longer PENDING (e.g. cancelled while queued)', async () => {
    ordersService.getStatus.mockResolvedValue(OrderStatus.CANCELLED);

    await expect(createProcessor(0).process(job(0))).resolves.toEqual({
      orderId: 1,
      skipped: true,
      status: OrderStatus.CANCELLED,
    });
    expect(ordersService.confirm).not.toHaveBeenCalled();
  });
});
