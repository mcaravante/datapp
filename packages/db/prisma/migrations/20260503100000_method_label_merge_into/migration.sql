-- Add the optional alias pointer to AnalyticsMethodLabel. When set,
-- the breakdown SQL groups by the canonical code so multiple raw
-- codes collapse into a single line in /reports.

ALTER TABLE "analytics_method_label"
    ADD COLUMN "merge_into_code" TEXT;
