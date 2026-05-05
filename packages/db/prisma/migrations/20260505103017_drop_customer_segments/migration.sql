-- Iteration 3 of the segment-as-customer-group reframe (per ADR-style
-- discussion + iteration 1+2 commits 38c6871 / 2ad1f1c). Customer
-- groups now drive the /segments surface entirely; the legacy
-- CustomerSegment / CustomerSegmentMember tables have no consumers
-- left in code (admin UI swapped in iter 2, API module removed in
-- this commit). Drop them.
--
-- IRREVERSIBLE in production. Restore path is the latest pg_dump.

DROP TABLE IF EXISTS "customer_segment_member";
DROP TABLE IF EXISTS "customer_segment";

-- The matching enum was introduced for `CustomerSegment.type`. No
-- other table references it.
DROP TYPE IF EXISTS "SegmentType";
