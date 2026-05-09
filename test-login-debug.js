const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const page = await browser.newPage();

  await page.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await page.waitForSelector('#login-email', { timeout: 8000 });
  await page.fill('#login-email', 'mohammed@regent-developments.com');
  await page.fill('#login-password', 'Mman1990');
  await page.click('#login-btn');
  await page.waitForSelector('#app-screen', { timeout: 10000 });

  // Navigate to BOQ
  await page.click('text=BOQ Setup');
  await page.waitForTimeout(3000);

  const hash = page.url();
  console.log('Hash:', hash);

  // Get all button texts
  const btns = await page.locator('button').allInnerTexts();
  console.log('Buttons on page:', btns);

  // Get content heading
  const heading = await page.locator('#content h1, #content h2, #content h3').first().innerText().catch(() => 'none');
  console.log('Heading:', heading);

  await page.screenshot({ path: 'boq-debug.png', fullPage: false });
  console.log('Screenshot: boq-debug.png');
  await browser.close();
})();
