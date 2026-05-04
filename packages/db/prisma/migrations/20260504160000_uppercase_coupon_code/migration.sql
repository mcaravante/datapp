-- Normalize the historical "CAR800" / "Car800" / "car800" zoo of
-- coupon codes into a single canonical uppercase form. Magento
-- accepts any case at checkout but stores whatever the operator
-- typed; the analytics roll-up was treating each variant as a
-- distinct coupon. The order mapper now uppercases at ingest;
-- this migration brings the existing rows in line.
UPDATE "order"
SET coupon_code = UPPER(coupon_code)
WHERE coupon_code IS NOT NULL
  AND coupon_code <> UPPER(coupon_code);
