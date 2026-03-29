"use client";

import { useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import {
  Radio,
  Play,
  StopCircle,
  Globe,
  Bot as BotIcon,
  Languages,
  FileText,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  api,
  parseMeetingUrl,
  type BotStatusItem,
  type MeetingStatus,
} from "@/lib/api";
import { useLiveTranscripts } from "@/hooks/use-live-transcripts";
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
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [stoppingBots, setStoppingBots] = useState<Set<string>>(new Set());

  const { activeBots, fetchActiveBots } = useMeetingsStore();

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const {
    groupedTranscripts,
    meetingStatus,
    isConnected,
    subscribeToMeeting,
    unsubscribeFromMeeting,
    clearTranscripts,
    segmentCount,
  } = useLiveTranscripts(selectedMeetingId);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [groupedTranscripts]);

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
      setUrlError("Invalid Google Meet URL. Expected format: https://meet.google.com/abc-defg-hij");
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
      setUrlError("Invalid Google Meet URL. Expected format: https://meet.google.com/abc-defg-hij");
      toast.error("Invalid meeting URL");
      return;
    }

    setIsJoining(true);
    try {
      const response = await api.createBot({
        platform: parsed.platform,
        nativeMeetingId: parsed.nativeMeetingId,
        botName: botName || "MeetBot",
        language,
      });

      // Refresh active bots list
      await fetchActiveBots();

      // Auto-select and subscribe to the new meeting
      setSelectedMeetingId(response.meetingId);
      subscribeToMeeting(response.meetingId);
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

      if (selectedMeetingId === bot.meetingId) {
        unsubscribeFromMeeting(bot.meetingId);
        setSelectedMeetingId(null);
      }
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

  const handleSelectBot = useCallback(
    (bot: BotStatusItem) => {
      if (selectedMeetingId) {
        unsubscribeFromMeeting(selectedMeetingId);
      }
      clearTranscripts();
      setSelectedMeetingId(bot.meetingId);
      subscribeToMeeting(bot.meetingId);
    },
    [selectedMeetingId, unsubscribeFromMeeting, clearTranscripts, subscribeToMeeting]
  );

  // Find the currently selected bot for status display
  const selectedBot = activeBots.find((b) => b.meetingId === selectedMeetingId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Join Form + Active Bots */}
        <div className="space-y-6">
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
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs">
                  {isConnected ? (
                    <>
                      <Wifi className="h-3.5 w-3.5 text-success" />
                      <span className="text-success">WS</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3.5 w-3.5 text-error" />
                      <span className="text-error">WS</span>
                    </>
                  )}
                </div>
                <button
                  onClick={() => fetchActiveBots()}
                  className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                  title="Refresh active bots"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
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
                  const isSelected = selectedMeetingId === bot.meetingId;
                  const botKey = `${bot.platform}:${bot.nativeMeetingId}`;
                  const isStopping = stoppingBots.has(botKey);

                  return (
                    <div
                      key={bot.meetingId}
                      onClick={() => live && handleSelectBot(bot)}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-all",
                        live && "cursor-pointer",
                        isSelected
                          ? "border-brand-primary/40 bg-brand-primary/5"
                          : "border-border/50 hover:border-border-hover hover:bg-bg-tertiary/30",
                        !live && "opacity-50 cursor-default"
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
                            {bot.platform === "google_meet" ? "Google Meet" : bot.platform}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          {new Date(bot.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      {live && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStopBot(bot);
                          }}
                          disabled={isStopping}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors flex-shrink-0",
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
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Live Transcript Viewer */}
        <div className="lg:col-span-2">
          <Card padding="none" className="h-[calc(100vh-12rem)] flex flex-col">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-text-primary">
                    Live Transcript
                  </h3>
                  {selectedMeetingId && isConnected && (
                    <Badge variant="success" dot pulse>
                      Live
                    </Badge>
                  )}
                  {segmentCount > 0 && (
                    <span className="text-xs text-text-muted">
                      {segmentCount} segments
                    </span>
                  )}
                </div>
                {selectedBot && (
                  <Badge variant={getStatusBadgeVariant(selectedBot.status)}>
                    <span className="flex items-center gap-1">
                      {getStatusIcon(selectedBot.status)}
                      {selectedBot.status}
                    </span>
                  </Badge>
                )}
              </div>
              {selectedMeetingId && (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-text-muted">
                    Meeting: {selectedBot?.nativeMeetingId ?? selectedMeetingId}
                  </p>
                  {meetingStatus && meetingStatus !== selectedBot?.status && (
                    <Badge variant="info" className="text-[10px]">
                      ws: {meetingStatus}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Transcript content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {!selectedMeetingId ? (
                <EmptyState
                  icon={<Radio className="h-10 w-10" />}
                  title="No active transcript"
                  description="Join a meeting or select an active bot to see the live transcript"
                />
              ) : groupedTranscripts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="relative mb-4">
                    <div className="w-12 h-12 rounded-full bg-brand-primary/10 flex items-center justify-center">
                      <FileText className="h-6 w-6 text-brand-primary" />
                    </div>
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-success" />
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary">
                    Waiting for transcript...
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    Speech will appear here in real-time
                  </p>
                  {selectedBot && (
                    <p className="text-xs text-text-muted mt-3">
                      Bot status:{" "}
                      <span className="font-medium text-text-secondary">
                        {selectedBot.status}
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedTranscripts.map((group, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex-shrink-0 w-28 pt-0.5">
                        <p className="text-sm font-medium text-brand-secondary truncate">
                          {group.speaker}
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatTime(group.startTime)}
                        </p>
                      </div>
                      <div className="flex-1 text-sm text-text-primary leading-relaxed">
                        {group.entries.map((entry, i) => (
                          <span
                            key={entry.id || i}
                            className={cn(
                              !entry.isFinal && "text-text-secondary italic"
                            )}
                          >
                            {entry.text}{" "}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
