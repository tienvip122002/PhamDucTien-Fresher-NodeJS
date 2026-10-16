import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets clients retry POST /orders safely: the same Idempotency-Key header
 * always maps to the same order. Unique only when present (most callers
 * will not send it).
 */
export class AddOrderIdempotencyKey1760590000000 implements MigrationInterface {
  name = 'AddOrderIdempotencyKey1760590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "idempotency_key" varchar(100)`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_orders_idempotency_key"
        ON "orders" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_orders_idempotency_key"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "idempotency_key"`,
    );
  }
}
