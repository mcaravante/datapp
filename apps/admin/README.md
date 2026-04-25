# `@cdp/admin`

CDP admin dashboard. Next.js 14 (App Router) + TanStack Query + Tailwind +
shadcn/ui.

## Run locally

```bash
# from repo root, with API + Postgres + Redis running
pnpm --filter @cdp/admin dev   # http://localhost:3001
```

## Conventions (target — Iteration 3)

- **App Router**, server-first. Use server components for data fetch unless
  client interactivity is required.
- **Auth.js v5** with credentials provider; sessions in DB; cookie SameSite=Lax.
- **TanStack Query** for any client-side data (filters, infinite lists).
- **Tailwind + shadcn/ui** for components. shadcn components live under
  `src/components/ui/` (vendored — never `npm install`'d).
- **All times rendered in `America/Argentina/Buenos_Aires`** via `date-fns-tz`.
- **CSV/Excel export via `exceljs`** server-side.

## Page map (target — Iteration 3+)

| Path              | Purpose                        |
| ----------------- | ------------------------------ |
| `/login`          | Auth.js credentials login      |
| `/`               | KPI overview (Iteration 4)     |
| `/customers`      | List + filters + saved segment |
| `/customers/[id]` | Customer 360                   |
| `/orders`         | List + filters                 |
| `/orders/[id]`    | Order detail                   |
| `/products`       | Top products report            |
| `/regions`        | Argentina geo heatmap          |
| `/cohorts`        | Cohort retention heatmap       |
| `/sync`           | Sync status (admin-only)       |
| `/audit`          | Audit log (admin-only)         |

## Iteration 1 status

This is a **scaffold-only** drop. The home page renders a placeholder. Auth,
sidebar layout, and data pages land in Iteration 3.
