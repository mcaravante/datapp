# ADR 0002 — NestJS for the API

- **Status:** accepted
- **Date:** 2026-04-25

## Context

The API is a long-lived service that grows: HTTP endpoints, scheduled crons,
BullMQ workers, CLI commands. We need a framework that keeps a large feature
surface organized.

## Decision

NestJS 10+ with the express adapter.

## Why

- **Module boundaries enforced by the framework.** Bounded contexts
  (customers, orders, sync, audit) each get their own module with a clean
  public surface — important as we approach ~30 features.
- **Decorator-based metadata** maps cleanly to OpenAPI generation
  (`@nestjs/swagger`), validation (`nestjs-zod`), and guards
  (`@Roles()`/`ThrottlerGuard`).
- **Worker entry uses the same DI container.** `NestFactory.createApplicationContext`
  bootstraps a non-HTTP context with the same providers. One image, two
  CMDs (see Dockerfile).
- **Mature ecosystem for our stack.** First-class @nestjs/throttler,
  @nestjs/config, nestjs-pino, BullMQ adapters.

## Why not the alternatives

- **Express alone:** would force us to roll module boundaries, validation,
  swagger generation, and lifecycle ourselves. Too much undifferentiated
  glue.
- **Fastify-only:** faster, but the ecosystem of opinionated patterns we
  want is thinner. NestJS's Fastify adapter is an option for later if we
  need raw throughput.
- **tRPC:** great for shared TS clients, poor for partner integrations
  (Magento module is PHP, not TS). Public REST + OpenAPI is the right
  contract.
- **Hono / Elysia:** too young for a system we will run for years.

## Consequences

- Controllers must be thin. Business logic lives in services.
- DTOs and validation must use Zod via `nestjs-zod` so schemas remain the
  single source of truth across API + admin + ingest.
- Tests use `@nestjs/testing` for DI; the harness runs Vitest, not Jest
  (see ADR 0007 if added later).
- Workers register processors in their feature modules; they are picked up
  automatically by the worker entry.
