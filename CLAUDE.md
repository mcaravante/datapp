# CLAUDE.md — Operating contract

This file is the source of truth for any AI agent working on this repository.
Read it end-to-end before generating code. If a request contradicts this file,
push back and ask the user before proceeding.

## 1. Project identity

**CDP for Adobe Commerce — a custom Customer Data Platform that integrates with
a single Magento 2.4.x store, centralizes its data, and exposes analytics +
customer 360 + RFM segmentation.**

The work is broken into three phases. Only Phase 1 is in scope right now.

| Phase | Scope                                                                        | Status            |
| ----- | ---------------------------------------------------------------------------- | ----------------- |
| 1     | Magento sync, customer 360, RFM, cohorts, top-products / top-regions reports | **active**        |
| 2     | Public loader script, popups/modals, web event tracking, identity resolution | schema stubs only |
| 3     | Email marketing engine + Resend                                              | schema stubs only |

The system is **multi-tenant from day one** — `tenant_id` is required on every
domain table — even though only one tenant runs in production for now.

## 2. Tech stack (LOCKED — do not substitute without an ADR)

| Layer         | Choice                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| Language      | TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| API           | NestJS 10+                                                                   |
| ORM           | Prisma 5+                                                                    |
| DB            | PostgreSQL 16                                                                |
| Cache / queue | Redis 7 + BullMQ                                                             |
| Admin         | Next.js 14 App Router + TanStack Query + Tailwind + shadcn/ui                |
| Admin auth    | Auth.js (NextAuth) credentials provider, 2FA-ready (TOTP)                    |
| Service auth  | JWT RS256 (service-to-service); HMAC-SHA256 (ingest webhooks)                |
| Validation    | Zod, schemas live in `packages/shared`                                       |
| HTTP          | native `fetch` (Node 20+) with retries via `p-retry`                         |
| Logging       | Pino, JSON structured                                                        |
| APM           | Sentry SDK                                                                   |
| Tests         | Vitest, Supertest, Playwright (admin smoke only)                             |
| Lint          | ESLint + Prettier + commitlint + husky + lint-staged                         |
| Pkg manager   | pnpm 10+                                                                     |
| Monorepo      | Turborepo                                                                    |
| Container     | Docker (multi-stage)                                                         |
| Deploy        | Hostinger VPS + Dokploy + Cloudflare                                         |
| Time zone     | `America/Argentina/Buenos_Aires` for presentation; **UTC at rest**           |

All commits, branch names, identifiers, comments, and docs are in **English**.

## 3. Repository layout

```
crm/
├── apps/
│   ├── api/          NestJS API + BullMQ worker (single image, two CMDs)
│   ├── admin/        Next.js admin dashboard
│   └── loader/       Phase 2 placeholder (do not implement)
├── packages/
│   ├── shared/       Zod schemas, types, constants
│   ├── db/           Prisma schema, migrations, client
│   ├── magento-client/ Typed Magento 2 REST client
│   └── config/       ESLint, TS, Prettier base configs
├── infra/
│   ├── docker/       Dockerfiles per app
│   ├── compose/      docker-compose.dev.yml + docker-compose.prod.yml
│   └── dokploy/      Dokploy compose + VPS runbook
├── docs/adr/         Architecture Decision Records
└── .github/workflows CI (lint/test/build), image push, deploy
```

## 4. Key invariants

- **`tenant_id` on every domain table.** Composite indexes start with it.
- **UTC at rest, Buenos Aires for display.** Use `date-fns-tz` on the way out.
- **All money is `Decimal(20,4)`.** Never `float`/`double`.
- **`Order.real_revenue` is a Postgres generated column** (`total_invoiced -
total_refunded`). Never write to it; never compute it in TS as the source of
  truth — read it from the DB.
- **Webhook ingest is signed (HMAC-SHA256) and idempotent (`event_id`).** Replay
  window: 5 minutes. Endpoint enqueues + returns 202. Workers persist.
- **PII discipline.** Emails are hashed (sha256) when logged. Names, addresses,
  phones never logged at info level.
- **Argentine address normalization.** `region` maps to a pre-seeded table of
  the 24 INDEC provinces with canonical names. Unmatched values land in
  `geo_unmatched` for manual review.
- **No `any`.** Use `unknown` and narrow.
- **No business logic in controllers.** Controllers are dumb mappers; services
  hold logic; repositories are thin Prisma wrappers.
- **Auth.js cookies are SameSite=Lax.** CORS allowlist is restrictive.
- **Helmet + Throttler on the API.** Ingest is throttled separately from admin.
- **Soft delete is NOT used.** Real deletes only, captured in `audit_log`.

## 5. Current iteration

We deliver Phase 1 in iterative slices, each one committable, runnable, and
green in CI:

- **Iteration 1 — Foundation.** Monorepo, configs, Prisma schema (all tables
  including Phase 2/3 stubs), env, Docker compose dev, ADRs. _(active)_
- **Iteration 2 — Backend vertical slice.** `apps/api` modules (auth, magento,
  sync, customers, audit), HMAC ingest endpoint, BullMQ worker, CLI
  `sync:initial --entity=customers`, magento-client, tests.
- **Iteration 3 — Admin + close-out.** Next.js admin (login, customers list +
  detail, sync status), CSV export, Docker images, CI workflows, Dokploy
  runbook.

Subsequent iterations add: orders sync, products sync, RFM cron, cohort
analysis, geographic reports, top-products report, segments, full Customer 360
timeline.

## 6. What you SHALL NOT do

- Implement Phase 2 or Phase 3 features. Their tables exist as schema stubs
  only.
- Add libraries outside the locked stack without an ADR.
- Use `any`. Silence ESLint without a justifying comment.
- Write business logic in controllers.
- Commit `.env` files or any secret.
- Skip OpenAPI generation when adding API endpoints.
- Trust Magento payloads. Validate everything at the boundary with Zod.
- Use `grand_total` as revenue. Use `real_revenue` (= invoiced − refunded).
- Auto-commit or auto-push without explicit user confirmation. (Per the user's
  global instructions in `~/.claude/CLAUDE.md`.)

## 7. Style & conventions

- **TypeScript:** strict. No default exports for runtime modules (Next.js pages
  excepted).
- **Zod = source of truth.** Derive TS types via `z.infer<>`.
- **NestJS:** feature modules per bounded context. Workers live alongside their
  domain via `@Processor()`.
- **Tests colocated:** `foo.service.ts` + `foo.service.spec.ts`.
- **Commits:** Conventional Commits enforced by commitlint.
- **Branches:** `feat/`, `fix/`, `chore/`, `refactor/`, `docs/`.
- **Dates in memory/notes:** absolute (e.g. `2026-04-25`), never relative.

## 8. Onboarding checklist for an agent

Before writing code:

1. Read this file and any relevant ADR in `docs/adr/`.
2. Read the Prisma schema at `packages/db/prisma/schema.prisma`.
3. Read the relevant module's `README.md` if present.
4. If touching API: confirm OpenAPI updates and Zod validation are in place.
5. If touching ingest: confirm HMAC verification and idempotency are intact.
6. If adding env vars: update `.env.example` AND the Zod env schema in
   `packages/shared/src/env`.
7. Run `pnpm lint && pnpm test && pnpm type-check` before declaring done.

## 9. Quickstart

```bash
pnpm install
docker compose -f infra/compose/docker-compose.dev.yml up -d
cp .env.example .env   # fill in secrets
pnpm db:migrate
pnpm db:seed
pnpm dev               # api + admin + worker concurrently
```

API: <http://localhost:3000> · Admin: <http://localhost:3001>
