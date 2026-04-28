-- Promote coupon / promotion fields from the `attributes` JSON blob to
-- proper columns so we can index and aggregate them efficiently.

ALTER TABLE "order"
  ADD COLUMN "coupon_code" TEXT,
  ADD COLUMN "discount_description" TEXT,
  ADD COLUMN "applied_rule_ids" TEXT;

-- Backfill from the JSONB `attributes` for any historical rows that
-- already captured these fields. Cast empty strings to NULL so the
-- coupon_code index doesn't get clogged with empties.
UPDATE "order"
SET "coupon_code" = NULLIF(TRIM(BOTH FROM attributes->>'coupon_code'), '')
WHERE attributes ? 'coupon_code';

UPDATE "order"
SET "discount_description" = NULLIF(TRIM(BOTH FROM attributes->>'discount_description'), '')
WHERE attributes ? 'discount_description';

UPDATE "order"
SET "applied_rule_ids" = NULLIF(TRIM(BOTH FROM attributes->>'applied_rule_ids'), '')
WHERE attributes ? 'applied_rule_ids';

-- Partial-friendly btree on coupon_code for the /coupons aggregation.
CREATE INDEX "order_tenant_id_coupon_code_idx" ON "order"("tenant_id", "coupon_code");
