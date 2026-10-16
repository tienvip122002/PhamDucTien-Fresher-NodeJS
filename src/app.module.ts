import { Module } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [InfrastructureModule, ProductsModule],
})
export class AppModule {}
