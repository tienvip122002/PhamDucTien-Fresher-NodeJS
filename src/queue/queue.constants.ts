export const ORDER_PROCESSING_QUEUE = 'order-processing';

export const PROCESS_ORDER_JOB = 'process-order';
export const CLEANUP_EXPIRED_ORDERS_JOB = 'cleanup-expired-orders';

export interface ProcessOrderJobData {
  orderId: number;
}

/**
 * One job per order. BullMQ ignores `add()` when a job with the same id
 * already exists, so a duplicated enqueue cannot process an order twice.
 */
export const processOrderJobId = (orderId: number) => `order-${orderId}`;
