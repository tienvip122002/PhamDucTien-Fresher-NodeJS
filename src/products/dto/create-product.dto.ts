import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProductDto {
  /**
   * Stock keeping unit, unique among active products. Stored in upper case.
   * @example "TSHIRT-RED-M"
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'sku may only contain letters, digits, "-" and "_"',
  })
  sku!: string;

  /** @example "Red T-shirt (M)" */
  @Transform(trim)
  @IsString()
  @Length(1, 255)
  name!: string;

  /** @example 199000 */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999.99)
  price!: number;

  /** @example 10 */
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock!: number;
}
