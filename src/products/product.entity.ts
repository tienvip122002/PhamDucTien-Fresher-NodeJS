import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../common/transformers/decimal.transformer';

@Entity('products')
// SKU is unique among products that are not soft-deleted,
// so a deleted product's SKU can be reused.
@Index('UQ_products_sku_active', ['sku'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class Product {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 64 })
  sku!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  price!: number;

  /** Never negative: guarded by a CHECK constraint in the database. */
  @Column({ type: 'int' })
  stock!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
