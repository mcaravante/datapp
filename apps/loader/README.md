# `@cdp/loader` — Phase 2 placeholder

**This app is reserved for Phase 2 and must NOT be implemented during Phase 1.**

## What it will be

A small (< 15 KB gzipped), framework-free, dependency-free script served from
the CDP that the storefront includes via:

```html
<script src="https://cdp.example.com/loader.js" async></script>
```

It will be responsible for:

1. **Identity resolution.** Generate / persist a stable `anonymous_id`
   (cookie + localStorage), promote it to `customer_profile_id` on login or
   form submission, and stitch all events.
2. **Web event tracking.** Page views, clicks, form submissions, custom
   events from the storefront's Magento layouts. POSTs batched to
   `/v1/ingest/web/events` (signed via short-lived public token).
3. **Popups / modals.** Render configurable forms (newsletter capture, exit
   intent, post-purchase) defined in the admin. Sees the visitor's segment
   for targeting.

## What is in scope right now (Phase 1)

The schema stubs (`Visitor`, `WebEvent`, `Form`, `FormSubmission`) live in
`packages/db/prisma/schema.prisma` already so foreign keys can be reasoned
about. **No code yet.**

When Phase 2 starts, the loader should be its own bundle pipeline (esbuild or
Vite-lib) and is deliberately not part of the Turborepo `build` graph yet.
