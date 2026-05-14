-- AlterTable
ALTER TABLE "order_item" ADD COLUMN     "added_from" TEXT,
ADD COLUMN     "source_product_id" INTEGER,
ADD COLUMN     "source_product_sku" TEXT;

-- CreateIndex
CREATE INDEX "order_item_tenant_id_added_from_idx" ON "order_item"("tenant_id", "added_from");
