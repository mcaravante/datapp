-- Audit log gains coverage for auth events (login fail, lockout,
-- password reset, session revoke, 2FA changes, recovery codes).
--
-- Key changes:
--   - `tenant_id` becomes nullable so super_admin actions and
--     pre-login events (login_failed for unknown users) can still
--     emit a row.
--   - 10 new AuditAction values capture each event type explicitly so
--     queries can filter without parsing JSON.
--   - Adds an `at`-only index so the cross-tenant `/audit` admin view
--     can paginate efficiently.
--
-- Note: ALTER TYPE ADD VALUE is allowed inside a transaction in
-- PostgreSQL 13+ provided the new label isn't *used* in the same
-- transaction. We don't insert any rows here, so this is safe.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'login_failed';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'account_locked';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'password_reset_requested';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'password_reset_completed';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'session_revoked';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'two_factor_enrolled';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'two_factor_disabled';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'two_factor_admin_reset';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'recovery_codes_generated';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'recovery_code_used';

ALTER TABLE "audit_log" ALTER COLUMN "tenant_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "audit_log_at_idx" ON "audit_log" ("at" DESC);
