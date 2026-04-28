-- Add value_of_works, pc_ps_adjustments, and advance_recovery_pct columns to payment_certificates
-- value_of_works: Manual input for Value of Works Completed (a)
-- pc_ps_adjustments: Manual input for PC & PS Adjustments (b)
-- advance_recovery_pct: Percentage used to calculate Recovery of Advance Payment (f = value_of_works × advance_recovery_pct / 100)

ALTER TABLE payment_certificates
  ADD COLUMN IF NOT EXISTS value_of_works numeric not null default 0,
  ADD COLUMN IF NOT EXISTS pc_ps_adjustments numeric not null default 0,
  ADD COLUMN IF NOT EXISTS advance_recovery_pct numeric not null default 10;
