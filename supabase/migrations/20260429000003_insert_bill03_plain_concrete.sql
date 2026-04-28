-- Insert missing 3.01 PLAIN CONCRETE items into Bill 03 (Sub-Structure Concrete Works)
-- bill_id: fb67f039-ea43-4e6f-bd24-a231e2606f79
-- Existing Bill 03 items start at sort_order=8; shift them up by 2 to make room

UPDATE boq_items
SET sort_order = sort_order + 2
WHERE bill_id = 'fb67f039-ea43-4e6f-bd24-a231e2606f79';

INSERT INTO boq_items (bill_id, item_no, description, qty, unit, rate, total, sort_order)
VALUES
  ('fb67f039-ea43-4e6f-bd24-a231e2606f79', '3.01.A', '100mm thick below foundations',             1640, 'sq.m', 68,  111520, 8),
  ('fb67f039-ea43-4e6f-bd24-a231e2606f79', '3.01.B', '150mm thick Grade Slab with A-252 mesh',    704,  'sq.m', 130, 91520,  9);
