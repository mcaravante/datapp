-- CreateEnum
CREATE TYPE "email_template_channel" AS ENUM ('abandoned_cart', 'transactional', 'marketing');

-- CreateEnum
CREATE TYPE "email_campaign_status" AS ENUM ('draft', 'active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "email_campaign_trigger" AS ENUM ('abandoned_cart_stage');

-- CreateEnum
CREATE TYPE "coupon_mode" AS ENUM ('none', 'static', 'unique');

-- CreateEnum
CREATE TYPE "email_send_status" AS ENUM ('pending', 'queued', 'delivered', 'bounced', 'complained', 'failed', 'suppressed', 'cancelled');

-- CreateEnum
CREATE TYPE "email_event_type" AS ENUM ('delivered', 'delivery_delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed', 'unsubscribed');

-- CreateEnum
CREATE TYPE "suppression_reason" AS ENUM ('manual', 'hard_bounce', 'spam_complaint', 'unsubscribed', 'invalid_address', 'test_allowlist');

-- AlterTable
ALTER TABLE "abandoned_cart" ADD COLUMN     "magento_masked_quote_id" VARCHAR(32);

-- NOTE: Prisma's auto-generated diff also produced three pre-existing drift
-- lines unrelated to this migration:
--   ALTER TABLE "order" ALTER COLUMN "real_revenue" DROP DEFAULT;
--   ALTER TABLE "role_section_access" ALTER COLUMN "updated_at" DROP DEFAULT;
--   ALTER TABLE "role_section_access" RENAME CONSTRAINT "role_section_access_tenant_fk" TO "role_section_access_tenant_id_fkey";
--   ALTER INDEX "role_section_access_tenant_role_idx" RENAME TO "role_section_access_tenant_id_role_idx";
-- The first one fails outright (`real_revenue` is GENERATED ALWAYS and has
-- no DEFAULT to drop — same drift the 20260426165126 migration documented).
-- The other three are noise from Prisma vs hand-written SQL naming
-- conventions on `role_section_access`. They're left for a future dedicated
-- cleanup migration so this diff stays focused on the email engine.

-- CreateTable
CREATE TABLE "email_template" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "channel" "email_template_channel" NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "body_text" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "format" TEXT NOT NULL DEFAULT 'mjml',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "email_campaign_trigger" NOT NULL DEFAULT 'abandoned_cart_stage',
    "status" "email_campaign_status" NOT NULL DEFAULT 'draft',
    "from_email" TEXT,
    "reply_to_email" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_stage" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "delay_hours" INTEGER NOT NULL,
    "coupon_mode" "coupon_mode" NOT NULL DEFAULT 'none',
    "coupon_static_code" TEXT,
    "magento_sales_rule_id" INTEGER,
    "coupon_discount" DECIMAL(20,4),
    "coupon_discount_type" TEXT,
    "coupon_ttl_hours" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_campaign_stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_send" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "abandoned_cart_id" UUID,
    "customer_profile_id" UUID,
    "to_email" TEXT NOT NULL,
    "to_email_hash" CHAR(64) NOT NULL,
    "from_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "resend_message_id" TEXT,
    "status" "email_send_status" NOT NULL DEFAULT 'pending',
    "last_event_type" "email_event_type",
    "last_event_at" TIMESTAMPTZ(6),
    "coupon_code" TEXT,
    "coupon_source" "coupon_mode",
    "magento_sales_rule_id" INTEGER,
    "recovery_url" TEXT NOT NULL,
    "render_context" JSONB NOT NULL DEFAULT '{}',
    "error_message" TEXT,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_send_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_event" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email_send_id" UUID NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" "email_event_type" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_suppression" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email_hash" CHAR(64) NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "suppression_reason" NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_suppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_template_tenant_id_channel_is_active_idx" ON "email_template"("tenant_id", "channel", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "email_template_tenant_id_slug_key" ON "email_template"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "email_campaign_tenant_id_status_idx" ON "email_campaign"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "email_campaign_tenant_id_slug_key" ON "email_campaign"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "email_campaign_stage_tenant_id_is_active_delay_hours_idx" ON "email_campaign_stage"("tenant_id", "is_active", "delay_hours");

-- CreateIndex
CREATE UNIQUE INDEX "email_campaign_stage_campaign_id_position_key" ON "email_campaign_stage"("campaign_id", "position");

-- CreateIndex
CREATE INDEX "email_send_tenant_id_status_scheduled_for_idx" ON "email_send"("tenant_id", "status", "scheduled_for");

-- CreateIndex
CREATE INDEX "email_send_tenant_id_abandoned_cart_id_stage_id_idx" ON "email_send"("tenant_id", "abandoned_cart_id", "stage_id");

-- CreateIndex
CREATE INDEX "email_send_tenant_id_to_email_hash_created_at_idx" ON "email_send"("tenant_id", "to_email_hash", "created_at" DESC);

-- CreateIndex
CREATE INDEX "email_send_tenant_id_resend_message_id_idx" ON "email_send"("tenant_id", "resend_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_send_tenant_id_idempotency_key_key" ON "email_send"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "email_event_tenant_id_event_type_occurred_at_idx" ON "email_event"("tenant_id", "event_type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "email_event_email_send_id_occurred_at_idx" ON "email_event"("email_send_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_event_tenant_id_provider_event_id_key" ON "email_event"("tenant_id", "provider_event_id");

-- CreateIndex
CREATE INDEX "email_suppression_tenant_id_reason_idx" ON "email_suppression"("tenant_id", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "email_suppression_tenant_id_email_hash_key" ON "email_suppression"("tenant_id", "email_hash");

-- CreateIndex
CREATE INDEX "abandoned_cart_tenant_id_magento_masked_quote_id_idx" ON "abandoned_cart"("tenant_id", "magento_masked_quote_id");

-- AddForeignKey
ALTER TABLE "email_template" ADD CONSTRAINT "email_template_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign" ADD CONSTRAINT "email_campaign_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_stage" ADD CONSTRAINT "email_campaign_stage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_stage" ADD CONSTRAINT "email_campaign_stage_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_stage" ADD CONSTRAINT "email_campaign_stage_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send" ADD CONSTRAINT "email_send_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send" ADD CONSTRAINT "email_send_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send" ADD CONSTRAINT "email_send_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "email_campaign_stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send" ADD CONSTRAINT "email_send_abandoned_cart_id_fkey" FOREIGN KEY ("abandoned_cart_id") REFERENCES "abandoned_cart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_send" ADD CONSTRAINT "email_send_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_email_send_id_fkey" FOREIGN KEY ("email_send_id") REFERENCES "email_send"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_suppression" ADD CONSTRAINT "email_suppression_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
