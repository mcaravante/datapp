-- CreateTable
CREATE TABLE "abandoned_cart" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "magento_store_id" UUID NOT NULL,
    "magento_cart_id" INTEGER NOT NULL,
    "customer_profile_id" UUID,
    "magento_customer_id" TEXT,
    "customer_email" TEXT,
    "customer_name" TEXT,
    "is_guest" BOOLEAN NOT NULL,
    "items_count" INTEGER NOT NULL,
    "items_qty" INTEGER NOT NULL,
    "subtotal" DECIMAL(20,4) NOT NULL,
    "grand_total" DECIMAL(20,4) NOT NULL,
    "currency_code" CHAR(3),
    "magento_created_at" TIMESTAMPTZ(6) NOT NULL,
    "magento_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abandoned_cart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "abandoned_cart_tenant_id_magento_store_id_magento_cart_id_key"
    ON "abandoned_cart"("tenant_id", "magento_store_id", "magento_cart_id");

-- CreateIndex
CREATE INDEX "abandoned_cart_tenant_id_magento_updated_at_idx"
    ON "abandoned_cart"("tenant_id", "magento_updated_at" DESC);

-- CreateIndex
CREATE INDEX "abandoned_cart_tenant_id_customer_profile_id_idx"
    ON "abandoned_cart"("tenant_id", "customer_profile_id");

-- AddForeignKey
ALTER TABLE "abandoned_cart" ADD CONSTRAINT "abandoned_cart_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abandoned_cart" ADD CONSTRAINT "abandoned_cart_magento_store_id_fkey"
    FOREIGN KEY ("magento_store_id") REFERENCES "magento_store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abandoned_cart" ADD CONSTRAINT "abandoned_cart_customer_profile_id_fkey"
    FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
