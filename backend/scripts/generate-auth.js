/* scripts/generate-auth.js
 * Generates auth.json by logging into Google via Playwright.
 * Usage: npm run gen:auth
 */
const { chromium } = require('playwright');
const path = require('path');
require('dotenv').config();

const { GOOGLE_ACCOUNT_EMAIL, GOOGLE_ACCOUNT_PASSWORD } = process.env;

const LOGIN_URL =
  'https://accounts.google.com/ServiceLogin' +
  '?service=wise&passive=true&continue=https%3A%2F%2Fmeet.google.com%2F';

(async () => {
  console.log('🚀 Launching Chromium (headed mode) ...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('📎 Navigating to Google sign-in ...');
  await page.goto(LOGIN_URL);

  // Auto-fill email if provided in .env
  if (await page.isVisible('input[type="email"]')) {
    if (GOOGLE_ACCOUNT_EMAIL) {
      await page.fill('input[type="email"]', GOOGLE_ACCOUNT_EMAIL);
      await page.click('button:has-text("Next")');
      console.log('✅ Email auto-filled from .env');
    } else {
      console.log('👉 Please type your Google email in the browser and click "Next"...');
    }
  }

  // Wait for password field
  await page.waitForSelector('input[type="password"]', { timeout: 0 });

  // Auto-fill password if provided in .env
  if (GOOGLE_ACCOUNT_PASSWORD) {
    await page.fill('input[type="password"]', GOOGLE_ACCOUNT_PASSWORD);
    await page.click('button:has-text("Next")');
    console.log('✅ Password auto-filled from .env');
  } else {
    console.log('👉 Please enter your password (and complete any 2-FA) in the browser...');
  }

  console.log('⏳ Waiting until Google Meet UI appears (complete any 2FA in the browser)...');
  await page.waitForURL(/https:\/\/meet\.google\.com\/.*/, { timeout: 0 });
  await page.waitForSelector('text=/New meeting|Start an instant meeting|Your meetings/i', {
    timeout: 0,
  });

  const savePath = path.resolve(__dirname, '..', 'auth.json');
  await context.storageState({ path: savePath });
  console.log(`✅ Saved logged-in session → ${savePath}`);

  await browser.close();
  console.log('🎉 Done! You can now run the bot. The auth.json file contains your Google session.');
  console.log('⚠️  Do NOT commit auth.json to Git!');
})().catch((err) => {
  console.error('❌ generate-auth failed:', err);
  process.exit(1);
});
