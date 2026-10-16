import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { StockMovement, StockMovementReason } from './stock-movement.entity';

export interface StockLine {
  productId: number;
  quantity: number;
}

/**
 * All stock changes go through here. Every method runs inside the
 * caller's transaction (it receives the transaction's EntityManager),
 * so stock and order status always change together or not at all.
 */
@Injectable()
export class InventoryService {
  /**
   * Takes stock for each line and returns the current price of each product.
   *
   * Overselling is prevented by a conditional update:
   *   UPDATE ... SET stock = stock - qty WHERE id = ? AND stock >= qty
   * Postgres locks the row while updating, so when two orders race for the
   * last item, the second UPDATE re-checks `stock >= qty` after the first
   * commits, matches 0 rows, and that order is rejected.
   *
   * Lines are processed in productId order so that two orders touching the
   * same products always lock them in the same order (no deadlocks).
   */
  async take(
    manager: EntityManager,
    lines: StockLine[],
  ): Promise<Map<number, number>> {
    const prices = new Map<number, number>();
    const sorted = [...lines].sort((a, b) => a.productId - b.productId);

    for (const { productId, quantity } of sorted) {
      const rows: { price: string }[] = await manager.query(
        `UPDATE products
            SET stock = stock - $2, updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL AND stock >= $2
          RETURNING price`,
        [productId, quantity],
      );
      if (rows.length === 0) {
        await this.throwStockError(manager, productId, quantity);
      }
      prices.set(productId, Number(rows[0].price));
    }
    return prices;
  }

  /** Writes the ORDER_PLACED ledger rows once the order has an id. */
  async recordTaken(
    manager: EntityManager,
    orderId: number,
    lines: StockLine[],
  ): Promise<void> {
    await manager.insert(
      StockMovement,
      lines.map((line) => ({
        orderId,
        productId: line.productId,
        quantityChange: -line.quantity,
        reason: StockMovementReason.ORDER_PLACED,
      })),
    );
  }

  /**
   * Gives back the stock of every item in the order — at most once.
   *
   * The INSERT into the ledger skips rows that already exist
   * (UNIQUE order_id + product_id + reason), and only the rows actually
   * inserted are added back to products.stock. Calling this twice for the
   * same order changes nothing the second time.
   */
  async release(manager: EntityManager, orderId: number): Promise<void> {
    await manager.query(
      `WITH released AS (
         INSERT INTO stock_movements (product_id, order_id, quantity_change, reason)
         SELECT product_id, order_id, quantity, $2
           FROM order_items
          WHERE order_id = $1
         ON CONFLICT (order_id, product_id, reason) DO NOTHING
         RETURNING product_id, quantity_change
       )
       UPDATE products p
          SET stock = p.stock + r.quantity_change, updated_at = now()
         FROM released r
        WHERE p.id = r.product_id`,
      [orderId, StockMovementReason.ORDER_RELEASED],
    );
  }

  /** Explains why take() failed: product missing or not enough stock. */
  private async throwStockError(
    manager: EntityManager,
    productId: number,
    requested: number,
  ): Promise<never> {
    const rows: { stock: number }[] = await manager.query(
      `SELECT stock FROM products WHERE id = $1 AND deleted_at IS NULL`,
      [productId],
    );
    if (rows.length === 0) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: `Product ${productId} not found`,
      });
    }
    throw new ConflictException({
      code: 'INSUFFICIENT_STOCK',
      message: `Not enough stock for product ${productId}: requested ${requested}, available ${rows[0].stock}`,
    });
  }
}
