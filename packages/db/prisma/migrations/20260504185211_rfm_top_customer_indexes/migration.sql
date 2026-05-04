-- NOTE: pre-existing drift lines (real_revenue / role_section_access)
-- stripped — same noise the email-engine migration documented.

-- Indexes for "top customers by orders / spend" sort on /customers.
-- We do plain CREATE INDEX (not CONCURRENTLY) because Prisma wraps
-- each migration file in a transaction and CONCURRENTLY can't run
-- inside one. rfm_score is small enough that the brief lock is fine
-- (one row per customer; nightly refresh, never a hot write target).
CREATE INDEX IF NOT EXISTS "rfm_score_tenant_id_frequency_idx"
  ON "rfm_score" ("tenant_id", "frequency" DESC);

CREATE INDEX IF NOT EXISTS "rfm_score_tenant_id_monetary_idx"
  ON "rfm_score" ("tenant_id", "monetary" DESC);
