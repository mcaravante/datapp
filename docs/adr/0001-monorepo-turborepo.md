# ADR 0001 — Monorepo with Turborepo + pnpm workspaces

- **Status:** accepted
- **Date:** 2026-04-25

## Context

Phase 1 ships an API, an admin dashboard, and a Magento client library.
Phase 2 adds a public loader script. Phase 3 adds an email engine. All of them
share Zod schemas, types, generated DB types, and ESLint config.

Options considered:

1. **Polyrepo.** One repo per app + shared libraries published to a private
   registry.
2. **Monorepo, Nx.** Powerful build graph, opinionated.
3. **Monorepo, Turborepo + pnpm workspaces.** Lightweight, file-based caching,
   minimal opinions.

## Decision

Turborepo + pnpm workspaces.

## Why

- **One PR can change the schema, the API, and the admin atomically.** The
  alternative (versioning a shared package) creates dependency-bump chores
  and slows iteration.
- **Workspace-aware install (pnpm).** `workspace:*` keeps internal deps
  always-current; no publish step.
- **Build caching for free.** Turborepo hashes inputs per task; CI reuses the
  cache on unchanged packages. Nx does this too but is heavier.
- **Lower learning curve than Nx.** Plain `package.json` scripts; no
  generators or executors layer.

## Consequences

- Every internal dep is `workspace:*`. We never `npm publish`.
- `turbo.json` declares the task graph; new pipelines (e.g. `db:generate`)
  must be added there.
- CI must restore the Turborepo cache (Vercel-managed for free or self-hosted).
- Refactors that touch many packages need disciplined PR scope to stay
  reviewable.
