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
} from "@/lib/api";
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
              {meeting.data?.botName || "Meeting"}
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
