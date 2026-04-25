# ADR 0005 — BullMQ for queues

- **Status:** accepted
- **Date:** 2026-04-25

## Context

The ingest endpoint must accept signed Magento events and return 202 within
hundreds of milliseconds, regardless of downstream Postgres latency.
Background processing handles validation, persistence, and reconciliation.

## Decision

BullMQ on Redis 7.

## Why

- **Already on Redis.** No extra infra component (admin sessions + cache
  use it too).
- **First-class Node API** with TypeScript typings.
- **Per-job retry, exponential backoff, DLQ, scheduled / repeatable jobs.**
  Covers the cron + reconciliation cases without adding a separate scheduler.
- **Bull Board** UI for ops visibility (mounted on the API in dev only).
- **NestJS integration** via `@nestjs/bullmq` keeps queue + processor
  registration declarative.

## Why not the alternatives

- **pg-boss:** queue inside Postgres. Tempting (one less component), but
  performance and rate limiting are weaker, and we already need Redis for
  caching/sessions.
- **AWS SQS / Cloudflare Queues:** cloud-coupled; we want this stack to
  run on a single Hostinger VPS today.
- **RabbitMQ / Kafka:** way more than we need; ops cost is real.

## Topology (target — Iteration 2)

| Queue                   | Purpose                  | Concurrency | Retry                  |
| ----------------------- | ------------------------ | ----------- | ---------------------- |
| `ingest:magento:events` | Webhook events           | 4           | 5x exp(2s..5min) → DLQ |
| `sync:initial:*`        | CLI bulk sync per entity | 2           | 3x exp(5s..2min)       |
| `sync:reconciliation`   | Nightly drift detection  | 1           | 3x exp(30s..5min)      |
| `analytics:rfm:nightly` | RFM scoring              | 1           | 3x exp(30s..5min)      |

## Consequences

- Workers run as a separate process (same image, different `CMD`).
- Idempotency is the queue's responsibility — we use Magento `event_id`
  as the BullMQ job ID where possible. The `sync_event_log` table is the
  ultimate idempotency check.
- Redis persistence (AOF + snapshot) is required in production.
