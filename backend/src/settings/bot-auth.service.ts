import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as path from 'path';
import * as fs from 'fs';

export interface BotAuthStatus {
  isConfigured: boolean;
  method: 'upload' | 'oauth' | 'global' | null;
  lastUpdated: string | null;
  email: string | null;
}

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
      };
    }

    // Fall back to global auth.json
    const globalPath = this.resolveGlobalAuthPath();
    if (globalPath) {
      const stats = fs.statSync(globalPath);
      return {
        isConfigured: true,
        method: 'global',
        lastUpdated: stats.mtime.toISOString(),
        email: null,
      };
    }

    return {
      isConfigured: false,
      method: null,
      lastUpdated: null,
      email: null,
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

  private readAuthFile(filePath: string): any | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
