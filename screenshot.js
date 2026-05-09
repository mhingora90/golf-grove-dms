const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\USER\\projects\\golf-grove-dms\\login-screenshot.png', fullPage: false });
  console.log('Screenshot saved to login-screenshot.png');
  await browser.close();
})();
