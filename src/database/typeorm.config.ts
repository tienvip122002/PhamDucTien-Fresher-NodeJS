import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { StockMovement } from '../inventory/stock-movement.entity';
import { NotificationLog } from '../orders/entities/notification-log.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/product.entity';

/** Shared by the Nest app and the TypeORM CLI (migrations). */
export function buildDataSourceOptions(env: {
  DATABASE_URL: string;
  DATABASE_SSL?: string;
}): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    // Managed Postgres (Neon, Supabase) requires SSL.
    ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities: [Product, Order, OrderItem, NotificationLog, StockMovement],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    // Schema changes only go through migrations.
    synchronize: false,
  };
}
