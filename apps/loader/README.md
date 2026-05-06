# `@datapp/loader`

Public storefront loader for Phase 2 of the CDP. Built with esbuild
into a single self-contained IIFE bundle, served at
`https://loader.datapp.com.ar/loader.js` from an nginx-alpine
container.

## Status

- **Phase 2 iter 2: popup builder** — implemented. Renders configured
  popups against the storefront, captures form submissions, posts them
  to `POST /ingest/popup-submission`. Bundle target is < 12 KB
  gzipped; the live build sits at ~3.5 KB.
- **Phase 2.2 (page-view tracking + identity)** — not yet implemented.
  See ADR 0008 for the deferred scope.

## Embedding into a storefront

```html
<script async src="https://loader.datapp.com.ar/loader.js?tenant=<TENANT_SLUG>"></script>
```

Optional override for non-prod environments:

```html
<script async
  src="https://loader.datapp.com.ar/loader.js?tenant=acme&api=https://api.staging.datapp.com.ar">
</script>
```

The loader reads `?tenant=` and `?api=` from its own `<script src>`.
Both can also be supplied via `data-tenant` / `data-api` attributes
when the storefront's templating engine doesn't like `?` characters
in URLs.

## Development

```sh
pnpm --filter @datapp/loader dev          # esbuild --watch
pnpm --filter @datapp/loader build        # one-shot bundle to dist/
pnpm --filter @datapp/loader type-check
```

To exercise it against a local API:

```sh
# In one terminal, run the API + admin as usual.
pnpm dev

# Open a separate page (e.g. test.html) that includes:
#   <script src="http://localhost:8080/loader.js?tenant=acme&api=http://localhost:3000"></script>
# and serve it with any static server you prefer.
```

The bundle is delivered with `Cross-Origin-Resource-Policy:
cross-origin` and `Access-Control-Allow-Origin: *` so any storefront
can include it as a third-party script. The actual data plane (API)
enforces tenancy via `tenant.allowed_origins`.

## Architecture

```
src/
├── loader.ts     bootstrap, config parsing, fetch/show orchestration
├── render.ts     shadow-DOM popup renderer (no external CSS bleed)
├── storage.ts    localStorage / sessionStorage helpers, fault-tolerant
└── types.ts      shape mirror of the API's LoaderPopup DTO
```

Three rules the bundle enforces by construction:

1. **No globals.** Everything lives inside the IIFE; the storefront's
   `window` is untouched.
2. **No external dependencies.** No fetch polyfill, no UUID library —
   the bundle ships only what `src/` writes. Anything the browser
   doesn't have natively goes through small inline helpers.
3. **No browsing-side tracking outside an explicit popup interaction.**
   This iteration captures only what the visitor types into a popup
   form. Page-view tracking arrives in 2.2 and is gated behind a
   separate Magento config flag.
