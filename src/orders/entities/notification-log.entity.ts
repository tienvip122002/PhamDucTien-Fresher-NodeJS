import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Order } from './order.entity';

export enum NotificationType {
  ORDER_CONFIRMED = 'ORDER_CONFIRMED',
}

/**
 * Stands in for sending a real email.
 * UNIQUE (order_id, type) makes "send confirmation" idempotent:
 * a retried or duplicated job can never log the same notification twice.
 */
@Entity('notification_logs')
@Unique('UQ_notification_logs_order_type', ['orderId', 'type'])
export class NotificationLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'order_id' })
  orderId!: number;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: Order;

  @Column({ type: 'varchar', length: 50 })
  type!: NotificationType;

  @Column({ type: 'text' })
  message!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
