# Payment Certificates Module — Design Spec
**Date:** 2026-04-28
**Project:** Golf Grove DMS — B+G+P+7+Roof, Production City, Dubai
**Parties:** Regent Star (Developer) · POE Engineering (Consultant) · Modern Building Contracting (Contractor)

---

## Overview

A new module for tracking and processing Interim Payment Certificates (IPCs) under the FIDIC contract. The full flow is:

1. **Contractor** submits a Payment Application (claiming % complete per BOQ item)
2. **Consultant** reviews, adjusts %s, applies financial deductions, and issues the IPC
3. **Developer** records payment against the certified amount

All parties can view the full breakdown including consultant adjustments.

---

## Data Model

### `boq_bills`
Headline sections of the Bill of Quantities.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| bill_no | text | e.g. "1", "2A" |
| title | text | e.g. "Substructure" |
| sort_order | integer | controls display order |

### `boq_items`
Line items within each bill.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| bill_id | uuid FK → boq_bills | |
| item_no | text | e.g. "1.3.2" |
| description | text | |
| qty | numeric | |
| unit | text | e.g. "m³", "m²", "nr" |
| rate | numeric | AED per unit |
| total | numeric | qty × rate, stored on import |
| sort_order | integer | |

### `payment_certificates`
One record per IPC cycle.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| cert_no | integer | sequential, auto-assigned |
| ref_no | text | e.g. "IPC-003" |
| status | text | Draft \| Submitted \| Under Review \| Certified \| Paid |
| submitted_by_name | text | |
| submitted_date | timestamptz | |
| certified_by_name | text | |
| certified_date | timestamptz | |
| paid_date | date | set when developer records payment |
| payment_ref | text | bank ref / cheque no |
| retention_pct | numeric | default 10 |
| advance_recovery | numeric | amount to deduct (AED) |
| vat_pct | numeric | default 5 |
| previously_paid | numeric | auto-calculated from prior certs at submission time |
| notes | text | |
| created_at | timestamptz | |

### `payment_certificate_items`
Per-line-item breakdown for each cert.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| cert_id | uuid FK → payment_certificates | |
| boq_item_id | uuid FK → boq_items | |
| contractor_pct | numeric | 0–100, entered by contractor |
| contractor_amount | numeric | item.total × contractor_pct / 100 |
| consultant_pct | numeric | 0–100, entered by consultant (null until review) |
| consultant_amount | numeric | item.total × consultant_pct / 100 |

---

## Financial Calculation

All derived on-the-fly in JS from stored %s and cert header fields. Nothing derived is persisted.

```
gross_certified      = SUM(consultant_amount) across all items
less_retention       = gross_certified × retention_pct / 100
less_advance         = advance_recovery
less_previously_paid = previously_paid
net_before_vat       = gross_certified - less_retention - less_advance - less_previously_paid
vat_amount           = net_before_vat × vat_pct / 100
net_certified        = net_before_vat + vat_amount
```

`previously_paid` is calculated at the time a new cert is created as the sum of `net_certified` across all prior Certified and Paid certs.

---

## Status Flow

```
Draft → Submitted → Under Review → Certified → Paid
          ↑               |
          └───────────────┘  (retract: consultant returns to contractor)
```

**Constraints:**
- Only one cert may be in Draft or Submitted state at a time
- A new IPC cannot be created while one is already Draft/Submitted
- BOQ cannot be replaced once any payment certificate exists

**Role-gated transitions:**

| Transition | Actor | Button Label |
|---|---|---|
| Create new IPC | contractor, developer | + New IPC |
| Draft → Submitted | contractor | Submit Application |
| Submitted → Under Review | consultant | Begin Review |
| Under Review → Submitted | consultant | Return to Contractor |
| Under Review → Certified | consultant | Issue Certificate |
| Certified → Paid | developer | Record Payment |

---

## UI — Navigation Pages

### `boq` — BOQ Setup
- **Sidebar location:** Admin section (below Subcontractors)
- **Access:** developer, consultant (read-only for contractor and subcontractor)
- **Layout:** grouped table showing all bills and their items

```
Bill 1 — Substructure                               AED 1,250,000
  1.1  Excavation to formation    500  m³   85.00   AED    42,500
  1.2  Blinding concrete           50  m²   45.00   AED     2,250
  ...
Bill 2 — Superstructure                             AED 3,400,000
  ...
                                    CONTRACT SUM    AED 8,750,000
```

- **Import Excel** button (developer + consultant): opens import modal
- **Replace BOQ** button (developer only): blocked if any cert exists; requires confirmModal warning

### `ipc` — Payment Certificates
- **Sidebar location:** Site section (after Transmittals)
- **Access:** all roles
- **Layout:** list table

| Ref No | Submission Date | Contractor Claimed | Consultant Certified | Status | Actions |
|---|---|---|---|---|---|
| IPC-001 | 12 Apr 2026 | AED 1,234,500 | AED 1,180,000 | Paid | View |
| IPC-002 | 28 Apr 2026 | AED 890,000 | — | Draft | View |

- **+ New IPC** button (contractor, developer): disabled if an open cert exists

---

## IPC Detail View

Opened via `viewIPC(id)`, renders inside `openModal()` using `wide: true`.

### Section 1 — BOQ Table with % Inputs
Full bill/item table with two additional columns:

| Item | Description | BOQ Total | Contractor % | Contractor Amt | Consultant % | Consultant Amt |
|---|---|---|---|---|---|---|

- Contractor % column: editable inputs while status is Draft or Submitted (contractor only)
- Consultant % column: editable inputs while status is Under Review (consultant only)
- Amounts auto-calculate as % is typed
- Bill subtotals and contract total update live
- Contractor can see both columns at all times (read-only for consultant column)

### Section 2 — Financial Summary Panel
Shown below the BOQ table. Editable fields (retention %, advance recovery, VAT %) are consultant-only while Under Review.

```
Gross Certified Amount         AED 1,180,000.00
Less: Retention (10%)         (AED   118,000.00)
Less: Advance Recovery        (AED    50,000.00)
Less: Previously Paid         (AED   800,000.00)
Net Before VAT                 AED   212,000.00
VAT (5%)                       AED    10,600.00
NET CERTIFIED                  AED   222,600.00
```

### Section 3 — Audit Trail
Status change history: who acted, what transition, when. Uses existing comments/audit pattern.

---

## BOQ Excel Import

**Expected sheet structure (one sheet, row per line item):**

| Column | Header | Notes |
|---|---|---|
| A | Bill No | e.g. "1" — rows with same Bill No grouped under same bill |
| B | Bill Title | repeated per item in the same bill |
| C | Item No | e.g. "1.3.2" |
| D | Description | |
| E | Qty | numeric |
| F | Unit | text |
| G | Rate | numeric (AED) |

**Import flow:**
1. User uploads `.xlsx` via file input in modal
2. SheetJS parses client-side — no server round-trip
3. Preview table shows first 10 rows
4. On confirm: bulk-insert bills (de-duplicated by bill_no + title), then items in order
5. Success toast: `"Imported 4 bills, 87 items"`

**Replace BOQ flow:**
- Hard-blocked if any `payment_certificates` row exists (toast error)
- If no certs exist: confirmModal warning → delete all items, bills → re-import

---

## Roles & Permissions

| Action | Developer | Consultant | Contractor | Subcontractor |
|---|---|---|---|---|
| View BOQ | ✓ | ✓ | ✓ | — |
| Import / Replace BOQ | ✓ | ✓ | — | — |
| Create new IPC | ✓ | — | ✓ | — |
| Edit contractor %s (Draft/Submitted) | ✓ | — | ✓ | — |
| Begin Review / Return | ✓ | ✓ | — | — |
| Edit consultant %s (Under Review) | — | ✓ | — | — |
| Edit financial deductions (Under Review) | — | ✓ | — | — |
| Issue Certificate | ✓ | ✓ | — | — |
| Record Payment | ✓ | — | — | — |
| View IPC detail | ✓ | ✓ | ✓ | — |

---

## RLS Policies (new tables)

All four new tables follow the existing RLS pattern in `supabase/rls_policies.sql`:
- `authenticated` users can SELECT all rows (visibility for all logged-in parties)
- INSERT / UPDATE / DELETE gated by role via `get_user_role()` helper function

---

## Sidebar & Navigation

Two new entries added to the nav array in `index.html`:

```javascript
{ id: 'boq',  label: 'BOQ Setup',             section: 'Admin' }
{ id: 'ipc',  label: 'Payment Certificates',  section: 'Site'  }
```

Dashboard stat card added: **Certified This Month** — sum of `net_certified` for certs moving to Certified in the current calendar month.

---

## Dependencies

- **SheetJS (xlsx)** — client-side Excel parsing, loaded via CDN `<script>` tag (no npm needed given single-file architecture)
- No new storage buckets required (payment certs are data-only; attachments use the existing `attachments` bucket with `record_type: 'ipc'`)

---

## Out of Scope (this version)

- Variation Order amendments to BOQ line items (can be added in a later sprint as a `boq_variations` table)
- PDF generation of the IPC document
- Email notifications on status transitions
- Nominated subcontractor amount breakdowns
