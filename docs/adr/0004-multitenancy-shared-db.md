# ADR 0004 — Multi-tenancy: shared DB, `tenant_id` discipline

- **Status:** accepted
- **Date:** 2026-04-25

## Context

Phase 1 ships with one tenant in production. Phase 1+ stays multi-tenant
ready: the spec mandates `tenant_id` on every domain table, even though we
won't onboard a second tenant for months.

Three patterns considered:

1. **Database-per-tenant.** Strongest isolation; expensive to operate
   (24+ DBs at moderate scale, migration coordination across them).
2. **Schema-per-tenant.** Decent isolation; Prisma's multi-schema support
   is workable but query routing still requires per-request schema
   switching.
3. **Shared DB, `tenant_id` column.** Lightest ops cost, requires
   discipline in every WHERE clause.

## Decision

**Shared DB, `tenant_id` discipline,** enforced at three layers:

1. **Schema:** every domain table has `tenantId`; composite indexes start
   with it; foreign keys cascade with their parent tenant.
2. **Application:** a request-scoped `TenantContext` is populated by the
   auth guard (admin) or the HMAC verification middleware (ingest). All
   repositories accept and require `tenantId`.
3. **CI lint:** a custom ESLint rule (added in Iteration 2) flags
   `prisma.<model>.findMany` calls whose first arg lacks `where.tenantId`.

## Why

- **Single migration set.** Adding a column ships everywhere at once.
- **Cross-tenant analytics** (when we onboard a second tenant) becomes a
  COUNT/JOIN, not a fan-out.
- **Operational sanity.** One Postgres to back up, one connection pool, one
  query plan to tune.

## Trade-offs

- **Blast radius of a missed `tenant_id`.** A bug could leak data
  across tenants. The lint rule and code review are our defenses; the
  composite index also makes such queries slow enough to notice.
- **Row-level security (RLS)** is _not_ enabled in Phase 1 — Prisma's
  current RLS support requires per-connection role switching that
  complicates the pool. Re-evaluate when tenant 2 onboards.

## Consequences

- Adding a domain table without `tenantId` is a review-blocker.
- The `super_admin` role bypasses tenant scoping for support; every such
  action is recorded in `audit_log`.
- The default tenant slug is `acme` (configurable via
  `DEFAULT_TENANT_SLUG`). The seed creates it on bootstrap.
