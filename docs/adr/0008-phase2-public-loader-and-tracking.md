# ADR 0008 — Phase 2: public loader, popups, web events, identity resolution

- **Status:** proposed
- **Date:** 2026-05-05
- **Supersedes:** the "Phase 2 schema-only" stipulation in `CLAUDE.md` §1 / §6 once accepted.

## Context

Phase 1 (Magento sync, customer 360, RFM, reports) is shipped and Phase 3
(abandoned-cart email recovery via the engine introduced in ADR 0007) is
ramping up. Phase 2 — the **public, browser-side surface** — is still
"schema stubs only" per `CLAUDE.md`. The stubs cover four things:

1. A first-party JS loader (`apps/loader/`) that storefronts include.
2. Popup / modal / form components rendered by the loader.
3. Web event tracking (page views, clicks, form interactions).
4. Identity resolution: stitching anonymous device ids onto known
   `customer_profile` rows once the visitor authenticates.

The schema fields that exist already and have stayed unused since
Iteration 1:

- `Visitor` (anonymous device id + tenant scope)
- `WebEvent` (events emitted by the loader; FK to Visitor and optional
  CustomerProfile)
- `Form` + `FormSubmission` (popup / inline forms)
- `CustomerProfile.anonymousIds: String[]`
- `MarketingList`, `Subscription`, `SubscriptionStatus`

This ADR proposes the work to **light up that surface** for the
storefront we already control (Pupemoda) so the CDP starts capturing
the data that drives the analytics and the email engine — instead of
depending only on Magento's order log.

## Why now

Three things changed since the original "Phase 2 later" ruling:

1. **Phase 3 is in flight.** The email engine can already send recovery
   mail, but it can only target abandoned carts (Magento quote → email).
   Without web events we can't trigger on browse abandon, search-no-
   click, repeat-visit-no-purchase, etc. These are the campaigns that
   move the needle on Pupemoda.
2. **Identity resolution is a prerequisite for attribution.** Today the
   CDP knows about a visitor only when an order lands. Web events let us
   stitch the pre-order journey (which campaign drove the click, which
   product was viewed first, which checkout step they bounced on) onto
   the customer profile retroactively, the moment they log in or buy.
3. **The schema is already designed.** Iteration 1 deliberately reserved
   FKs and tables for this surface, so the migration cost of "open
   Phase 2" is essentially zero — we're filling existing columns.

## Decision

Open Phase 2 as a **single vertical**, in the spirit of ADR 0007 (one
end-to-end slice rather than four parallel half-shipped surfaces). The
slice is:

> A public loader that, when included on Pupemoda's storefront, tracks
> page views and identifies visitors. Identification happens
> automatically when the visitor is logged into Magento, and stitches
> their `Visitor.anonymousIds` onto the matching `CustomerProfile`.
> Popups, forms, and richer event types are explicit out-of-scope for
> the first iteration and become later ADRs / iterations.

Scoped this way the deliverables are:

### `apps/loader/` (new)

- TypeScript source compiled to a single `.js` bundle, served from
  `loader.datapp.com.ar` behind Cloudflare.
- ~10 KB target gzipped. No framework — vanilla DOM + `fetch` + a tiny
  queue.
- Initializes a per-tenant context from a global config object the
  storefront sets before the script tag (`window.__DATAPP = { tenantId,
  apiUrl }`).
- Generates and stores a stable anonymous device id in `localStorage`
  (UUID v7, 1-year cookie fallback for cross-subdomain).
- Beacon to `POST /v1/ingest/web-event` with HMAC signature (reusing
  the existing pattern from `sync/ingest`).
- Auto-tracks: `page_view` on load + history-API navigation,
  `identify` when the storefront calls `__DATAPP.identify({ email })`
  after Magento login.

### `apps/api/src/modules/web-events/` (new)

- `WebEventIngestController` validates HMAC + signature window (5 min,
  same as the Magento webhook ingest), enqueues to BullMQ, returns 202.
- `WebEventProcessor` writes to `web_event` and upserts the matching
  `Visitor` row.
- `IdentityResolver` runs on `identify` events: hashes the email, looks
  up the `CustomerProfile`, appends the anonymous id to
  `anonymousIds[]`, links every prior `WebEvent` from that visitor to
  the resolved profile.

### `apps/admin/src/app/(authed)/customers/[id]/` extensions

- New "Activity" tab with a paginated list of the customer's web events
  (page views first, more types as they land).
- The customer 360 surface gains a "first seen" timestamp sourced from
  the earliest `WebEvent.eventTimestamp` of any of their stitched
  visitors.

### Out of scope for this iteration (future ADRs)

- Popup / modal rendering (`Form`, `FormSubmission` stay schema-only).
- Server-side personalization (loader doesn't push state down — it only
  emits events).
- Cross-site identity (storefront only, not other Pupemoda properties).
- A/B testing of campaigns.
- Cookie-banner / consent surface — Pupemoda already has GDPR-consent
  outside the CDP; the loader respects an existing `__DATAPP_CONSENT`
  variable but doesn't render its own UI.

## Architectural choices

- **Self-host the loader, no third-party CDN.** Cloudflare in front of
  the apps/admin Dokploy container is enough; bundle is small enough.
  Avoids an extra trust boundary.
- **No external analytics vendor.** Every event lands in our `WebEvent`
  table; reports query the same DB as the rest of the CDP. The cost of
  this discipline (more storage, more aggregation work) is preferable
  to splitting the source of truth across two products.
- **HMAC for ingest, NOT JWT.** The loader runs in untrusted browsers —
  embedding a long-lived JWT is a leak risk. HMAC over a per-tenant
  shared secret + replay-window of 5 min matches the existing
  `apps/api/src/modules/sync/ingest` pattern that already protects the
  Magento webhook ingest.
- **Anonymous id as UUID v7, not v4.** Time-ordered ids let us index
  `web_event` by `(tenantId, anonymousId, eventTimestamp)` without
  needing a separate timestamp index for the common "events for this
  visitor in order" query.

## What this implies for `CLAUDE.md`

Once accepted, the §1 row for Phase 2 changes from "schema stubs only"
to "active, scope = public loader + page-view + identify". The §6
"What you SHALL NOT do" entry against Phase 2 stays in place for the
out-of-scope items (popups, forms, A/B testing, etc.) until a follow-up
ADR opens them.

## Risks / things to watch

- **Bot traffic noise.** Page views from crawlers will dwarf the human
  signal if not filtered. The processor should drop events whose UA
  matches the standard bot regex on ingest, before they hit
  `web_event`.
- **GDPR for cross-device stitching.** Linking a visitor's anonymous id
  to a customer profile is profile enrichment, which is covered by
  Pupemoda's existing privacy policy — but the GDPR export endpoint in
  `customers.gdpr.service.ts` needs a new section for `WebEvent` and
  `Visitor` so right-of-access stays complete.
- **Storage growth.** Page views can exceed 1M/month on a small store.
  Plan a partition / retention policy in `web_event` (default 90 days
  hot, drop after that — analytics rolls up before the drop).
- **Loader bundle drift.** Without bundle-size monitoring the script
  will balloon over time. CI gate: fail the build if the gzipped
  loader exceeds 12 KB.

## Plan (5 commits, each green in CI)

1. **Scaffold + config gate.** `apps/loader/` skeleton with build
   script, env vars added behind `LOADER_PUBLIC_URL` + `WEB_EVENTS_HMAC_SECRET`.
   Module `apps/api/src/modules/web-events/` with empty controller +
   queue constants. Default off — runtime behavior unchanged.
2. **Ingest path.** HMAC-signed `POST /v1/ingest/web-event`, BullMQ
   queue, processor, persistence into `web_event` + `visitor`. Vitest
   unit + integration tests against a local Postgres+Redis container.
3. **Loader bundle.** TypeScript source, esbuild config, gzip-size
   guard, served from `apps/admin` static assets behind Cloudflare.
   Public smoke test: hit the script URL, confirm 200 + correct
   content-type + cache headers.
4. **Identity resolution.** `IdentityResolver` service, integration
   test that an `identify` event after a chain of `page_view`s back-
   fills `customer_profile_id` on every prior visitor row.
5. **Admin Activity tab.** Customer 360 extension, Playwright smoke
   that creates a synthetic visitor + a page-view + an identify and
   asserts the row shows up in the customer's tab.

## Verification

- **Manual end-to-end on Pupemoda staging.** Drop the loader script,
  navigate three pages logged out, log in, watch the visitor row gain
  a `customer_profile_id`, watch the three prior page_views inherit
  it via the resolver. Customer 360 → Activity shows them in order.
- **Bot test.** Hit the ingest with a UA matching `Googlebot/2.1`, the
  processor drops the event before persisting, but logs an info-level
  counter so we can see the noise floor.

## Revisit date

2026-09-01. By then we will know whether to widen Phase 2 to popups +
forms (likely if engagement metrics from Phase 3 are healthy) or pivot
the loader scope.
