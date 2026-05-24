-- Migration: 20260524000002_units_add_sale_status.sql
-- Add sale_status to units so CSV import can set available/sold/blocked_by_developer
-- without creating skeleton unit_sales records.

ALTER TABLE public.units ADD COLUMN IF NOT EXISTS
  sale_status text NOT NULL DEFAULT 'available'
  CHECK (sale_status IN ('available','sold','blocked_by_developer'));

-- Backfill from existing unit_sales (sold status)
UPDATE public.units u
SET sale_status = 'sold'
WHERE EXISTS (
  SELECT 1 FROM public.unit_sales us WHERE us.unit_id = u.id AND us.status = 'sold'
);

-- Backfill blocked column → sale_status
UPDATE public.units SET sale_status = 'blocked_by_developer' WHERE blocked = true;
