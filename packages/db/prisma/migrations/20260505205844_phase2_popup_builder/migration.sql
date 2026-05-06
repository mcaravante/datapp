-- Phase 2 — popup builder vertical (per ADR 0008, accepted with the
-- popup-first scope). Extends the schema-only `form` + `form_submission`
-- stubs introduced in iteration 1 with the columns the public loader
-- and the admin builder need to actually render and capture leads.
--
-- Also widens `tenant` with `allowed_origins`, the whitelist that
-- gates the public loader endpoints. Empty = closed — the operator has
-- to add their storefront origin from /system before the loader works.

ALTER TABLE "tenant"
  ADD COLUMN "allowed_origins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Make customer_profile.magento_customer_id optional so popup leads can
-- live as profiles before they ever sign up at the storefront. Postgres
-- treats NULL as distinct in the (tenant_id, magento_customer_id)
-- unique index, so multiple lead rows with NULL coexist without
-- fighting the constraint.
ALTER TABLE "customer_profile"
  ALTER COLUMN "magento_customer_id" DROP NOT NULL;

CREATE TYPE "FormKind" AS ENUM ('popup', 'inline', 'bar');
CREATE TYPE "FormStatus" AS ENUM ('draft', 'active', 'paused', 'archived');
CREATE TYPE "FormTrigger" AS ENUM ('immediate', 'time_on_page', 'scroll_depth', 'exit_intent');
CREATE TYPE "FormDisplayFrequency" AS ENUM ('once_per_session', 'once_per_visitor', 'every_visit');

ALTER TABLE "form"
  ADD COLUMN "slug"                       TEXT NOT NULL DEFAULT '',
  ADD COLUMN "kind"                       "FormKind" NOT NULL DEFAULT 'popup',
  ADD COLUMN "status"                     "FormStatus" NOT NULL DEFAULT 'draft',
  ADD COLUMN "headline"                   TEXT,
  ADD COLUMN "subheadline"                TEXT,
  ADD COLUMN "body_html"                  TEXT,
  ADD COLUMN "image_url"                  TEXT,
  ADD COLUMN "primary_cta_label"          TEXT,
  ADD COLUMN "primary_color"              TEXT,
  ADD COLUMN "consent_text"               TEXT,
  ADD COLUMN "success_message"            TEXT,
  ADD COLUMN "trigger"                    "FormTrigger" NOT NULL DEFAULT 'time_on_page',
  ADD COLUMN "trigger_delay_seconds"      INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "display_frequency"          "FormDisplayFrequency" NOT NULL DEFAULT 'once_per_session',
  ADD COLUMN "page_match_rules"           JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "display_priority"           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "show_cap"                   INTEGER,
  ADD COLUMN "submission_cap"             INTEGER,
  ADD COLUMN "marketing_list_id"          UUID,
  ADD COLUMN "cached_show_count"          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cached_submission_count"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cached_last_submitted_at"   TIMESTAMPTZ(6);

-- Slug starts empty for any existing row; seed one based on the name so
-- the unique index below can land. The placeholder is fine because the
-- module is brand-new — there are no rows in production today.
UPDATE "form"
SET "slug" = lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))
WHERE "slug" = '';

ALTER TABLE "form"
  ALTER COLUMN "slug" DROP DEFAULT;

ALTER TABLE "form"
  ADD CONSTRAINT "form_marketing_list_id_fkey"
  FOREIGN KEY ("marketing_list_id") REFERENCES "marketing_list"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "form_tenant_id_slug_key" ON "form"("tenant_id", "slug");
CREATE INDEX "form_tenant_id_status_display_priority_idx"
  ON "form"("tenant_id", "status", "display_priority" DESC);

ALTER TABLE "form_submission"
  ADD COLUMN "email"        TEXT,
  ADD COLUMN "email_hash"   CHAR(64),
  ADD COLUMN "page_url"     TEXT,
  ADD COLUMN "user_agent"   TEXT,
  ADD COLUMN "ip_address"   TEXT;

CREATE INDEX "form_submission_tenant_id_email_hash_idx"
  ON "form_submission"("tenant_id", "email_hash");
