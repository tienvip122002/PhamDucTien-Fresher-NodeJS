import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum StockMovementReason {
  /** Stock taken when the order is placed. */
  ORDER_PLACED = 'ORDER_PLACED',
  /** Stock given back when the order is cancelled, failed or expired. */
  ORDER_RELEASED = 'ORDER_RELEASED',
}

/**
 * Stock ledger: one row per stock change caused by an order
 * (similar to "reservations" in Magento MSI).
 *
 * UNIQUE (order_id, product_id, reason) is the safety net that makes
 * releasing stock idempotent: the same order can only be released once,
 * no matter how many times cancel / fail / cleanup run.
 */
@Entity('stock_movements')
@Unique('UQ_stock_movements_order_product_reason', [
  'orderId',
  'productId',
  'reason',
])
export class StockMovement {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'product_id' })
  productId!: number;

  @Column({ name: 'order_id' })
  orderId!: number;

  /** Negative when stock is taken, positive when it is given back. */
  @Column({ name: 'quantity_change', type: 'int' })
  quantityChange!: number;

  @Column({ type: 'varchar', length: 20 })
  reason!: StockMovementReason;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
