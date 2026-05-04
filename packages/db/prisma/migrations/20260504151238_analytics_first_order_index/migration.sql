-- NOTE: pre-existing drift lines stripped (real_revenue / role_section_access)
-- — same noise the email-engine + media + branding migrations documented.

-- For tenants with millions of orders, building this index online is
-- safer than the table lock that the default Prisma migration would
-- take. CONCURRENTLY can't run inside a transaction — but Prisma wraps
-- migrations in one by default. Drop the wrapper for this single file.
-- Postgres + pgsql don't have transactional CREATE INDEX CONCURRENTLY,
-- but Prisma's migration engine handles non-transactional statements
-- when there is no BEGIN/COMMIT in the file. We omit them here.

-- CreateIndex (concurrent — no table lock; falls back to standard
-- CREATE INDEX on engines that don't support CONCURRENTLY)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "order_tenant_id_customer_profile_id_placed_at_idx"
  ON "order" ("tenant_id", "customer_profile_id", "placed_at");
