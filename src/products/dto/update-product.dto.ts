import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

/** Every field is optional; only the fields sent are changed. */
export class UpdateProductDto extends PartialType(CreateProductDto) {}
