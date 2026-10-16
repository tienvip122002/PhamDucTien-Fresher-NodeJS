import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1760580000000 implements MigrationInterface {
  name = 'InitSchema1760580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id"         SERIAL PRIMARY KEY,
        "sku"        varchar(64)   NOT NULL,
        "name"       varchar(255)  NOT NULL,
        "price"      numeric(12,2) NOT NULL,
        "stock"      integer       NOT NULL,
        "created_at" timestamptz   NOT NULL DEFAULT now(),
        "updated_at" timestamptz   NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "CHK_products_price_non_negative" CHECK ("price" >= 0),
        -- Last line of defence against overselling.
        CONSTRAINT "CHK_products_stock_non_negative" CHECK ("stock" >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_products_sku_active"
        ON "products" ("sku") WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE TYPE "order_status" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED')
    `);
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id"             SERIAL PRIMARY KEY,
        "customer_name"  varchar(255)   NOT NULL,
        "customer_email" varchar(255)   NOT NULL,
        "status"         "order_status" NOT NULL DEFAULT 'PENDING',
        "total_amount"   numeric(12,2)  NOT NULL,
        "failure_reason" text,
        "created_at"     timestamptz    NOT NULL DEFAULT now(),
        "updated_at"     timestamptz    NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_status_created_at" ON "orders" ("status", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id"         SERIAL PRIMARY KEY,
        "order_id"   integer       NOT NULL,
        "product_id" integer       NOT NULL,
        "quantity"   integer       NOT NULL,
        "unit_price" numeric(12,2) NOT NULL,
        CONSTRAINT "CHK_order_items_quantity_positive" CHECK ("quantity" > 0),
        CONSTRAINT "FK_order_items_order" FOREIGN KEY ("order_id")
          REFERENCES "orders" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_items_product" FOREIGN KEY ("product_id")
          REFERENCES "products" ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_order_items_order_id" ON "order_items" ("order_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "stock_movements" (
        "id"              SERIAL PRIMARY KEY,
        "product_id"      integer     NOT NULL,
        "order_id"        integer     NOT NULL,
        "quantity_change" integer     NOT NULL,
        "reason"          varchar(20) NOT NULL,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_stock_movements_order_product_reason"
          UNIQUE ("order_id", "product_id", "reason"),
        CONSTRAINT "FK_stock_movements_order" FOREIGN KEY ("order_id")
          REFERENCES "orders" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_movements_product" FOREIGN KEY ("product_id")
          REFERENCES "products" ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_stock_movements_product_id" ON "stock_movements" ("product_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_logs" (
        "id"         SERIAL PRIMARY KEY,
        "order_id"   integer     NOT NULL,
        "type"       varchar(50) NOT NULL,
        "message"    text        NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_notification_logs_order_type" UNIQUE ("order_id", "type"),
        CONSTRAINT "FK_notification_logs_order" FOREIGN KEY ("order_id")
          REFERENCES "orders" ("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notification_logs"`);
    await queryRunner.query(`DROP TABLE "stock_movements"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "order_status"`);
    await queryRunner.query(`DROP TABLE "products"`);
  }
}
