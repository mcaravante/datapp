-- =====================================================================
--  Daily blue-dollar quote (Bluelytics)
-- =====================================================================
--
-- Backs the ARS/USD toggle on /insights and /reports. One row per day,
-- shared across tenants because the cotización is universal. Backfill
-- happens via `pnpm --filter @datapp/api cli rates:blue:backfill`; a
-- daily BullMQ job keeps it current.

CREATE TABLE "currency_rate" (
    "date"       DATE NOT NULL,
    "source"     TEXT NOT NULL DEFAULT 'bluelytics',
    "blue_buy"   DECIMAL(14,4) NOT NULL,
    "blue_sell"  DECIMAL(14,4) NOT NULL,
    "blue_avg"   DECIMAL(14,4) NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_rate_pkey" PRIMARY KEY ("date")
);
