-- Allow unit_sales.status = 'blocked_by_developer' so developer-blocked units
-- can still carry a client_name (Excel master list tracks intended buyer for
-- blocked stock; we want the same data in the app).

ALTER TABLE unit_sales DROP CONSTRAINT IF EXISTS unit_sales_status_check;

ALTER TABLE unit_sales
  ADD CONSTRAINT unit_sales_status_check
  CHECK (status IN ('reserved', 'sold', 'blocked_by_developer'));
