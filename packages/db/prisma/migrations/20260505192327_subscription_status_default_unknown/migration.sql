-- Flip the column default from `unsubscribed` (the original
-- placeholder) to `unknown` and backfill every customer_profile that
-- landed at `unsubscribed` from the schema default rather than an
-- explicit user/webhook action. Without this, the suppression service
-- blocks 100% of recovery emails because every freshly synced profile
-- inherits `unsubscribed`.
--
-- Heuristic for "default vs explicit unsub": the only way to land on
-- `unsubscribed` deliberately is via the public unsubscribe surface,
-- which writes an `email_suppression` row with reason `unsubscribed`
-- alongside flipping the profile. Profiles whose status is
-- `unsubscribed` but have no matching suppression row are placeholders
-- from the schema default — those are the ones we reset.

ALTER TABLE "customer_profile"
  ALTER COLUMN "subscription_status" SET DEFAULT 'unknown';

UPDATE "customer_profile" cp
SET "subscription_status" = 'unknown'
WHERE cp."subscription_status" = 'unsubscribed'
  AND NOT EXISTS (
    SELECT 1
    FROM "email_suppression" es
    WHERE es."tenant_id" = cp."tenant_id"
      AND es."email_hash" = cp."email_hash"
      AND es."reason" = 'unsubscribed'
  );
