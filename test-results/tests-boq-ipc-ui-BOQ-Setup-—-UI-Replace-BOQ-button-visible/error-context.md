# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\boq-ipc-ui.test.js >> BOQ Setup — UI >> Replace BOQ button visible
- Location: tests\boq-ipc-ui.test.js:90:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 60000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]: Regent Developments
    - generic [ref=e6]: Golf Grove DMS
    - generic [ref=e7]: Document Management System · Production City, Dubai
  - generic [ref=e8]:
    - generic [ref=e9] [cursor=pointer]: Sign In
    - generic [ref=e10] [cursor=pointer]: Register
  - generic [ref=e11]:
    - generic [ref=e12]:
      - generic [ref=e13]: Email Address
      - textbox "you@company.com" [ref=e14]
    - generic [ref=e15]:
      - generic [ref=e16]: Password
      - textbox "••••••••" [ref=e17]
    - button "Sign In" [ref=e18] [cursor=pointer]
```

# Test source

```ts
  1   | #!/usr/bin/env node
  2   | /**
  3   |  * BOQ Setup & Payment Certificates — UI Tests
  4   |  * Golf Grove DMS — Part B (Playwright)
  5   |  *
  6   |  * Tests the actual UI from a logged-in session:
  7   |  *   - BOQ page loads with data, bill headers, item counts
  8   |  *   - Import Excel, Edit, Replace BOQ, + New button visibility
  9   |  *   - Edit mode toggle (inputs appear, Save/Cancel, exits cleanly)
  10  |  *   - IPC page loads with module stats, + New, View buttons
  11  |  *   - IPC detail view with BOQ items and financial summary
  12  |  *   - Hash persistence, sidebar navigation
  13  |  *
  14  |  * Requires:
  15  |  *   - Dev server running on localhost:3000
  16  |  *   - Logged in as developer role (contractor can't access manage BOQ)
  17  |  *
  18  |  * Run:
  19  |  *   npx playwright test tests/boq-ipc-ui.test.js --reporter=list
  20  |  */
  21  | 
  22  | const { test, expect } = require('@playwright/test');
  23  | 
  24  | const BASE = 'http://localhost:3000';
  25  | const EMAIL = 'mohammed@regent-developments.com';
  26  | const PASSWORD = 'Mman1990';
  27  | 
  28  | async function login(page) {
  29  |   await page.goto(BASE);
  30  |   // Wait for either the login form or the dashboard (if already logged in)
  31  |   await page.waitForTimeout(1000);
  32  |   const isLoginPage = await page.getByPlaceholder('Email').isVisible().catch(() => false);
  33  |   if (isLoginPage) {
  34  |     await page.getByPlaceholder('Email').fill(EMAIL);
  35  |     await page.getByPlaceholder('Password').fill(PASSWORD);
  36  |     await page.getByRole('button', { name: 'Sign In' }).click();
  37  |     // Wait for the dashboard to appear
  38  |     await page.waitForTimeout(3000);
  39  |   }
  40  |   // Verify we're on a page (either dashboard or already logged in)
  41  |   await page.waitForTimeout(500);
  42  | }
  43  | 
  44  | async function navTo(page, hash) {
  45  |   await page.evaluate((h) => {
  46  |     window.location.hash = h;
  47  |     // Also call loadApp() to force re-render
  48  |     if (typeof loadApp === 'function') loadApp();
  49  |   }, hash);
  50  |   // Wait for the loading spinner to disappear and actual content to appear
> 51  |   await page.waitForFunction(() => {
      |              ^ Error: page.waitForFunction: Test timeout of 60000ms exceeded.
  52  |     const content = document.getElementById('content');
  53  |     return content && !content.textContent?.includes('Loading...');
  54  |   }, { timeout: 10000 });
  55  | }
  56  | 
  57  | async function btnExists(page, name) {
  58  |   try { return await page.getByRole('button', { name }).isVisible(); }
  59  |   catch(e) { return false; }
  60  | }
  61  | 
  62  | async function countEls(page, sel) { return await page.locator(sel).count().catch(() => 0); }
  63  | 
  64  | // ═══════════════════════════════════════════════════════════════════════════
  65  | // BOQ SETUP — UI Tests
  66  | // ═══════════════════════════════════════════════════════════════════════════
  67  | 
  68  | test.describe('BOQ Setup — UI', () => {
  69  | 
  70  |   test('page loads with BOQ data', async ({ page }) => {
  71  |     await login(page);
  72  |     await navTo(page, 'boq');
  73  |     const text = await page.locator('#content').textContent();
  74  |     expect(text.length).toBeGreaterThan(500);
  75  |     expect(text.toLowerCase()).toMatch(/bill|item|description|aED|total|contract sum/i);
  76  |   });
  77  | 
  78  |   test('Import Excel button visible', async ({ page }) => {
  79  |     await login(page);
  80  |     await navTo(page, 'boq');
  81  |     expect(await btnExists(page, 'Import Excel')).toBeTruthy();
  82  |   });
  83  | 
  84  |   test('Edit button visible', async ({ page }) => {
  85  |     await login(page);
  86  |     await navTo(page, 'boq');
  87  |     expect(await btnExists(page, 'Edit')).toBeTruthy();
  88  |   });
  89  | 
  90  |   test('Replace BOQ button visible', async ({ page }) => {
  91  |     await login(page);
  92  |     await navTo(page, 'boq');
  93  |     expect(await btnExists(page, 'Replace BOQ')).toBeTruthy();
  94  |   });
  95  | 
  96  |   test('+ New button visible', async ({ page }) => {
  97  |     await login(page);
  98  |     await navTo(page, 'boq');
  99  |     expect(await btnExists(page, '+ New')).toBeTruthy();
  100 |   });
  101 | 
  102 |   test('stat bar shows bill and item counts', async ({ page }) => {
  103 |     await login(page);
  104 |     await navTo(page, 'boq');
  105 |     const text = await page.locator('#content').textContent();
  106 |     expect(text).toMatch(/\d+\s*bills/i);
  107 |     expect(text).toMatch(/\d+\s*items/i);
  108 |   });
  109 | 
  110 |   test('CONTRACT SUM displayed', async ({ page }) => {
  111 |     await login(page);
  112 |     await navTo(page, 'boq');
  113 |     const text = await page.locator('#content').textContent();
  114 |     expect(text).toMatch(/CONTRACT\s*SUM/i);
  115 |   });
  116 | 
  117 |   test('edit mode toggles correctly', async ({ page }) => {
  118 |     await login(page);
  119 |     await navTo(page, 'boq');
  120 | 
  121 |     // Enter edit mode
  122 |     await page.getByRole('button', { name: 'Edit' }).click();
  123 |     await page.waitForTimeout(1500);
  124 | 
  125 |     const inputs = await countEls(page, 'input.boq-edit');
  126 |     expect(inputs).toBeGreaterThan(0);
  127 | 
  128 |     // Save and Cancel visible
  129 |     expect(await btnExists(page, 'Save Changes')).toBeTruthy();
  130 |     expect(await btnExists(page, 'Cancel')).toBeTruthy();
  131 | 
  132 |     // Cancel exits edit mode
  133 |     await page.getByRole('button', { name: 'Cancel' }).click();
  134 |     await page.waitForTimeout(1000);
  135 | 
  136 |     const inputsAfter = await countEls(page, 'input.boq-edit');
  137 |     expect(inputsAfter).toBe(0);
  138 | 
  139 |     // Edit button reappears
  140 |     expect(await btnExists(page, 'Edit')).toBeTruthy();
  141 |   });
  142 | 
  143 |   test('BOQ table has bill headers', async ({ page }) => {
  144 |     await login(page);
  145 |     await navTo(page, 'boq');
  146 |     const text = await page.locator('#content').textContent();
  147 |     expect(text).toMatch(/site works|sub-structure|block work/i);
  148 |   });
  149 | });
  150 | 
  151 | // ═══════════════════════════════════════════════════════════════════════════
```