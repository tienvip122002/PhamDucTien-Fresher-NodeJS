import { Module } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [InfrastructureModule, ProductsModule, OrdersModule],
})
export class AppModule {}
