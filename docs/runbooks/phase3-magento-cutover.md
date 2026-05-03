# Phase 3 cutover — abandoned-cart recovery

**Goal:** transfer ownership of abandoned-cart reminder emails from the
Magento module `Pupe_AbandonedCart` to the CDP, without sending duplicate
emails to customers and without losing any in-flight cart.

This runbook is the operational counterpart to ADR
`docs/adr/0007-phase3-abandoned-cart-recovery-vertical.md`.

---

## Pre-flight

Before starting, confirm:

- [ ] Iteration 5 of Phase 3 is deployed in **staging** with
      `EMAIL_ENGINE_ENABLED=true` + `EMAIL_DRY_RUN=true` for at least 24 h.
- [ ] Staging logs show the recovery scheduler running every 5 min and
      `EmailSend` rows being created with `status='suppressed'` for any
      recipient outside `EMAIL_TEST_RECIPIENT_ALLOWLIST`. No exceptions.
- [ ] At least one full end-to-end smoke against `matias.caravante@gmail.com`
      has succeeded: send → click recovery URL → cart restored → coupon
      applied → order placed → `AbandonedCart.status` flips to `recovered`.
- [ ] Resend domain (`mg.datapp.com.ar` or whichever) is verified, SPF/DKIM
      green, with the production webhook endpoint registered and signing
      secret saved in the prod env.
- [ ] `MAGENTO_STOREFRONT_URL` is set to the actual prod storefront base
      URL — NOT the admin REST URL.

If any of those is red, **stop**. Cutover only after they're green.

---

## Cutover sequence

Each step below is **reversible by undoing the previous step**. Don't batch
them — wait for the verification of each before moving to the next.

### Step 1 — Deploy the engine in production with dry-run still on

```
EMAIL_ENGINE_ENABLED=true
EMAIL_DRY_RUN=true
EMAIL_TEST_RECIPIENT_ALLOWLIST=matias.caravante@gmail.com
RESEND_API_KEY=<prod>
RESEND_WEBHOOK_SECRET=<prod>
MAGENTO_STOREFRONT_URL=https://<store-prod>
```

Verify:

- [ ] `apps/api` and `apps/admin` deploy clean (no Zod env errors at boot).
- [ ] `/v1/admin/health` returns 200.
- [ ] BullMQ shows the four new queues (`email.recovery.schedule`,
      `email.recovery.prepare`, `email.send`, `email.events.resend`)
      registered with active workers.
- [ ] Within 5 min the recovery scheduler emits at least one log line
      (debug level: "scanned N abandoned carts, prepared M sends").
- [ ] No `email_send` row is created with `status='queued'` (engine is
      dry-running). Rows should be `status='suppressed'` for non-allowlist
      recipients, and 0 calls hit Resend (check Resend dashboard).

**If anything is off:** roll back by setting `EMAIL_ENGINE_ENABLED=false`
and re-deploying. Magento module keeps sending — no customer impact.

### Step 2 — Disable the Magento module's reminder cron

In Magento admin:

1. Navigate to **Stores → Configuration → Sales → Sales Emails**.
2. Open the **Abandoned Cart Reminders** group.
3. Set **Enabled** to **No**.
4. Save Config.
5. Run `bin/magento cache:clean config` from the Magento app server.

CLI alternative:

```bash
bin/magento config:set sales_email/pupe_abandoned_cart/enabled 0
bin/magento cache:clean config
```

Verify:

- [ ] In `/var/log/pupe_abandoned_cart.log` the next cron tick (every 15
      min) logs `Module disabled, exiting` (or equivalent — see
      `Cron/SendReminders::execute()`).
- [ ] No new rows in `pupe_abandoned_cart_reminder_log` for at least one
      cron cycle.
- [ ] Magento system messages and the abandoned-cart admin grid still
      load (we did not remove the module, only disabled its sender).

**Reverse step:** set the same config back to `1`. The cron resumes within
15 min.

### Step 3 — Flip CDP off dry-run

```
EMAIL_DRY_RUN=false
```

Re-deploy the API. After the rolling restart finishes:

Verify:

- [ ] Recovery scheduler now emits sends with `EmailSend.status='queued'`
      → `'delivered'` (eventually) for real customer emails.
- [ ] Resend dashboard shows a steady stream of accepted messages.
- [ ] First-stage delivery rate is ≥ 95 % within 30 min (check
      `EmailEvent` table for `eventType='delivered'`).
- [ ] No emails sent to addresses present in `EmailSuppression`
      (e.g. previous bounces, complaints).

**Reverse step:** set `EMAIL_DRY_RUN=true` and redeploy. New sends will
be suppressed; in-flight Resend deliveries already on the wire still
complete (this is fine — they're a few seconds at most).

### Step 4 — Watch for 24h

Set a calendar reminder. Keep an eye on:

- Resend dashboard: bounce rate, complaint rate, delivery latency.
- `email_event` table: any `eventType='complained'` or
  `eventType='bounced'` should auto-populate `email_suppression`.
- Sentry: any new errors in `EmailService.dispatchSend` /
  `RecoverySchedulerService` / `PrepareSendProcessor`.
- DB: `SELECT count(*), status FROM email_send GROUP BY status` should
  show a healthy mix; investigate any outsized `failed` count.
- Magento storefront access logs: `/pupe_abandoned/cart/restore` requests
  should resolve to 302 → `/checkout/cart` (i.e. the controller is happy).

If something looks bad, revert Steps 3 and 2 in that order (Step 2 can
stay reverted while you investigate Step 3 — the worst-case is "Magento
keeps sending", which is the pre-cutover state).

---

## Rollback (full)

If cutover fails badly enough to need a full rollback:

1. `EMAIL_DRY_RUN=true` → redeploy. CDP stops sending.
2. Magento admin → re-enable the cron (`enabled=1`).
3. (Optional) `EMAIL_ENGINE_ENABLED=false` → redeploy. Removes the engine
   from the runtime entirely.

After rollback, the system is exactly as it was pre-cutover. Investigate
in staging with the captured logs / metrics; do not retry until the root
cause is fixed.

---

## Post-cutover housekeeping

A week after a clean cutover:

- [ ] Archive any old `pupe_abandoned_cart_reminder_log` rows older than
      90 days from Magento (they're not used by the CDP path).
- [ ] Confirm production env vars `EMAIL_TEST_RECIPIENT_ALLOWLIST` no
      longer matter (set `EMAIL_DRY_RUN=false` and the allowlist becomes
      a no-op for production traffic), but keep them in the env for
      future staging redeploys.
- [ ] Update CLAUDE.md §1 phase table — change Phase 3 from
      "schema stubs only" to "abandoned-cart recovery active; broadcast
      and segment-driven still pending". Reference ADR 0007.
