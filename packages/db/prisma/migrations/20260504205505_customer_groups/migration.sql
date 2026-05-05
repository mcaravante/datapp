-- NOTE: pre-existing drift lines (real_revenue / role_section_access)
-- stripped — same noise other recent migrations documented.

-- New table: Magento customer groups mirrored into the CDP. The Magento
-- integration token can list these via GET /V1/customerGroups/search.
CREATE TABLE "customer_group" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "magento_group_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "tax_class_id" INTEGER,
    "tax_class_name" TEXT,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "customer_group_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_group_tenant_id_magento_group_id_key"
    ON "customer_group"("tenant_id", "magento_group_id");
CREATE UNIQUE INDEX "customer_group_tenant_id_name_key"
    ON "customer_group"("tenant_id", "name");

ALTER TABLE "customer_group"
    ADD CONSTRAINT "customer_group_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New FK on customer_profile pointing at customer_group. The existing
-- `customer_group` text column stays as a denormalized cache so existing
-- queries that filter by name (and the analytics that count by string)
-- keep working unchanged. Backfill is performed in the
-- `customer-groups:sync` CLI / cron, not in this migration, because it
-- depends on first hitting Magento to populate the new table.
ALTER TABLE "customer_profile"
    ADD COLUMN "customer_group_id" UUID;

CREATE INDEX "customer_profile_tenant_id_customer_group_id_idx"
    ON "customer_profile"("tenant_id", "customer_group_id");

ALTER TABLE "customer_profile"
    ADD CONSTRAINT "customer_profile_customer_group_id_fkey"
    FOREIGN KEY ("customer_group_id") REFERENCES "customer_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
