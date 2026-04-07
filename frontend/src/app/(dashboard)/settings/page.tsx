"use client";

import { useState, useEffect, useCallback, useRef, type FormEvent, type ChangeEvent } from "react";
import {
  Settings,
  Bell,
  Plus,
  Trash2,
  Edit2,
  TestTube2,
  Link,
  Clock,
  Bot,
  Shield,
  ShieldAlert,
  Check,
  X,
  User,
  Users,
  Mail,
  AlertTriangle,
  Save,
  UserCog,
  ToggleLeft,
  ToggleRight,
  Crown,
  Upload,
  KeyRound,
  LogIn,
  FileJson,
  CheckCircle2,
  XCircle,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useAuthStore } from "@/stores/auth-store";
import {
  api,
  type Webhook,
  type WebhookHeader,
  type CreateWebhookData,
  type UpdateWebhookData,
  type UserSettings,
  type AdminUser,
  type AdminAppSettings,
  type BotAuthStatus,
} from "@/lib/api";
import toast from "react-hot-toast";

// ─── Available webhook events ───────────────────────────────────────────────
const WEBHOOK_EVENTS = ["meeting.started", "meeting.ended"] as const;

// ─── Webhook Form State ─────────────────────────────────────────────────────
interface WebhookFormState {
  name: string;
  url: string;
  secret: string;
  headers: WebhookHeader[];
  events: string[];
  isActive: boolean;
}

const defaultWebhookForm: WebhookFormState = {
  name: "",
  url: "",
  secret: "",
  headers: [],
  events: ["meeting.started", "meeting.ended"],
  isActive: true,
};

export default function SettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  // ── Profile state ───────────────────────────────────────────────────────
  const [name] = useState(user?.name ?? "");
  const [email] = useState(user?.email ?? "");

  // ── Admin state ─────────────────────────────────────────────────────────
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [isLoadingAdminUsers, setIsLoadingAdminUsers] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [promotingUserId, setPromotingUserId] = useState<string | null>(null);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [userToPromote, setUserToPromote] = useState<AdminUser | null>(null);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [isLoadingAdminSettings, setIsLoadingAdminSettings] = useState(false);
  const [isTogglingRegistration, setIsTogglingRegistration] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [isSavingRetention, setIsSavingRetention] = useState(false);

  // ── Bot settings state ──────────────────────────────────────────────────
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [botAutoExitEnabled, setBotAutoExitEnabled] = useState(false);
  const [botAutoExitMinutes, setBotAutoExitMinutes] = useState(5);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // ── Webhooks state ──────────────────────────────────────────────────────
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(true);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [webhookForm, setWebhookForm] = useState<WebhookFormState>(defaultWebhookForm);
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [deletingWebhookId, setDeletingWebhookId] = useState<string | null>(null);

  // ── Bot auth state ───────────────────────────────────────────────────────
  const [botAuthStatus, setBotAuthStatus] = useState<BotAuthStatus | null>(null);
  const [isLoadingBotAuth, setIsLoadingBotAuth] = useState(true);
  const [isUploadingAuth, setIsUploadingAuth] = useState(false);
  const [isDeletingAuth, setIsDeletingAuth] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [isLoadingOAuthUrl, setIsLoadingOAuthUrl] = useState(false);
  const [showAuthPasteModal, setShowAuthPasteModal] = useState(false);
  const [authPasteContent, setAuthPasteContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Danger zone state ───────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // ── Load settings ───────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    try {
      const data = await api.getSettings();
      setSettings(data);
      setBotAutoExitEnabled(data.botAutoExitEnabled);
      setBotAutoExitMinutes(data.botAutoExitMinutes);
    } catch {
      // Settings endpoint may not exist yet - use defaults
      setBotAutoExitEnabled(false);
      setBotAutoExitMinutes(5);
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  // ── Load webhooks ───────────────────────────────────────────────────────
  const loadWebhooks = useCallback(async () => {
    setIsLoadingWebhooks(true);
    try {
      const data = await api.listWebhooks();
      setWebhooks(data);
    } catch {
      // Webhooks endpoint may not exist yet
      setWebhooks([]);
    } finally {
      setIsLoadingWebhooks(false);
    }
  }, []);

  // ── Load admin users ─────────────────────────────────────────────────
  const loadAdminUsers = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingAdminUsers(true);
    try {
      const data = await api.adminListUsers();
      setAdminUsers(data);
    } catch {
      setAdminUsers([]);
    } finally {
      setIsLoadingAdminUsers(false);
    }
  }, [isAdmin]);

  // ── Load admin app settings ────────────────────────────────────────────
  const loadAdminSettings = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingAdminSettings(true);
    try {
      const data = await api.adminGetSettings();
      setRegistrationEnabled(data.registration_enabled === "true");
      setRetentionDays(parseInt(data.recording_retention_days || "30", 10));
    } catch {
      setRegistrationEnabled(true);
    } finally {
      setIsLoadingAdminSettings(false);
    }
  }, [isAdmin]);

  // ── Load bot auth status ────────────────────────────────────────────────
  const loadBotAuthStatus = useCallback(async () => {
    setIsLoadingBotAuth(true);
    try {
      const [authStatus, oauthConfig] = await Promise.all([
        api.getBotAuthStatus(),
        api.getOAuthConfig().catch(() => ({ isConfigured: false })),
      ]);
      setBotAuthStatus(authStatus);
      setOauthConfigured(oauthConfig.isConfigured);
    } catch {
      setBotAuthStatus(null);
    } finally {
      setIsLoadingBotAuth(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadWebhooks();
    loadBotAuthStatus();
    if (isAdmin) {
      loadAdminUsers();
      loadAdminSettings();
    }
  }, [loadSettings, loadWebhooks, loadBotAuthStatus, isAdmin, loadAdminUsers, loadAdminSettings]);

  // ── Handle OAuth callback (if returning from Google OAuth) ──────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (code) {
      // Clear the URL params
      window.history.replaceState({}, "", window.location.pathname);
      // Handle the callback
      api
        .handleOAuthCallback(code, state || undefined)
        .then((result) => {
          toast.success(result.message);
          setBotAuthStatus(result.status);
        })
        .catch((err: any) => {
          toast.error(err.message || "OAuth authentication failed");
        });
    }
  }, []);

  // ── Save bot settings ───────────────────────────────────────────────────
  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const updated = await api.updateSettings({
        botAutoExitEnabled,
        botAutoExitMinutes,
      });
      setSettings(updated);
      toast.success("Bot settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // ── Admin: toggle user active status ─────────────────────────────────
  const handleToggleUserActive = async (targetUser: AdminUser) => {
    setTogglingUserId(targetUser.id);
    try {
      const updated = await api.adminUpdateUser(targetUser.id, {
        isActive: !targetUser.isActive,
      });
      setAdminUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? updated : u))
      );
      toast.success(
        updated.isActive
          ? `${updated.name} has been enabled`
          : `${updated.name} has been disabled`
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update user");
    } finally {
      setTogglingUserId(null);
    }
  };

  // ── Admin: promote user to admin ───────────────────────────────────────
  const handlePromoteUser = async () => {
    if (!userToPromote) return;
    setPromotingUserId(userToPromote.id);
    try {
      const updated = await api.adminUpdateUser(userToPromote.id, {
        role: "admin",
      });
      setAdminUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? updated : u))
      );
      toast.success(`${updated.name} has been promoted to admin`);
    } catch (err: any) {
      toast.error(err.message || "Failed to promote user");
    } finally {
      setPromotingUserId(null);
      setShowPromoteModal(false);
      setUserToPromote(null);
    }
  };

  // ── Admin: toggle registration ─────────────────────────────────────────
  const handleToggleRegistration = async () => {
    setIsTogglingRegistration(true);
    const newValue = !registrationEnabled;
    try {
      await api.adminUpdateSettings({
        registration_enabled: newValue ? "true" : "false",
      });
      setRegistrationEnabled(newValue);
      toast.success(
        newValue
          ? "Registration has been enabled"
          : "Registration has been disabled"
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update registration settings");
    } finally {
      setIsTogglingRegistration(false);
    }
  };

  // ── Admin: save recording retention days ────────────────────────────────
  const handleSaveRetention = async () => {
    setIsSavingRetention(true);
    try {
      await api.adminUpdateSettings({
        recording_retention_days: String(Math.max(0, retentionDays)),
      });
      toast.success(
        retentionDays <= 0
          ? "Recordings will be kept forever"
          : `Recordings will be kept for ${retentionDays} days`
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update retention settings");
    } finally {
      setIsSavingRetention(false);
    }
  };

  // ── Bot auth handlers ────────────────────────────────────────────────────
  const handleAuthFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAuth(true);
    try {
      const result = await api.uploadBotAuth(file);
      toast.success(result.message);
      setBotAuthStatus(result.status);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload auth file");
    } finally {
      setIsUploadingAuth(false);
      // Reset the file input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAuthPasteSubmit = async () => {
    if (!authPasteContent.trim()) {
      toast.error("Please paste the auth.json content");
      return;
    }
    setIsUploadingAuth(true);
    try {
      const result = await api.uploadBotAuthJson(authPasteContent.trim());
      toast.success(result.message);
      setBotAuthStatus(result.status);
      setShowAuthPasteModal(false);
      setAuthPasteContent("");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload auth content");
    } finally {
      setIsUploadingAuth(false);
    }
  };

  const handleDeleteAuth = async () => {
    setIsDeletingAuth(true);
    try {
      const result = await api.deleteBotAuth();
      toast.success(result.message);
      setBotAuthStatus(result.status);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete auth");
    } finally {
      setIsDeletingAuth(false);
    }
  };

  const handleGoogleOAuth = async () => {
    setIsLoadingOAuthUrl(true);
    try {
      const { url } = await api.getOAuthUrl();
      // Redirect to Google OAuth consent screen
      window.location.href = url;
    } catch (err: any) {
      toast.error(err.message || "Failed to start Google OAuth");
      setIsLoadingOAuthUrl(false);
    }
  };

  // ── Webhook CRUD ────────────────────────────────────────────────────────
  const openAddWebhook = () => {
    setEditingWebhook(null);
    setWebhookForm(defaultWebhookForm);
    setShowWebhookForm(true);
  };

  const openEditWebhook = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setWebhookForm({
      name: webhook.name,
      url: webhook.url,
      secret: webhook.secret || "",
      headers: webhook.headers.length > 0 ? [...webhook.headers] : [],
      events: [...webhook.events],
      isActive: webhook.isActive,
    });
    setShowWebhookForm(true);
  };

  const closeWebhookForm = () => {
    setShowWebhookForm(false);
    setEditingWebhook(null);
    setWebhookForm(defaultWebhookForm);
  };

  const handleSaveWebhook = async (e: FormEvent) => {
    e.preventDefault();
    if (!webhookForm.url.trim()) {
      toast.error("URL is required");
      return;
    }

    setIsSavingWebhook(true);
    try {
      const payload: CreateWebhookData | UpdateWebhookData = {
        url: webhookForm.url.trim(),
        name: webhookForm.name.trim() || undefined,
        secret: webhookForm.secret.trim() || undefined,
        headers: webhookForm.headers.filter((h) => h.key.trim() && h.value.trim()),
        events: webhookForm.events,
      };

      if (editingWebhook) {
        const updated = await api.updateWebhook(editingWebhook.id, {
          ...payload,
          isActive: webhookForm.isActive,
        });
        setWebhooks((prev) =>
          prev.map((w) => (w.id === updated.id ? updated : w))
        );
        toast.success("Webhook updated");
      } else {
        const created = await api.createWebhook(payload as CreateWebhookData);
        setWebhooks((prev) => [...prev, created]);
        toast.success("Webhook created");
      }
      closeWebhookForm();
    } catch (err: any) {
      toast.error(err.message || "Failed to save webhook");
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    setDeletingWebhookId(id);
    try {
      await api.deleteWebhook(id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      toast.success("Webhook deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete webhook");
    } finally {
      setDeletingWebhookId(null);
    }
  };

  const handleTestWebhook = async (id: string) => {
    setTestingWebhookId(id);
    try {
      const result = await api.testWebhook(id);
      if (result.success) {
        toast.success(`Webhook test successful (status ${result.status})`);
      } else {
        toast.error(`Webhook test failed: ${result.error || "Unknown error"}`);
      }
      // Refresh to get updated lastTriggeredAt / lastStatus
      loadWebhooks();
    } catch (err: any) {
      toast.error(err.message || "Failed to test webhook");
    } finally {
      setTestingWebhookId(null);
    }
  };

  const handleToggleWebhookActive = async (webhook: Webhook) => {
    try {
      const updated = await api.updateWebhook(webhook.id, {
        isActive: !webhook.isActive,
      });
      setWebhooks((prev) =>
        prev.map((w) => (w.id === updated.id ? updated : w))
      );
      toast.success(
        updated.isActive ? "Webhook activated" : "Webhook deactivated"
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update webhook");
    }
  };

  // ── Webhook form helpers ────────────────────────────────────────────────
  const addHeader = () => {
    setWebhookForm((prev) => ({
      ...prev,
      headers: [...prev.headers, { key: "", value: "" }],
    }));
  };

  const removeHeader = (index: number) => {
    setWebhookForm((prev) => ({
      ...prev,
      headers: prev.headers.filter((_, i) => i !== index),
    }));
  };

  const updateHeader = (index: number, field: "key" | "value", value: string) => {
    setWebhookForm((prev) => ({
      ...prev,
      headers: prev.headers.map((h, i) =>
        i === index ? { ...h, [field]: value } : h
      ),
    }));
  };

  const toggleEvent = (event: string) => {
    setWebhookForm((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  // ── Danger zone ─────────────────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    toast("Account deletion coming soon", { icon: "i" });
    setShowDeleteModal(false);
    setDeleteConfirmText("");
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const truncateUrl = (url: string, maxLen = 45) => {
    if (url.length <= maxLen) return url;
    return url.slice(0, maxLen) + "...";
  };

  const activeUserCount = adminUsers.filter((u) => u.isActive).length;

  return (
    <div className="max-w-2xl space-y-6">
      {/* ── Admin Panel Section ─────────────────────────────────────────── */}
      {isAdmin && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <div>
              <CardTitle>
                <span className="inline-flex items-center gap-2 text-amber-400">
                  <ShieldAlert className="h-5 w-5" />
                  Admin Panel
                </span>
              </CardTitle>
              <CardDescription>
                Manage users and application settings
              </CardDescription>
            </div>
          </CardHeader>

          {/* ── User Management ──────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#e4e4f0] flex items-center gap-2">
                  <Users className="h-4 w-4 text-amber-400" />
                  User Management
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Manage user accounts
                </p>
              </div>
              {!isLoadingAdminUsers && (
                <div className="text-xs text-text-muted">
                  {activeUserCount} active / {adminUsers.length} total
                </div>
              )}
            </div>

            {isLoadingAdminUsers ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : adminUsers.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-[#2a2a3e] rounded-lg">
                <Users className="h-8 w-8 text-text-muted mx-auto mb-2" />
                <p className="text-sm text-text-secondary">No users found</p>
              </div>
            ) : (
              <div className="rounded-lg border border-[#2a2a3e] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2a3e] bg-[#16162a]">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Name
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Email
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Role
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Status
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a3e]">
                    {adminUsers.map((adminUser) => {
                      const isCurrentUser = adminUser.id === user?.id;
                      const isAdminUser = adminUser.role === "admin";
                      return (
                        <tr
                          key={adminUser.id}
                          className="bg-[#0f0f23] hover:bg-[#16162a] transition-colors"
                        >
                          <td className="px-4 py-3 text-[#e4e4f0] font-medium truncate max-w-[140px]">
                            {adminUser.name}
                            {isCurrentUser && (
                              <span className="text-xs text-text-muted ml-1">
                                (you)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-text-secondary truncate max-w-[180px]">
                            {adminUser.email}
                          </td>
                          <td className="px-4 py-3">
                            {isAdminUser ? (
                              <Badge variant="brand">
                                <Crown className="h-3 w-3 mr-1" />
                                Admin
                              </Badge>
                            ) : (
                              <Badge variant="neutral">User</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                adminUser.isActive ? "success" : "neutral"
                              }
                              dot
                            >
                              {adminUser.isActive ? "Active" : "Disabled"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isAdminUser ? (
                              <span className="text-xs text-text-muted italic">
                                --
                              </span>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                {/* Toggle active/disabled */}
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleUserActive(adminUser)
                                  }
                                  disabled={togglingUserId === adminUser.id}
                                  title={
                                    adminUser.isActive
                                      ? "Disable user"
                                      : "Enable user"
                                  }
                                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-[#0f0f23] disabled:opacity-50 disabled:cursor-not-allowed ${
                                    adminUser.isActive
                                      ? "bg-emerald-600"
                                      : "bg-[#2a2a3e]"
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                      adminUser.isActive
                                        ? "translate-x-4"
                                        : "translate-x-0"
                                    }`}
                                  />
                                </button>
                                {/* Promote to admin */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUserToPromote(adminUser);
                                    setShowPromoteModal(true);
                                  }}
                                  title="Promote to admin"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-amber-400 hover:bg-amber-500/10 border border-amber-500/30 transition-colors"
                                >
                                  <Crown className="h-3 w-3" />
                                  Promote
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── App Settings: Registration ──────────────────────────────── */}
            <div className="mt-6 pt-4 border-t border-[#2a2a3e]">
              <h3 className="text-sm font-semibold text-[#e4e4f0] flex items-center gap-2 mb-3">
                <Settings className="h-4 w-4 text-amber-400" />
                Registration Settings
              </h3>

              {isLoadingAdminSettings ? (
                <div className="flex items-center justify-center py-4">
                  <div className="h-5 w-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <UserCog className="h-4 w-4 text-amber-400" />
                      <p className="text-sm font-medium text-[#e4e4f0]">
                        Allow new user registration
                      </p>
                    </div>
                    <p className="text-xs text-text-secondary mt-1 ml-6">
                      When disabled, new users cannot create accounts. Only
                      admins can re-enable registration.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={registrationEnabled}
                    onClick={handleToggleRegistration}
                    disabled={isTogglingRegistration}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-[#16162a] disabled:opacity-50 disabled:cursor-not-allowed ${
                      registrationEnabled ? "bg-amber-500" : "bg-[#2a2a3e]"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        registrationEnabled
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* ── App Settings: Recording Retention ──────────────────────── */}
            <div className="mt-6 pt-4 border-t border-[#2a2a3e]">
              <h3 className="text-sm font-semibold text-[#e4e4f0] flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-amber-400" />
                Recording Retention
              </h3>

              {isLoadingAdminSettings ? (
                <div className="flex items-center justify-center py-4">
                  <div className="h-5 w-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Trash2 className="h-4 w-4 text-amber-400" />
                      <p className="text-sm font-medium text-[#e4e4f0]">
                        Days to retain recordings
                      </p>
                    </div>
                    <p className="text-xs text-text-secondary mt-1 ml-6">
                      Recording files older than this will be auto-deleted. Set
                      to 0 to keep forever.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="3650"
                      value={retentionDays}
                      onChange={(e) =>
                        setRetentionDays(
                          Math.max(0, parseInt(e.target.value, 10) || 0)
                        )
                      }
                      className="w-20 bg-[#1e1e36] border border-[#2a2a3e] rounded-lg px-3 py-1.5 text-sm text-[#e4e4f0] text-center focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveRetention}
                      isLoading={isSavingRetention}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Promote User Confirmation Modal ─────────────────────────────── */}
      <Modal
        isOpen={showPromoteModal}
        onClose={() => {
          setShowPromoteModal(false);
          setUserToPromote(null);
        }}
        title="Promote User to Admin"
        description={`Are you sure you want to promote "${userToPromote?.name}" to admin? This action cannot be easily undone.`}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-400">
                This grants full admin privileges
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                The user will be able to manage all users and app settings.
              </p>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowPromoteModal(false);
                setUserToPromote(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePromoteUser}
              isLoading={promotingUserId === userToPromote?.id}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              <Crown className="h-4 w-4 mr-1" />
              Promote to Admin
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Profile Section ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <User className="h-5 w-5 text-[#6c5ce7]" />
                Profile
              </span>
            </CardTitle>
            <CardDescription>Your account information</CardDescription>
          </div>
        </CardHeader>

        <div className="space-y-4">
          <Input
            label="Name"
            type="text"
            placeholder="Your name"
            value={name}
            readOnly
            leftIcon={<User className="h-4 w-4" />}
            hint="Profile editing coming soon"
          />

          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            readOnly
            leftIcon={<Mail className="h-4 w-4" />}
            disabled
          />
        </div>
      </Card>

      {/* ── Bot Settings Section ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Bot className="h-5 w-5 text-[#6c5ce7]" />
                Bot Settings
              </span>
            </CardTitle>
            <CardDescription>
              Configure default behavior for meeting bots
            </CardDescription>
          </div>
        </CardHeader>

        {isLoadingSettings ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 border-2 border-[#6c5ce7] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSaveSettings} className="space-y-4">
            {/* Auto-exit toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-[#2a2a3e] bg-[#16162a]">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#6c5ce7]" />
                  <p className="text-sm font-medium text-[#e4e4f0]">
                    Auto-exit when alone
                  </p>
                </div>
                <p className="text-xs text-text-secondary mt-1 ml-6">
                  Bot will automatically leave the meeting if no other
                  participants are present for the specified duration
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={botAutoExitEnabled}
                onClick={() => setBotAutoExitEnabled(!botAutoExitEnabled)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#6c5ce7] focus:ring-offset-2 focus:ring-offset-[#16162a] ${
                  botAutoExitEnabled ? "bg-[#6c5ce7]" : "bg-[#2a2a3e]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    botAutoExitEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Auto-exit timeout (shown only when enabled) */}
            {botAutoExitEnabled && (
              <div className="ml-6 p-4 rounded-lg border border-[#2a2a3e] bg-[#16162a]">
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Auto-exit timeout (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={botAutoExitMinutes}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 1 && v <= 30) {
                      setBotAutoExitMinutes(v);
                    }
                  }}
                  className="w-24 bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#6c5ce7]/50 focus:border-[#6c5ce7] hover:border-border-hover"
                />
                <p className="mt-1.5 text-xs text-text-muted">
                  Between 1 and 30 minutes
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                leftIcon={<Save className="h-4 w-4" />}
                isLoading={isSavingSettings}
              >
                Save Settings
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* ── Bot Authentication Section ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-[#6c5ce7]" />
                Bot Authentication
              </span>
            </CardTitle>
            <CardDescription>
              Configure the Google account the bot uses to join meetings
            </CardDescription>
          </div>
        </CardHeader>

        {isLoadingBotAuth ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 border-2 border-[#6c5ce7] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* ── Auth Status ───────────────────────────────────────────── */}
            <div
              className={`flex items-center gap-3 p-4 rounded-lg border ${
                botAuthStatus?.isConfigured
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-amber-500/30 bg-amber-500/5"
              }`}
            >
              {botAuthStatus?.isConfigured ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-amber-400 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#e4e4f0]">
                  {botAuthStatus?.isConfigured
                    ? "Google account connected"
                    : "No Google account configured"}
                </p>
                {botAuthStatus?.isConfigured ? (
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {botAuthStatus.email && (
                      <span className="text-xs text-text-secondary inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {botAuthStatus.email}
                      </span>
                    )}
                    <Badge
                      variant={
                        botAuthStatus.method === "oauth"
                          ? "brand"
                          : botAuthStatus.method === "upload"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {botAuthStatus.method === "oauth"
                        ? "Google OAuth"
                        : botAuthStatus.method === "upload"
                          ? "Uploaded"
                          : "Global Config"}
                    </Badge>
                    {botAuthStatus.lastUpdated && (
                      <span className="text-xs text-text-muted">
                        Updated: {formatRelativeTime(botAuthStatus.lastUpdated)}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-text-secondary mt-0.5">
                    The bot will join meetings as a guest. Connect a Google
                    account for better access.
                  </p>
                )}
              </div>
              {botAuthStatus?.isConfigured &&
                botAuthStatus.method !== "global" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteAuth}
                    isLoading={isDeletingAuth}
                    className="text-error hover:text-error flex-shrink-0"
                    title="Remove authentication"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
            </div>

            {/* ── Auth Actions ──────────────────────────────────────────── */}
            <div className="space-y-3">
              {/* Google OAuth option */}
              {oauthConfigured && (
                <div className="p-4 rounded-lg border border-[#2a2a3e] bg-[#16162a]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[#6c5ce7]/10">
                        <Globe className="h-5 w-5 text-[#6c5ce7]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#e4e4f0]">
                          Sign in with Google
                        </p>
                        <p className="text-xs text-text-secondary">
                          Connect your Google account via OAuth for the bot to
                          use
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      leftIcon={<LogIn className="h-4 w-4" />}
                      onClick={handleGoogleOAuth}
                      isLoading={isLoadingOAuthUrl}
                    >
                      Connect
                    </Button>
                  </div>
                </div>
              )}

              {/* Upload auth.json option */}
              <div className="p-4 rounded-lg border border-[#2a2a3e] bg-[#16162a]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[#6c5ce7]/10">
                      <FileJson className="h-5 w-5 text-[#6c5ce7]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#e4e4f0]">
                        Upload auth.json
                      </p>
                      <p className="text-xs text-text-secondary">
                        Upload a Playwright auth state file generated by{" "}
                        <code className="px-1 py-0.5 rounded bg-bg-tertiary text-xs font-mono">
                          npm run gen:auth
                        </code>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Upload className="h-4 w-4" />}
                      onClick={() => fileInputRef.current?.click()}
                      isLoading={isUploadingAuth}
                    >
                      Upload File
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAuthPasteModal(true)}
                      title="Paste JSON content"
                    >
                      Paste
                    </Button>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleAuthFileUpload}
                  className="hidden"
                />
              </div>

              {/* Instructions */}
              <div className="p-3 rounded-lg bg-[#16162a]/50 border border-[#2a2a3e]/50">
                <p className="text-xs text-text-muted leading-relaxed">
                  <span className="font-medium text-text-secondary">
                    How to generate auth.json:
                  </span>{" "}
                  Run{" "}
                  <code className="px-1 py-0.5 rounded bg-bg-tertiary text-xs font-mono">
                    npm run gen:auth
                  </code>{" "}
                  in the backend directory. This opens a browser where you log
                  into a Google account. The session is saved to{" "}
                  <code className="px-1 py-0.5 rounded bg-bg-tertiary text-xs font-mono">
                    auth.json
                  </code>{" "}
                  which you can then upload here. Use a secondary Google
                  account, not your primary one.
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ── Paste Auth JSON Modal ───────────────────────────────────────── */}
      <Modal
        isOpen={showAuthPasteModal}
        onClose={() => {
          setShowAuthPasteModal(false);
          setAuthPasteContent("");
        }}
        title="Paste auth.json Content"
        description="Paste the contents of your auth.json file below"
        size="lg"
      >
        <div className="space-y-4">
          <textarea
            value={authPasteContent}
            onChange={(e) => setAuthPasteContent(e.target.value)}
            placeholder='{"cookies": [...], "origins": [...]}'
            rows={12}
            className="w-full bg-bg-secondary border border-border rounded-lg px-4 py-3 text-sm text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#6c5ce7]/50 focus:border-[#6c5ce7] hover:border-border-hover resize-none"
          />
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowAuthPasteModal(false);
                setAuthPasteContent("");
              }}
            >
              Cancel
            </Button>
            <Button
              leftIcon={<Upload className="h-4 w-4" />}
              onClick={handleAuthPasteSubmit}
              isLoading={isUploadingAuth}
              disabled={!authPasteContent.trim()}
            >
              Upload
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Webhooks Section ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <Bell className="h-5 w-5 text-[#6c5ce7]" />
                Webhooks
              </span>
            </CardTitle>
            <CardDescription>
              Receive HTTP notifications when meetings start and end
            </CardDescription>
          </div>
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={openAddWebhook}
          >
            Add Webhook
          </Button>
        </CardHeader>

        {isLoadingWebhooks ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 border-2 border-[#6c5ce7] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : webhooks.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[#2a2a3e] rounded-lg">
            <Bell className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-sm text-text-secondary">
              No webhooks configured
            </p>
            <p className="text-xs text-text-muted mt-1">
              Add a webhook to receive notifications about meeting events
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="p-4 rounded-lg border border-[#2a2a3e] bg-[#16162a] space-y-3"
              >
                {/* Top row: name, status, actions */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[#e4e4f0] truncate">
                        {webhook.name || "Unnamed Webhook"}
                      </p>
                      <Badge
                        variant={webhook.isActive ? "success" : "neutral"}
                        dot
                      >
                        {webhook.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Link className="h-3 w-3 text-text-muted flex-shrink-0" />
                      <p className="text-xs text-text-muted font-mono truncate">
                        {truncateUrl(webhook.url)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditWebhook(webhook)}
                      title="Edit"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTestWebhook(webhook.id)}
                      isLoading={testingWebhookId === webhook.id}
                      title="Test"
                    >
                      <TestTube2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteWebhook(webhook.id)}
                      isLoading={deletingWebhookId === webhook.id}
                      title="Delete"
                      className="text-error hover:text-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Events row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {webhook.events.map((event) => (
                    <Badge key={event} variant="brand">
                      {event}
                    </Badge>
                  ))}
                </div>

                {/* Last triggered row */}
                <div className="flex items-center gap-4 text-xs text-text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last triggered: {formatRelativeTime(webhook.lastTriggeredAt)}
                  </span>
                  {webhook.lastStatus !== null && (
                    <span className="inline-flex items-center gap-1">
                      {webhook.lastStatus >= 200 && webhook.lastStatus < 300 ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <X className="h-3 w-3 text-error" />
                      )}
                      Status: {webhook.lastStatus}
                    </span>
                  )}
                  {webhook.lastError && (
                    <span className="text-error truncate max-w-[200px]">
                      {webhook.lastError}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Webhook Add/Edit Modal ──────────────────────────────────────── */}
      <Modal
        isOpen={showWebhookForm}
        onClose={closeWebhookForm}
        title={editingWebhook ? "Edit Webhook" : "Add Webhook"}
        description="Configure a webhook endpoint to receive meeting event notifications"
        size="lg"
      >
        <form onSubmit={handleSaveWebhook} className="space-y-5">
          {/* Name */}
          <Input
            label="Name"
            type="text"
            placeholder="My Webhook"
            value={webhookForm.name}
            onChange={(e) =>
              setWebhookForm((prev) => ({ ...prev, name: e.target.value }))
            }
            leftIcon={<Bell className="h-4 w-4" />}
            hint="Optional friendly name for this webhook"
          />

          {/* URL */}
          <Input
            label="URL"
            type="url"
            placeholder="https://example.com/webhook"
            value={webhookForm.url}
            onChange={(e) =>
              setWebhookForm((prev) => ({ ...prev, url: e.target.value }))
            }
            leftIcon={<Link className="h-4 w-4" />}
          />

          {/* Secret */}
          <Input
            label="Secret"
            type="text"
            placeholder="Optional HMAC signing secret"
            value={webhookForm.secret}
            onChange={(e) =>
              setWebhookForm((prev) => ({ ...prev, secret: e.target.value }))
            }
            leftIcon={<Shield className="h-4 w-4" />}
            hint="Used for HMAC-SHA256 signature verification"
          />

          {/* Custom Headers */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-text-secondary">
                Custom Headers
              </label>
              <button
                type="button"
                onClick={addHeader}
                className="inline-flex items-center gap-1 text-xs text-[#6c5ce7] hover:text-[#7c6cf7] transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add Header
              </button>
            </div>
            {webhookForm.headers.length === 0 ? (
              <p className="text-xs text-text-muted">
                No custom headers configured
              </p>
            ) : (
              <div className="space-y-2">
                {webhookForm.headers.map((header, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Header name"
                      value={header.key}
                      onChange={(e) =>
                        updateHeader(index, "key", e.target.value)
                      }
                      className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#6c5ce7]/50 focus:border-[#6c5ce7] hover:border-border-hover"
                    />
                    <input
                      type="text"
                      placeholder="Value"
                      value={header.value}
                      onChange={(e) =>
                        updateHeader(index, "value", e.target.value)
                      }
                      className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#6c5ce7]/50 focus:border-[#6c5ce7] hover:border-border-hover"
                    />
                    <button
                      type="button"
                      onClick={() => removeHeader(index)}
                      className="p-2 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Events */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Events
            </label>
            <div className="flex flex-wrap gap-3">
              {WEBHOOK_EVENTS.map((event) => {
                const isSelected = webhookForm.events.includes(event);
                return (
                  <button
                    key={event}
                    type="button"
                    onClick={() => toggleEvent(event)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all duration-200 ${
                      isSelected
                        ? "border-[#6c5ce7] bg-[#6c5ce7]/10 text-[#6c5ce7]"
                        : "border-[#2a2a3e] bg-[#16162a] text-text-muted hover:border-border-hover hover:text-text-secondary"
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center h-4 w-4 rounded border ${
                        isSelected
                          ? "border-[#6c5ce7] bg-[#6c5ce7]"
                          : "border-[#2a2a3e]"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </span>
                    {event}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active toggle (only for edit) */}
          {editingWebhook && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-[#2a2a3e] bg-[#16162a]">
              <span className="text-sm text-[#e4e4f0]">Active</span>
              <button
                type="button"
                role="switch"
                aria-checked={webhookForm.isActive}
                onClick={() =>
                  setWebhookForm((prev) => ({
                    ...prev,
                    isActive: !prev.isActive,
                  }))
                }
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#6c5ce7] focus:ring-offset-2 focus:ring-offset-[#16162a] ${
                  webhookForm.isActive ? "bg-[#6c5ce7]" : "bg-[#2a2a3e]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    webhookForm.isActive ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Form actions */}
          <div className="flex gap-3 justify-end pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeWebhookForm}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              leftIcon={<Save className="h-4 w-4" />}
              isLoading={isSavingWebhook}
            >
              {editingWebhook ? "Update Webhook" : "Create Webhook"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Danger Zone ─────────────────────────────────────────────────── */}
      <Card className="border-error/20">
        <CardHeader>
          <div>
            <CardTitle className="text-error">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </span>
            </CardTitle>
            <CardDescription>
              Irreversible and destructive actions
            </CardDescription>
          </div>
        </CardHeader>

        <div className="flex items-center justify-between p-4 rounded-lg border border-error/20 bg-error/5">
          <div>
            <p className="text-sm font-medium text-text-primary">
              Delete Account
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              Permanently delete your account and all associated data
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
          >
            Delete Account
          </Button>
        </div>
      </Card>

      {/* ── Delete Account Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteConfirmText("");
        }}
        title="Delete Account"
        description="This will permanently delete your account, all meetings, transcripts, and API keys. This action cannot be undone."
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-error/5 border border-error/20">
            <AlertTriangle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-error">
                This is irreversible
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                All your data will be permanently deleted. Type{" "}
                <code className="px-1 py-0.5 rounded bg-bg-tertiary text-error text-xs font-mono">
                  DELETE
                </code>{" "}
                to confirm.
              </p>
            </div>
          </div>

          <Input
            placeholder="Type DELETE to confirm"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
          />

          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== "DELETE"}
            >
              Delete My Account
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
