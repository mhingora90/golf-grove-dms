# Sales Module Design
**Date:** 2026-05-09  
**Project:** Golf Grove DMS  
**Status:** Approved

---

## Overview

New Sales module for tracking unit sales, buyer details, SPA/Oqood status, payment collections, commissions, and discounts for a 98-unit residential development (56 Studio, 42 1BHK).

---

## Navigation

Two sidebar nav items under a "Sales" section group, mirroring the Finance/BOQ/IPC pattern:

| Nav ID | Label | Icon |
|--------|-------|------|
| `ureg` | Unit Register | 🏠 |
| `srev` | Sales Revenue | 📈 |

Both visible to `developer` role only (Regent Developments). Consultant/contractor/subcontractor have no access.

---

## Database Schema

### `units` table
Master list of all 98 units. Set up once; rarely changes.

```sql
CREATE TABLE units (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_no         text NOT NULL UNIQUE,   -- '101', '102', etc.
  floor           integer NOT NULL,
  unit_type       text NOT NULL,          -- 'Studio' | '1BHK'
  area_sqft       numeric NOT NULL,
  listed_price    numeric NOT NULL,
  created_at      timestamptz DEFAULT now()
);
```

### `unit_sales` table
One row per unit when sold or reserved. NULL = available.

```sql
CREATE TABLE unit_sales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id             uuid NOT NULL UNIQUE REFERENCES units(id),
  status              text NOT NULL DEFAULT 'available', -- 'available' | 'reserved' | 'sold'
  buyer_name          text,
  sale_date           date,
  sold_price          numeric,
  discount_amount     numeric DEFAULT 0,
  commission_pct      numeric DEFAULT 0,
  broker_name         text,
  brokerage_name      text,
  spa_status          text DEFAULT 'not_signed',  -- 'not_signed' | 'signed_buyer' | 'fully_signed'
  spa_date            date,
  oqood_status        text DEFAULT 'not_registered', -- 'not_registered' | 'registered'
  oqood_date          date,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
```

Derived fields (computed in JS, not stored):
- `commission_value` = `sold_price × commission_pct / 100`
- `discount_pct` = `discount_amount / listed_price × 100`
- Unit status = derived from `unit_sales.status` (NULL row = available)

### `payment_milestones` table
Payment plan rows per sale.

```sql
CREATE TABLE payment_milestones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_sale_id    uuid NOT NULL REFERENCES unit_sales(id) ON DELETE CASCADE,
  milestone_name  text NOT NULL,        -- 'Booking Deposit', '1st Instalment', etc.
  amount          numeric NOT NULL,
  pct_of_sale     numeric NOT NULL,
  due_date        date,
  received_date   date,
  status          text NOT NULL DEFAULT 'upcoming', -- 'upcoming' | 'pending' | 'paid'
  sort_order      integer NOT NULL DEFAULT 0
);
```

---

## Module 1: Unit Register (`ureg`)

### Table columns (condensed — financial detail in modal)

| Column | Content |
|--------|---------|
| Unit | Unit number (bold) |
| Floor | Floor number |
| Type | Studio / 1BHK |
| Sqft | Area in sqft |
| Listed Price | AED formatted |
| Buyer | Buyer name (blue link style) or — |
| SPA | Status badge |
| Oqood | Status badge |
| Status | Available / Reserved / Sold badge |

### Filters (dropdowns)
- Type: All / Studio / 1BHK
- Status: All / Available / Reserved / Sold
- Floor: All / 1–8 (or however many floors exist)

### Search
Free-text search on unit number and buyer name.

### Unit Detail Modal
Triggered on row click. Structured in four sections:

**Header:** `Unit {no} — {type} · Floor {floor}`

**1. Unit Info strip** (4 cols): Unit No · Type · Floor · Area (sqft)

**2. Sale Details grid** (2 cols):
- Buyer Name / Sale Date
- Listed Price / Discount (AED + %)
- Sold Price / (empty)
- Commission % / Commission Value (AED)
- Broker Name / Brokerage

**3. SPA + Oqood** (side-by-side, shaded bg):
- SPA Status badge + date
- Oqood Status badge + date

**4. Payment Plan Milestones table:**
- Columns: Milestone | Amount | % | Due Date | Received Date | Status
- Progress bar at bottom (collected / total sold price)
- Header shows running total: `AED X of Y received (Z%)`

For Available units: modal shows unit info only, no sale/payment sections.

### Status Badges
| Status | Background | Color |
|--------|-----------|-------|
| Available | `#EAF3DE` | `#3B6D11` |
| Reserved | `#FEF3E8` | `#854F0B` |
| Sold | `#d4edbc` | `#2d6a0a` |
| SPA: Not Signed | `#e8e4dc` | `#666` |
| SPA: Signed Buyer | `#FEF3E8` | `#854F0B` |
| SPA: Fully Signed | `#d4edbc` | `#2d6a0a` |
| Oqood: Not Registered | `#e8e4dc` | `#666` |
| Oqood: Registered | `#d4edbc` | `#2d6a0a` |
| Milestone: Upcoming | `#e8e4dc` | `#888` |
| Milestone: Pending | `#FEF3E8` | `#854F0B` |
| Milestone: Paid | `#d4edbc` | `#2d6a0a` |

### Edit
Modal has Edit button (developer only). Opens editable form with all sale detail fields. Save updates `unit_sales` row and `payment_milestones` rows. No inline editing in table.

---

## Module 2: Sales Revenue (`srev`)

### Stats strip (5 cards)
1. Total Units — `98` (sub: `56 Studio · 42 1BHK`)
2. Sold — count, % of total
3. Reserved — count, `SPA in progress` note
4. Available — count, % remaining
5. Total sqft sold — of total sqft

### Revenue strip (4 cards)
1. Total GDV (Listed) — sum of all listed prices — green bg
2. Total Sold Revenue — sum of sold prices — green bg
3. Revenue Collected — sum of paid milestone amounts — amber bg
4. Outstanding — contracted but uncollected — neutral bg

### Collection Progress bar
`AED {collected} of {contracted} contracted ({pct}%)`  
Styled with `#3B6D11` fill.

### Commission + Discount summary (2-col)
**Commission:**
- Total Commission Payable (sum of commission_value for sold units)
- Avg Commission Rate
- Units with broker (count where broker_name not null)

**Discount:**
- Total Discount Given (sum of discount_amount)
- Avg Discount Rate
- Units with discount (count where discount_amount > 0)

### Revenue by Unit Type table
Columns: Type | Total | Sold | Avg sqft | Avg Sold Price | Total Revenue | Collected  
Rows: Studio, 1BHK

---

## Data Flow

```
units (master list, 98 rows)
  └── unit_sales (1 row when reserved/sold)
        └── payment_milestones (N rows per sale, typically 4)
```

Revenue page aggregates by JOIN + GROUP BY unit_type.  
All reads: `sb.from('units').select('*, unit_sales(*, payment_milestones(*))')`

---

## RLS Policies

- `units`, `unit_sales`, `payment_milestones`: SELECT/INSERT/UPDATE/DELETE for `developer` role only.
- No access for consultant, contractor, subcontractor.

---

## Implementation Scope

1. **Migration**: Create `units`, `unit_sales`, `payment_milestones` tables with RLS.
2. **Seed**: Insert 98 units (56 Studio, 42 1BHK) with listed prices and floor assignments.
3. **Unit Register page** (`ureg`): table + filters + search + click-to-modal.
4. **Unit Detail Modal**: four-section layout, edit form for developer.
5. **Sales Revenue page** (`srev`): all stats, progress bar, commission/discount, type breakdown.
6. **Nav items**: add `ureg` and `srev` to sidebar under "Sales" section.

---

## Out of Scope

- Document uploads per unit (SPA PDF, Oqood certificate) — future phase.
- Buyer contact details — not stored by design decision.
- Multi-project support — single project only.
- Public buyer portal.
