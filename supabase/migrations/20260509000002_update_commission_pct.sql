-- Update seeded unit_sales commission from default 2% to correct 9%
UPDATE unit_sales SET commission_pct = 9 WHERE commission_pct = 2;
