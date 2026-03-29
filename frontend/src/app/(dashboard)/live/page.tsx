"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  Radio,
  Play,
  StopCircle,
  Globe,
  Bot as BotIcon,
  Languages,
  FileText,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  ExternalLink,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  api,
  parseMeetingUrl,
  type BotStatusItem,
  type MeetingStatus,
} from "@/lib/api";
import { useMeetingsStore } from "@/stores/meetings-store";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "hi", label: "Hindi" },
  { value: "ar", label: "Arabic" },
];

const POLL_INTERVAL = 10_000;

function getStatusBadgeVariant(
  status: MeetingStatus
): "success" | "warning" | "error" | "info" | "neutral" | "brand" {
  switch (status) {
    case "active":
      return "success";
    case "requested":
    case "joining":
    case "awaiting_admission":
      return "info";
    case "stopping":
      return "warning";
    case "completed":
      return "neutral";
    case "failed":
      return "error";
    default:
      return "neutral";
  }
}

function getStatusIcon(status: MeetingStatus) {
  switch (status) {
    case "active":
      return <Wifi className="h-3 w-3" />;
    case "requested":
    case "joining":
    case "awaiting_admission":
      return <Loader2 className="h-3 w-3 animate-spin" />;
    case "stopping":
      return <Clock className="h-3 w-3" />;
    case "completed":
      return <CheckCircle2 className="h-3 w-3" />;
    case "failed":
      return <AlertCircle className="h-3 w-3" />;
    default:
      return null;
  }
}

function isBotLive(status: MeetingStatus): boolean {
  return !["completed", "failed"].includes(status);
}

export default function LivePage() {
  const [meetingUrl, setMeetingUrl] = useState("");
  const [botName, setBotName] = useState("MeetBot");
  const [language, setLanguage] = useState("en");
  const [isJoining, setIsJoining] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [parsedMeetingId, setParsedMeetingId] = useState<string | null>(null);
  const [stoppingBots, setStoppingBots] = useState<Set<string>>(new Set());

  const { activeBots, fetchActiveBots } = useMeetingsStore();

  // Fetch active bots on mount and poll every 10s
  useEffect(() => {
    fetchActiveBots();
    const interval = setInterval(fetchActiveBots, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchActiveBots]);

  // Parse URL on change for validation feedback
  useEffect(() => {
    if (!meetingUrl.trim()) {
      setUrlError(null);
      setParsedMeetingId(null);
      return;
    }
    const parsed = parseMeetingUrl(meetingUrl.trim());
    if (parsed) {
      setUrlError(null);
      setParsedMeetingId(parsed.nativeMeetingId);
    } else {
      setUrlError(
        "Invalid Google Meet URL. Expected format: https://meet.google.com/abc-defg-hij"
      );
      setParsedMeetingId(null);
    }
  }, [meetingUrl]);

  const handleJoinMeeting = async (e: FormEvent) => {
    e.preventDefault();

    const trimmedUrl = meetingUrl.trim();
    if (!trimmedUrl) {
      toast.error("Please enter a meeting URL");
      return;
    }

    const parsed = parseMeetingUrl(trimmedUrl);
    if (!parsed) {
      setUrlError(
        "Invalid Google Meet URL. Expected format: https://meet.google.com/abc-defg-hij"
      );
      toast.error("Invalid meeting URL");
      return;
    }

    setIsJoining(true);
    try {
      await api.createBot({
        platform: parsed.platform,
        nativeMeetingId: parsed.nativeMeetingId,
        botName: botName || "MeetBot",
        language,
      });

      await fetchActiveBots();
      setMeetingUrl("");
      setParsedMeetingId(null);
      toast.success(`Bot is joining meeting ${parsed.nativeMeetingId}...`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to join meeting"
      );
    } finally {
      setIsJoining(false);
    }
  };

  const handleStopBot = async (bot: BotStatusItem) => {
    const botKey = `${bot.platform}:${bot.nativeMeetingId}`;
    setStoppingBots((prev) => new Set(prev).add(botKey));

    try {
      await api.stopBot(bot.platform, bot.nativeMeetingId);
      await fetchActiveBots();
      toast.success("Bot stopped");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to stop bot"
      );
    } finally {
      setStoppingBots((prev) => {
        const next = new Set(prev);
        next.delete(botKey);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Meetings</h2>
        <p className="text-sm text-text-secondary mt-1">
          Send a bot to join and transcribe your Google Meet meetings
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Join Meeting Form */}
        <Card>
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <Radio className="h-5 w-5 text-brand-primary" />
              <h3 className="text-lg font-semibold text-text-primary">
                Join Meeting
              </h3>
            </div>
            <p className="text-sm text-text-secondary">
              Send a bot to transcribe a meeting
            </p>
          </div>

          <form onSubmit={handleJoinMeeting} className="space-y-4">
            <div>
              <Input
                label="Meeting URL"
                type="url"
                placeholder="https://meet.google.com/abc-defg-hij"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                leftIcon={<Globe className="h-4 w-4" />}
                error={urlError ?? undefined}
                required
              />
              {parsedMeetingId && !urlError && (
                <p className="mt-1.5 text-xs text-success flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Meeting ID: {parsedMeetingId}
                </p>
              )}
            </div>

            <Input
              label="Bot Name (optional)"
              type="text"
              placeholder="MeetBot"
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              leftIcon={<BotIcon className="h-4 w-4" />}
            />

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Language
              </label>
              <div className="relative">
                <Languages className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-bg-secondary border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary hover:border-border-hover appearance-none cursor-pointer"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              leftIcon={<Play className="h-4 w-4" />}
              isLoading={isJoining}
              disabled={isJoining || !!urlError}
            >
              Join Meeting
            </Button>
          </form>
        </Card>

        {/* Active Bots */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BotIcon className="h-4 w-4 text-text-muted" />
              Active Bots
              {activeBots.length > 0 && (
                <span className="text-xs font-normal text-text-muted">
                  ({activeBots.length})
                </span>
              )}
            </CardTitle>
            <button
              onClick={() => fetchActiveBots()}
              className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
              title="Refresh active bots"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </CardHeader>

          {activeBots.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-text-muted">No active bots</p>
              <p className="text-xs text-text-muted mt-1">
                Join a meeting to get started
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeBots.map((bot) => {
                const live = isBotLive(bot.status);
                const botKey = `${bot.platform}:${bot.nativeMeetingId}`;
                const isStopping = stoppingBots.has(botKey);

                return (
                  <div
                    key={bot.meetingId}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-all",
                      "border-border/50 hover:bg-bg-tertiary/30",
                      !live && "opacity-50"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate font-mono">
                        {bot.nativeMeetingId}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant={getStatusBadgeVariant(bot.status)}
                          dot
                          pulse={live}
                        >
                          <span className="flex items-center gap-1">
                            {getStatusIcon(bot.status)}
                            {bot.status}
                          </span>
                        </Badge>
                        <span className="text-xs text-text-muted">
                          {bot.platform === "google_meet"
                            ? "Google Meet"
                            : bot.platform}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        {new Date(bot.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!live && (
                        <a
                          href={`/meetings/${bot.meetingId}`}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            "text-text-muted hover:text-brand-primary hover:bg-brand-primary/10"
                          )}
                          title="View Transcript"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {live && (
                        <button
                          onClick={() => handleStopBot(bot)}
                          disabled={isStopping}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            isStopping
                              ? "text-text-muted cursor-not-allowed"
                              : "text-text-muted hover:text-error hover:bg-error/10"
                          )}
                          title="Stop bot"
                        >
                          {isStopping ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <StopCircle className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Info card about transcripts */}
      <Card>
        <div className="flex items-center gap-3 text-text-secondary">
          <FileText className="h-5 w-5 text-brand-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-text-primary">
              Transcripts available after the call
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Once the bot leaves the meeting, the full transcript will be saved
              and available on the{" "}
              <a
                href="/meetings"
                className="text-brand-primary hover:underline"
              >
                Meetings
              </a>{" "}
              page.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
