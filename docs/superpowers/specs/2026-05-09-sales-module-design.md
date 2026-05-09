# Sales Module Design
**Date:** 2026-05-09  
**Project:** Golf Grove DMS  
**Status:** Approved

---

## Overview

New Sales module for tracking unit sales, buyer details, SPA/Oqood status, payment plan schedules, commissions, and discounts for a 98-unit residential development (56 Studio, 42 1BHK). No actual payment receipt tracking — revenue figures are plan-based only.

---

## Navigation

Three sidebar nav items under a "Sales" section group:

| Nav ID | Label | Icon |
|--------|-------|------|
| `usetup` | Unit Setup | ⚙️ |
| `ureg` | Unit Register | 🏠 |
| `srev` | Sales Revenue | 📈 |

All visible to `developer` role only. No access for other roles.

---

## Database Schema

### `units` table
Master list of all units. Populated via Unit Setup.

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
One row per unit when sold or reserved.

```sql
CREATE TABLE unit_sales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id             uuid NOT NULL UNIQUE REFERENCES units(id),
  status              text NOT NULL DEFAULT 'reserved', -- 'reserved' | 'sold'
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
- Unit "available" = no row in `unit_sales`

### `payment_milestones` table
Payment plan schedule per sale — plan-based, not tracking actual receipts.

```sql
CREATE TABLE payment_milestones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_sale_id    uuid NOT NULL REFERENCES unit_sales(id) ON DELETE CASCADE,
  milestone_name  text NOT NULL,   -- 'Booking Deposit', '1st Instalment', 'Handover', etc.
  amount          numeric NOT NULL,
  pct_of_sale     numeric NOT NULL,
  due_date        date,            -- NULL = 'On Handover' / event-based
  sort_order      integer NOT NULL DEFAULT 0
);
```

No `received_date` or `status` — plan-based only.

---

## Module 0: Unit Setup (`usetup`)

Modelled after the BOQ import flow. Allows developer to populate the units master list.

### Features
- **Add single unit** — form: Unit No, Floor, Type, Area sqft, Listed Price
- **Bulk import** — CSV upload with columns: `unit_no, floor, unit_type, area_sqft, listed_price`
- **Edit unit** — edit listed price and area sqft (unit_no, floor, type are identity fields, change with caution)
- **Delete unit** — only if no `unit_sales` row exists (prevents orphan data)
- **Unit list table** — shows all units with edit/delete actions

CSV template downloadable from the page.

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
| Buyer | Buyer name (blue style) or — |
| SPA | Status badge |
| Oqood | Status badge |
| Status | Available / Reserved / Sold badge |

### Filters (dropdowns)
- Type: All / Studio / 1BHK
- Status: All / Available / Reserved / Sold
- Floor: All / dynamic from data

### Search
Free-text on unit number and buyer name.

### Unit Detail Modal
Triggered on row click.

**Header:** `Unit {no} — {type} · Floor {floor}`

**1. Unit Info strip** (4 cols): Unit No · Type · Floor · Area (sqft)

**2. Sale Details grid** (2 cols) — shown for Reserved/Sold only:
- Buyer Name / Sale Date
- Listed Price / Discount (AED + %)
- Sold Price / (empty)
- Commission % / Commission Value (AED)
- Broker Name / Brokerage

**3. SPA + Oqood** (shaded, side-by-side) — Reserved/Sold only:
- SPA Status badge + date
- Oqood Status badge + date

**4. Payment Plan Milestones table** — Reserved/Sold only:
- Columns: Milestone | Amount | % | Due Date
- Header shows contract total: `AED {sold_price} contracted`

For Available units: modal shows unit info only with "No sale recorded" note.

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

### Edit
Modal has Edit button (developer only). Opens editable form with all sale detail fields + milestone rows. Save updates `unit_sales` and `payment_milestones`. "Mark as Available" removes sale record (with confirmation).

### Add Sale
"+ Add Sale" button in modal for Available units (developer only). Same form as Edit.

---

## Module 2: Sales Revenue (`srev`)

### Stats strip (5 cards)
1. Total Units — count (sub: `X Studio · Y 1BHK`)
2. Sold — count, % of total
3. Reserved — count, `SPA in progress` sub-label
4. Available — count, % remaining
5. Total sqft sold — of total sqft

### Revenue strip (3 cards — plan-based only)
1. **Total GDV** — sum of all `listed_price` — green bg
2. **Total Contracted Revenue** — sum of `sold_price` for sold + reserved units — green bg
3. **Remaining GDV** — sum of `listed_price` for available units — neutral bg

### Expected Revenue by Month
Bar chart or table showing sum of `payment_milestones.amount` grouped by `due_date` month/year. Covers all milestones with a due_date. Event-based milestones (null due_date, e.g. Handover) shown separately as "On Handover: AED X".

Layout: simple table with columns Month | Expected AED | Cumulative AED, sorted chronologically.

### Commission + Discount summary (2-col)
**Commission:**
- Total Commission Payable — sum of `sold_price × commission_pct / 100`
- Avg Commission Rate
- Units with broker (count where `broker_name` not null)

**Discount:**
- Total Discount Given — sum of `discount_amount`
- Avg Discount Rate
- Units with discount (count where `discount_amount > 0`)

### Revenue by Unit Type table
Columns: Type | Total | Sold | Avg sqft | Avg Sold Price | Total Revenue  
Rows: Studio, 1BHK

---

## Data Flow

```
units (master list via Unit Setup)
  └── unit_sales (1 row per reserved/sold unit)
        └── payment_milestones (plan schedule, typically 4 rows)
```

All reads: `sb.from('units').select('*, unit_sales(*, payment_milestones(*))')`

---

## RLS Policies

`units`, `unit_sales`, `payment_milestones`: SELECT/INSERT/UPDATE/DELETE for `developer` role only.

---

## Implementation Scope

1. **Migration** — create `units`, `unit_sales`, `payment_milestones` tables + RLS policies
2. **Unit Setup page** (`usetup`) — add/edit/delete single unit + CSV bulk import with template download
3. **Unit Register page** (`ureg`) — table + filters + search + unit detail modal (view + edit + add sale)
4. **Sales Revenue page** (`srev`) — stats strip, revenue cards, monthly expected revenue table, commission/discount summary, by-type breakdown
5. **Nav items** — add `usetup`, `ureg`, `srev` to sidebar under "Sales" section

---

## Out of Scope

- Actual payment receipt tracking
- Document uploads per unit (SPA PDF, Oqood certificate)
- Buyer contact details
- Multi-project support
- Public buyer portal
