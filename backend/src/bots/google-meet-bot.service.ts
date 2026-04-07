import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { getRecordingDir } from '../config/storage.config';

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
  captionHealthInterval?: NodeJS.Timeout;
  hardTimeoutTimer?: NodeJS.Timeout;
  isRunning: boolean;
  /** Number of minutes the bot waits alone before auto-exiting (0 = disabled) */
  autoExitMinutes: number;
  /** Current unfinalised caption state, updated by the scraping closure */
  currentSpeaker: string;
  currentText: string;
  segmentTimestamp: Date;
  /** Tracks how many times the observer has been (re-)attached */
  observerGeneration: number;
  /** Timestamp of the last caption received — used for staleness detection */
  lastCaptionTime: number;
  /** Whether the exposeFunction bridge has been registered on the page */
  bridgeExposed: boolean;
  /** Count of consecutive health-check recoveries (to avoid infinite re-enable loops) */
  recoveryCount: number;
  /** Whether screen recording is enabled for this bot */
  screenRecordingEnabled: boolean;
  /** Whether audio recording is enabled for this bot */
  audioRecordingEnabled: boolean;
  /** Storage path for this bot's recordings */
  storagePath?: string;
}

@Injectable()
export class GoogleMeetBotService implements OnModuleDestroy {
  private readonly logger = new Logger(GoogleMeetBotService.name);

  /** Map of meetingKey -> active bot state */
  private activeBots = new Map<string, ActiveBot>();

  /** Hard timeout for meetings: 4 hours (previously 100 min, too short for long meetings) */
  private readonly HARD_TIMEOUT_MS = 4 * 60 * 60 * 1000;

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
    authStatePath?: string | null; // per-user auth file path (overrides global)
    screenRecordingEnabled?: boolean;
    audioRecordingEnabled?: boolean;
    storagePath?: string;
  }): Promise<EventEmitter> {
    const { meetingUrl, botName, meetingKey } = options;
    const screenRecordingEnabled = options.screenRecordingEnabled ?? true;
    const audioRecordingEnabled = options.audioRecordingEnabled ?? true;
    const emitter = new EventEmitter();

    // Prevent duplicate bots for the same meeting
    if (this.activeBots.has(meetingKey)) {
      throw new Error(`Bot already running for meeting ${meetingKey}`);
    }

    try {
      emitter.emit('status', 'joining');

      // Use per-user auth path if provided, otherwise fall back to global
      const authPath = options.authStatePath !== undefined
        ? options.authStatePath
        : this.resolveAuthPath();

      // Launch Playwright Chromium in headed mode.
      // Audio recording requires a real audio output pipeline — headless
      // Chromium has NO audio sink, so AudioContext/MediaRecorder produce
      // silence.  In Docker, Xvfb + PulseAudio provide virtual display
      // and audio.
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

      // Create browser context with optional auth state and screen recording
      const context = await this.createBotContext(browser, {
        authPath,
        screenRecordingEnabled,
        meetingKey,
        storagePath: options.storagePath,
      });
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
        observerGeneration: 0,
        lastCaptionTime: 0,
        bridgeExposed: false,
        recoveryCount: 0,
        screenRecordingEnabled,
        audioRecordingEnabled,
        storagePath: options.storagePath,
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
  // Browser context creation helper (reused for guest fallback)
  // ---------------------------------------------------------------------------

  private async createBotContext(
    browser: Browser,
    options: {
      authPath?: string | null;
      screenRecordingEnabled?: boolean;
      meetingKey?: string;
      storagePath?: string;
    },
  ): Promise<BrowserContext> {
    const contextOptions: Record<string, any> = {
      viewport: { width: 1280, height: 720 },
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      permissions: ['microphone', 'camera'],
      locale: 'en-US',
      acceptDownloads: true,  // Required for audio recording save via download API
    };

    if (options.authPath) {
      contextOptions.storageState = options.authPath;
    }

    if (options.screenRecordingEnabled && options.meetingKey && options.storagePath) {
      const recordingDir = getRecordingDir(options.storagePath, options.meetingKey);
      contextOptions.recordVideo = {
        dir: recordingDir,
        size: { width: 1280, height: 720 },
      };
      this.logger.log(`Screen recording enabled → ${recordingDir}`);
    }

    return browser.newContext(contextOptions);
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

    // Set up audio recording init script BEFORE navigation
    if (bot.audioRecordingEnabled && bot.storagePath) {
      await this.setupAudioRecordingInitScript(page);
    }

    // Step 1: Navigate to the meeting URL
    emitter.emit('status', 'joining');
    this.logger.log(`Navigating to ${meetingUrl}`);
    await page.goto(meetingUrl, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });

    // Wait for page to fully render (VPS can be slow)
    await page.waitForTimeout(5000);

    // Log current URL + page title for debugging
    this.logger.log(`Page loaded — URL: ${page.url()}, Title: ${await page.title()}`);

    // Handle Google "sign in" redirect or "browser not supported" pages
    await this.handleBlockingPages(page, meetingUrl);

    // ── Guest fallback: if auth failed (still on sign-in page), retry without auth ──
    const currentUrl = page.url();
    if (
      (currentUrl.includes('accounts.google.com') || currentUrl.includes('/signin')) &&
      bot.context.storageState !== undefined
    ) {
      this.logger.warn(
        'Auth state appears expired/invalid. Retrying as guest user...',
      );

      // Close current context (closes all its pages)
      await context.close().catch(() => {});

      // Create new context WITHOUT storageState
      const newContext = await this.createBotContext(bot.browser, {
        authPath: null,
        screenRecordingEnabled: bot.screenRecordingEnabled,
        meetingKey,
        storagePath: bot.storagePath,
      });
      const newPage = await newContext.newPage();

      // Re-setup audio recording on new page
      if (bot.audioRecordingEnabled && bot.storagePath) {
        await this.setupAudioRecordingInitScript(newPage);
      }

      // Update bot references
      bot.context = newContext;
      bot.page = newPage;
      bot.bridgeExposed = false;
      page = newPage;
      context = newContext;

      // Re-navigate
      this.logger.log('Re-navigating to meeting as guest...');
      await page.goto(meetingUrl, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(5000);

      // Handle blocking pages again
      await this.handleBlockingPages(page, meetingUrl);
      this.logger.log('Switched to guest mode successfully');
    }

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

    // Step 13: Log audio recording diagnostics (delayed so tracks have time to arrive)
    if (bot.audioRecordingEnabled) {
      setTimeout(async () => {
        try {
          const audioStatus = await page.evaluate(() => ({
            trackCount: (window as any).__meetbot_trackCount || 0,
            contextState: (window as any).__meetbot_audioContext?.state || 'not created',
            recorderState: (window as any).__meetbot_audioRecorder?.state || 'not created',
            sourceCount: ((window as any).__meetbot_audioSources || []).length,
            chunkCount: (window as any).__meetbot_chunkCount || 0,
            ready: (window as any).__meetbot_audioReady || false,
          }));
          this.logger.log(`Audio recording diagnostics: ${JSON.stringify(audioStatus)}`);
          if (audioStatus.trackCount === 0) {
            this.logger.warn(
              'No audio tracks received — RTCPeerConnection patch may not be intercepting tracks',
            );
          }
          if (audioStatus.contextState === 'suspended') {
            this.logger.warn('AudioContext is still suspended — audio will be silent');
          }
        } catch {
          // Page may have closed
        }
      }, 15_000); // 15s after join — enough time for WebRTC to establish
    }
  }

  // ---------------------------------------------------------------------------
  // Audio recording helpers
  // ---------------------------------------------------------------------------

  /**
   * Inject init script that patches RTCPeerConnection to intercept incoming
   * audio tracks and mix them into a single MediaRecorder stream.
   * Must be called BEFORE navigating to the meeting URL.
   */
  private async setupAudioRecordingInitScript(page: Page): Promise<void> {
    await page.addInitScript(() => {
      // Globals for audio capture — Blobs are collected in-memory and saved
      // at the end via Playwright's download API (avoids base64 corruption).
      (window as any).__meetbot_audioContext = null;
      (window as any).__meetbot_audioDestination = null;
      (window as any).__meetbot_audioRecorder = null;
      (window as any).__meetbot_audioSources = [];
      (window as any).__meetbot_audioChunks = [] as Blob[];
      (window as any).__meetbot_audioReady = false;
      (window as any).__meetbot_trackCount = 0;
      (window as any).__meetbot_chunkCount = 0;

      // Patch RTCPeerConnection to intercept incoming audio tracks
      const OriginalRTC = window.RTCPeerConnection;

      const PatchedRTC = function (this: RTCPeerConnection, ...args: any[]) {
        const pc: RTCPeerConnection = new (OriginalRTC as any)(...args);

        pc.addEventListener('track', (event: RTCTrackEvent) => {
          if (event.track.kind === 'audio') {
            (window as any).__meetbot_trackCount++;
            console.log(
              `[MeetBot] Audio track received (#${(window as any).__meetbot_trackCount}), readyState=${event.track.readyState}`,
            );

            try {
              if (!(window as any).__meetbot_audioContext) {
                const ctx = new AudioContext();
                // CRITICAL: Explicitly resume — AudioContext may start suspended
                if (ctx.state === 'suspended') {
                  ctx.resume().catch(() => {});
                  console.log('[MeetBot] AudioContext was suspended, resuming...');
                }
                console.log(`[MeetBot] AudioContext created, state=${ctx.state}`);
                (window as any).__meetbot_audioContext = ctx;
                (window as any).__meetbot_audioDestination = ctx.createMediaStreamDestination();
              }

              // Ensure AudioContext is running before connecting sources
              const ctx = (window as any).__meetbot_audioContext;
              if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
              }

              const stream = new MediaStream([event.track]);
              const source = ctx.createMediaStreamSource(stream);
              source.connect((window as any).__meetbot_audioDestination);
              (window as any).__meetbot_audioSources.push(source);
              console.log(
                `[MeetBot] Audio source connected (total: ${(window as any).__meetbot_audioSources.length})`,
              );

              // Start recorder if not already started
              if (
                !(window as any).__meetbot_audioRecorder &&
                (window as any).__meetbot_audioDestination
              ) {
                try {
                  // Detect supported mimeType with fallback
                  const mimeType =
                    typeof MediaRecorder !== 'undefined' &&
                    MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                      ? 'audio/webm;codecs=opus'
                      : 'audio/webm';
                  console.log(`[MeetBot] Using mimeType: ${mimeType}`);

                  const recorder = new MediaRecorder(
                    (window as any).__meetbot_audioDestination.stream,
                    { mimeType },
                  );
                  recorder.ondataavailable = (e: BlobEvent) => {
                    if (e.data.size > 0) {
                      (window as any).__meetbot_audioChunks.push(e.data);
                      (window as any).__meetbot_chunkCount++;
                    }
                  };
                  recorder.start(5000); // 5-second chunks
                  (window as any).__meetbot_audioRecorder = recorder;
                  (window as any).__meetbot_audioReady = true;
                  console.log(`[MeetBot] Audio recorder started, state=${recorder.state}`);
                } catch (recErr) {
                  console.error('[MeetBot] Failed to start audio recorder:', recErr);
                }
              }
            } catch (err) {
              console.error('[MeetBot] Audio capture error:', err);
            }
          }
        });

        return pc;
      } as any;

      // Preserve prototype chain
      PatchedRTC.prototype = OriginalRTC.prototype;
      Object.setPrototypeOf(PatchedRTC, OriginalRTC);

      // Copy static properties
      for (const prop of Object.getOwnPropertyNames(OriginalRTC)) {
        if (prop !== 'prototype' && prop !== 'length' && prop !== 'name') {
          try {
            Object.defineProperty(
              PatchedRTC,
              prop,
              Object.getOwnPropertyDescriptor(OriginalRTC, prop) || {},
            );
          } catch {
            // Some properties may not be configurable
          }
        }
      }

      (window as any).RTCPeerConnection = PatchedRTC;
      console.log('[MeetBot] RTCPeerConnection patched for audio capture');
    });
    this.logger.log('Audio recording init script injected');
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
  // Handle blocking pages (browser not supported, sign-in redirect, etc.)
  // ---------------------------------------------------------------------------

  private async handleBlockingPages(
    page: Page,
    meetingUrl: string,
  ): Promise<void> {
    const url = page.url();
    const bodyText = await page.evaluate(() =>
      document.body?.innerText?.substring(0, 500) || '',
    ).catch(() => '');

    this.logger.debug(`Current URL: ${url}`);
    this.logger.debug(`Page text preview: ${bodyText.substring(0, 200)}`);

    // Google may redirect to accounts.google.com for sign-in
    if (url.includes('accounts.google.com')) {
      this.logger.warn('Redirected to Google sign-in. Auth state may be expired.');
      this.logger.warn('Re-run: npm run gen:auth to refresh the session.');
      // Try navigating back to the meeting URL
      await page.goto(meetingUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(3000);
    }

    // "You can't join this video call" or "Check your meeting code"
    const lowerBody = bodyText.toLowerCase();
    if (
      lowerBody.includes("can't join") ||
      lowerBody.includes('check your meeting code') ||
      lowerBody.includes('meeting not found') ||
      lowerBody.includes('invalid meeting')
    ) {
      throw new Error(`Meeting not accessible: ${bodyText.substring(0, 100)}`);
    }

    // "Your browser doesn't support" or "Switch to Chrome"
    if (
      lowerBody.includes("browser doesn't support") ||
      lowerBody.includes('not supported') ||
      lowerBody.includes('switch to chrome') ||
      lowerBody.includes('download chrome')
    ) {
      this.logger.warn(
        'Google Meet says browser is not supported. Attempting to continue anyway...',
      );
      // Try clicking "Join anyway" or similar
      const joinAnywayTexts = ['Join anyway', 'Continue anyway', 'Use this browser'];
      for (const text of joinAnywayTexts) {
        try {
          const btn = page.getByRole('button', { name: text, exact: false });
          if ((await btn.count()) > 0) {
            await btn.first().click({ timeout: 3000 });
            this.logger.log(`Clicked "${text}" to bypass browser check`);
            await page.waitForTimeout(2000);
            return;
          }
        } catch {
          continue;
        }
      }
    }

    // "Get a link you can share" — we're on the Meet home page, not the meeting
    if (
      lowerBody.includes('get a link you can share') ||
      lowerBody.includes('new meeting') ||
      lowerBody.includes('start an instant meeting')
    ) {
      this.logger.warn('Landed on Google Meet home page instead of meeting. Retrying navigation...');
      await page.goto(meetingUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(3000);
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
      // Dump debug info to logs so we can see what the page actually shows
      const debugInfo = await page.evaluate(() => {
        const allButtons = Array.from(
          document.querySelectorAll('button, [role="button"]'),
        );
        return {
          url: window.location.href,
          title: document.title,
          buttons: allButtons
            .map((b) => ({
              text: b.textContent?.trim().substring(0, 80),
              ariaLabel: b.getAttribute('aria-label'),
              visible: (b as HTMLElement).offsetParent !== null,
            }))
            .filter((b) => b.visible)
            .slice(0, 20),
          bodyPreview: document.body?.innerText?.substring(0, 300),
        };
      }).catch(() => ({ url: 'unknown', title: 'unknown', buttons: [], bodyPreview: '' }));

      this.logger.error(
        `Join button not found. Page debug info:\n` +
        `  URL: ${debugInfo.url}\n` +
        `  Title: ${debugInfo.title}\n` +
        `  Visible buttons: ${JSON.stringify(debugInfo.buttons, null, 2)}\n` +
        `  Body preview: ${debugInfo.bodyPreview}`,
      );

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

  /** Maximum seconds a single speaker segment can accumulate before forced finalization */
  private readonly CAPTION_FINALIZE_INTERVAL_SEC = 30;

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

    // Step 2: Expose the bridge function BEFORE injecting the observer
    await this.exposeCaptionBridge(page, meetingKey, emitter);

    // Step 3: Inject MutationObserver (will be called on each health-check too)
    await this.injectCaptionObserver(page, meetingKey);

    // Step 4: Periodic finalization — force-finalize segments that have been
    // accumulating for too long from a single speaker. This prevents data loss
    // if the captions region is recreated and the old text is never reset.
    const finalizeIntervalMs = this.CAPTION_FINALIZE_INTERVAL_SEC * 1000;
    bot.flushInterval = setInterval(() => {
      if (!bot.isRunning || !bot.currentText) return;
      const age = Date.now() - bot.segmentTimestamp.getTime();
      if (age >= finalizeIntervalMs) {
        emitter.emit('caption', {
          speaker: bot.currentSpeaker || 'Unknown',
          text: bot.currentText,
          timestamp: bot.segmentTimestamp,
          isFinal: true,
        } as CaptionEvent);
        this.logger.debug(
          `[Final/Periodic] [${bot.currentSpeaker}] "${bot.currentText}"`,
        );
        // Reset — the next incoming caption will start a fresh segment
        bot.currentSpeaker = '';
        bot.currentText = '';
        bot.segmentTimestamp = new Date();
      }
    }, 10_000); // check every 10s

    // Step 5: Caption health-check — comprehensive monitoring for long meetings.
    // Checks: observer attachment, bridge function, caption staleness, captions enabled.
    // Google Meet can recreate the captions region during long meetings, turn off
    // captions, or rebuild the page context.
    const STALENESS_THRESHOLD_MS = 2 * 60 * 1000; // 2 min without captions = stale
    const MAX_RECOVERY_ATTEMPTS = 10; // prevent infinite re-enable loops

    bot.captionHealthInterval = setInterval(async () => {
      if (!bot.isRunning) return;
      try {
        // Check 1: Is the observer still attached?
        const isObserverHealthy = await page.evaluate(() => {
          return !!(window as any).__meetbot_observerAttached;
        });

        // Check 2: Is the bridge function still available?
        const isBridgeHealthy = await page.evaluate(() => {
          return typeof (window as any).__meetbot_onCaption === 'function';
        });

        // Check 3: Are we receiving captions? (staleness detection)
        const timeSinceLastCaption = bot.lastCaptionTime > 0
          ? Date.now() - bot.lastCaptionTime
          : 0;
        const isStale = bot.lastCaptionTime > 0 && timeSinceLastCaption > STALENESS_THRESHOLD_MS;

        if (!isObserverHealthy || !isBridgeHealthy || isStale) {
          const reasons: string[] = [];
          if (!isObserverHealthy) reasons.push('observer detached');
          if (!isBridgeHealthy) reasons.push('bridge function lost');
          if (isStale) reasons.push(`stale (no captions for ${Math.round(timeSinceLastCaption / 1000)}s)`);

          this.logger.warn(
            `Caption health check failed for ${meetingKey}: ${reasons.join(', ')}. ` +
            `Recovery attempt ${bot.recoveryCount + 1}/${MAX_RECOVERY_ATTEMPTS}`,
          );

          if (bot.recoveryCount >= MAX_RECOVERY_ATTEMPTS) {
            this.logger.error(
              `Max recovery attempts reached for ${meetingKey}. Captions may not work.`,
            );
            return;
          }

          bot.recoveryCount++;

          // Recovery step 1: Re-expose bridge if lost
          if (!isBridgeHealthy) {
            bot.bridgeExposed = false;
            await this.exposeCaptionBridge(page, meetingKey, emitter);
          }

          // Recovery step 2: Re-enable captions (Google Meet may have turned them off)
          if (isStale) {
            this.logger.log(`Re-enabling captions for ${meetingKey}...`);
            await this.enableCaptions(page);
          }

          // Recovery step 3: Re-inject observer
          await this.injectCaptionObserver(page, meetingKey);
        } else {
          // Reset recovery counter on healthy check
          if (bot.recoveryCount > 0) {
            this.logger.log(
              `Caption health restored for ${meetingKey} after ${bot.recoveryCount} recovery attempts`,
            );
            bot.recoveryCount = 0;
          }
        }
      } catch {
        // Page may be closed — ignore
      }
    }, 10_000); // check every 10s

    this.logger.log('Caption scraping active with enhanced health monitoring');
  }

  /**
   * Expose (or re-expose) the __meetbot_onCaption bridge function.
   * This is called once initially and can be re-called if the page context
   * changes (e.g. Google Meet internal SPA navigation).
   */
  private async exposeCaptionBridge(
    page: Page,
    meetingKey: string,
    emitter: EventEmitter,
  ): Promise<boolean> {
    const bot = this.activeBots.get(meetingKey);
    if (!bot) return false;

    // If already exposed, verify it's still working
    if (bot.bridgeExposed) {
      try {
        const bridgeOk = await page.evaluate(() => {
          return typeof (window as any).__meetbot_onCaption === 'function';
        });
        if (bridgeOk) return true;
        this.logger.warn(`Bridge function lost for ${meetingKey} — re-exposing...`);
      } catch {
        // Page may have navigated — need to re-expose
      }
    }

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

          // Track last caption time for staleness detection
          bot.lastCaptionTime = Date.now();

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
      bot.bridgeExposed = true;
      this.logger.log(`Bridge function exposed for ${meetingKey}`);
      return true;
    } catch (err: any) {
      // exposeFunction throws if the function is already registered
      if (err.message?.includes('already been registered')) {
        bot.bridgeExposed = true;
        return true;
      }
      this.logger.error(`Failed to expose __meetbot_onCaption: ${err.message}`);
      return false;
    }
  }

  /**
   * Inject (or re-inject) the MutationObserver into the live Captions region.
   * Safe to call multiple times — it disconnects any previous observer first.
   */
  private async injectCaptionObserver(
    page: Page,
    meetingKey: string,
  ): Promise<void> {
    const bot = this.activeBots.get(meetingKey);
    if (!bot) return;

    bot.observerGeneration++;
    const generation = bot.observerGeneration;

    try {
      const attached = await page.evaluate(() => {
        // Disconnect any previous observer
        if ((window as any).__meetbot_observer) {
          (window as any).__meetbot_observer.disconnect();
          (window as any).__meetbot_observer = null;
        }
        (window as any).__meetbot_observerAttached = false;

        // Find the EXACT captions region — NOT the generic [aria-live] status areas
        const captionsRegion = document.querySelector<HTMLElement>(
          '[role="region"][aria-label*="aption" i]',
        );
        if (!captionsRegion) {
          console.error('[MeetBot] Captions region not found for (re-)attach');
          return false;
        }

        // Verify the region is still connected to the live DOM
        if (!captionsRegion.isConnected) {
          console.error('[MeetBot] Captions region found but not connected to DOM');
          return false;
        }

        console.log(
          '[MeetBot] (Re-)attaching observer to captions region:',
          captionsRegion.getAttribute('aria-label'),
        );

        let lastSpeaker = '';
        let lastText = '';

        // Extract speaker + text from a caption entry node.
        const extractFromNode = (
          node: HTMLElement,
        ): { speaker: string; text: string } | null => {
          const fullText = node.textContent?.trim() || '';
          if (!fullText || fullText.length < 2) return null;

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

        // ── Multi-node debounce: coalesce rapid mutations per caption entry ──
        // Uses a Map keyed by the direct-child node so concurrent speakers
        // don't overwrite each other.
        const pendingNodes = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
        const DEBOUNCE_MS = 150;

        const enqueue = (node: HTMLElement) => {
          // Find the direct child of captionsRegion (the caption entry container)
          let entry: HTMLElement | null = node;
          while (entry && entry.parentElement !== captionsRegion) {
            entry = entry.parentElement;
          }
          if (!entry) {
            // Fallback: use the node itself if we can't find the entry container
            entry = node;
          }

          // Clear any existing debounce timer for this entry
          const existing = pendingNodes.get(entry);
          if (existing) clearTimeout(existing);

          const target = entry; // capture for closure
          pendingNodes.set(
            target,
            setTimeout(() => {
              pendingNodes.delete(target);
              send(target);
            }, DEBOUNCE_MS),
          );
        };

        // Observe ONLY the captions region (not document.body)
        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const n of Array.from(m.addedNodes)) {
              if (n instanceof HTMLElement) enqueue(n);
            }
            if (
              m.type === 'characterData' &&
              m.target?.parentElement instanceof HTMLElement
            ) {
              enqueue(m.target.parentElement as HTMLElement);
            }
          }
        });

        observer.observe(captionsRegion, {
          childList: true,
          characterData: true,
          subtree: true,
        });

        // Store reference so we can disconnect and health-check
        (window as any).__meetbot_observer = observer;
        (window as any).__meetbot_observerAttached = true;

        // Self-healing: if the captionsRegion is detached from the DOM,
        // mark as unhealthy so the Node.js health-check will re-attach.
        const parentObserver = new MutationObserver(() => {
          if (!captionsRegion.isConnected) {
            console.warn('[MeetBot] Captions region detached from DOM');
            (window as any).__meetbot_observerAttached = false;
            observer.disconnect();
            parentObserver.disconnect();
          }
        });
        // Observe the parent to detect removal of the captions region
        if (captionsRegion.parentElement) {
          parentObserver.observe(captionsRegion.parentElement, { childList: true });
        }

        console.log('[MeetBot] Caption observer attached to region');
        return true;
      });

      if (attached) {
        this.logger.log(
          `Caption MutationObserver injected (generation ${generation}) for ${meetingKey}`,
        );
      } else {
        this.logger.warn(
          `Failed to attach caption observer (generation ${generation}) for ${meetingKey} — captions region not found`,
        );
      }
    } catch (err: any) {
      this.logger.warn(`Failed to inject observer: ${err.message}`);
    }
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
    if (bot.captionHealthInterval) clearInterval(bot.captionHealthInterval);
    if (bot.hardTimeoutTimer) clearTimeout(bot.hardTimeoutTimer);

    // Save audio recording: stop MediaRecorder, combine Blobs in browser,
    // trigger a download, and save via Playwright's download API.
    // This avoids base64 encoding issues that corrupt binary WebM data.
    if (bot.audioRecordingEnabled && bot.storagePath) {
      try {
        const recordingDir = getRecordingDir(bot.storagePath, meetingKey);
        const audioPath = path.join(recordingDir, 'audio.webm');

        // Stop the recorder and wait for the final ondataavailable event
        await Promise.race([
          bot.page.evaluate(() => {
            return new Promise<void>((resolve) => {
              const recorder = (window as any).__meetbot_audioRecorder;
              if (recorder && recorder.state === 'recording') {
                recorder.onstop = () => resolve();
                recorder.stop();
              } else {
                resolve();
              }
            });
          }),
          new Promise(resolve => setTimeout(resolve, 5000)),
        ]);

        // Check how many chunks were collected
        const chunkCount = await bot.page.evaluate(
          () => ((window as any).__meetbot_audioChunks || []).length,
        );
        this.logger.log(`Audio recording: ${chunkCount} chunks collected for ${meetingKey}`);

        if (chunkCount > 0) {
          // Trigger a download of the combined audio Blob from inside the page
          const [download] = await Promise.all([
            bot.page.waitForEvent('download', { timeout: 15_000 }),
            bot.page.evaluate(() => {
              const chunks: Blob[] = (window as any).__meetbot_audioChunks || [];
              const blob = new Blob(chunks, { type: 'audio/webm' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'audio.webm';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }),
          ]);
          await download.saveAs(audioPath);
          this.logger.log(`Audio recording saved via download: ${audioPath}`);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to save audio recording: ${err.message}`);
      }
    }

    // Capture video reference BEFORE closing context — video.saveAs() can
    // only succeed AFTER the page/context is closed (Playwright finalises
    // the recording file on close). Calling saveAs before close deadlocks.
    let videoRef: ReturnType<Page['video']> = null;
    if (bot.screenRecordingEnabled && bot.storagePath) {
      try {
        videoRef = bot.page.video();
      } catch {
        // Page might already be closed
      }
    }

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

    // Close browser context — this finalises the video recording file.
    // context.close() can be slow when recording video (Playwright #4148),
    // so enforce a 10s timeout and fall through to browser.close().
    try {
      await Promise.race([
        bot.context.close(),
        new Promise(resolve => setTimeout(resolve, 10_000)),
      ]);
    } catch {
      // Ignore
    }

    // Save screen recording AFTER context close, then merge with audio.
    // Playwright's recordVideo produces video-only frames.  If audio.webm
    // also exists we merge them with ffmpeg into a single screen.webm that
    // has both video and audio.  The temp video-only file is deleted.
    if (videoRef && bot.storagePath) {
      try {
        const recordingDir = getRecordingDir(bot.storagePath, meetingKey);
        const videoOnlyPath = path.join(recordingDir, '_video_tmp.webm');
        const screenPath = path.join(recordingDir, 'screen.webm');
        const audioPath = path.join(recordingDir, 'audio.webm');

        // Save the Playwright video frames to a temp file
        await Promise.race([
          videoRef.saveAs(videoOnlyPath),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('video.saveAs timed out')), 10_000),
          ),
        ]);
        this.logger.log(`Playwright video saved to temp: ${videoOnlyPath}`);

        // Merge video + audio into screen.webm (if audio exists)
        const hasAudio = fs.existsSync(audioPath) && fs.statSync(audioPath).size > 0;
        if (hasAudio) {
          try {
            const { execSync } = require('child_process');
            execSync(
              `ffmpeg -y -i "${videoOnlyPath}" -i "${audioPath}" -c:v copy -c:a copy -shortest "${screenPath}"`,
              { timeout: 120_000, stdio: 'pipe' },
            );
            // Remove temp video-only file
            fs.unlinkSync(videoOnlyPath);
            this.logger.log(`Screen recording (video+audio) saved: ${screenPath}`);
          } catch (mergeErr: any) {
            // ffmpeg failed — fall back to video-only as screen.webm
            this.logger.warn(`ffmpeg merge failed: ${mergeErr.message}. Using video-only.`);
            fs.renameSync(videoOnlyPath, screenPath);
          }
        } else {
          // No audio — just rename the video-only file to screen.webm
          fs.renameSync(videoOnlyPath, screenPath);
          this.logger.log(`Screen recording (video only) saved: ${screenPath}`);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to save screen recording: ${err.message}`);
      }
    }

    // Close the browser process
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
