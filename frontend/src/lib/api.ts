import { getToken } from "./auth";
import { getApiUrl } from "./config";

// ─── Interfaces matching backend entities/responses exactly ─────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export type MeetingPlatform = "google_meet";

export type MeetingStatus =
  | "requested"
  | "joining"
  | "awaiting_admission"
  | "active"
  | "stopping"
  | "completed"
  | "failed";

export interface Meeting {
  id: string;
  userId: string;
  platform: MeetingPlatform;
  nativeMeetingId: string;
  constructedMeetingUrl: string;
  status: MeetingStatus;
  botContainerId: string | null;
  startTime: string | null;
  endTime: string | null;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedMeetings {
  meetings: Meeting[];
  meta: PaginationMeta;
}

/** Shape returned by POST /bots (createBot) */
export interface CreateBotResponse {
  meetingId: string;
  platform: MeetingPlatform;
  nativeMeetingId: string;
  constructedMeetingUrl: string;
  status: MeetingStatus;
  botContainerId: string | null;
  data: Record<string, any>;
  createdAt: string;
}

/** Shape returned by GET /bots/status */
export interface BotStatusItem {
  meetingId: string;
  platform: MeetingPlatform;
  nativeMeetingId: string;
  constructedMeetingUrl: string;
  status: MeetingStatus;
  botContainerId: string | null;
  startTime: string | null;
  data: Record<string, any>;
  createdAt: string;
}

/** Shape returned by DELETE /bots/:platform/:nativeMeetingId */
export interface StopBotResponse {
  meetingId: string;
  platform: MeetingPlatform;
  nativeMeetingId: string;
  status: MeetingStatus;
  endTime: string;
  message: string;
}

/** Shape returned by PUT /bots/:platform/:nativeMeetingId/config */
export interface UpdateBotConfigResponse {
  meetingId: string;
  platform: MeetingPlatform;
  nativeMeetingId: string;
  status: MeetingStatus;
  data: Record<string, any>;
  message: string;
}

/** Shape returned by GET /meetings/:platform/:nativeMeetingId (single meeting detail) */
export interface MeetingDetail {
  id: string;
  platform: MeetingPlatform;
  nativeMeetingId: string;
  constructedMeetingUrl: string;
  status: MeetingStatus;
  botContainerId: string | null;
  startTime: string | null;
  endTime: string | null;
  data: Record<string, any>;
  transcriptSegments?: TranscriptSegment[];
  createdAt: string;
  updatedAt: string;
}

/** Shape returned by PATCH /meetings/:platform/:nativeMeetingId */
export interface UpdateMeetingResponse {
  id: string;
  platform: MeetingPlatform;
  nativeMeetingId: string;
  status: MeetingStatus;
  data: Record<string, any>;
  updatedAt: string;
  message: string;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  speaker: string;
  language: string;
  startTime: number;
  endTime: number;
  absoluteStartTime: string;
  absoluteEndTime: string;
  completed: boolean;
  createdAt: string;
}

export interface TranscriptResponse {
  meeting: {
    id: string;
    platform: MeetingPlatform;
    nativeMeetingId: string;
    constructedMeetingUrl: string;
    status: MeetingStatus;
    startTime: string | null;
    endTime: string | null;
    data: Record<string, any>;
  };
  segments: TranscriptSegment[];
  totalSegments: number;
  fullText: string;
}

export interface ShareResponse {
  shareToken: string;
  shareUrl: string;
  message: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key?: string;
  keyPrefix?: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ApiKeyCreateResponse {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
  createdAt: string;
  message: string;
}

// Webhook types
export interface WebhookHeader {
  key: string;
  value: string;
}

export interface Webhook {
  id: string;
  url: string;
  name: string;
  secret?: string;
  headers: WebhookHeader[];
  events: string[];
  isActive: boolean;
  lastTriggeredAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookData {
  url: string;
  name?: string;
  secret?: string;
  headers?: WebhookHeader[];
  events?: string[];
}

export interface UpdateWebhookData {
  url?: string;
  name?: string;
  secret?: string;
  headers?: WebhookHeader[];
  events?: string[];
  isActive?: boolean;
}

export interface WebhookTestResult {
  success: boolean;
  status?: number;
  error?: string;
}

// Settings types
export interface UserSettings {
  botAutoExitEnabled: boolean;
  botAutoExitMinutes: number;
  defaultBotName: string;
}

export interface UpdateSettingsData {
  botAutoExitEnabled?: boolean;
  botAutoExitMinutes?: number;
}

// Bot auth types
export interface BotAuthStatus {
  isConfigured: boolean;
  method: "upload" | "oauth" | "global" | null;
  lastUpdated: string | null;
  email: string | null;
}

export interface BotAuthUploadResponse {
  message: string;
  status: BotAuthStatus;
}

export interface BotAuthDeleteResponse {
  message: string;
  status: BotAuthStatus;
}

export interface OAuthConfigResponse {
  isConfigured: boolean;
}

export interface OAuthUrlResponse {
  url: string;
  state: string;
}

export interface OAuthCallbackResponse {
  message: string;
  email: string;
  status: BotAuthStatus;
}

// ─── Admin types ────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAppSettings {
  registration_enabled: string;
  [key: string]: string;
}

// ─── URL parsing helper ─────────────────────────────────────────────────────

/**
 * Parse a Google Meet URL into platform + nativeMeetingId.
 * Returns null if the URL does not match a known meeting URL format.
 */
export function parseMeetingUrl(
  url: string
): { platform: "google_meet"; nativeMeetingId: string } | null {
  const match = url.match(/meet\.google\.com\/([a-z]+-[a-z]+-[a-z]+)/);
  if (match) {
    return { platform: "google_meet", nativeMeetingId: match[1] };
  }
  return null;
}

// ─── API Client ─────────────────────────────────────────────────────────────

class ApiClient {
  /** Resolved lazily at request time so runtime config is picked up */
  private get baseUrl(): string {
    return getApiUrl();
  }

  /**
   * Core request method.
   *
   * The backend wraps ALL successful responses in:
   *   { success: boolean, data: T, timestamp: string }
   *
   * This method unwraps the envelope and returns only the `data` payload.
   * If the response has no `data` field (unlikely but defensive), return
   * the raw JSON as-is.
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token && token !== "undefined" && token !== "null") {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: "An error occurred",
      }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const json = await response.json();
    return json.data ?? json;
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async register(
    name: string,
    email: string,
    password: string
  ): Promise<AuthResponse> {
    return this.request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
  }

  async getProfile(): Promise<User> {
    return this.request<User>("/auth/profile");
  }

  // ── Bots ────────────────────────────────────────────────────────────────

  async createBot(data: {
    platform: string;
    nativeMeetingId: string;
    botName?: string;
    language?: string;
    recordingEnabled?: boolean;
    screenRecordingEnabled?: boolean;
    audioRecordingEnabled?: boolean;
    transcribeEnabled?: boolean;
  }): Promise<CreateBotResponse> {
    return this.request<CreateBotResponse>("/bots", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getBotStatus(): Promise<BotStatusItem[]> {
    return this.request<BotStatusItem[]>("/bots/status");
  }

  async stopBot(
    platform: string,
    nativeMeetingId: string
  ): Promise<StopBotResponse> {
    return this.request<StopBotResponse>(
      `/bots/${encodeURIComponent(platform)}/${encodeURIComponent(nativeMeetingId)}`,
      { method: "DELETE" }
    );
  }

  async updateBotConfig(
    platform: string,
    nativeMeetingId: string,
    config: {
      language?: string;
      recordingEnabled?: boolean;
      transcribeEnabled?: boolean;
    }
  ): Promise<UpdateBotConfigResponse> {
    return this.request<UpdateBotConfigResponse>(
      `/bots/${encodeURIComponent(platform)}/${encodeURIComponent(nativeMeetingId)}/config`,
      {
        method: "PUT",
        body: JSON.stringify(config),
      }
    );
  }

  // ── Meetings ────────────────────────────────────────────────────────────

  async listMeetings(params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }): Promise<PaginatedMeetings> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.status) query.set("status", params.status);
    if (params?.search) query.set("search", params.search);
    const qs = query.toString();
    return this.request<PaginatedMeetings>(`/meetings${qs ? `?${qs}` : ""}`);
  }

  async getMeetingById(id: string): Promise<Meeting> {
    return this.request<Meeting>(
      `/meetings/detail/${encodeURIComponent(id)}`
    );
  }

  async getMeeting(
    platform: string,
    nativeMeetingId: string
  ): Promise<MeetingDetail> {
    return this.request<MeetingDetail>(
      `/meetings/${encodeURIComponent(platform)}/${encodeURIComponent(nativeMeetingId)}`
    );
  }

  async updateMeeting(
    platform: string,
    nativeMeetingId: string,
    data: { data: Record<string, any> }
  ): Promise<UpdateMeetingResponse> {
    return this.request<UpdateMeetingResponse>(
      `/meetings/${encodeURIComponent(platform)}/${encodeURIComponent(nativeMeetingId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  }

  async deleteMeeting(
    platform: string,
    nativeMeetingId: string
  ): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/meetings/${encodeURIComponent(platform)}/${encodeURIComponent(nativeMeetingId)}`,
      { method: "DELETE" }
    );
  }

  // ── Transcripts ─────────────────────────────────────────────────────────

  async getTranscriptByMeetingId(
    meetingId: string
  ): Promise<TranscriptResponse> {
    return this.request<TranscriptResponse>(
      `/transcripts/meeting/${encodeURIComponent(meetingId)}`
    );
  }

  async getTranscript(
    platform: string,
    nativeMeetingId: string
  ): Promise<TranscriptResponse> {
    return this.request<TranscriptResponse>(
      `/transcripts/${encodeURIComponent(platform)}/${encodeURIComponent(nativeMeetingId)}`
    );
  }

  async shareTranscript(
    platform: string,
    nativeMeetingId: string
  ): Promise<ShareResponse> {
    return this.request<ShareResponse>(
      `/transcripts/${encodeURIComponent(platform)}/${encodeURIComponent(nativeMeetingId)}/share`,
      { method: "POST" }
    );
  }

  // ── API Keys ────────────────────────────────────────────────────────────

  async listApiKeys(): Promise<ApiKey[]> {
    return this.request<ApiKey[]>("/api-keys");
  }

  async createApiKey(name: string): Promise<ApiKeyCreateResponse> {
    return this.request<ApiKeyCreateResponse>("/api-keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async revokeApiKey(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api-keys/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  async listWebhooks(): Promise<Webhook[]> {
    return this.request<Webhook[]>("/webhooks");
  }

  async createWebhook(data: CreateWebhookData): Promise<Webhook> {
    return this.request<Webhook>("/webhooks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateWebhook(id: string, data: UpdateWebhookData): Promise<Webhook> {
    return this.request<Webhook>(`/webhooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteWebhook(id: string): Promise<void> {
    return this.request<void>(`/webhooks/${id}`, { method: "DELETE" });
  }

  async testWebhook(id: string): Promise<WebhookTestResult> {
    return this.request<WebhookTestResult>(`/webhooks/${id}/test`, {
      method: "POST",
    });
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async getSettings(): Promise<UserSettings> {
    return this.request<UserSettings>("/settings");
  }

  async updateSettings(data: UpdateSettingsData): Promise<UserSettings> {
    return this.request<UserSettings>("/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // ── Bot Auth ───────────────────────────────────────────────────────────────

  async getBotAuthStatus(): Promise<BotAuthStatus> {
    return this.request<BotAuthStatus>("/settings/bot-auth/status");
  }

  async uploadBotAuth(file: File): Promise<BotAuthUploadResponse> {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const headers: Record<string, string> = {};
    if (token && token !== "undefined" && token !== "null") {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}/settings/bot-auth/upload`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: "An error occurred",
      }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const json = await response.json();
    return json.data ?? json;
  }

  async uploadBotAuthJson(
    content: string,
    email?: string
  ): Promise<BotAuthUploadResponse> {
    return this.request<BotAuthUploadResponse>(
      "/settings/bot-auth/upload-json",
      {
        method: "POST",
        body: JSON.stringify({ content, email }),
      }
    );
  }

  async deleteBotAuth(): Promise<BotAuthDeleteResponse> {
    return this.request<BotAuthDeleteResponse>("/settings/bot-auth", {
      method: "DELETE",
    });
  }

  async getOAuthConfig(): Promise<OAuthConfigResponse> {
    return this.request<OAuthConfigResponse>(
      "/settings/bot-auth/oauth/config"
    );
  }

  async getOAuthUrl(): Promise<OAuthUrlResponse> {
    return this.request<OAuthUrlResponse>("/settings/bot-auth/oauth/url");
  }

  async handleOAuthCallback(
    code: string,
    state?: string
  ): Promise<OAuthCallbackResponse> {
    return this.request<OAuthCallbackResponse>(
      "/settings/bot-auth/oauth/callback",
      {
        method: "POST",
        body: JSON.stringify({ code, state }),
      }
    );
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  async adminListUsers(): Promise<AdminUser[]> {
    return this.request<AdminUser[]>("/admin/users");
  }

  async adminUpdateUser(id: string, data: { isActive?: boolean; role?: string }): Promise<AdminUser> {
    return this.request<AdminUser>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async adminGetSettings(): Promise<AdminAppSettings> {
    return this.request<AdminAppSettings>("/admin/settings");
  }

  async adminUpdateSettings(data: Record<string, string>): Promise<AdminAppSettings> {
    return this.request<AdminAppSettings>("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getRegistrationStatus(): Promise<{ registrationEnabled: boolean }> {
    return this.request<{ registrationEnabled: boolean }>("/auth/registration-status");
  }

  // ── Recordings ──────────────────────────────────────────────────────────

  getRecordingUrl(meetingId: string, type: "screen" | "audio"): string {
    return `${this.baseUrl}/meetings/detail/${encodeURIComponent(meetingId)}/recording/${type}`;
  }
}

export const api = new ApiClient();
