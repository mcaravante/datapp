# ADR 0006 — RFM segmentation logic

- **Status:** accepted
- **Date:** 2026-04-25

## Context

The CDP must label every customer with a marketing-meaningful segment so the
admin can target campaigns (Phase 3) and the dashboard can show value-tier
distribution.

## Decision

**Quintile-bucketed RFM** scored per tenant, run nightly. Segments named
per the de-facto industry mapping ("Champions", "At Risk", etc.).

### Definitions

For each customer in a tenant:

- **Recency (R):** days since last order (lower is better).
- **Frequency (F):** order count in the last 365 days.
- **Monetary (M):** sum of `real_revenue` (i.e. invoiced − refunded) in
  the last 365 days, expressed in tenant base currency.

Each dimension is bucketed into quintiles **per tenant**:

- 5 → top quintile (best)
- 1 → bottom quintile (worst)

Recency is inverted (a small `recency_days` is good), so its quintile is
computed on `-recency_days` or by reversing the bucket order — pick one
implementation and document it in the code.

### Segment mapping

Combined score `R F M` (each 1..5) maps to a label per the table below
(the same mapping every major CDP/ESP uses, with minor variations):

| Segment                     | Trigger (R, F, M)                                                      |
| --------------------------- | ---------------------------------------------------------------------- |
| Champions                   | (5,5,5), (5,5,4), (5,4,5), (5,4,4), (4,5,5), (4,5,4), (4,4,5)          |
| Loyal customers             | (5,5,3), (5,5,2), (5,4,3), (4,5,3), (4,4,4), (3,5,5), (3,5,4)          |
| Potential loyalists         | (5,4,2), (5,3,4), (4,4,2), (4,3,3), (4,3,2), (3,4,4), (3,4,3), (3,4,2) |
| New customers               | R=5 and F=1                                                            |
| Promising                   | (5,3,1..3), (4,3,1)                                                    |
| Customers needing attention | (3,3,1..3), (3,2,2..3), (2,3,2..3)                                     |
| About to sleep              | (3,2,1), (3,1,2..3), (2,2,1..2)                                        |
| At risk                     | (2,4..5,3..5), (2,3,4..5), (1,4,4..5)                                  |
| Cannot lose them            | (1,5,4..5), (1,4,5)                                                    |
| Hibernating                 | (1..2,1..2,1..2)                                                       |
| Lost                        | (1,1,1..3), (1,2,1)                                                    |

Edge cells fall through to the closest neighbor; the implementation should
include the full lookup table to avoid argument over the boundaries.

## Why quintile and not absolute thresholds

Absolute thresholds need re-tuning as a tenant's order volume evolves.
Per-tenant quintiles auto-calibrate: the top 20% of customers by recency
this month are always quintile 5.

## Storage

- `rfm_score` — current state; one row per (tenant, customer). Replaced on
  every nightly run.
- `rfm_score_history` — monthly snapshot taken on the first of each month.
  Used by analytics for "are we losing customers?" charts.

## Consequences

- The nightly cron must complete before the admin dashboard's morning
  load. With the quintile approach we can compute it in a single SQL
  pass plus a TS bucketing step. Target < 10 minutes for tenants with
  500k customers.
- The segment vocabulary becomes UI-facing. The enum values in
  `schema.prisma` are the contract; renaming requires a migration.
- Tenants with tiny order volumes (< 100 customers) get noisy quintiles.
  We accept that for Phase 1 — flag in admin UI when sample size is too
  small.
