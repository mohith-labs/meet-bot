import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';

export interface CaptionEvent {
  speaker: string;
  text: string;
  timestamp: Date;
  isFinal: boolean;
}

export interface BotEvents {
  on(event: 'caption', listener: (data: CaptionEvent) => void): this;
  on(event: 'status', listener: (status: string) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'ended', listener: () => void): this;
}

interface ActiveBot {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  emitter: EventEmitter;
  flushInterval?: NodeJS.Timeout;
  endMonitorInterval?: NodeJS.Timeout;
  participantMonitorInterval?: NodeJS.Timeout;
  hardTimeoutTimer?: NodeJS.Timeout;
  isRunning: boolean;
  /** Number of minutes the bot waits alone before auto-exiting (0 = disabled) */
  autoExitMinutes: number;
  /** Current unfinalised caption state, updated by the scraping closure */
  currentSpeaker: string;
  currentText: string;
  segmentTimestamp: Date;
}

@Injectable()
export class GoogleMeetBotService implements OnModuleDestroy {
  private readonly logger = new Logger(GoogleMeetBotService.name);

  /** Map of meetingKey -> active bot state */
  private activeBots = new Map<string, ActiveBot>();

  /** Hard timeout for meetings: 100 minutes */
  private readonly HARD_TIMEOUT_MS = 100 * 60 * 1000;

  constructor(private configService: ConfigService) {}

  /**
   * Launch a bot that joins a Google Meet meeting.
   * Returns an EventEmitter that fires 'caption', 'status', 'error', 'ended' events.
   */
  async joinMeeting(options: {
    meetingUrl: string;
    botName: string;
    meetingKey: string;
    autoExitMinutes?: number; // 0 = disabled
  }): Promise<EventEmitter> {
    const { meetingUrl, botName, meetingKey } = options;
    const emitter = new EventEmitter();

    // Prevent duplicate bots for the same meeting
    if (this.activeBots.has(meetingKey)) {
      throw new Error(`Bot already running for meeting ${meetingKey}`);
    }

    try {
      emitter.emit('status', 'joining');

      // Resolve auth state path
      const authPath = this.resolveAuthPath();

      // Launch Playwright Chromium with Google Meet-optimized flags
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-features=WebRtcHideLocalIpsWithMdns',
          '--disable-notifications',
          '--disable-popup-blocking',
          '--window-size=1280,720',
          '--autoplay-policy=no-user-gesture-required',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
        ],
      });

      // Create browser context with auth state (Google account session)
      const contextOptions: Record<string, any> = {
        viewport: { width: 1280, height: 720 },
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        permissions: ['microphone', 'camera'],
      };

      if (authPath) {
        contextOptions.storageState = authPath;
      }

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();

      // Store the bot reference immediately so cleanup can find it
      const bot: ActiveBot = {
        browser,
        context,
        page,
        emitter,
        isRunning: true,
        autoExitMinutes: options.autoExitMinutes || 0,
        currentSpeaker: '',
        currentText: '',
        segmentTimestamp: new Date(),
      };
      this.activeBots.set(meetingKey, bot);

      // Drive the meeting-entry flow asynchronously
      this.runBot(page, context, meetingUrl, botName, meetingKey, emitter).catch(
        (error) => {
          this.logger.error(`Bot run failed: ${error.message}`);
          emitter.emit('error', error);
          emitter.emit('status', 'failed');
          this.stopBot(meetingKey).catch(() => {});
        },
      );
    } catch (error) {
      this.logger.error(`Failed to launch bot: ${error.message}`);
      emitter.emit('error', error);
      await this.stopBot(meetingKey);
      throw error;
    }

    return emitter;
  }

  // ---------------------------------------------------------------------------
  // Auth path resolution
  // ---------------------------------------------------------------------------

  private resolveAuthPath(): string | null {
    const configPath = this.configService.get<string>('AUTH_STATE_PATH');
    const candidatePaths = [
      configPath,
      path.resolve(process.cwd(), 'auth.json'),
      path.resolve(__dirname, '..', '..', 'auth.json'),
    ].filter(Boolean) as string[];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        this.logger.log(`Using auth state from: ${p}`);
        return p;
      }
    }

    this.logger.warn(
      'No auth.json found. The bot will join as a guest. ' +
        'To join with a Google account, run: npm run gen:auth',
    );
    return null;
  }

  // ---------------------------------------------------------------------------
  // Main bot flow (Recall.ai-inspired)
  // ---------------------------------------------------------------------------

  private async runBot(
    page: Page,
    context: BrowserContext,
    meetingUrl: string,
    botName: string,
    meetingKey: string,
    emitter: EventEmitter,
  ): Promise<void> {
    const bot = this.activeBots.get(meetingKey);
    if (!bot) return;

    // Set hard timeout for the entire meeting
    bot.hardTimeoutTimer = setTimeout(async () => {
      this.logger.warn(
        `Hard timeout reached for meeting ${meetingKey} (${this.HARD_TIMEOUT_MS / 60000} min)`,
      );
      emitter.emit('ended');
      await this.stopBot(meetingKey).catch(() => {});
    }, this.HARD_TIMEOUT_MS);

    // Step 1: Navigate to the meeting URL
    emitter.emit('status', 'joining');
    this.logger.log(`Navigating to ${meetingUrl}`);
    await page.goto(meetingUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Step 2: Turn off mic and camera on the pre-join page
    await this.turnOffMediaDevices(page);

    // Step 3: Dismiss any initial overlays
    await this.dismissOverlays(page);

    // Step 4: If no auth state (guest mode), fill name input
    await this.fillNameIfGuest(page, botName);

    // Step 5: Click join button
    emitter.emit('status', 'awaiting_admission');
    await this.clickJoinButton(page);
    this.logger.log('Clicked join button, waiting for admission...');

    // Step 6: Handle potential 2-step join (preview → confirm)
    await this.handleSecondJoinStep(page);

    // Step 7: Dismiss any post-join overlays
    await this.dismissOverlays(page);

    // Step 8: Wait for meeting entry confirmation
    await this.waitForMeetingEntry(page, meetingKey);

    if (!bot.isRunning) return;

    emitter.emit('status', 'active');
    this.logger.log('Successfully joined the meeting!');

    // Step 9: Enable captions via Shift+C
    await this.enableCaptions(page);

    // Step 10: Start caption scraping via MutationObserver + exposeFunction
    await this.startCaptionScraping(page, meetingKey, emitter);

    // Step 11: Monitor for meeting end
    this.monitorMeetingEnd(page, meetingKey, emitter);

    // Step 12: Monitor participant count for auto-exit when alone
    this.monitorParticipants(page, meetingKey, emitter);
  }

  // ---------------------------------------------------------------------------
  // Turn off mic & camera (Recall.ai approach: click by text)
  // ---------------------------------------------------------------------------

  private async turnOffMediaDevices(page: Page): Promise<void> {
    // Wait briefly for the pre-join UI to render
    await page.waitForTimeout(2000);

    // Try to click "Turn off microphone" button
    try {
      const micBtn = page.getByRole('button', {
        name: /turn off microphone/i,
      });
      if ((await micBtn.count()) > 0) {
        await micBtn.first().click({ timeout: 3000 });
        this.logger.debug('Turned off microphone');
        await page.waitForTimeout(300);
      }
    } catch {
      // Microphone button may not be visible or already off
    }

    // Try to click "Turn off camera" button
    try {
      const camBtn = page.getByRole('button', { name: /turn off camera/i });
      if ((await camBtn.count()) > 0) {
        await camBtn.first().click({ timeout: 3000 });
        this.logger.debug('Turned off camera');
        await page.waitForTimeout(300);
      }
    } catch {
      // Camera button may not be visible or already off
    }

    // Fallback: try aria-label selectors
    const fallbackSelectors = [
      '[aria-label*="microphone" i][aria-label*="turn off" i]',
      '[aria-label*="camera" i][aria-label*="turn off" i]',
      '[data-tooltip*="microphone" i][data-tooltip*="turn off" i]',
      '[data-tooltip*="camera" i][data-tooltip*="turn off" i]',
    ];

    for (const selector of fallbackSelectors) {
      try {
        const btn = page.locator(selector).first();
        if ((await btn.count()) > 0) {
          await btn.click({ timeout: 2000 });
          await page.waitForTimeout(300);
        }
      } catch {
        // Ignore
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Dismiss overlays (Recall.ai approach)
  // ---------------------------------------------------------------------------

  private async dismissOverlays(page: Page): Promise<void> {
    const dismissTexts = ['Got it', 'Dismiss', 'Continue'];

    for (const text of dismissTexts) {
      try {
        const btn = page.getByRole('button', { name: text, exact: false });
        if ((await btn.count()) > 0) {
          await btn.first().click({ timeout: 2000 });
          this.logger.debug(`Dismissed overlay: "${text}"`);
          await page.waitForTimeout(300);
        }
      } catch {
        // Overlay may not exist
      }
    }

    // Also try pressing Escape to dismiss any remaining overlays
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch {
      // Ignore
    }
  }

  // ---------------------------------------------------------------------------
  // Fill name input (guest mode)
  // ---------------------------------------------------------------------------

  private async fillNameIfGuest(page: Page, botName: string): Promise<void> {
    // Ordered by specificity
    const nameSelectors = [
      'input[aria-label="Your name"]',
      'input[placeholder="Your name"]',
      'input[type="text"][jsname]',
      '#c7',
    ];

    for (const selector of nameSelectors) {
      try {
        const input = page.locator(selector).first();
        if ((await input.count()) > 0 && (await input.isVisible())) {
          await input.click();
          await input.fill(botName);
          this.logger.log(`Entered bot name: ${botName}`);
          return;
        }
      } catch {
        continue;
      }
    }

    // Fallback: find any visible text input
    try {
      const inputs = page.locator('input[type="text"]');
      const count = await inputs.count();
      for (let i = 0; i < count; i++) {
        const input = inputs.nth(i);
        if (await input.isVisible()) {
          await input.fill(botName);
          this.logger.log(`Entered bot name via fallback: ${botName}`);
          return;
        }
      }
    } catch {
      // No name input found — likely authenticated via auth.json
    }
  }

  // ---------------------------------------------------------------------------
  // Join button (Recall.ai approach: try multiple button texts)
  // ---------------------------------------------------------------------------

  private async clickJoinButton(page: Page): Promise<void> {
    const joinTexts = [
      'Continue without microphone and camera',
      'Join now',
      'Ask to join',
      'Join meeting',
      'Join call',
      'Join',
      'Done',
      'Continue',
    ];

    for (const text of joinTexts) {
      try {
        const btn = page.getByRole('button', { name: text, exact: false });
        if ((await btn.count()) > 0 && (await btn.first().isVisible())) {
          await btn.first().click({ timeout: 3000 });
          this.logger.log(`Clicked join button: "${text}"`);
          return;
        }
      } catch {
        continue;
      }
    }

    // Fallback: selector-based search
    const joinSelectors = [
      'button[jsname="Qx7uuf"]',
      '[data-tooltip="Ask to join"]',
      '[aria-label="Ask to join"]',
      '[aria-label="Join now"]',
      'button[data-tooltip="Join now"]',
    ];

    for (const selector of joinSelectors) {
      try {
        const btn = page.locator(selector).first();
        if ((await btn.count()) > 0) {
          await btn.click({ timeout: 3000 });
          this.logger.log(`Clicked join button via selector: ${selector}`);
          return;
        }
      } catch {
        continue;
      }
    }

    // Final fallback: evaluate DOM for button text matching
    const clicked = await page.evaluate(() => {
      const targets = [
        ...Array.from(document.querySelectorAll('button')),
        ...Array.from(document.querySelectorAll('[role="button"]')),
      ];
      const joinTexts = [
        'ask to join',
        'join now',
        'join',
        'join meeting',
        'join call',
      ];

      for (const el of targets) {
        const text = el.textContent?.trim().toLowerCase();
        if (text && joinTexts.includes(text)) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      throw new Error(
        'Could not find the join button. The meeting page layout may have changed.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Handle 2-step join preview (Recall.ai approach)
  // ---------------------------------------------------------------------------

  private async handleSecondJoinStep(page: Page): Promise<void> {
    // Some meetings show a preview, then require a second "Join now" click
    await page.waitForTimeout(2000);

    const secondJoinTexts = ['Join now', 'Ask to join', 'Join'];

    for (const text of secondJoinTexts) {
      try {
        const btn = page.getByRole('button', { name: text, exact: false });
        if ((await btn.count()) > 0 && (await btn.first().isVisible())) {
          await btn.first().click({ timeout: 2000 });
          this.logger.log(`Clicked second join step: "${text}"`);
          return;
        }
      } catch {
        continue;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Wait for meeting entry (Recall.ai approach: check for known elements)
  // ---------------------------------------------------------------------------

  private async waitForMeetingEntry(
    page: Page,
    meetingKey: string,
  ): Promise<void> {
    const maxWaitMs = 120_000; // 2 minutes
    const pollMs = 2000;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const bot = this.activeBots.get(meetingKey);
      if (!bot?.isRunning) return;

      // Check for join confirmation signals (Recall.ai approach)
      try {
        // "Leave call" button means we're in the meeting
        const leaveBtn = page.locator(
          '[aria-label*="Leave call" i], [data-tooltip*="Leave call" i]',
        );
        if ((await leaveBtn.count()) > 0) {
          this.logger.debug('Detected "Leave call" button — in meeting');
          return;
        }
      } catch {
        // Ignore
      }

      // Check for admission text
      try {
        const bodyText = await page.textContent('body');
        const lowerText = (bodyText || '').toLowerCase();

        if (
          lowerText.includes("you've been admitted") ||
          lowerText.includes("you're the only one here")
        ) {
          this.logger.debug('Detected admission text — in meeting');
          return;
        }

        // Check for caption/subtitle controls (secondary signal)
        const captionBtn = page.locator(
          '[aria-label*="captions" i], [aria-label*="subtitle" i], [data-tooltip*="caption" i]',
        );
        if ((await captionBtn.count()) > 0) {
          this.logger.debug('Detected caption controls — in meeting');
          return;
        }

        // Check if entry was denied
        if (
          lowerText.includes("you can't join") ||
          lowerText.includes('denied') ||
          lowerText.includes('meeting has ended') ||
          lowerText.includes('not allowed')
        ) {
          throw new Error('Bot was denied entry to the meeting');
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('denied')) {
          throw e;
        }
      }

      await page.waitForTimeout(pollMs);
    }

    throw new Error('Timed out waiting for meeting admission (2 minutes)');
  }

  // ---------------------------------------------------------------------------
  // Enable captions (Recall.ai approach: Shift+C shortcut)
  // ---------------------------------------------------------------------------

  private async enableCaptions(page: Page): Promise<void> {
    // Wait for UI to stabilize
    await page.waitForTimeout(5000);

    // Dismiss any overlays that might block keyboard shortcuts
    await this.dismissOverlays(page);

    // Dismiss any overlay that might block keyboard shortcut delivery
    const overlay = page.locator('div[data-disable-esc-to-close="true"]');
    for (let i = 0; i < 8; i++) {
      if (!(await overlay.isVisible().catch(() => false))) break;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // Try Shift+C keyboard shortcut (Recall.ai's primary approach)
    const maxRetries = 10;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      this.logger.debug(
        `Pressing Shift+C (attempt ${attempt + 1}/${maxRetries})`,
      );

      await page.keyboard.down('Shift');
      await page.keyboard.press('c');
      await page.keyboard.up('Shift');

      // Check if captions region appeared
      const captionRegion = page.locator(
        '[role="region"][aria-label*="Captions" i]',
      );
      try {
        await captionRegion.waitFor({ timeout: 800 });
        if (await captionRegion.isVisible().catch(() => false)) {
          this.logger.log(
            `Captions enabled via Shift+C on attempt ${attempt + 1}`,
          );
          return;
        }
      } catch {
        // Not visible yet
      }

      // Also check if "Turn off captions" button is visible (means captions are ON)
      const ccOffBtn = page.locator('button[aria-label*="Turn off captions" i]');
      if (await ccOffBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        this.logger.log(
          'Captions confirmed ON (Turn off captions button visible)',
        );
        return;
      }

      await page.waitForTimeout(600);
    }

    // Fallback: move mouse to bottom to trigger toolbar, then click CC button
    this.logger.warn(
      'Shift+C did not enable captions, trying button click fallback...',
    );
    await page.mouse.move(500, 700);
    await page.waitForTimeout(300);

    const ccButton = page.locator('button[aria-label*="Turn on captions" i]');
    try {
      await ccButton.waitFor({ state: 'visible', timeout: 4000 });
      await ccButton.click();
      // Verify captions turned on
      const captionRegion = page.locator(
        '[role="region"][aria-label*="Captions" i]',
      );
      if (
        await captionRegion
          .waitFor({ timeout: 5000 })
          .then(() => true)
          .catch(() => false)
      ) {
        this.logger.log('Captions enabled via CC button fallback');
        return;
      }
    } catch {
      this.logger.warn('CC button fallback also failed');
    }

    // Debug: log visible regions
    try {
      const regions = await page.locator('[role="region"]').allTextContents();
      this.logger.warn(`Visible regions: ${JSON.stringify(regions)}`);
    } catch {
      // Ignore
    }

    this.logger.warn(
      'Could not confirm captions are enabled. Caption scraping may not work.',
    );
  }

  // ---------------------------------------------------------------------------
  // Caption scraping (Recall.ai approach: exposeFunction + MutationObserver)
  // ---------------------------------------------------------------------------

  private async startCaptionScraping(
    page: Page,
    meetingKey: string,
    emitter: EventEmitter,
  ): Promise<void> {
    const bot = this.activeBots.get(meetingKey);
    if (!bot) return;

    // -------------------------------------------------------------------------
    // Hybrid approach: MutationObserver scoped to the Captions region ONLY,
    // with exposeFunction bridge to Node.js, and robust speaker extraction.
    //
    // Google Meet has many [aria-live] regions (status announcements, chat, etc).
    // The CAPTIONS region is specifically: [role="region"][aria-label="Captions"]
    // We MUST wait for this exact element and observe ONLY inside it.
    // -------------------------------------------------------------------------

    // Step 1: Wait for the specific Captions region
    this.logger.log('Waiting for Captions region to appear...');
    try {
      // The captions region has aria-label="Captions" (exact) or contains "aption"
      await page.waitForSelector(
        '[role="region"][aria-label*="aption" i]',
        { timeout: 60_000 },
      );
      this.logger.log('Captions region found!');
    } catch {
      this.logger.warn(
        'Could not find Captions region. Captions may not be enabled.',
      );
      return;
    }

    // Step 2: Caption state is stored on the bot object (not closure vars)
    // so that bots.service.ts can read it via getRemainingCaption() before
    // saving the transcript buffer.
    //
    // KEY DESIGN: Google Meet captions are live speech-to-text that REVISE
    // earlier text as more context arrives. For example:
    //   "Hello" → "Hello. How" → "Hello. How?" → "Hello. How are you?"
    // The "?" after "How" was an interim guess that gets corrected.
    //
    // We NEVER finalize based on text changes or timeouts.
    // We only finalize a segment when:
    //   1. The SPEAKER changes (a different person starts talking)
    //   2. Google Meet RESETS the caption bubble (new text is much shorter)
    //   3. The meeting ends (bots.service.ts calls getRemainingCaption)

    // System phrases to filter out (Google Meet accessibility announcements)
    const SYSTEM_PHRASES = [
      'you have joined',
      'joined the call',
      'other person',
      'people in the call',
      'camera is turned',
      'microphone is turned',
      'hand is lowered',
      'hand is raised',
      'is presenting',
      'left the meeting',
      'return to home',
      'leave call',
      'feedback',
      'audio and video',
      'learn more',
      'recording',
      'transcript',
    ];

    // Step 3: Expose the bridge function BEFORE injecting the observer
    try {
      await page.exposeFunction(
        '__meetbot_onCaption',
        (speaker: string, text: string) => {
          if (!bot.isRunning) return;

          const cleanSpeaker = (speaker || '').trim() || bot.currentSpeaker || 'Unknown';
          const cleanText = (text || '').trim();
          if (!cleanText || cleanText.length < 2) return;

          // Filter system messages
          const lower = cleanText.toLowerCase();
          if (SYSTEM_PHRASES.some((p) => lower.includes(p))) return;

          // Exact duplicate — skip
          if (cleanText === bot.currentText && cleanSpeaker === bot.currentSpeaker) return;

          const speakerChanged =
            bot.currentSpeaker !== '' && cleanSpeaker !== bot.currentSpeaker;

          // ── Speaker changed → finalize previous segment ──
          if (speakerChanged && bot.currentText) {
            emitter.emit('caption', {
              speaker: bot.currentSpeaker,
              text: bot.currentText,
              timestamp: bot.segmentTimestamp,
              isFinal: true,
            } as CaptionEvent);
            this.logger.debug(
              `[Final/SpeakerChange] [${bot.currentSpeaker}] "${bot.currentText}"`,
            );
            // Start fresh for the new speaker
            bot.currentSpeaker = cleanSpeaker;
            bot.currentText = cleanText;
            bot.segmentTimestamp = new Date();
            return;
          }

          // ── Same speaker (or first caption) ──
          if (!bot.currentText) {
            bot.currentSpeaker = cleanSpeaker;
            bot.currentText = cleanText;
            bot.segmentTimestamp = new Date();
            return;
          }

          // Check if this is a caption RESET (Google cleared the bubble and
          // started a new one). A reset means the new text is significantly
          // shorter and does NOT begin with the start of the old text.
          const isReset =
            cleanText.length < bot.currentText.length * 0.5 &&
            !cleanText.startsWith(
              bot.currentText.substring(0, Math.min(10, bot.currentText.length)),
            );

          if (isReset) {
            emitter.emit('caption', {
              speaker: bot.currentSpeaker,
              text: bot.currentText,
              timestamp: bot.segmentTimestamp,
              isFinal: true,
            } as CaptionEvent);
            this.logger.debug(
              `[Final/Reset] [${bot.currentSpeaker}] "${bot.currentText}"`,
            );
            bot.currentSpeaker = cleanSpeaker;
            bot.currentText = cleanText;
            bot.segmentTimestamp = new Date();
            return;
          }

          // Otherwise: same speaker, text is being revised or extended.
          // ALWAYS take the latest version from Google's recognizer.
          bot.currentSpeaker = cleanSpeaker;
          bot.currentText = cleanText;
        },
      );
    } catch (err: any) {
      this.logger.error(`Failed to expose __meetbot_onCaption: ${err.message}`);
      return;
    }

    // Step 4: Inject MutationObserver scoped to the Captions region ONLY
    try {
      await page.evaluate(() => {
        // Find the EXACT captions region — NOT the generic [aria-live] status areas
        const captionsRegion = document.querySelector<HTMLElement>(
          '[role="region"][aria-label*="aption" i]',
        );
        if (!captionsRegion) {
          console.error('[MeetBot] Captions region not found');
          return;
        }

        console.log(
          '[MeetBot] Observing captions region:',
          captionsRegion.getAttribute('aria-label'),
        );

        let lastSpeaker = '';
        let lastText = '';

        // Extract speaker + text from a caption entry node.
        // Google Meet caption entries typically look like:
        //   <div>
        //     <div><img ...><span>Speaker Name</span></div>
        //     <div><span>Caption text words...</span></div>
        //   </div>
        // But the exact structure changes. We use a heuristic:
        // walk the children, find the first short text (<40 chars) that
        // is NOT the entire text content — that's the speaker name.
        const extractFromNode = (
          node: HTMLElement,
        ): { speaker: string; text: string } | null => {
          const fullText = node.textContent?.trim() || '';
          if (!fullText || fullText.length < 2) return null;

          // Try to find speaker from child structure
          let speaker = '';
          let captionText = fullText;

          // Strategy 1: Look for an img with alt text (avatar)
          const img = node.querySelector('img');
          if (img && img.alt) {
            speaker = img.alt.trim();
          }

          // Strategy 2: Look at direct child elements
          const directChildren = Array.from(node.children) as HTMLElement[];
          if (directChildren.length >= 2) {
            for (const child of directChildren) {
              const ct = child.textContent?.trim() || '';
              // A speaker label is short and not the full text
              if (
                ct.length > 0 &&
                ct.length < 40 &&
                ct.length < fullText.length * 0.5
              ) {
                speaker = ct;
                captionText = fullText.replace(ct, '').trim();
                break;
              }
            }
          }

          // If speaker is still empty, walk deeper
          if (!speaker) {
            const allSpans = node.querySelectorAll<HTMLElement>('span, div');
            for (const span of allSpans) {
              const st = span.textContent?.trim() || '';
              if (
                st.length > 0 &&
                st.length < 40 &&
                st !== fullText &&
                st.length < fullText.length * 0.5
              ) {
                speaker = st;
                captionText = fullText.replace(st, '').trim();
                break;
              }
            }
          }

          if (!captionText || captionText.length < 1) return null;
          return { speaker: speaker || lastSpeaker, text: captionText };
        };

        const send = (node: HTMLElement): void => {
          const result = extractFromNode(node);
          if (!result) return;
          // Dedup: skip exact same speaker+text
          if (result.speaker === lastSpeaker && result.text === lastText)
            return;
          lastSpeaker = result.speaker || lastSpeaker;
          lastText = result.text;
          try {
            (window as any).__meetbot_onCaption(result.speaker, result.text);
          } catch {
            /* not yet available */
          }
        };

        // Debounce: coalesce rapid mutations within 150ms
        let pending: HTMLElement | null = null;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
          timer = null;
          if (pending) {
            send(pending);
            pending = null;
          }
        };
        const enqueue = (node: HTMLElement) => {
          pending = node;
          if (!timer) timer = setTimeout(flush, 150);
        };

        // Observe ONLY the captions region (not document.body)
        new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const n of Array.from(m.addedNodes)) {
              if (n instanceof HTMLElement) enqueue(n);
            }
            if (
              m.type === 'characterData' &&
              m.target?.parentElement instanceof HTMLElement
            ) {
              // Walk up to find the caption entry (direct child of region)
              let el: HTMLElement | null = m.target
                .parentElement as HTMLElement;
              while (el && el.parentElement !== captionsRegion) {
                el = el.parentElement;
              }
              if (el) enqueue(el);
            }
          }
        }).observe(captionsRegion, {
          childList: true,
          characterData: true,
          subtree: true,
        });

        console.log('[MeetBot] Caption observer attached to region');
      });

      this.logger.log('Caption MutationObserver injected into Captions region');
    } catch (err: any) {
      this.logger.warn(`Failed to inject observer: ${err.message}`);
    }

    // Step 5: No timer-based finalization. The remaining caption is stored
    // on bot.currentText and will be retrieved by bots.service.ts via
    // getRemainingCaption() BEFORE saving the transcript buffer.
    this.logger.log('Caption scraping active — segments will be saved when meeting ends');
  }

  // ---------------------------------------------------------------------------
  // Meeting-end detection (Recall.ai approach: watch for banner text)
  // ---------------------------------------------------------------------------

  private monitorMeetingEnd(
    page: Page,
    meetingKey: string,
    emitter: EventEmitter,
  ): void {
    const bot = this.activeBots.get(meetingKey);
    if (!bot) return;

    const endMonitorInterval = setInterval(async () => {
      if (!bot.isRunning) {
        clearInterval(endMonitorInterval);
        return;
      }

      try {
        const ended = await page.evaluate(() => {
          const text = (document.body.textContent || '').toLowerCase();
          return (
            text.includes('you left the meeting') ||
            text.includes("you've left the call") ||
            text.includes("you've been removed") ||
            text.includes('the meeting has ended') ||
            text.includes('return to home screen') ||
            text.includes('meeting ended') ||
            text.includes('removed from the meeting')
          );
        });

        if (ended) {
          this.logger.log(`Meeting ${meetingKey} has ended`);
          emitter.emit('ended');
          await this.stopBot(meetingKey);
          clearInterval(endMonitorInterval);
        }
      } catch {
        // Page may already be closed — treat as meeting ended
        emitter.emit('ended');
        await this.stopBot(meetingKey).catch(() => {});
        clearInterval(endMonitorInterval);
      }
    }, 5000);

    bot.endMonitorInterval = endMonitorInterval;
  }

  // ---------------------------------------------------------------------------
  // Participant monitoring — auto-exit when bot is alone
  // ---------------------------------------------------------------------------

  private monitorParticipants(
    page: Page,
    meetingKey: string,
    emitter: EventEmitter,
  ): void {
    const bot = this.activeBots.get(meetingKey);
    if (!bot || bot.autoExitMinutes <= 0) return;

    const autoExitMs = bot.autoExitMinutes * 60 * 1000;
    let aloneStartTime: number | null = null;

    const checkInterval = setInterval(async () => {
      if (!bot.isRunning) {
        clearInterval(checkInterval);
        return;
      }

      try {
        // Get participant count from the Google Meet UI
        const participantCount = await page.evaluate(() => {
          // Strategy 1: Look for participant count in the button/badge
          // Google Meet shows participant count near the people icon
          const countEls = document.querySelectorAll(
            '[data-participant-count], [aria-label*="participant" i]',
          );
          for (const el of countEls) {
            const text = el.textContent?.trim() || '';
            const match = text.match(/(\d+)/);
            if (match) return parseInt(match[1], 10);
            // Also check aria-label like "2 participants"
            const label = el.getAttribute('aria-label') || '';
            const labelMatch = label.match(/(\d+)/);
            if (labelMatch) return parseInt(labelMatch[1], 10);
          }

          // Strategy 2: Look for "You're the only one here" text
          const body = document.body.textContent?.toLowerCase() || '';
          if (
            body.includes("you're the only one here") ||
            body.includes('you are the only one here') ||
            body.includes('no one else is here')
          ) {
            return 1;
          }

          // Strategy 3: Count video tiles
          const tiles = document.querySelectorAll(
            '[data-self-name], [data-participant-id]',
          );
          if (tiles.length > 0) return tiles.length;

          // Can't determine — return -1 to indicate unknown
          return -1;
        });

        if (participantCount === -1) {
          // Unknown — don't trigger auto-exit
          return;
        }

        if (participantCount <= 1) {
          // Bot is alone
          if (aloneStartTime === null) {
            aloneStartTime = Date.now();
            this.logger.log(
              `Bot is alone in meeting ${meetingKey}. Will auto-exit in ${bot.autoExitMinutes} minutes if no one joins.`,
            );
          }

          const aloneTime = Date.now() - aloneStartTime;
          if (aloneTime >= autoExitMs) {
            this.logger.log(
              `Auto-exit triggered for meeting ${meetingKey}: alone for ${bot.autoExitMinutes} minutes`,
            );
            emitter.emit('status', 'stopping');
            emitter.emit('ended');
            await this.stopBot(meetingKey);
            clearInterval(checkInterval);
            return;
          }
        } else {
          // Someone else is in the meeting — reset the alone timer
          if (aloneStartTime !== null) {
            this.logger.log(
              `Participant joined meeting ${meetingKey}, resetting auto-exit timer`,
            );
            aloneStartTime = null;
          }
        }
      } catch {
        // Page may be closed — stop monitoring
        clearInterval(checkInterval);
      }
    }, 15000); // Check every 15 seconds

    bot.participantMonitorInterval = checkInterval;
  }

  // ---------------------------------------------------------------------------
  // Stop / cleanup
  // ---------------------------------------------------------------------------

  /**
   * Stop a running bot and release all resources.
   */
  async stopBot(meetingKey: string): Promise<void> {
    const bot = this.activeBots.get(meetingKey);
    if (!bot) return;

    bot.isRunning = false;

    // Clear intervals and timers
    if (bot.flushInterval) clearInterval(bot.flushInterval);
    if (bot.endMonitorInterval) clearInterval(bot.endMonitorInterval);
    if (bot.participantMonitorInterval) clearInterval(bot.participantMonitorInterval);
    if (bot.hardTimeoutTimer) clearTimeout(bot.hardTimeoutTimer);

    // Try to leave the meeting gracefully
    try {
      const leaveBtn = bot.page.locator(
        '[aria-label*="Leave call" i], [data-tooltip*="Leave call" i]',
      );
      if ((await leaveBtn.count()) > 0) {
        await leaveBtn.first().click({ timeout: 3000 });
        this.logger.debug('Clicked "Leave call" button');
        await bot.page.waitForTimeout(1000);
      } else {
        await bot.page.keyboard.down('Control');
        await bot.page.keyboard.down('Alt');
        await bot.page.keyboard.press('KeyQ');
        await bot.page.keyboard.up('Alt');
        await bot.page.keyboard.up('Control');
        await bot.page.waitForTimeout(1000);
      }
    } catch {
      // Page might already be closed
    }

    // Close the browser context and browser
    try {
      await bot.context.close();
    } catch {
      // Ignore
    }

    try {
      await bot.browser.close();
    } catch {
      // Ignore
    }

    this.activeBots.delete(meetingKey);
    this.logger.log(`Bot stopped for meeting ${meetingKey}`);
  }

  /**
   * Get and clear any remaining unfinalised caption from the bot.
   * Must be called BEFORE saveBufferedTranscripts to avoid losing
   * the last segment (especially for single-speaker meetings).
   */
  getRemainingCaption(meetingKey: string): CaptionEvent | null {
    const bot = this.activeBots.get(meetingKey);
    if (!bot || !bot.currentText) return null;

    const caption: CaptionEvent = {
      speaker: bot.currentSpeaker || 'Unknown',
      text: bot.currentText,
      timestamp: bot.segmentTimestamp,
      isFinal: true,
    };

    this.logger.debug(
      `[Final/Flush] [${bot.currentSpeaker}] "${bot.currentText}"`,
    );

    // Clear so it's not returned again
    bot.currentSpeaker = '';
    bot.currentText = '';

    return caption;
  }

  /**
   * Check if a bot is running for a given meeting.
   */
  isRunning(meetingKey: string): boolean {
    const bot = this.activeBots.get(meetingKey);
    return !!bot?.isRunning;
  }

  /**
   * Get all active meeting keys.
   */
  getActiveBotKeys(): string[] {
    return Array.from(this.activeBots.keys());
  }

  /**
   * Cleanup all bots on module shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    const keys = Array.from(this.activeBots.keys());
    await Promise.all(keys.map((key) => this.stopBot(key)));
    this.logger.log('All bots stopped on module destroy');
  }
}
