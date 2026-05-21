-- Multi-contract BOQ support: contracts table + contract_id on boq_bills

CREATE TABLE IF NOT EXISTS contracts (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id   uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         text        NOT NULL DEFAULT 'Main Contract',
  contractor   text,
  contract_type text       DEFAULT 'main'
                           CHECK (contract_type IN ('main','enabling_works','specialist','other')),
  contract_value numeric   DEFAULT 0,
  award_date   date,
  sort_order   integer     DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contracts_select ON contracts FOR SELECT USING (true);
CREATE POLICY contracts_write  ON contracts FOR ALL
  USING (get_user_role() IN ('developer','consultant'))
  WITH CHECK (get_user_role() IN ('developer','consultant'));

ALTER TABLE boq_bills ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES contracts(id) ON DELETE CASCADE;

-- ─── Aquapile Enabling Works contract ─────────────────────────────────────────
DO $$
DECLARE
  v_contract_id uuid;
  v_bill01 uuid;
  v_bill02 uuid;
  v_bill03 uuid;
  v_bill04 uuid;
  v_bill05 uuid;
  v_bill06 uuid;
BEGIN
  INSERT INTO contracts (project_id, name, contractor, contract_type, contract_value, award_date, sort_order)
  VALUES (
    '00000000-0000-0000-0000-000000000002',
    'Enabling Works',
    'Aquapile Contracting LLC',
    'enabling_works',
    2350000,
    '2026-01-27',
    0
  ) RETURNING id INTO v_contract_id;

  -- Bill 01: Site Establishment
  INSERT INTO boq_bills (project_id, contract_id, bill_no, title, sort_order)
  VALUES ('00000000-0000-0000-0000-000000000002', v_contract_id, '01', 'Site Establishment', 0)
  RETURNING id INTO v_bill01;

  INSERT INTO boq_items (bill_id, item_no, description, qty, unit, rate, total, sort_order) VALUES
    (v_bill01, 'A', 'Mobilization – Design, preparation of shop drawings, supply of porta cabins, general requirements and mobilization of plant and equipment for Piling works as per project requirements in line with Authority requirements', 1, 'Item', 35000, 35000, 0),
    (v_bill01, 'B', 'Demobilization', 1, 'Item', 0, 0, 1),
    (v_bill01, 'C', 'Signboard – Design, preparation of shop drawings, supply and fixing of Project Signboard as per Authority requirements and Engineer approval', 1, 'No.', 30000, 30000, 2),
    (v_bill01, 'D', 'Fencing – Design, supply and fixing of PVC Fencing for the plot as per Authorities latest regulations, Master Developer and project requirement', 202, 'LMT', 285, 57570, 3),
    (v_bill01, 'E', 'Excavation and cart away to DM specified location including DM/Authority charges, all in accordance with drawings, specifications and project requirements', 9250, 'm3', 30, 0, 4),
    (v_bill01, 'F', 'Ground Improvement Works – Complete design, approval, execution including approval from Authority, testing, etc., all in accordance with soil report, drawings and Authority requirements', 1, 'Item', 511750, 0, 5);

  -- Bill 02: Dewatering Works
  INSERT INTO boq_bills (project_id, contract_id, bill_no, title, sort_order)
  VALUES ('00000000-0000-0000-0000-000000000002', v_contract_id, '02', 'Dewatering Works', 1)
  RETURNING id INTO v_bill02;

  INSERT INTO boq_items (bill_id, item_no, description, qty, unit, rate, total, sort_order) VALUES
    (v_bill02, 'A', 'Mobilization and installation of Dewatering System complete in all respects including French drains (if required) to keep construction area in dry working condition', 1, 'Item', 50000, 0, 0),
    (v_bill02, 'B', 'Running and maintenance charges for the whole dewatering system during and up to handing over of Enabling Works to Main Contractor', 45, 'day', 1850, 0, 1),
    (v_bill02, 'C', 'Sufficient maintenance staff engaged to provide 24-hour cover of Contractor operations', 1, 'Item', 0, 0, 2),
    (v_bill02, 'D', 'Running and maintenance charges for the whole dewatering system after Enabling Works Contract (complete in all respects)', 1, 'day', 1850, 0, 3),
    (v_bill02, 'E', 'Authority connection fees/renewal fees', 1, 'Item', 0, 0, 4),
    (v_bill02, 'F', 'Nakheel Deposit', 1, 'LS', 50000, 0, 5),
    (v_bill02, 'G', 'Nakheel NOC Fees', 3, 'months', 8500, 0, 6),
    (v_bill02, 'H', 'Water Analysis Fee', 1, 'Each', 1365, 0, 7),
    (v_bill02, 'I', 'Coastal NOC Fees', 3, 'months', 2000, 0, 8),
    (v_bill02, 'J', 'Trakhees NOC Fees', 3, 'months', 7500, 0, 9),
    (v_bill02, 'K', 'Usage Charge / Unit Usage Charge', 1, 'Item', 1850, 0, 10);

  -- Bill 03: Piling Works
  INSERT INTO boq_bills (project_id, contract_id, bill_no, title, sort_order)
  VALUES ('00000000-0000-0000-0000-000000000002', v_contract_id, '03', 'Piling Works', 2)
  RETURNING id INTO v_bill03;

  INSERT INTO boq_items (bill_id, item_no, description, qty, unit, rate, total, sort_order) VALUES
    (v_bill03, 'A',  'Pile Type A1 – 800mm dia bored cast-in-situ pile, 19m length', 4,  'No.', 13120, 52480,  0),
    (v_bill03, 'B',  'Pile Type A1a – 800mm dia bored cast-in-situ pile, 19m length', 1,  'No.', 13120, 13120,  1),
    (v_bill03, 'C',  'Pile Type A2 – 800mm dia bored cast-in-situ pile, 21m length', 8,  'No.', 14150, 113200, 2),
    (v_bill03, 'D',  'Pile Type A3 – 800mm dia bored cast-in-situ pile, 23m length', 1,  'No.', 16625, 16625,  3),
    (v_bill03, 'E',  'Pile Type B1 – 800mm dia bored cast-in-situ pile, 25m length', 2,  'No.', 16700, 33400,  4),
    (v_bill03, 'F',  'Pile Type B2 – 800mm dia bored cast-in-situ pile, 25m length', 2,  'No.', 16700, 33400,  5),
    (v_bill03, 'G',  'Pile Type C1 – 900mm dia bored cast-in-situ pile, 25m length', 2,  'No.', 21220, 42440,  6),
    (v_bill03, 'H',  'Pile Type C2 – 900mm dia bored cast-in-situ pile, 25m length', 2,  'No.', 21275, 42550,  7),
    (v_bill03, 'J',  'Pile Type D1 – 800mm dia bored cast-in-situ pile, 26m length', 4,  'No.', 18120, 72480,  8),
    (v_bill03, 'K',  'Pile Type D2 – 800mm dia bored cast-in-situ pile, 26m length', 2,  'No.', 19650, 39300,  9),
    (v_bill03, 'L',  'Pile Type E1 – 800mm dia bored cast-in-situ pile, 28m length', 4,  'No.', 21900, 87600,  10),
    (v_bill03, 'M',  'Pile Type E2 – 800mm dia bored cast-in-situ pile, 28m length', 3,  'No.', 21850, 65550,  11),
    (v_bill03, 'N',  'Pile Type E3 – 800mm dia bored cast-in-situ pile, 28m length', 2,  'No.', 21900, 43800,  12),
    (v_bill03, 'P',  'Pile Type F1 – 900mm dia bored cast-in-situ pile, 28m length (with lateral capacity 765kN)', 20, 'No.', 24600, 492000, 13),
    (v_bill03, 'Q',  'Pile Type F2 – 900mm dia bored cast-in-situ pile, 28m length', 12, 'No.', 24250, 291000, 14),
    (v_bill03, 'R',  'Pile Type F3 – 900mm dia bored cast-in-situ pile, 28m length', 6,  'No.', 24600, 147600, 15),
    (v_bill03, 'S',  'Pile Type F4 – 900mm dia bored cast-in-situ pile, 28m length', 4,  'No.', 24300, 97200,  16);

  -- Bill 04: Pile Head Breaking & Testing
  INSERT INTO boq_bills (project_id, contract_id, bill_no, title, sort_order)
  VALUES ('00000000-0000-0000-0000-000000000002', v_contract_id, '04', 'Pile Head Breaking & Testing', 3)
  RETURNING id INTO v_bill04;

  INSERT INTO boq_items (bill_id, item_no, description, qty, unit, rate, total, sort_order) VALUES
    (v_bill04, 'A',  'Pile head breaking up to cut-off level for 800mm dia pile', 33, 'No.', 450, 0, 0),
    (v_bill04, 'B',  'Pile head breaking up to cut-off level for 900mm dia pile', 46, 'No.', 500, 0, 1),
    (v_bill04, 'B1', 'Preliminary load test (Bi-directional) – PTP 800mm dia pile', 1, 'No.', 55000, 0, 2),
    (v_bill04, 'B2', 'Preliminary load test (Bi-directional) – PTP 900mm dia pile', 1, 'No.', 60000, 60000, 3),
    (v_bill04, 'C',  'Static load test (Crown Arrangement) for 800mm dia pile – 1.5× design load compression', 1, 'No.', 80000, 80000, 4),
    (v_bill04, 'D',  'Static load test (Crown Arrangement) for 900mm dia pile – 1.5× design load compression', 1, 'No.', 95000, 95000, 5),
    (v_bill04, 'E',  'Dynamic load test (5% of compression piles) – 800mm dia pile', 2, 'No.', 3500, 7000, 6),
    (v_bill04, 'F',  'Dynamic load test (5% of compression piles) – 900mm dia pile', 3, 'No.', 5000, 15000, 7),
    (v_bill04, 'G',  'Sonic core test (10% of piles) – 800mm dia pile', 4, 'No.', 2500, 10000, 8),
    (v_bill04, 'H',  'Sonic core test (10% of piles) – 900mm dia pile', 5, 'No.', 2500, 12500, 9),
    (v_bill04, 'J',  'Integrity test – all 79 piles', 79, 'No.', 30, 2370, 10);

  -- Bill 05: Other Preparation
  INSERT INTO boq_bills (project_id, contract_id, bill_no, title, sort_order)
  VALUES ('00000000-0000-0000-0000-000000000002', v_contract_id, '05', 'Other Preparation', 4)
  RETURNING id INTO v_bill05;

  INSERT INTO boq_items (bill_id, item_no, description, qty, unit, rate, total, sort_order) VALUES
    (v_bill05, 'A', 'Preparation and submission of design and shop drawings', 1, 'Item', 0, 0, 0),
    (v_bill05, 'B', 'Supply of material for piling works', 1, 'Item', 0, 0, 1),
    (v_bill05, 'C', 'Obtaining design approvals for above mentioned works', 1, 'Item', 10000, 10000, 2),
    (v_bill05, 'D', 'All gate passes for labour, equipment and other personnel', 1, 'Item', 0, 0, 3),
    (v_bill05, 'E', 'Removal of surplus material from boring', 1, 'Item', 30000, 30000, 4),
    (v_bill05, 'F', 'Clearance of site', 1, 'Item', 0, 0, 5),
    (v_bill05, 'G', 'Authorities inspection fee', 1, 'Item', 0, 0, 6),
    (v_bill05, 'H', 'Site office – single porta cabin with basic facilities for common use of Engineer and Contractor for duration of works', 1, 'Item', 50000, 50000, 7),
    (v_bill05, 'J', 'Supply of water and electricity', 1, 'Item', 40000, 40000, 8),
    (v_bill05, 'K', 'Coordination with Authorities', 1, 'Item', 0, 0, 9),
    (v_bill05, 'L', 'Survey of site for control points', 1, 'Item', 23815, 23815, 10),
    (v_bill05, 'M', 'Storage yard at site', 1, 'Item', 0, 0, 11),
    (v_bill05, 'N', 'Shovel, bobcat and other tools/machinery necessary to execute and complete the works', 1, 'Item', 0, 0, 12),
    (v_bill05, 'P', 'Access for machines including drilling machines and other equipment', 1, 'Item', 0, 0, 13),
    (v_bill05, 'Q', 'Work permits, demarcation and re-demarcation', 1, 'Item', 0, 0, 14),
    (v_bill05, 'R', 'NOCs from all Authorities – Excavation NOC, Sand Shifting NOCs, Road Closure NOCs', 1, 'Item', 13000, 13000, 15),
    (v_bill05, 'S', 'Submission of as-built piling drawings', 1, 'Item', 0, 0, 16),
    (v_bill05, 'T', 'Submission of test reports', 1, 'Item', 0, 0, 17),
    (v_bill05, 'U', 'Reinstatement of roads, interlock, kerbstone etc. to RTA standard prior to handover', 1, 'Item', 0, 0, 18),
    (v_bill05, 'W', 'Backfilling up to piling working platform level and cart away after piling works', 1, 'Item', 70000, 70000, 19);

  -- Bill 06: Security & Insurances
  INSERT INTO boq_bills (project_id, contract_id, bill_no, title, sort_order)
  VALUES ('00000000-0000-0000-0000-000000000002', v_contract_id, '06', 'Security & Insurances', 5)
  RETURNING id INTO v_bill06;

  INSERT INTO boq_items (bill_id, item_no, description, qty, unit, rate, total, sort_order) VALUES
    (v_bill06, 'A', 'Security – protect site and works from unauthorized entry, fire; control labour force to prevent nuisance or trespass', 1, 'Item', 0, 0, 0),
    (v_bill06, 'B', 'All Insurances for the Works', 1, 'Item', 25000, 25000, 1),
    (v_bill06, 'C', 'Demobilization and handing over – remove all debris to Authority approved point, hand over to Main Contractor with all documentation', 1, 'Item', 0, 0, 2);

END $$;
