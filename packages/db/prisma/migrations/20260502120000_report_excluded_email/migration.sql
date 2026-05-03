-- =====================================================================
--  Per-tenant email exclusion list for analytics reports
-- =====================================================================
--
-- Operators add their own (and their client's) test emails here so the
-- staging orders they place don't pollute revenue / KPIs / cohorts.
-- Every analytics aggregate joins against this list with a
-- `customer_email NOT IN (…)` filter.

CREATE TABLE "report_excluded_email" (
    "id"           UUID NOT NULL,
    "tenant_id"    UUID NOT NULL,
    "email"        TEXT NOT NULL,
    "reason"       TEXT,
    "added_by_id"  UUID,
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_excluded_email_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_excluded_email_tenant_id_email_key"
    ON "report_excluded_email"("tenant_id", "email");

ALTER TABLE "report_excluded_email"
    ADD CONSTRAINT "report_excluded_email_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_excluded_email"
    ADD CONSTRAINT "report_excluded_email_added_by_id_fkey"
    FOREIGN KEY ("added_by_id") REFERENCES "user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
