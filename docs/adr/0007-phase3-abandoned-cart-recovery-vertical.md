# ADR 0007 — Phase 3 vertical: abandoned-cart email recovery

- **Status:** accepted
- **Date:** 2026-05-03
- **Supersedes:** the "Phase 3 schema-only" stipulation in `CLAUDE.md` §6 — for the abandoned-cart vertical only.

## Context

`Pupe_AbandonedCart` (a Magento 2 module living in the storefront repo) is in
production. It runs a 15-minute cron that finds idle quotes and sends three
escalating reminder emails (default: 1h / 24h / 72h), each containing a
recovery link of the form `/pupe_abandoned/cart/restore?token={32-char masked
quote id}`. The module owns its own templates, sender, and reminder log.

The CDP already syncs `AbandonedCart` rows from Magento every 15 minutes
(`apps/api/src/modules/carts/abandoned-cart-sync.service.ts`) and exposes them
read-only at `/carts`. It does not yet send any marketing email; the only
SMTP path is a single-purpose password-reset mailer.

This split has three structural problems:

1. **Two sources of truth for "did we contact the customer".** Reminder log
   is in Magento; the conversion record is in the CDP. We can't compute open
   rate, click rate, or attributed revenue cleanly.
2. **No coupon support.** The Magento module has no mechanism for attaching a
   discount code to a recovery email. Static codes can be added by hand to
   the templates but they are shareable, hard to rotate, and impossible to
   attribute to a specific send.
3. **No tracking surface.** Magento's `TransportBuilder` returns once the
   message hits the relay. There is no delivered/opened/clicked/bounced
   feedback loop, which means we cannot detect deliverability problems and
   cannot suppress addresses that hard-bounce.

`CLAUDE.md` §1 lists Phase 3 ("Email marketing engine + Resend") as
schema-only and §6 forbids implementing Phase 3 features without an ADR.
This is that ADR.

## Decision

Build a **generic Phase 3 email engine** in the CDP — `EmailTemplate`,
`EmailCampaign`, `EmailCampaignStage`, `EmailSend`, `EmailEvent`,
`EmailSuppression` — and use **abandoned-cart recovery as the first (and
currently only) trigger**. The CDP becomes the sole sender. The Magento
module keeps the `cart/restore` controller (extended to apply a coupon when
present) and nothing else; its email cron is disabled as part of cutover.

### What is in scope right now

- All six new Prisma models, generic enough to support future broadcast and
  segment-driven campaigns. The only constraint is `EmailCampaignTrigger`,
  whose enum has a single value `abandoned_cart_stage`. Adding new triggers
  is gated by a follow-up ADR.
- Resend integration (SDK + webhook receiver). MJML + Handlebars renderer.
- Per-stage coupon strategy with three modes: `none`, `static_code` (operator
  pre-creates the rule in Magento), `unique_code` (CDP creates one Magento
  sales rule per stage and calls `/V1/coupons/generate` once per send).
- Cleanup on campaign archive: Magento sales rules created in `unique_code`
  mode are deleted (cascading their generated codes), with a TTL grace
  period so codes already in customer hands keep working until they expire.
- Hard-locked test recipient via `EMAIL_DRY_RUN` + `EMAIL_TEST_RECIPIENT_ALLOWLIST`.
  Default allowlist contains a single address (the project owner). The
  suppression service is the **only path** to dispatch — manual admin sends
  go through the same guard.
- Admin UI: `/campaigns`, `/templates`, `/settings/email` plus per-cart and
  per-customer surfaces in the existing pages. shadcn/ui primitives are
  introduced now (they were always in the locked stack list per `CLAUDE.md`
  §2 — just unused so far).

### What is explicitly out of scope

- SMS, push, in-app notifications, broadcast marketing, segment-driven
  campaigns, A/B testing, drag-and-drop email builder, multi-language
  template variants beyond the existing Spanish ones, cross-tenant
  suppression sharing, multi-step automations beyond a linear stage list.
- The rest of Phase 3 (broadcast and segments) and all of Phase 2 (loader
  script, web events, identity resolution).

### Cutover

The Magento cron stays on until the CDP has run cleanly in `EMAIL_DRY_RUN=true`
for a full day in staging. Then `sales_email/pupe_abandoned_cart/enabled` is
flipped to 0 in Magento admin (one click, one click to revert) and
`EMAIL_DRY_RUN` is flipped to false in production. See
`docs/runbooks/phase3-magento-cutover.md` for the step list.

## Alternatives considered

1. **Keep Magento as sender, add CDP analytics on top.** Rejected: requires
   plumbing reminder log + open/click events from Magento back into the CDP,
   which means duplicating the whole tracking stack inside Magento. We end
   up writing the engine anyway, just in PHP.
2. **Use the existing `MailerService` (nodemailer) with Resend's SMTP.**
   Rejected: SMTP loses the per-message tracking, suppression, and webhook
   feedback that the Resend HTTP API provides. The whole point of choosing
   Resend in `CLAUDE.md` is to use its tracking.
3. **One Magento sales rule per send (vs. per stage).** Rejected: blows up
   `salesrule` row count and degrades cart-rule evaluation cost on every
   storefront request. One rule per stage with on-demand `coupons/generate`
   is the right granularity.

## Consequences

- Brings shadcn/ui from stack-only to actively used. Future Phase 3 surfaces
  inherit the primitives.
- Introduces 4 new BullMQ queues (`email.recovery.schedule`,
  `email.recovery.prepare`, `email.send`, `email.events.resend`).
- Adds Magento `salesrule` rows at a rate of ~one per active stage per
  active campaign (≈3-9 rows per campaign). Magento handles this comfortably.
- Requires `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and
  `MAGENTO_STOREFRONT_URL` in production. Cross-validated at boot.
- Operationally adds a runbook: cutover, suppression-list management,
  campaign archive (with cleanup of unused sales rules).

## Revisit

**2026-11-01.** By then we should have six months of recovery data and a
clear sense of whether broadening `EmailCampaignTrigger` to include
broadcast (Phase 3.2) and segment-match (Phase 3.3) is worth the additional
scope. If yes, that becomes ADR 0008. If no — if recovery is the only thing
the engine ever sends — we should reconsider whether the generic abstraction
was worth carrying.
