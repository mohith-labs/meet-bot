"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
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
  Check,
  X,
  User,
  Mail,
  AlertTriangle,
  Save,
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

  // ── Profile state ───────────────────────────────────────────────────────
  const [name] = useState(user?.name ?? "");
  const [email] = useState(user?.email ?? "");

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

  useEffect(() => {
    loadSettings();
    loadWebhooks();
  }, [loadSettings, loadWebhooks]);

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

  return (
    <div className="max-w-2xl space-y-6">
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
