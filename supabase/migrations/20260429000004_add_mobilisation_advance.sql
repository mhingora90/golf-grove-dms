-- Add mobilisation_advance_paid column to payment_certificates
-- This represents the total mobilisation advance paid to the contractor,
-- which is recovered progressively across IPCs.

ALTER TABLE payment_certificates
  ADD COLUMN IF NOT EXISTS mobilisation_advance numeric not null default 0;
