# `@cdp/api`

NestJS API + BullMQ worker. **Single image, two entry points.**

## Run locally

```bash
# from repo root
docker compose -f infra/compose/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:seed

# this app
pnpm --filter @cdp/api dev          # HTTP API on :3000
pnpm --filter @cdp/api start:worker # worker (separate terminal)
```

OpenAPI docs (no auth in dev): <http://localhost:3000/v1/docs>

## Module map (target — Iteration 2/3)

| Module      | Bounded context                                                       |
| ----------- | --------------------------------------------------------------------- |
| `auth`      | Login, sessions, JWT, TOTP scaffolding                                |
| `magento`   | Magento client wrapper, store config                                  |
| `sync`      | Webhook ingest, BullMQ workers, CLI initial sync, reconciliation cron |
| `customers` | `/v1/admin/customers/*` endpoints, customer 360                       |
| `orders`    | `/v1/admin/orders/*`, order ingest, reconciliation                    |
| `products`  | `/v1/admin/products/*`, product ingest, top-products report           |
| `analytics` | KPIs, RFM cron, cohort analysis, top-regions                          |
| `audit`     | `audit_log` writer wired into mutating endpoints                      |
| `health`    | `/v1/health` (Iteration 1)                                            |

## Adding a new entity sync

1. Define the event payload schema in `packages/shared/src/ingest.ts`.
2. Add a Magento client method in `packages/magento-client`.
3. In the relevant feature module of this app:
   - A `@Processor('<queue>')` class consuming the event from BullMQ.
   - A repository method that UPSERTs by `(tenantId, magento_*_id)`.
4. Update `sync_state` cursor on success.
5. Tests: HMAC verification + idempotency + payload validation.

## Queue topology

```
ingest:magento:events    fan-in queue, worker dispatches by event_type
sync:initial:customers   from CLI bulk sync
sync:initial:orders
sync:initial:products
sync:reconciliation      nightly drift detection
analytics:rfm:nightly    nightly RFM scoring
```

Each queue has DLQ + per-job retry with exponential backoff.

## Conventions

- **Controllers are dumb mappers.** Business logic lives in services.
- **Tests are colocated.** `foo.service.ts` next to `foo.service.spec.ts`.
- **Zod everywhere.** Inbound DTOs validated via `nestjs-zod`'s `ZodValidationPipe`.
- **Multi-tenancy enforced.** A request-scoped `TenantContext` carries
  `tenantId`; repositories include it in every WHERE clause.
- **`real_revenue` is read-only.** Never include it in `prisma.order.create()`
  or `update()` calls.
