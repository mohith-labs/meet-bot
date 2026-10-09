"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Video,
  Clock,
  FileText,
  Share2,
  StopCircle,
  Trash2,
  ExternalLink,
  Globe,
  Monitor,
  Mic,
  Download,
  Cloud,
  CloudUpload,
  CloudOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/loading";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/ui/copy-button";
import { Modal } from "@/components/ui/modal";
import {
  api,
  type Meeting,
  type MeetingStatus,
  type TranscriptSegment,
  type MeetingUpload,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  absoluteStartTime: number;
  isFinal: boolean;
}
import { formatDuration, cn } from "@/lib/utils";
import toast from "react-hot-toast";

/** Calculate duration in seconds from startTime/endTime ISO strings */
function calcDurationSeconds(
  startTime: string | null,
  endTime: string | null
): number {
  if (!startTime || !endTime) return 0;
  const diffMs =
    new Date(endTime).getTime() - new Date(startTime).getTime();
  return Math.max(0, Math.round(diffMs / 1000));
}

/** Display platform name nicely */
function formatPlatform(platform: string): string {
  const map: Record<string, string> = {
    google_meet: "Google Meet",
  };
  return map[platform] || platform;
}

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStopping, setIsStopping] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [transcriptRetryCount, setTranscriptRetryCount] = useState(0);
  const [meetingRetryCount, setMeetingRetryCount] = useState(0);

  const isLive =
    meeting?.status === "active" ||
    meeting?.status === "joining" ||
    meeting?.status === "awaiting_admission";

  // Live transcript feature removed — transcripts are saved after the call ends

  // Load meeting by UUID directly (no more fetching all meetings)
  useEffect(() => {
    async function loadMeeting() {
      try {
        const found = await api.getMeetingById(meetingId);
        setMeeting(found);

        // Fetch transcript using meeting UUID
        try {
          const transcriptData = await api.getTranscriptByMeetingId(meetingId);
          setSegments(transcriptData.segments);
        } catch {
          // Transcript may not exist yet — that's fine
        }
      } catch {
        // Meeting not found or fetch failed
      } finally {
        setIsLoading(false);
      }
    }

    loadMeeting();
  }, [meetingId]);

  // Poll for meeting status changes while the meeting is live.
  // When the bot auto-exits (or meeting ends naturally), the backend updates
  // the status to "completed" — but the frontend has no WebSocket notification,
  // so we poll every 5s. Once we detect the transition, we update local state
  // which triggers the existing transcript/recording retry polling effects.
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(async () => {
      try {
        const updated = await api.getMeetingById(meetingId);
        const newIsLive =
          updated.status === "active" ||
          updated.status === "joining" ||
          updated.status === "awaiting_admission";

        if (!newIsLive) {
          // Meeting is no longer live — update state to trigger retry polling
          setMeeting(updated);

          // Also eagerly fetch transcripts now
          try {
            const transcriptData =
              await api.getTranscriptByMeetingId(meetingId);
            if (transcriptData.segments.length > 0) {
              setSegments(transcriptData.segments);
            }
          } catch {
            // Transcript may not be ready yet — retry polling will handle it
          }
        }
      } catch {
        // Network error — ignore, will retry on next interval
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isLive, meetingId]);

  // Retry polling for transcript availability after meeting completion
  // 3s interval, up to 5 attempts
  useEffect(() => {
    if (
      meeting?.status !== "completed" ||
      segments.length > 0 ||
      transcriptRetryCount >= 5
    ) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const transcriptData = await api.getTranscriptByMeetingId(meetingId);
        if (transcriptData.segments.length > 0) {
          setSegments(transcriptData.segments);
        } else {
          setTranscriptRetryCount((c) => c + 1);
        }
      } catch {
        setTranscriptRetryCount((c) => c + 1);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [meeting?.status, meetingId, segments.length, transcriptRetryCount]);

  // Retry polling for recording paths after meeting completion.
  // Recordings are saved by the bot slightly after the meeting status changes
  // to completed, so the meeting data may not have recording paths yet.
  const hasRecordings =
    !!meeting?.data?.screenRecordingPath || !!meeting?.data?.audioRecordingPath;
  const recordingWasEnabled =
    meeting?.data?.screenRecordingEnabled || meeting?.data?.audioRecordingEnabled;

  useEffect(() => {
    if (
      meeting?.status !== "completed" ||
      hasRecordings ||
      !recordingWasEnabled ||
      meetingRetryCount >= 8
    ) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const updated = await api.getMeetingById(meetingId);
        if (
          updated.data?.screenRecordingPath ||
          updated.data?.audioRecordingPath
        ) {
          setMeeting(updated);
        } else {
          setMeetingRetryCount((c) => c + 1);
        }
      } catch {
        setMeetingRetryCount((c) => c + 1);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [
    meeting?.status,
    meetingId,
    hasRecordings,
    recordingWasEnabled,
    meetingRetryCount,
  ]);

  const handleStop = async () => {
    if (!meeting) return;
    setIsStopping(true);
    try {
      await api.stopBot(meeting.platform, meeting.nativeMeetingId);
      setMeeting((prev) =>
        prev ? { ...prev, status: "completed" as MeetingStatus } : null
      );
      toast.success("Bot stopped successfully");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to stop bot"
      );
    } finally {
      setIsStopping(false);
    }
  };

  const handleShare = async () => {
    if (!meeting) return;
    try {
      const result = await api.shareTranscript(
        meeting.platform,
        meeting.nativeMeetingId
      );
      setShareUrl(result.shareUrl);
      await navigator.clipboard.writeText(result.shareUrl);
      toast.success("Share link copied to clipboard");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to share transcript"
      );
    }
  };

  const handleDelete = async () => {
    if (!meeting) return;
    setIsDeleting(true);
    try {
      await api.deleteMeeting(meeting.platform, meeting.nativeMeetingId);
      toast.success("Meeting deleted");
      router.push("/meetings");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete meeting"
      );
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (isLoading) return <PageLoader />;
  if (!meeting) {
    return (
      <EmptyState
        icon={<Video className="h-10 w-10" />}
        title="Meeting not found"
        description="The meeting you&apos;re looking for doesn&apos;t exist"
        action={
          <Button onClick={() => router.push("/meetings")}>
            Back to Meetings
          </Button>
        }
      />
    );
  }

  const statusVariant: Record<
    MeetingStatus,
    "success" | "warning" | "error" | "info" | "neutral"
  > = {
    requested: "warning",
    joining: "warning",
    awaiting_admission: "warning",
    active: "success",
    stopping: "info",
    completed: "neutral",
    failed: "error",
  };

  const durationSecs = calcDurationSeconds(meeting.startTime, meeting.endTime);
  const displayTime = meeting.startTime || meeting.createdAt;

  // Group static segments for display (live transcription removed)
  const displayTranscripts =
    segments.length > 0 ? groupSegments(segments) : [];

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push("/meetings")}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Meetings
      </button>

      {/* Meeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">
              {meeting.title || meeting.data?.botName || "Meeting"}
            </h1>
            <Badge
              variant={statusVariant[meeting.status] || "neutral"}
              dot
              pulse={meeting.status === "active"}
            >
              {meeting.status}
            </Badge>
            {isLive && (
              <Badge variant="info" dot pulse>
                In Progress
              </Badge>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {formatPlatform(meeting.platform)} &middot;{" "}
            {meeting.startTime
              ? `Started ${format(new Date(meeting.startTime), "MMMM d, yyyy 'at' h:mm a")}`
              : `Created ${format(new Date(meeting.createdAt), "MMMM d, yyyy 'at' h:mm a")}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {segments.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Share2 className="h-4 w-4" />}
              onClick={handleShare}
            >
              Share
            </Button>
          )}
          {meeting.status === "active" && (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<StopCircle className="h-4 w-4" />}
              onClick={handleStop}
              isLoading={isStopping}
            >
              Stop Bot
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Trash2 className="h-4 w-4" />}
            onClick={() => setShowDeleteModal(true)}
            className="text-error hover:text-error"
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Metadata Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding="sm" className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-primary/10 text-brand-primary">
            <Video className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-text-muted">Platform</p>
            <p className="text-sm font-medium text-text-primary">
              {formatPlatform(meeting.platform)}
            </p>
          </div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-primary/10 text-brand-primary">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-text-muted">Duration</p>
            <p className="text-sm font-medium text-text-primary">
              {durationSecs > 0
                ? formatDuration(durationSecs)
                : meeting.status === "active"
                  ? "In progress..."
                  : "—"}
            </p>
          </div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-primary/10 text-brand-primary">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-text-muted">Meeting ID</p>
            <p className="text-sm font-medium text-text-primary truncate max-w-[160px]">
              {meeting.nativeMeetingId}
            </p>
          </div>
        </Card>
        <Card padding="sm" className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-primary/10 text-brand-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-text-muted">Segments</p>
            <p className="text-sm font-medium text-text-primary">
              {segments.length}
            </p>
          </div>
        </Card>
      </div>

      {/* Meeting URL */}
      {meeting.constructedMeetingUrl && (
        <Card padding="sm" className="flex items-center gap-3">
          <ExternalLink className="h-4 w-4 text-text-muted flex-shrink-0" />
          <a
            href={meeting.constructedMeetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-sm text-brand-secondary truncate hover:underline"
          >
            {meeting.constructedMeetingUrl}
          </a>
          <CopyButton text={meeting.constructedMeetingUrl} />
        </Card>
      )}

      {/* Recordings Section */}
      <RecordingsSection meeting={meeting} isLive={isLive} />

      {/* Cloud Archive (S3) */}
      <CloudArchiveCard meetingId={meetingId} meetingStatus={meeting.status} />

      {/* Share URL */}
      {shareUrl && (
        <Card padding="sm" className="flex items-center gap-3">
          <Share2 className="h-4 w-4 text-text-muted flex-shrink-0" />
          <code className="flex-1 text-sm text-brand-secondary truncate">
            {shareUrl}
          </code>
          <CopyButton text={shareUrl} />
        </Card>
      )}

      {/* Transcript Viewer */}
      <Card padding="none">
        <CardHeader className="px-6 pt-6">
          <CardTitle>Transcript</CardTitle>
          {isLive && (
            <div className="flex items-center gap-2 text-sm text-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              Live
            </div>
          )}
        </CardHeader>

        <div className="px-6 pb-6 max-h-[600px] overflow-y-auto">
          {displayTranscripts.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="No transcript yet"
              description={
                isLive
                  ? "Transcript will be available once the meeting ends"
                  : "No transcript segments available for this meeting"
              }
            />
          ) : (
            <div className="space-y-4">
              {displayTranscripts.map((group: GroupedSegment, index: number) => (
                <div key={index} className="flex gap-4">
                  <div className="flex-shrink-0 w-28 pt-0.5">
                    <p className="text-sm font-medium text-brand-secondary truncate">
                      {group.speaker}
                    </p>
                    <p className="text-xs text-text-muted">
                      {formatTimestamp(group.startTime)}
                    </p>
                  </div>
                  <div className="flex-1 text-sm text-text-primary leading-relaxed">
                    {group.entries.map((entry: TranscriptSegment | TranscriptEntry, i: number) => (
                      <span
                        key={entry.id || i}
                        className="text-text-primary"
                      >
                        {entry.text}{" "}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Meeting"
        description="This action cannot be undone. All meeting data and transcripts will be permanently deleted."
        size="sm"
      >
        <div className="flex items-center gap-3 justify-end">
          <Button
            variant="secondary"
            onClick={() => setShowDeleteModal(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={isDeleting}
          >
            Delete Meeting
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// Helper types and functions

interface GroupedSegment {
  speaker: string;
  entries: (TranscriptSegment | TranscriptEntry)[];
  startTime: number;
  endTime: number;
}

function groupSegments(segments: TranscriptSegment[]): GroupedSegment[] {
  if (segments.length === 0) return [];

  // Sort by startTime (numeric relative offset)
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  const groups: GroupedSegment[] = [];
  let current: GroupedSegment | null = null;

  for (const seg of sorted) {
    if (
      !current ||
      current.speaker !== seg.speaker ||
      seg.startTime - current.endTime > 3
    ) {
      if (current) groups.push(current);
      current = {
        speaker: seg.speaker,
        entries: [seg],
        startTime: seg.startTime,
        endTime: seg.endTime,
      };
    } else {
      current.entries.push(seg);
      current.endTime = seg.endTime;
    }
  }
  if (current) groups.push(current);
  return groups;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Recordings section — fetches blob with auth and renders media players
// ---------------------------------------------------------------------------

function RecordingsSection({
  meeting,
  isLive,
}: {
  meeting: Meeting;
  isLive: boolean;
}) {
  const [screenUrl, setScreenUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hasScreen = !!meeting.data?.screenRecordingPath;
  const hasAudio = !!meeting.data?.audioRecordingPath;
  const hasAnyRecording = hasScreen || hasAudio;
  const isRecording =
    isLive &&
    (meeting.data?.screenRecordingEnabled || meeting.data?.audioRecordingEnabled);

  useEffect(() => {
    if (!hasAnyRecording) return;

    let cancelled = false;
    setLoading(true);

    async function fetchBlob(
      type: "screen" | "audio"
    ): Promise<string | null> {
      try {
        const token = getToken();
        const res = await fetch(api.getRecordingUrl(meeting.id, type), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    }

    (async () => {
      if (hasScreen) {
        const url = await fetchBlob("screen");
        if (!cancelled) setScreenUrl(url);
      }
      if (hasAudio) {
        const url = await fetchBlob("audio");
        if (!cancelled) setAudioUrl(url);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      if (screenUrl) URL.revokeObjectURL(screenUrl);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id, hasScreen, hasAudio]);

  if (!hasAnyRecording && !isRecording) return null;

  return (
    <Card padding="sm">
      <div className="flex items-center gap-2 mb-3">
        <Video className="h-4 w-4 text-brand-primary" />
        <h3 className="text-sm font-semibold text-text-primary">Recordings</h3>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-4 text-sm text-text-muted">
          <div className="h-4 w-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
          Loading recordings...
        </div>
      )}

      <div className="space-y-4">
        {/* Screen recording (video + audio merged via ffmpeg) */}
        {screenUrl && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-brand-primary" />
                <span className="text-sm font-medium text-text-primary">
                  Screen Recording
                </span>
              </div>
              <a
                href={
                  api.getRecordingUrl(meeting.id, "screen") + "?download=true"
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            </div>
            <video
              controls
              className="w-full rounded-lg border border-border bg-black"
              src={screenUrl}
            />
          </div>
        )}

        {/* Audio recording */}
        {audioUrl && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-brand-primary" />
                <span className="text-sm font-medium text-text-primary">
                  Audio Recording
                </span>
              </div>
              <a
                href={
                  api.getRecordingUrl(meeting.id, "audio") + "?download=true"
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            </div>
            <audio controls className="w-full" src={audioUrl} />
          </div>
        )}

        {/* In-progress indicators */}
        {isRecording && !hasAnyRecording && (
          <div className="flex flex-wrap gap-3">
            {meeting.data?.screenRecordingEnabled && (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-muted">
                <Monitor className="h-4 w-4" />
                Screen recording in progress...
              </div>
            )}
            {meeting.data?.audioRecordingEnabled && (
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-sm text-text-muted">
                <Mic className="h-4 w-4" />
                Audio recording in progress...
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cloud archive (S3) section — upload status, artifact links, retry
// ---------------------------------------------------------------------------

/** Human-readable file size. */
function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const UPLOAD_BADGE: Record<
  string,
  { variant: "success" | "warning" | "error" | "info" | "neutral"; label: string }
> = {
  completed: { variant: "success", label: "Archived to S3" },
  uploading: { variant: "info", label: "Uploading..." },
  pending: { variant: "warning", label: "Upload pending" },
  failed: { variant: "error", label: "Upload failed" },
  skipped: { variant: "neutral", label: "Not archived" },
  none: { variant: "neutral", label: "Not archived" },
};

function CloudArchiveCard({
  meetingId,
  meetingStatus,
}: {
  meetingId: string;
  meetingStatus: MeetingStatus;
}) {
  const [upload, setUpload] = useState<MeetingUpload | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const isFinished = meetingStatus === "completed" || meetingStatus === "failed";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api.getUpload(meetingId);
        if (!cancelled) setUpload(data);
      } catch {
        if (!cancelled) setUpload(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Poll while an upload is in flight so the badge settles on its own.
    const interval = setInterval(() => {
      setUpload((current) => {
        if (
          current &&
          (current.status === "uploading" || current.status === "pending")
        ) {
          load();
        }
        return current;
      });
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [meetingId]);

  const handleRetry = async () => {
    try {
      setIsRetrying(true);
      const result = await api.retryUpload(meetingId);
      setUpload(result.upload);
      if (result.upload?.status === "completed") {
        toast.success("Meeting archived to S3");
      } else if (result.upload?.status === "skipped") {
        toast(result.upload.lastError || "Upload skipped");
      } else {
        toast.error(result.upload?.lastError || "Upload did not complete");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to retry upload"
      );
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDownload = async (artifactName: string) => {
    try {
      setDownloading(artifactName);
      const { url } = await api.getArtifactUrl(meetingId, artifactName);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create download link"
      );
    } finally {
      setDownloading(null);
    }
  };

  // Nothing to show for meetings that are still running.
  if (!isFinished) return null;
  if (loading) return null;

  const status = upload?.status || "none";
  const badge = UPLOAD_BADGE[status] || UPLOAD_BADGE.none;
  const isSkipped = status === "skipped" || status === "none";

  return (
    <Card padding="sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {status === "completed" ? (
            <Cloud className="h-5 w-5 text-green-400" />
          ) : status === "failed" ? (
            <CloudOff className="h-5 w-5 text-red-400" />
          ) : status === "uploading" || status === "pending" ? (
            <CloudUpload className="h-5 w-5 text-[#6c5ce7] animate-pulse" />
          ) : (
            <CloudOff className="h-5 w-5 text-text-muted" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-text-primary">
                Cloud Archive
              </p>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </div>
            {status === "completed" && upload?.folderKey && (
              <p className="text-xs text-text-muted mt-1 font-mono break-all">
                s3://{upload.bucket}/{upload.folderKey}/
              </p>
            )}
            {isSkipped && (
              <p className="text-xs text-text-muted mt-1">
                {upload?.lastError ||
                  "Configure an S3 bucket in Settings to archive meetings automatically."}
              </p>
            )}
            {status === "failed" && (
              <p className="text-xs text-red-400 mt-1">
                {upload?.lastError || "Upload failed"}
                {upload?.attempts ? ` (attempt ${upload.attempts})` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === "completed" && (
            <span className="text-xs text-text-muted inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              {formatBytes(upload?.totalBytes || 0)}
            </span>
          )}
          {status !== "uploading" && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={handleRetry}
              isLoading={isRetrying}
            >
              {status === "completed" ? "Re-upload" : "Upload now"}
            </Button>
          )}
        </div>
      </div>

      {/* Archived artifact links */}
      {status === "completed" && (upload?.artifacts?.length ?? 0) > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs font-medium text-text-secondary mb-2">
            Archived files
          </p>
          <div className="flex flex-wrap gap-2">
            {upload!.artifacts!.map((artifact) => (
              <button
                key={artifact.name}
                onClick={() => handleDownload(artifact.name)}
                disabled={downloading === artifact.name}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border text-xs text-text-secondary hover:border-[#6c5ce7] hover:text-text-primary transition-colors disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="font-mono">{artifact.name}</span>
                <span className="text-text-muted">
                  {formatBytes(artifact.size)}
                </span>
              </button>
            ))}
          </div>
          {upload?.localFilesDeleted && (
            <p className="text-xs text-text-muted mt-3 inline-flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" />
              Local copies were deleted after upload — S3 is the source of truth.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
