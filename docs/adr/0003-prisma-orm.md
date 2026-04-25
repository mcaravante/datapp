# ADR 0003 — Prisma as ORM

- **Status:** accepted
- **Date:** 2026-04-25

## Context

The CDP centralizes Magento data: ~30 tables today, with relational
integrity, JSONB attributes, generated columns, and Postgres-specific
features (extensions, partial indexes, partitioning later).

## Decision

Prisma 5+.

## Why

- **TypeScript-first.** Generated client types are extremely good; query
  results are inferred down to the field level.
- **Migrations workflow** (`prisma migrate dev`) covers ~95% of schema
  changes; raw SQL escape hatch handles the rest (we use it for the
  `order.real_revenue` generated column — see `packages/db/README.md`).
- **Multi-line readability.** A 30-table schema reads better in Prisma DSL
  than equivalent TypeORM/Sequelize entities.
- **Postgres extension support** (`previewFeatures = ["postgresqlExtensions"]`)
  means `pgcrypto`, `pg_trgm`, `citext`, `unaccent` are declared in the
  schema, not as side-channel SQL.

## Trade-offs we accept

- **Generated columns and partitions need raw migrations.** Documented in
  `packages/db/README.md`. We treat the affected columns as read-only
  in TS code.
- **Single Prisma client per process.** A singleton in `packages/db` keeps
  the connection pool shared.
- **N+1 risk** on relations; mitigated by `include`/`select` discipline in
  reviews.
- **Performance ceiling** on extreme aggregations: the analytics module
  drops to `prisma.$queryRaw` (parameterised) for cohort + RFM rollups;
  Prisma's query builder is not the right tool there.

## Why not the alternatives

- **Drizzle:** SQL-first feels nicer for analytics but less ergonomic for
  the 80% CRUD path. Migration workflow is younger.
- **TypeORM:** decorators have aged poorly, and migration generation is
  unreliable.
- **Knex / pg-typed / kysely-only:** great as escape hatches, not as the
  primary ORM.

## Consequences

- The schema is the contract. Always update `schema.prisma` first, then
  run `prisma migrate dev --name <descriptive>`.
- Never `prisma db pull` on this project — introspection mangles
  generated columns and `@map`s we hand-rolled.
- Performance-critical reads use `$queryRaw` with parameterised SQL only.
  Audit any non-parameterised raw SQL in code review.
