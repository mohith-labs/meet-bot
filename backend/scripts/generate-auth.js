/* scripts/generate-auth.js
 * Generates auth.json by logging into Google via Playwright.
 * Usage: npm run gen:auth
 *
 * Flow:
 *   1. Opens a headed Chromium at the Google sign-in page.
 *   2. Best-effort auto-fills email / password from .env (optional).
 *   3. Polls the browser context for Google session cookies. As soon as a
 *      logged-in session is detected (regardless of which page Google lands
 *      on after 2FA, or which UI language the account uses) the storage
 *      state is snapshotted in memory.
 *   4. Waits briefly for Google Meet to load (so Meet-origin storage is
 *      captured too), then writes auth.json and exits.
 *   5. If the browser window is closed or the process is interrupted after a
 *      session was detected, the last snapshot is still written to disk.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { GOOGLE_ACCOUNT_EMAIL, GOOGLE_ACCOUNT_PASSWORD, AUTH_STATE_PATH } = process.env;

const LOGIN_URL =
  'https://accounts.google.com/ServiceLogin' +
  '?service=wise&passive=true&continue=https%3A%2F%2Fmeet.google.com%2F';

const MEET_URL = 'https://meet.google.com/';
const MEET_URL_RE = /^https:\/\/meet\.google\.com\//;

// Cookies that Google sets only for an authenticated session.
const SESSION_COOKIE_NAMES = ['SID', 'HSID', 'SSID', '__Secure-1PSID', '__Secure-3PSID'];

// How often to check for a logged-in session.
const POLL_INTERVAL_MS = 2000;
// After login is detected, how long to wait for Meet to show up before we
// navigate there ourselves.
const MEET_WAIT_MS = 45_000;

const savePath = AUTH_STATE_PATH
  ? path.resolve(process.cwd(), AUTH_STATE_PATH)
  : path.resolve(__dirname, '..', 'auth.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastState = null; // most recent storageState snapshot with a valid session
let saved = false;
let shuttingDown = false;

function writeState(state, reason) {
  if (saved) return;
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  fs.writeFileSync(savePath, JSON.stringify(state, null, 2));
  saved = true;
  console.log(`✅ Saved logged-in session → ${savePath}${reason ? ` (${reason})` : ''}`);
  console.log('🎉 Done! You can now run the bot. The auth.json file contains your Google session.');
  console.log('⚠️  Do NOT commit auth.json to Git!');
}

function hasSessionCookies(cookies) {
  return cookies.some(
    (c) => SESSION_COOKIE_NAMES.includes(c.name) && /(^|\.)google\.com$/.test(c.domain),
  );
}

async function bestEffortAutofill(page) {
  // Email step
  try {
    const email = page.locator('input[type="email"]');
    await email.waitFor({ state: 'visible', timeout: 15_000 });
    if (GOOGLE_ACCOUNT_EMAIL) {
      await email.fill(GOOGLE_ACCOUNT_EMAIL);
      await page.keyboard.press('Enter');
      console.log('✅ Email auto-filled from .env');
    } else {
      console.log('👉 Please type your Google email in the browser and click "Next"...');
    }
  } catch {
    // Already past the email step (e.g. account chooser) — nothing to do.
  }

  // Password step
  try {
    const password = page.locator('input[type="password"]');
    await password.waitFor({ state: 'visible', timeout: 60_000 });
    if (GOOGLE_ACCOUNT_PASSWORD) {
      await password.fill(GOOGLE_ACCOUNT_PASSWORD);
      await page.keyboard.press('Enter');
      console.log('✅ Password auto-filled from .env');
    } else {
      console.log('👉 Please enter your password (and complete any 2-FA) in the browser...');
    }
  } catch {
    // Passkey / already signed in / password step never shown — fine.
  }
}

(async () => {
  console.log('🚀 Launching Chromium (headed mode) ...');
  const browser = await chromium.launch({
    headless: false,
    // Reduce the chance of Google's "This browser or app may not be secure" block.
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // If the user closes the window after signing in, still persist the session.
  browser.on('disconnected', () => {
    if (shuttingDown) return;
    if (lastState) {
      writeState(lastState, 'browser closed');
      process.exit(0);
    }
    if (!saved) {
      console.error('❌ Browser was closed before a Google session was detected. auth.json was NOT written.');
      process.exit(1);
    }
  });

  const onInterrupt = async () => {
    shuttingDown = true;
    if (lastState) {
      writeState(lastState, 'interrupted');
    } else {
      console.error('\n❌ Interrupted before a Google session was detected. auth.json was NOT written.');
    }
    await browser.close().catch(() => {});
    process.exit(lastState ? 0 : 1);
  };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onInterrupt);

  console.log('📎 Navigating to Google sign-in ...');
  await page.goto(LOGIN_URL);

  // Don't block the session poll on the autofill steps.
  const autofill = bestEffortAutofill(page).catch(() => {});

  console.log('⏳ Waiting for you to finish signing in (complete any 2FA in the browser)...');

  // ---- Phase 1: wait until Google session cookies exist -------------------
  let warnedInsecure = false;
  for (;;) {
    const cookies = await context.cookies().catch(() => []);
    if (hasSessionCookies(cookies)) break;

    // Surface Google's automation block if it appears, so the user isn't left guessing.
    if (!warnedInsecure) {
      const blocked = await page
        .getByText(/this browser or app may not be secure/i)
        .isVisible()
        .catch(() => false);
      if (blocked) {
        warnedInsecure = true;
        console.warn(
          '⚠️  Google is blocking sign-in from this automated browser. ' +
            'Try again with a different account, or sign in from a regular Chrome profile and export cookies.',
        );
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  await autofill;

  console.log('🔑 Google session detected.');
  lastState = await context.storageState();

  // ---- Phase 2: give Meet a chance to load so its origin storage is captured
  const activePage = () => context.pages().find((p) => MEET_URL_RE.test(p.url())) || page;
  const deadline = Date.now() + MEET_WAIT_MS;
  let onMeet = false;
  while (Date.now() < deadline) {
    if (context.pages().some((p) => MEET_URL_RE.test(p.url()))) {
      onMeet = true;
      break;
    }
    lastState = await context.storageState().catch(() => lastState);
    await sleep(POLL_INTERVAL_MS);
  }

  if (!onMeet) {
    console.log('↪️  Meet did not open on its own, navigating to it now ...');
    try {
      await page.goto(MEET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (err) {
      console.warn(`⚠️  Could not open Meet (${err.message}). Saving session anyway.`);
    }
  }

  // Let Meet settle, then take the final snapshot.
  await activePage().waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  lastState = await context.storageState().catch(() => lastState);

  if (!hasSessionCookies(lastState.cookies || [])) {
    console.error('❌ Session cookies disappeared before saving. Please run gen:auth again.');
    shuttingDown = true;
    await browser.close();
    process.exit(1);
  }

  writeState(lastState);
  shuttingDown = true;
  process.off('SIGINT', onInterrupt);
  process.off('SIGTERM', onInterrupt);
  await browser.close();
})().catch((err) => {
  if (lastState && !saved) {
    writeState(lastState, 'error recovery');
    process.exit(0);
  }
  console.error('❌ generate-auth failed:', err);
  process.exit(1);
});
