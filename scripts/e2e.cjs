const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.fill('#registrationBusinessName', 'Proof Café');
  await page.fill('#registrationContactName', 'Sammie Test');
  await page.fill('#registrationEmail', 'proof@example.com');
  await page.check('#registrationTerms');
  await page.check('#registrationFeedback');
  await page.click('#registrationForm button[type="submit"]');
  await page.waitForSelector('#appShell:not([hidden])');

  const productId = await page.textContent('#headerProductId');
  assert.match(productId, /^LFA-CE-[2-9A-HJ-NP-Z]{8}$/);
  assert.equal(await page.textContent('#brandTitle'), 'Proof Café');

  await page.click('nav button[data-screen="customers"]');
  await page.fill('#crmName', 'Alex Customer');
  await page.fill('#crmEmail', 'alex@example.com');
  await page.check('#crmContactConsent');
  await page.click('#btnSaveCustomer');
  const customerCode = await page.inputValue('#crmToken');
  assert.match(customerCode, /^CUST-[2-9A-HJ-NP-Z]{6}$/);

  await page.click('nav button[data-screen="counter"]');
  await page.fill('#scanInput', customerCode);
  await page.click('#btnHandleScan');
  await page.click('#btnCheckIn');
  assert.match(await page.textContent('#currentCustomerSummary'), /1 visits · 5 points/);

  await page.click('nav button[data-screen="cards"]');
  const qrPixels = await page.locator('#cardQrCanvas').evaluate(canvas => {
    const context2d = canvas.getContext('2d');
    const pixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 40 && pixels[index + 1] < 40 && pixels[index + 2] < 40) dark += 1;
    }
    return dark;
  });
  assert.ok(qrPixels > 100, 'QR canvas should contain dark modules');

  await page.click('nav button[data-screen="dashboard"]');
  assert.equal(await page.textContent('#kpiCustomers'), '1');
  assert.equal(await page.textContent('#kpiVisits'), '1');

  await page.click('nav button[data-screen="settings"]');
  const downloadPromise = page.waitForEvent('download');
  await page.click('#btnExportData');
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /proof-caf-backup-\d{4}-\d{2}-\d{2}\.json/);

  assert.deepEqual(errors, []);
  await browser.close();
  console.log('Browser workflow passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
