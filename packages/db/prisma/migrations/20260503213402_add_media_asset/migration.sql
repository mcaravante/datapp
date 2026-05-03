-- NOTE: Prisma's auto-generated diff also produced three pre-existing
-- drift lines unrelated to this migration:
--   ALTER TABLE "order" ALTER COLUMN "real_revenue" DROP DEFAULT;
--   ALTER TABLE "role_section_access" ALTER COLUMN "updated_at" DROP DEFAULT;
--   ALTER TABLE "role_section_access" RENAME CONSTRAINT ...
--   ALTER INDEX "role_section_access_tenant_role_idx" RENAME ...
-- Removed (same drift the email-engine migration documented).

-- CreateTable
CREATE TABLE "media_asset" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_asset_tenant_id_created_at_idx" ON "media_asset"("tenant_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
