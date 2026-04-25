-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'admin', 'analyst', 'viewer');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('billing', 'shipping', 'both');

-- CreateEnum
CREATE TYPE "SegmentType" AS ENUM ('static', 'dynamic');

-- CreateEnum
CREATE TYPE "RfmSegmentLabel" AS ENUM ('champions', 'loyal', 'potential_loyalists', 'new_customers', 'promising', 'needing_attention', 'about_to_sleep', 'at_risk', 'cannot_lose_them', 'hibernating', 'lost');

-- CreateEnum
CREATE TYPE "SyncEntity" AS ENUM ('customers', 'orders', 'products', 'categories', 'newsletter');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('idle', 'running', 'error', 'paused');

-- CreateEnum
CREATE TYPE "SyncEventStatus" AS ENUM ('pending', 'processed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "SyncEventType" AS ENUM ('customer.created', 'customer.updated', 'customer.deleted', 'order.created', 'order.updated', 'order.invoiced', 'order.refunded', 'order.shipped', 'product.created', 'product.updated', 'newsletter.subscribed', 'newsletter.unsubscribed');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('subscribed', 'unsubscribed', 'pending', 'complained', 'bounced');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete', 'login', 'logout', 'export', 'erase');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('enabled', 'disabled');

-- CreateEnum
CREATE TYPE "ProductVisibility" AS ENUM ('not_visible', 'catalog', 'search', 'catalog_search');

-- CreateTable
CREATE TABLE "tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'viewer',
    "totp_secret_id" UUID,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_totp_secret" (
    "id" UUID NOT NULL,
    "secret_encrypted" BYTEA NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_totp_secret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magento_store" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "admin_token_encrypted" BYTEA NOT NULL,
    "hmac_secret_encrypted" BYTEA NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ARS',
    "default_country" CHAR(2) NOT NULL DEFAULT 'AR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "magento_store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "magento_store_id" UUID NOT NULL,
    "entity" "SyncEntity" NOT NULL,
    "last_processed_event_id" UUID,
    "last_processed_at" TIMESTAMPTZ(6),
    "cursor" TEXT,
    "status" "SyncStatus" NOT NULL DEFAULT 'idle',
    "last_error" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_event_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "magento_store_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_type" "SyncEventType" NOT NULL,
    "magento_entity_id" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "status" "SyncEventStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "payload_hash" CHAR(64) NOT NULL,

    CONSTRAINT "sync_event_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profile" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "magento_customer_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_hash" CHAR(64) NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "dob" DATE,
    "gender" TEXT,
    "customer_group" TEXT,
    "magento_created_at" TIMESTAMPTZ(6),
    "magento_updated_at" TIMESTAMPTZ(6),
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "anonymous_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_subscribed" BOOLEAN NOT NULL DEFAULT false,
    "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'unsubscribed',
    "subscription_consent_at" TIMESTAMPTZ(6),
    "subscription_consent_source" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_address" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "type" "AddressType" NOT NULL,
    "is_default_billing" BOOLEAN NOT NULL DEFAULT false,
    "is_default_shipping" BOOLEAN NOT NULL DEFAULT false,
    "first_name" TEXT,
    "last_name" TEXT,
    "company" TEXT,
    "street1" TEXT,
    "street2" TEXT,
    "city" TEXT,
    "region_id" INTEGER,
    "region_raw" TEXT,
    "postal_code" TEXT,
    "country_code" CHAR(2) NOT NULL DEFAULT 'AR',
    "phone" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_segment" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL DEFAULT '{}',
    "type" "SegmentType" NOT NULL DEFAULT 'static',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_segment_member" (
    "segment_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_segment_member_pkey" PRIMARY KEY ("segment_id","customer_profile_id")
);

-- CreateTable
CREATE TABLE "rfm_score" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "recency_days" INTEGER NOT NULL,
    "frequency" INTEGER NOT NULL,
    "monetary" DECIMAL(20,4) NOT NULL,
    "recency_score" SMALLINT NOT NULL,
    "frequency_score" SMALLINT NOT NULL,
    "monetary_score" SMALLINT NOT NULL,
    "segment" "RfmSegmentLabel" NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfm_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfm_score_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "snapshot_month" DATE NOT NULL,
    "recency_days" INTEGER NOT NULL,
    "frequency" INTEGER NOT NULL,
    "monetary" DECIMAL(20,4) NOT NULL,
    "recency_score" SMALLINT NOT NULL,
    "frequency_score" SMALLINT NOT NULL,
    "monetary_score" SMALLINT NOT NULL,
    "segment" "RfmSegmentLabel" NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfm_score_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "magento_store_id" UUID NOT NULL,
    "magento_order_id" TEXT NOT NULL,
    "magento_order_number" TEXT NOT NULL,
    "customer_profile_id" UUID,
    "customer_email" TEXT NOT NULL,
    "customer_email_hash" CHAR(64) NOT NULL,
    "status" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(20,4) NOT NULL,
    "total_tax" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "shipping_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(20,4) NOT NULL,
    "total_invoiced" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total_refunded" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total_paid" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total_shipped" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "real_revenue" DECIMAL(20,4),
    "billing_address" JSONB NOT NULL DEFAULT '{}',
    "shipping_address" JSONB NOT NULL DEFAULT '{}',
    "payment_method" TEXT,
    "shipping_method" TEXT,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "sku_count" INTEGER NOT NULL DEFAULT 0,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "placed_at" TIMESTAMPTZ(6) NOT NULL,
    "magento_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "magento_order_item_id" TEXT NOT NULL,
    "product_id" UUID,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty_ordered" DECIMAL(20,4) NOT NULL,
    "qty_invoiced" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "qty_refunded" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "qty_shipped" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "price" DECIMAL(20,4) NOT NULL,
    "discount_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "row_total" DECIMAL(20,4) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "state" TEXT,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "magento_product_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'simple',
    "status" "ProductStatus" NOT NULL DEFAULT 'enabled',
    "visibility" "ProductVisibility" NOT NULL DEFAULT 'catalog_search',
    "price" DECIMAL(20,4),
    "special_price" DECIMAL(20,4),
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "main_image_url" TEXT,
    "magento_updated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_category" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "magento_category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT[],
    "parent_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_category_membership" (
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "position" INTEGER,

    CONSTRAINT "product_category_membership_pkey" PRIMARY KEY ("product_id","category_id")
);

-- CreateTable
CREATE TABLE "region" (
    "id" SERIAL NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geo_unmatched" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "region_raw" TEXT,
    "city_raw" TEXT,
    "postal_code" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geo_unmatched_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "anonymous_id" TEXT NOT NULL,
    "customer_profile_id" UUID,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attributes" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_event" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "customer_profile_id" UUID,
    "event_type" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submission" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "visitor_id" UUID,
    "customer_profile_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_list" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "marketing_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "list_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'subscribed',
    "consent_at" TIMESTAMPTZ(6),
    "consent_source" TEXT,
    "consent_ip" TEXT,
    "unsubscribed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_slug_key" ON "tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_totp_secret_id_key" ON "user"("totp_secret_id");

-- CreateIndex
CREATE INDEX "user_tenant_id_role_idx" ON "user"("tenant_id", "role");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_at_idx" ON "audit_log"("tenant_id", "at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_entity_entity_id_idx" ON "audit_log"("tenant_id", "entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_user_id_at_idx" ON "audit_log"("tenant_id", "user_id", "at" DESC);

-- CreateIndex
CREATE INDEX "magento_store_tenant_id_is_active_idx" ON "magento_store"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "magento_store_tenant_id_name_key" ON "magento_store"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "sync_state_tenant_id_status_idx" ON "sync_state"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sync_state_tenant_id_magento_store_id_entity_key" ON "sync_state"("tenant_id", "magento_store_id", "entity");

-- CreateIndex
CREATE UNIQUE INDEX "sync_event_log_event_id_key" ON "sync_event_log"("event_id");

-- CreateIndex
CREATE INDEX "sync_event_log_tenant_id_event_type_received_at_idx" ON "sync_event_log"("tenant_id", "event_type", "received_at" DESC);

-- CreateIndex
CREATE INDEX "sync_event_log_tenant_id_magento_entity_id_idx" ON "sync_event_log"("tenant_id", "magento_entity_id");

-- CreateIndex
CREATE INDEX "sync_event_log_received_at_idx" ON "sync_event_log"("received_at");

-- CreateIndex
CREATE INDEX "customer_profile_tenant_id_email_hash_idx" ON "customer_profile"("tenant_id", "email_hash");

-- CreateIndex
CREATE INDEX "customer_profile_tenant_id_email_idx" ON "customer_profile"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "customer_profile_tenant_id_customer_group_idx" ON "customer_profile"("tenant_id", "customer_group");

-- CreateIndex
CREATE INDEX "customer_profile_tenant_id_magento_updated_at_idx" ON "customer_profile"("tenant_id", "magento_updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "customer_profile_tenant_id_magento_customer_id_key" ON "customer_profile"("tenant_id", "magento_customer_id");

-- CreateIndex
CREATE INDEX "customer_address_tenant_id_customer_profile_id_idx" ON "customer_address"("tenant_id", "customer_profile_id");

-- CreateIndex
CREATE INDEX "customer_address_tenant_id_region_id_idx" ON "customer_address"("tenant_id", "region_id");

-- CreateIndex
CREATE INDEX "customer_address_tenant_id_postal_code_idx" ON "customer_address"("tenant_id", "postal_code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_segment_tenant_id_name_key" ON "customer_segment"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "customer_segment_member_customer_profile_id_idx" ON "customer_segment_member"("customer_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfm_score_customer_profile_id_key" ON "rfm_score"("customer_profile_id");

-- CreateIndex
CREATE INDEX "rfm_score_tenant_id_segment_idx" ON "rfm_score"("tenant_id", "segment");

-- CreateIndex
CREATE INDEX "rfm_score_tenant_id_calculated_at_idx" ON "rfm_score"("tenant_id", "calculated_at" DESC);

-- CreateIndex
CREATE INDEX "rfm_score_history_tenant_id_snapshot_month_idx" ON "rfm_score_history"("tenant_id", "snapshot_month");

-- CreateIndex
CREATE UNIQUE INDEX "rfm_score_history_tenant_id_customer_profile_id_snapshot_mo_key" ON "rfm_score_history"("tenant_id", "customer_profile_id", "snapshot_month");

-- CreateIndex
CREATE INDEX "order_tenant_id_customer_profile_id_idx" ON "order"("tenant_id", "customer_profile_id");

-- CreateIndex
CREATE INDEX "order_tenant_id_customer_email_hash_idx" ON "order"("tenant_id", "customer_email_hash");

-- CreateIndex
CREATE INDEX "order_tenant_id_placed_at_idx" ON "order"("tenant_id", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "order_tenant_id_status_idx" ON "order"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "order_tenant_id_magento_updated_at_idx" ON "order"("tenant_id", "magento_updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "order_tenant_id_magento_store_id_magento_order_id_key" ON "order"("tenant_id", "magento_store_id", "magento_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_tenant_id_magento_order_number_key" ON "order"("tenant_id", "magento_order_number");

-- CreateIndex
CREATE INDEX "order_item_tenant_id_sku_idx" ON "order_item"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "order_item_tenant_id_product_id_idx" ON "order_item"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_item_order_id_magento_order_item_id_key" ON "order_item"("order_id", "magento_order_item_id");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "product_tenant_id_status_visibility_idx" ON "product"("tenant_id", "status", "visibility");

-- CreateIndex
CREATE INDEX "product_tenant_id_magento_updated_at_idx" ON "product"("tenant_id", "magento_updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "product_tenant_id_sku_key" ON "product"("tenant_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_tenant_id_magento_product_id_key" ON "product"("tenant_id", "magento_product_id");

-- CreateIndex
CREATE INDEX "product_category_tenant_id_parent_id_idx" ON "product_category"("tenant_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_category_tenant_id_magento_category_id_key" ON "product_category"("tenant_id", "magento_category_id");

-- CreateIndex
CREATE INDEX "product_category_membership_category_id_idx" ON "product_category_membership"("category_id");

-- CreateIndex
CREATE INDEX "region_country_code_name_idx" ON "region"("country_code", "name");

-- CreateIndex
CREATE UNIQUE INDEX "region_country_code_code_key" ON "region"("country_code", "code");

-- CreateIndex
CREATE INDEX "geo_unmatched_tenant_id_last_seen_at_idx" ON "geo_unmatched"("tenant_id", "last_seen_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "geo_unmatched_tenant_id_region_raw_city_raw_postal_code_key" ON "geo_unmatched"("tenant_id", "region_raw", "city_raw", "postal_code");

-- CreateIndex
CREATE INDEX "visitor_tenant_id_customer_profile_id_idx" ON "visitor"("tenant_id", "customer_profile_id");

-- CreateIndex
CREATE INDEX "visitor_tenant_id_last_seen_at_idx" ON "visitor"("tenant_id", "last_seen_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "visitor_tenant_id_anonymous_id_key" ON "visitor"("tenant_id", "anonymous_id");

-- CreateIndex
CREATE INDEX "web_event_tenant_id_occurred_at_idx" ON "web_event"("tenant_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "web_event_tenant_id_event_type_occurred_at_idx" ON "web_event"("tenant_id", "event_type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "web_event_tenant_id_customer_profile_id_occurred_at_idx" ON "web_event"("tenant_id", "customer_profile_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "form_tenant_id_name_key" ON "form"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "form_submission_tenant_id_form_id_submitted_at_idx" ON "form_submission"("tenant_id", "form_id", "submitted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "marketing_list_tenant_id_name_key" ON "marketing_list"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "subscription_tenant_id_status_idx" ON "subscription"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "subscription_tenant_id_list_id_idx" ON "subscription"("tenant_id", "list_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_customer_profile_id_list_id_key" ON "subscription"("customer_profile_id", "list_id");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_totp_secret_id_fkey" FOREIGN KEY ("totp_secret_id") REFERENCES "user_totp_secret"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magento_store" ADD CONSTRAINT "magento_store_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_magento_store_id_fkey" FOREIGN KEY ("magento_store_id") REFERENCES "magento_store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_event_log" ADD CONSTRAINT "sync_event_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_event_log" ADD CONSTRAINT "sync_event_log_magento_store_id_fkey" FOREIGN KEY ("magento_store_id") REFERENCES "magento_store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profile" ADD CONSTRAINT "customer_profile_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_address" ADD CONSTRAINT "customer_address_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_address" ADD CONSTRAINT "customer_address_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_address" ADD CONSTRAINT "customer_address_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_segment" ADD CONSTRAINT "customer_segment_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_segment" ADD CONSTRAINT "customer_segment_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_segment_member" ADD CONSTRAINT "customer_segment_member_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "customer_segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_segment_member" ADD CONSTRAINT "customer_segment_member_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfm_score" ADD CONSTRAINT "rfm_score_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfm_score" ADD CONSTRAINT "rfm_score_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfm_score_history" ADD CONSTRAINT "rfm_score_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfm_score_history" ADD CONSTRAINT "rfm_score_history_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_magento_store_id_fkey" FOREIGN KEY ("magento_store_id") REFERENCES "magento_store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category_membership" ADD CONSTRAINT "product_category_membership_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category_membership" ADD CONSTRAINT "product_category_membership_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geo_unmatched" ADD CONSTRAINT "geo_unmatched_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor" ADD CONSTRAINT "visitor_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor" ADD CONSTRAINT "visitor_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_event" ADD CONSTRAINT "web_event_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_event" ADD CONSTRAINT "web_event_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_event" ADD CONSTRAINT "web_event_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form" ADD CONSTRAINT "form_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_list" ADD CONSTRAINT "marketing_list_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_customer_profile_id_fkey" FOREIGN KEY ("customer_profile_id") REFERENCES "customer_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "marketing_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- Convert order.real_revenue to a Postgres GENERATED column.
-- Prisma cannot express GENERATED ALWAYS AS in schema.prisma, so the
-- column is declared there as a regular nullable Decimal and is treated
-- as read-only by application code (see packages/db/README.md).
-- ---------------------------------------------------------------------
ALTER TABLE "order" DROP COLUMN "real_revenue";
ALTER TABLE "order"
  ADD COLUMN "real_revenue" NUMERIC(20, 4)
  GENERATED ALWAYS AS ("total_invoiced" - "total_refunded") STORED;
