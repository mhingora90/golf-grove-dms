# Role Journey Tests — Design Spec
**Date:** 2026-04-30
**Project:** Golf Grove DMS

---

## Goal

Full end-to-end journey tests for all 4 user roles: developer, consultant, contractor, subcontractor. Each journey covers every action that role can perform — both at the API/DB layer and in the browser UI.

---

## File Structure

```
tests/
  journeys/
    developer-journey.js      ← refactor existing (add Playwright section)
    consultant-journey.js     ← new
    contractor-journey.js     ← new
    subcontractor-journey.js  ← new
  fixtures/
    sample.pdf                (architecture drawing PDF)
    sample.dwg                (AutoCAD drawing)
    sample.xlsx               (generated drawing register)
    sample-submittal.pdf      (material submittal PDF)
  helpers/
    api.js                    (existing)
    auth.js                   (existing — loginAs, loginDev)
    seed.js                   (existing — createDrawing, cleanup)
  config.js                   (existing — TEST_ACCOUNTS, APP_URL)
```

Each journey file runs in two parts:
1. **Part 1 — API tests**: Direct Supabase REST calls using service role for setup, test account JWT for RLS assertions. Fast (~20s).
2. **Part 2 — Playwright UI tests**: Real browser via `loginAs(page, role, APP_URL)`. Tests navigation, button visibility, form submission, file uploads. Slower (~3min).

Run individually: `node tests/journeys/contractor-journey.js`

---

## Role Permissions Reference

From `can()` in `index.html:670`:

| Permission | developer | consultant | contractor | subcontractor |
|------------|:---------:|:---------:|:---------:|:-------------:|
| approve | ✓ | ✓ | ✗ | ✗ |
| upload (drawing) | ✓ | ✓ | ✓ | ✗ |
| raise (NCR) | ✓ | ✓ | ✗ | ✗ |
| submit | ✓ | ✓ | ✓ | ✓ |
| manageUsers | ✓ | ✗ | ✗ | ✗ |
| manageSubs | ✓ | ✗ | ✓ | ✗ |
| submitMS | ✗ | ✗ | ✓ | ✓ |
| manageRegister | ✓ | ✓ | ✗ | ✗ |

IR/Transmittal/RFI create: all roles (`canCreateOnPage` returns true for submit=true or unconditionally).
Correspondence/Punch List create: approve roles only (developer, consultant).

---

## Coverage Matrix

| Module / Action | developer | consultant | contractor | subcontractor |
|-----------------|:---------:|:---------:|:---------:|:-------------:|
| **Drawing Register** | | | | |
| View list | ✓ | ✓ | ✓ | ✓ |
| Upload DWG/PDF (new revision) | ✓ | ✓ | ✓ | skip |
| Approve drawing | ✓ | ✓ | skip | skip |
| Advance CDE (WIP→Shared→Published→Archived) | ✓ | ✓ | skip | skip |
| Batch approve | ✓ | ✓ | skip | skip |
| Bulk import XLSX | ✓ | ✓ | skip | skip |
| Export CSV | ✓ | ✓ | ✓ | ✓ |
| Link related drawings | ✓ | ✓ | skip | skip |
| Void drawing | ✓ | ✓ | skip | skip |
| Drawing review (code A/B/C/D + markup) | ✓ | ✓ | skip | skip |
| **Submittals** | | | | |
| Submit (PDF upload) | ✓ | ✓ | ✓ | ✓ |
| Review — all 4 outcome codes | ✓ | ✓ | skip | skip |
| Batch mark reviewed | ✓ | ✓ | skip | skip |
| Resubmit | skip | skip | ✓ | ✓ |
| **Submittal Register** | | | | |
| Add item | ✓ | ✓ | skip | skip |
| Delete item | ✓ | ✓ | skip | skip |
| Import CSV/XLSX | ✓ | ✓ | skip | skip |
| **Inspection Requests** | | | | |
| Create IR | ✓ | ✓ | ✓ | ✓ |
| Respond (Pass/Fail/Conditional/Correction) | ✓ | ✓ | skip | skip |
| Re-inspect | skip | skip | ✓ | ✓ |
| **NCRs** | | | | |
| Raise NCR | ✓ | ✓ | skip | skip |
| Submit CAP | skip | skip | ✓ | skip |
| Verify CAP | ✓ | ✓ | skip | skip |
| Reject CAP | ✓ | ✓ | skip | skip |
| Close NCR | ✓ | ✓ | skip | skip |
| **RFIs** | | | | |
| Create | ✓ | ✓ | ✓ | ✓ |
| Respond | ✓ | ✓ | skip | skip |
| Close | ✓ | ✓ | skip | skip |
| **Transmittals** | | | | |
| Create | ✓ | ✓ | ✓ | ✓ |
| Acknowledge receipt | ✓ | ✓ | ✓ | ✓ |
| **Correspondence** | | | | |
| Create | ✓ | ✓ | skip | skip |
| Close | ✓ | ✓ | skip | skip |
| **Punch List** | | | | |
| Add item | ✓ | ✓ | skip | skip |
| Update item | ✓ | ✓ | skip | skip |
| Close item | ✓ | ✓ | skip | skip |
| **Method Statements** | | | | |
| Submit MS (PDF upload) | skip | skip | ✓ | ✓ |
| Review — Approved | ✓ | ✓ | skip | skip |
| Review — Rejected | ✓ | ✓ | skip | skip |
| **Subcontractors** | | | | |
| Add | ✓ | skip | ✓ | skip |
| Remove | ✓ | skip | ✓ | skip |
| **User Management** | | | | |
| View all users | ✓ | skip | skip | skip |
| Change role | ✓ | skip | skip | skip |
| **Comments** | | | | |
| Post comment (cross-module) | ✓ | ✓ | ✓ | ✓ |

---

## Part 1 — API Test Structure (per journey)

Pattern mirrors `developer-journey.js`:
- Service role for INSERT/setup (bypasses RLS)
- `toDelete` tracker + `runCleanup()` at end
- `pass/fail/skip/warn` reporters
- Each module = one `async function testXxx()` called from `main()`

Consultant journey = developer journey minus `testUsers()` and `testSubcontractors()`.
Contractor journey = subset: drawings (view + upload record only), submittals, IRs, RFIs, transmittals, method statements (submit), subcontractors (manage), CAP submit on seeded NCR.
Subcontractor journey = smallest subset: submittals, IRs, RFIs, transmittals, method statements (submit), comments.

---

## Part 2 — Playwright UI Test Structure (per journey)

Uses `APP_URL` (Vercel) — required for Supabase Storage file uploads.
Uses `loginAs(page, role, APP_URL)` from `tests/helpers/auth.js`.

### Common UI tests (all roles):
1. Login → `#app-screen` visible, role badge matches role
2. Click each allowed nav item → no JS errors, page title updates
3. FAB (+) button visible on allowed pages, absent on blocked pages

### File upload tests by role:

**developer / consultant:**
- Drawing: open drawing detail → Upload Revision → `setInputFiles(sample.dwg)` → submit → revision row appears
- Submittal: open new submittal form → `setInputFiles(sample-submittal.pdf)` → submit → row appears in list
- Bulk import: Drawing Register → Bulk Import → `setInputFiles(sample.xlsx)` → parse → rows appear in staging table

**contractor:**
- Drawing: open drawing detail → Upload Revision → `setInputFiles(sample.pdf)` → submit → revision row appears
- Submittal: new submittal → `setInputFiles(sample-submittal.pdf)` → submit → row appears
- Method Statement: new MS → `setInputFiles(sample-submittal.pdf)` → submit → row appears in MS list

**subcontractor:**
- Method Statement: new MS → `setInputFiles(sample-submittal.pdf)` → submit → row appears
- Submittal: new submittal → `setInputFiles(sample-submittal.pdf)` → submit → row appears
- Verify: drawing list visible but no "Upload Revision" button present

### Negative UI assertions (per role):
- **contractor/subcontractor**: No "Approve" button on drawing rows
- **subcontractor**: No "Upload Revision" button on drawing detail
- **contractor/subcontractor**: No "Raise NCR" button (FAB hidden on NCR page)
- **consultant/contractor/subcontractor**: No User Management nav item
- **consultant/subcontractor**: No Subcontractors manage buttons

---

## Test Accounts

From `tests/config.js`:

| Role | Email | Password |
|------|-------|----------|
| developer | test.developer@golfgrove.test | GGTest2026! |
| consultant | test.consultant@golfgrove.test | GGTest2026! |
| contractor | test.contractor@golfgrove.test | GGTest2026! |
| subcontractor | test.subcontractor@golfgrove.test | GGTest2026! |

Ensure accounts exist: `node tests/setup-test-accounts.js`

---

## Run Order

```bash
node tests/journeys/developer-journey.js
node tests/journeys/consultant-journey.js
node tests/journeys/contractor-journey.js
node tests/journeys/subcontractor-journey.js
```

Or parallel: all 4 simultaneously (each uses own browser context, own seeded data).

---

## Known Issues to Account For

- Duplicate `doResubmit` at lines 2930 and 3774 — contractor resubmit test should verify which fires
- `comments` table uses `message` field (not `content`) — confirmed in developer journey
- Playwright uploads require `APP_URL` not `LOCAL_URL` (Storage requires HTTPS)
