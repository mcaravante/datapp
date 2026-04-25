# CDP — Customer Data Platform for Adobe Commerce

Custom CDP that integrates with a single Adobe Commerce Cloud (Magento 2.4.x)
store, centralizes customer / order / product data, and exposes analytics +
customer 360 + RFM segmentation to the store owner.

> **Phase 1 is active.** Phase 2 (storefront loader, web events, identity
> resolution) and Phase 3 (email engine + Resend) exist as data-model stubs
> only. See [`CLAUDE.md`](CLAUDE.md) for the operating contract every change
> must respect, and [`docs/adr/`](docs/adr/) for the foundational decisions.

## Stack

NestJS · Prisma · PostgreSQL 16 · Redis 7 + BullMQ · Next.js 14 · Auth.js ·
Zod · Pino · Sentry · Vitest · Playwright · Turborepo · pnpm 10 ·
Docker + Dokploy + Cloudflare. TypeScript strict throughout.

## Layout

```
crm/
├── apps/
│   ├── api/          NestJS API + BullMQ worker (single image, two CMDs)
│   ├── admin/        Next.js admin dashboard
│   └── loader/       Phase 2 placeholder
├── packages/
│   ├── shared/       Zod schemas + types shared across apps
│   ├── db/           Prisma schema + migrations + client
│   ├── magento-client/ Typed Magento 2 REST client
│   └── config/       Shared ESLint flat-config presets
├── infra/
│   ├── compose/      docker-compose.dev.yml
│   └── dokploy/      production runbook + compose
└── docs/adr/         Architecture Decision Records
```

## Quickstart

```bash
# 1. Install
pnpm install

# 2. Bring up Postgres + Redis + Mailpit
pnpm compose:up

# 3. Configure env
cp .env.example .env
# fill in AUTH_SECRET, JWT keys, ENCRYPTION_MASTER_KEY, MAGENTO_*

# 4. Initialize database
pnpm prisma -F @cdp/db migrate dev --create-only --name init
# Append the real_revenue conversion to the generated migration.sql
# (see packages/db/README.md)
pnpm db:migrate
pnpm db:seed

# 5. Run apps
pnpm dev
```

| Service      | URL                             |
| ------------ | ------------------------------- |
| API          | <http://localhost:3000>         |
| OpenAPI docs | <http://localhost:3000/v1/docs> |
| Admin        | <http://localhost:3001>         |
| Mailpit      | <http://localhost:8025>         |

## Iteration plan

| Iteration | Scope                                                                                  | Status     |
| --------- | -------------------------------------------------------------------------------------- | ---------- |
| 1         | Foundation: monorepo, Prisma schema, configs, ADRs, dev compose                        | **active** |
| 2         | Backend vertical slice: auth, magento client, sync ingest + worker, customers API      | next       |
| 3         | Admin: login, customers list + detail, sync status, Docker images, CI, Dokploy runbook |            |
| 4+        | Orders / products sync, RFM cron, cohorts, geo report, top-products, segments          |            |

## Conventions

- All commits, code, comments, and docs in **English**.
- Conventional Commits enforced via commitlint.
- TypeScript strict; no `any`; Zod is the source of truth for validation.
- Every domain table carries `tenant_id`. See ADR 0004.
- `order.real_revenue` is a Postgres GENERATED column. Treat it as
  read-only. See ADR 0003 / `packages/db/README.md`.
- All times stored UTC. Render in `America/Argentina/Buenos_Aires` via
  `date-fns-tz`.

## Security baseline (Phase 1)

- Argon2id password hashing.
- Envelope-encrypted columns for Magento tokens & TOTP secrets (master
  key in env, per-row key in DB).
- HMAC-SHA256 signed webhooks with 5-minute replay window.
- Helmet + CORS allowlist + Throttler on the API.
- PII redacted from logs (Pino redact paths).
- GDPR / Argentine Ley 25.326 endpoints planned:
  `POST /v1/admin/customers/:id/erase` and
  `GET /v1/admin/customers/:id/export`.

## License

UNLICENSED — proprietary. Do not redistribute.
