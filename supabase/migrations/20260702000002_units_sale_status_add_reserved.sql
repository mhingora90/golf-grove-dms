-- Migration: 20260702000002_units_sale_status_add_reserved.sql
-- units.sale_status check currently omits 'reserved', so saving a sale with
-- status='reserved' leaves units.sale_status='available' and the Unit Register
-- renders the row as Available. Extend the CHECK to accept 'reserved', then
-- backfill any existing unit_sales rows where the mismatch already occurred.

ALTER TABLE public.units DROP CONSTRAINT IF EXISTS units_sale_status_check;

ALTER TABLE public.units
  ADD CONSTRAINT units_sale_status_check
  CHECK (sale_status IN ('available','reserved','sold','blocked_by_developer'));

UPDATE public.units u
   SET sale_status = 'reserved'
  FROM public.unit_sales us
 WHERE us.unit_id = u.id
   AND us.status  = 'reserved'
   AND u.sale_status = 'available'
   AND u.blocked = false;
