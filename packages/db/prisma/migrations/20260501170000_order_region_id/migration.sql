-- =====================================================================
--  Order.region_id — denormalized for fast geo-filtered queries
-- =====================================================================
--
-- Until now the shipping province was buried inside `shipping_address`
-- JSON. Filtering /orders by province (or any geo-aware report) had to
-- scan the column. Promote it to an indexed FK so we can serve
-- /orders?region=… cheaply and unlock per-province RFM/top-products
-- analytics in later iterations.
--
-- The column is added empty here; the alias-aware backfill is run as a
-- one-shot CLI (`pnpm --filter @datapp/api cli orders:backfill-region`)
-- so historic rows go through the same RegionResolverService that
-- sync uses.

ALTER TABLE "order" ADD COLUMN "region_id" INTEGER;

ALTER TABLE "order"
    ADD CONSTRAINT "order_region_id_fkey"
    FOREIGN KEY ("region_id") REFERENCES "region"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "order_tenant_id_region_id_placed_at_idx"
    ON "order"("tenant_id", "region_id", "placed_at" DESC);
