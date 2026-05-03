-- =====================================================================
--  Abandoned cart history + Order.magento_quote_id linkage
-- =====================================================================
--
-- Phase 1 stored only a live snapshot of currently-active abandoned
-- carts; Phase 3 needs recovery KPIs, so we keep a row for each cart
-- past 24h-idle and transition it through `open → recovered | expired
-- | purged`. Recovery is detected by joining `order.magento_quote_id`
-- against `abandoned_cart.magento_cart_id`.

-- CreateEnum
CREATE TYPE "abandoned_cart_status" AS ENUM ('open', 'recovered', 'expired', 'purged');

-- AlterTable: order — promote quote_id from JSON attributes to indexed column.
ALTER TABLE "order" ADD COLUMN "magento_quote_id" TEXT;

-- Backfill from existing payload. `attributes->>'quote_id'` returns text,
-- which matches the new column type. Rows without a quote_id stay NULL.
UPDATE "order"
   SET "magento_quote_id" = "attributes"->>'quote_id'
 WHERE "attributes" ? 'quote_id';

-- Drop quote_id from the JSON blob now that it lives in its own column,
-- so future upserts don't write the same value twice.
UPDATE "order"
   SET "attributes" = "attributes" - 'quote_id'
 WHERE "attributes" ? 'quote_id';

CREATE INDEX "order_tenant_id_magento_store_id_magento_quote_id_idx"
    ON "order"("tenant_id", "magento_store_id", "magento_quote_id");

-- AlterTable: abandoned_cart — add lifecycle columns.
ALTER TABLE "abandoned_cart"
    ADD COLUMN "abandoned_at"          TIMESTAMPTZ(6),
    ADD COLUMN "status"                "abandoned_cart_status" NOT NULL DEFAULT 'open',
    ADD COLUMN "recovered_at"          TIMESTAMPTZ(6),
    ADD COLUMN "recovered_by_order_id" UUID,
    ADD COLUMN "recovered_amount"      DECIMAL(20,4),
    ADD COLUMN "expired_at"            TIMESTAMPTZ(6);

-- Backfill: existing rows became "abandoned" the moment Magento last
-- touched them (best proxy we have without a real abandonment event).
UPDATE "abandoned_cart"
   SET "abandoned_at" = "magento_updated_at"
 WHERE "abandoned_at" IS NULL;

ALTER TABLE "abandoned_cart" ALTER COLUMN "abandoned_at" SET NOT NULL;

-- Drop the index Phase 1 used (filtering by recency) — replaced by
-- status-aware indexes below.
DROP INDEX IF EXISTS "abandoned_cart_tenant_id_magento_updated_at_idx";

CREATE INDEX "abandoned_cart_tenant_id_status_abandoned_at_idx"
    ON "abandoned_cart"("tenant_id", "status", "abandoned_at" DESC);

CREATE INDEX "abandoned_cart_tenant_id_status_recovered_at_idx"
    ON "abandoned_cart"("tenant_id", "status", "recovered_at" DESC);

ALTER TABLE "abandoned_cart"
    ADD CONSTRAINT "abandoned_cart_recovered_by_order_id_fkey"
    FOREIGN KEY ("recovered_by_order_id") REFERENCES "order"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
