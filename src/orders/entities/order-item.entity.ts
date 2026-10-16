import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { Product } from '../../products/product.entity';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'order_id' })
  orderId!: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: Order;

  @Column({ name: 'product_id' })
  productId!: number;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @Column({ type: 'int' })
  quantity!: number;

  /** Price at the moment of purchase, so later price changes don't affect the order. */
  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  unitPrice!: number;
}
