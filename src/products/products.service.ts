import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Paginated, paginate } from '../common/dto/pagination.dto';
import { escapeLike } from '../common/utils/escape-like';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    await this.assertSkuAvailable(dto.sku);
    return this.products.save(this.products.create(dto));
  }

  async findAll(query: QueryProductsDto): Promise<Paginated<Product>> {
    const { page, limit, search, minPrice, maxPrice } = query;
    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      throw new BadRequestException(
        'minPrice must be less than or equal to maxPrice',
      );
    }

    // Soft-deleted products are excluded automatically.
    const qb = this.products
      .createQueryBuilder('product')
      .orderBy('product.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (search) {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${escapeLike(search)}%`,
      });
    }
    if (minPrice !== undefined) {
      qb.andWhere('product.price >= :minPrice', { minPrice });
    }
    if (maxPrice !== undefined) {
      qb.andWhere('product.price <= :maxPrice', { maxPrice });
    }

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, query);
  }

  async findOne(id: number): Promise<Product> {
    const product = await this.products.findOneBy({ id });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);
    if (dto.sku && dto.sku !== product.sku) {
      await this.assertSkuAvailable(dto.sku);
    }
    // update() only writes the columns that were sent, so editing the name
    // or price never overwrites stock that orders are changing concurrently.
    if (Object.keys(dto).length > 0) {
      await this.products.update(id, dto);
    }
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.products.softDelete(id);
  }

  private async assertSkuAvailable(sku: string): Promise<void> {
    // Fast, friendly check. The partial unique index still protects
    // against two requests creating the same SKU at the same moment.
    if (await this.products.existsBy({ sku })) {
      throw new ConflictException({
        code: 'SKU_TAKEN',
        message: `SKU ${sku} is already used by another product`,
      });
    }
  }
}
