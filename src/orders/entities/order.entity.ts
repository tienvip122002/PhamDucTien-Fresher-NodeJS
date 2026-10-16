import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { OrderStatus } from '../order-status.enum';
import { OrderItem } from './order-item.entity';

@Entity('orders')
// Used by the cleanup job: "PENDING orders created before X".
@Index('IDX_orders_status_created_at', ['status', 'createdAt'])
export class Order {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'customer_name', length: 255 })
  customerName!: string;

  @Column({ name: 'customer_email', length: 255 })
  customerEmail!: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    enumName: 'order_status',
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  totalAmount!: number;

  /** Why the order ended up FAILED or CANCELLED (null otherwise). */
  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  /**
   * Idempotency-Key sent by the client on POST /orders (optional).
   * Unique when present; not returned by the API.
   */
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 100,
    nullable: true,
    select: false,
  })
  idempotencyKey!: string | null;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] })
  items!: OrderItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
