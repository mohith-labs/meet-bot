import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

export type BotSessionStatus = 'valid' | 'expired' | 'unknown';

export interface BotAuthStatus {
  isConfigured: boolean;
  method: 'upload' | 'oauth' | 'global' | null;
  lastUpdated: string | null;
  email: string | null;
  /** Result of the last Google session check (bot run or health check) */
  sessionStatus: BotSessionStatus;
  sessionCheckedAt: string | null;
}

/** Cookies Google only sets for an authenticated session. */
const SESSION_COOKIE_NAMES = ['SID', 'HSID', 'SSID', '__Secure-1PSID', '__Secure-3PSID'];

/** Top-level metadata keys we add to Playwright storage-state files. */
const METADATA_KEYS = [
  '_method',
  '_email',
  '_uploadedAt',
  '_refreshedAt',
  '_sessionStatus',
  '_sessionCheckedAt',
];

const MEET_URL = 'https://meet.google.com/';

@Injectable()
export class BotAuthService {
  private readonly logger = new Logger(BotAuthService.name);

  /** Directory where per-user auth state files are stored */
  private readonly authDir: string;

  /** Google OAuth client (initialized lazily when credentials are configured) */
  private oauthClient: OAuth2Client | null = null;

  constructor(private readonly configService: ConfigService) {
    this.authDir = path.resolve(
      this.configService.get<string>('AUTH_DATA_DIR', '.data/auth'),
    );
    // Ensure the auth directory exists
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Auth file management
  // ---------------------------------------------------------------------------

  /**
   * Get the auth file path for a specific user.
   */
  private getUserAuthPath(userId: string): string {
    return path.join(this.authDir, `${userId}.auth.json`);
  }

  /**
   * Get the bot auth status for a user.
   */
  getAuthStatus(userId: string): BotAuthStatus {
    const userAuthPath = this.getUserAuthPath(userId);

    // Check per-user auth file first
    if (fs.existsSync(userAuthPath)) {
      const stats = fs.statSync(userAuthPath);
      const authData = this.readAuthFile(userAuthPath);
      return {
        isConfigured: true,
        method: authData?._method || 'upload',
        lastUpdated: stats.mtime.toISOString(),
        email: authData?._email || null,
        sessionStatus: authData?._sessionStatus || 'unknown',
        sessionCheckedAt: authData?._sessionCheckedAt || null,
      };
    }

    // Fall back to global auth.json
    const globalPath = this.resolveGlobalAuthPath();
    if (globalPath) {
      const stats = fs.statSync(globalPath);
      const authData = this.readAuthFile(globalPath);
      return {
        isConfigured: true,
        method: 'global',
        lastUpdated: stats.mtime.toISOString(),
        email: null,
        sessionStatus: authData?._sessionStatus || 'unknown',
        sessionCheckedAt: authData?._sessionCheckedAt || null,
      };
    }

    return {
      isConfigured: false,
      method: null,
      lastUpdated: null,
      email: null,
      sessionStatus: 'unknown',
      sessionCheckedAt: null,
    };
  }

  /**
   * Save an uploaded auth.json file for a user.
   */
  saveAuthFile(userId: string, fileContent: string, email?: string): void {
    // Validate the content is valid JSON
    let parsed: any;
    try {
      parsed = JSON.parse(fileContent);
    } catch {
      throw new BadRequestException('Invalid JSON: the uploaded file is not valid JSON');
    }

    // Validate it looks like a Playwright storage state
    if (!parsed.cookies && !parsed.origins) {
      throw new BadRequestException(
        'Invalid auth.json format: expected Playwright storage state with "cookies" and/or "origins" fields',
      );
    }

    // Add metadata
    parsed._method = 'upload';
    parsed._email = email || null;
    parsed._uploadedAt = new Date().toISOString();

    const userAuthPath = this.getUserAuthPath(userId);
    fs.writeFileSync(userAuthPath, JSON.stringify(parsed, null, 2), 'utf-8');
    this.logger.log(`Auth file saved for user ${userId}`);
  }

  /**
   * Save OAuth-derived auth state for a user.
   * Google OAuth tokens are stored as a Playwright-compatible storage state.
   */
  saveOAuthState(
    userId: string,
    cookies: any[],
    origins: any[],
    email: string,
  ): void {
    const state = {
      cookies,
      origins,
      _method: 'oauth',
      _email: email,
      _uploadedAt: new Date().toISOString(),
    };

    const userAuthPath = this.getUserAuthPath(userId);
    fs.writeFileSync(userAuthPath, JSON.stringify(state, null, 2), 'utf-8');
    this.logger.log(`OAuth auth state saved for user ${userId} (${email})`);
  }

  /**
   * Delete the auth file for a user.
   */
  deleteAuthFile(userId: string): boolean {
    const userAuthPath = this.getUserAuthPath(userId);
    if (fs.existsSync(userAuthPath)) {
      fs.unlinkSync(userAuthPath);
      this.logger.log(`Auth file deleted for user ${userId}`);
      return true;
    }
    return false;
  }

  /**
   * Resolve the auth file path for a user's bot.
   * Returns per-user path if it exists, otherwise falls back to global auth.json.
   */
  resolveAuthPathForUser(userId: string): string | null {
    const userAuthPath = this.getUserAuthPath(userId);
    if (fs.existsSync(userAuthPath)) {
      return userAuthPath;
    }
    return this.resolveGlobalAuthPath();
  }

  // ---------------------------------------------------------------------------
  // Session maintenance (write-back + expiry checks)
  // ---------------------------------------------------------------------------

  /** True when the storage state contains Google's authenticated-session cookies. */
  hasSessionCookies(state: { cookies?: any[] } | null | undefined): boolean {
    return !!state?.cookies?.some(
      (c) =>
        SESSION_COOKIE_NAMES.includes(c.name) && /(^|\.)google\.com$/.test(c.domain || ''),
    );
  }

  /**
   * Overwrite an auth file with a fresh Playwright storage state captured from a
   * live browser context. Google rotates session cookies while the browser is
   * in use, so persisting the latest state keeps the saved session alive for
   * much longer than the original snapshot would.
   *
   * Existing metadata (_method, _email, ...) is preserved.
   */
  persistRefreshedState(authPath: string, state: any): boolean {
    if (!this.hasSessionCookies(state)) {
      this.logger.warn(
        `Not writing refreshed auth state to ${authPath}: no Google session cookies present`,
      );
      return false;
    }

    const existing = this.readAuthFile(authPath) || {};
    const now = new Date().toISOString();
    const merged: Record<string, any> = {
      cookies: state.cookies || [],
      origins: state.origins || [],
    };
    for (const key of METADATA_KEYS) {
      if (existing[key] !== undefined) merged[key] = existing[key];
    }
    merged._refreshedAt = now;
    merged._sessionStatus = 'valid';
    merged._sessionCheckedAt = now;

    this.writeAuthFileAtomic(authPath, merged);
    this.logger.log(`Refreshed Google session written to ${authPath}`);
    return true;
  }

  /** Record the outcome of a session check without touching the cookies. */
  markSessionStatus(authPath: string, status: BotSessionStatus): void {
    const existing = this.readAuthFile(authPath);
    if (!existing) return;
    existing._sessionStatus = status;
    existing._sessionCheckedAt = new Date().toISOString();
    this.writeAuthFileAtomic(authPath, existing);
    if (status === 'expired') {
      this.logger.warn(
        `Google session in ${authPath} has EXPIRED. Re-run "npm run gen:auth" ` +
          'or upload a fresh auth.json in Settings → Bot Authentication.',
      );
    }
  }

  /**
   * Every cookie-based auth file we manage: the global auth.json plus each
   * per-user file. OAuth-derived files are skipped because they hold API
   * tokens, not a browser session.
   */
  listSessionAuthPaths(): string[] {
    const paths = new Set<string>();
    const globalPath = this.resolveGlobalAuthPath();
    if (globalPath) paths.add(globalPath);

    if (fs.existsSync(this.authDir)) {
      for (const file of fs.readdirSync(this.authDir)) {
        if (!file.endsWith('.auth.json')) continue;
        const full = path.join(this.authDir, file);
        const data = this.readAuthFile(full);
        if (data?._method === 'oauth') continue;
        paths.add(full);
      }
    }
    return [...paths];
  }

  /**
   * Open Google Meet in a throwaway headless browser using the stored session
   * and report whether Google still accepts it. On success the rotated cookies
   * are written back; on failure the file is flagged as expired.
   */
  async checkSession(authPath: string): Promise<BotSessionStatus> {
    const stored = this.readAuthFile(authPath);
    if (!stored) {
      this.logger.warn(`Session check skipped: cannot read ${authPath}`);
      return 'unknown';
    }
    if (!this.hasSessionCookies(stored)) {
      this.markSessionStatus(authPath, 'expired');
      return 'expired';
    }

    let browser: import('playwright').Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      const context = await browser.newContext({
        storageState: authPath,
        locale: 'en-US',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();
      await page.goto(MEET_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

      const finalUrl = page.url();
      const signedOut =
        finalUrl.includes('accounts.google.com') ||
        finalUrl.includes('/signin') ||
        finalUrl.includes('workspace.google.com');

      if (signedOut) {
        this.markSessionStatus(authPath, 'expired');
        return 'expired';
      }

      const freshState = await context.storageState();
      if (!this.hasSessionCookies(freshState)) {
        this.markSessionStatus(authPath, 'expired');
        return 'expired';
      }

      this.persistRefreshedState(authPath, freshState);
      return 'valid';
    } catch (err: any) {
      // Network / launch failures say nothing about the session itself.
      this.logger.warn(`Session check for ${authPath} did not complete: ${err.message}`);
      return 'unknown';
    } finally {
      await browser?.close().catch(() => {});
    }
  }

  /** Check the session the given user's bot would use. */
  async checkSessionForUser(userId: string): Promise<BotSessionStatus> {
    const authPath = this.resolveAuthPathForUser(userId);
    if (!authPath) return 'unknown';
    const data = this.readAuthFile(authPath);
    if (data?._method === 'oauth') return 'unknown';
    return this.checkSession(authPath);
  }

  /** Check every managed session file. Returns a path → status map. */
  async checkAllSessions(): Promise<Record<string, BotSessionStatus>> {
    const results: Record<string, BotSessionStatus> = {};
    for (const authPath of this.listSessionAuthPaths()) {
      results[authPath] = await this.checkSession(authPath);
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Google OAuth
  // ---------------------------------------------------------------------------

  /**
   * Get or create the Google OAuth2 client.
   */
  private getOAuthClient(): OAuth2Client {
    if (this.oauthClient) return this.oauthClient;

    const clientId = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in your environment.',
      );
    }

    const redirectUri =
      this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URI') ||
      `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/settings`;

    this.oauthClient = new OAuth2Client(clientId, clientSecret, redirectUri);
    return this.oauthClient;
  }

  /**
   * Check if Google OAuth credentials are configured.
   */
  isOAuthConfigured(): boolean {
    const clientId = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_SECRET');
    return !!(clientId && clientSecret);
  }

  /**
   * Generate the Google OAuth authorization URL.
   */
  getOAuthUrl(state: string): string {
    const client = this.getOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      state,
    });
  }

  /**
   * Exchange an OAuth authorization code for tokens and save as auth state.
   * Returns the authenticated Google email.
   */
  async handleOAuthCallback(
    userId: string,
    code: string,
  ): Promise<{ email: string }> {
    const client = this.getOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user info
    const tokenInfo = await client.getTokenInfo(tokens.access_token!);
    const email = tokenInfo.email || 'unknown';

    // Build a Playwright-compatible storage state from the OAuth tokens.
    // The bot uses Google Meet which requires Google cookies. OAuth tokens
    // alone aren't enough for Playwright browser context, but we store them
    // so they can be used to refresh the session or as a reference.
    // The actual Google Meet session cookies need to be obtained via
    // a Playwright login flow using these tokens.
    const cookies = [
      {
        name: '__meetbot_oauth_access_token',
        value: tokens.access_token || '',
        domain: '.google.com',
        path: '/',
        expires: tokens.expiry_date
          ? Math.floor(tokens.expiry_date / 1000)
          : -1,
        httpOnly: false,
        secure: true,
        sameSite: 'None' as const,
      },
    ];

    const origins = [
      {
        origin: 'https://meet.google.com',
        localStorage: [
          {
            name: '__meetbot_oauth_refresh_token',
            value: tokens.refresh_token || '',
          },
          {
            name: '__meetbot_oauth_email',
            value: email,
          },
        ],
      },
    ];

    this.saveOAuthState(userId, cookies, origins, email);

    return { email };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private resolveGlobalAuthPath(): string | null {
    const configPath = this.configService.get<string>('AUTH_STATE_PATH');
    const candidatePaths = [
      configPath,
      path.resolve(process.cwd(), 'auth.json'),
      path.resolve(__dirname, '..', '..', 'auth.json'),
    ].filter(Boolean) as string[];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /** Write JSON via a temp file + rename so a crash never leaves a truncated auth file. */
  private writeAuthFileAtomic(filePath: string, data: any): void {
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
  }

  private readAuthFile(filePath: string): any | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
