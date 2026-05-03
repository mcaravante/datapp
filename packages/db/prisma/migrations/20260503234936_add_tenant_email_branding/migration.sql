-- NOTE: Same pre-existing drift lines stripped as in the email-engine
-- migration. role_section_access constraint/index renames + the
-- generated `real_revenue` DROP DEFAULT noise are unrelated and left
-- for a future dedicated cleanup migration.

-- CreateTable
CREATE TABLE "tenant_email_branding" (
    "tenant_id" UUID NOT NULL,
    "logo_media_asset_id" UUID,
    "logo_max_width_px" INTEGER NOT NULL DEFAULT 180,
    "primary_color" TEXT,
    "footer_html" TEXT,
    "sender_name" TEXT,
    "sender_address" TEXT,
    "unsubscribe_text" TEXT NOT NULL DEFAULT 'Si no querés recibir más estos emails, podés desuscribirte acá.',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_email_branding_pkey" PRIMARY KEY ("tenant_id")
);

-- AddForeignKey
ALTER TABLE "tenant_email_branding" ADD CONSTRAINT "tenant_email_branding_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_email_branding" ADD CONSTRAINT "tenant_email_branding_logo_media_asset_id_fkey" FOREIGN KEY ("logo_media_asset_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
