"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Video,
  ExternalLink,
  Trash2,
  Calendar,
} from "lucide-react";
import { format, startOfDay, isSameDay, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading";
import { Dropdown } from "@/components/ui/dropdown";
import { useMeetingsStore } from "@/stores/meetings-store";
import type { Meeting, MeetingStatus } from "@/lib/api";
import { formatDuration, cn } from "@/lib/utils";
import toast from "react-hot-toast";

const STATUS_OPTIONS = [
  { label: "All Status", value: "" },
  { label: "Requested", value: "requested" },
  { label: "Joining", value: "joining" },
  { label: "Awaiting Admission", value: "awaiting_admission" },
  { label: "Active", value: "active" },
  { label: "Stopping", value: "stopping" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
];

const PAGE_SIZE = 20;

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

/** Group meetings by date for display */
function groupMeetingsByDate(
  meetings: Meeting[]
): { label: string; meetings: Meeting[] }[] {
  const groups = new Map<string, Meeting[]>();
  const today = startOfDay(new Date());
  const yesterday = subDays(today, 1);

  for (const meeting of meetings) {
    const meetingDate = startOfDay(
      new Date(meeting.createdAt)
    );
    let label: string;

    if (isSameDay(meetingDate, today)) {
      label = "Today";
    } else if (isSameDay(meetingDate, yesterday)) {
      label = "Yesterday";
    } else {
      label = format(meetingDate, "MMMM d, yyyy");
    }

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(meeting);
  }

  return Array.from(groups.entries()).map(([label, meetings]) => ({
    label,
    meetings,
  }));
}

export default function MeetingsPage() {
  const router = useRouter();
  const { meetings, meta, isLoading, fetchMeetings, deleteMeeting } =
    useMeetingsStore();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch meetings whenever page, status, or debounced search changes
  const doFetch = useCallback(() => {
    fetchMeetings({
      page,
      limit: PAGE_SIZE,
      status: statusFilter || undefined,
      search: debouncedSearch || undefined,
    });
  }, [page, statusFilter, debouncedSearch, fetchMeetings]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  const totalPages = meta?.totalPages || 1;

  // Group meetings by date
  const dateGroups = useMemo(
    () => groupMeetingsByDate(meetings),
    [meetings]
  );

  const handleDelete = async (meeting: Meeting) => {
    setDeletingId(meeting.id);
    try {
      await deleteMeeting(meeting.platform, meeting.nativeMeetingId);
      toast.success("Meeting deleted");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete meeting"
      );
    } finally {
      setDeletingId(null);
    }
  };

  const statusBadge = (status: MeetingStatus) => {
    const variants: Record<
      MeetingStatus,
      {
        variant: "success" | "warning" | "error" | "info" | "neutral";
        label: string;
      }
    > = {
      requested: { variant: "warning", label: "Requested" },
      joining: { variant: "warning", label: "Joining" },
      awaiting_admission: { variant: "warning", label: "Awaiting" },
      active: { variant: "success", label: "Active" },
      stopping: { variant: "info", label: "Stopping" },
      completed: { variant: "neutral", label: "Completed" },
      failed: { variant: "error", label: "Failed" },
    };
    const { variant, label } = variants[status] || {
      variant: "neutral" as const,
      label: status,
    };
    return (
      <Badge variant={variant} dot pulse={status === "active"}>
        {label}
      </Badge>
    );
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by meeting ID or bot name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-bg-secondary border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary"
          />
        </div>

        {/* Status Filter */}
        <Dropdown
          trigger={
            <Button
              variant="secondary"
              leftIcon={<Filter className="h-4 w-4" />}
            >
              {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ||
                "All Status"}
            </Button>
          }
          items={STATUS_OPTIONS.map((option) => ({
            label: option.label,
            onClick: () => setStatusFilter(option.value),
          }))}
          align="right"
        />
      </div>

      {/* Meetings Table */}
      {isLoading ? (
        <TableSkeleton rows={5} />
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={<Video className="h-10 w-10" />}
          title="No meetings found"
          description={
            searchInput || statusFilter
              ? "Try adjusting your filters"
              : "Get started by sending a bot to join a meeting"
          }
          action={
            !searchInput && !statusFilter ? (
              <Button onClick={() => router.push("/live")}>
                Join a Meeting
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {dateGroups.map((group) => (
            <div key={group.label}>
              {/* Date Header */}
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="h-4 w-4 text-text-muted" />
                <h3 className="text-sm font-semibold text-text-secondary">
                  {group.label}
                </h3>
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-xs text-text-muted">
                  {group.meetings.length}{" "}
                  {group.meetings.length === 1 ? "meeting" : "meetings"}
                </span>
              </div>

              {/* Table for this date group */}
              <div className="rounded-xl border border-border overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[1fr_110px_110px_140px_80px_80px] gap-4 px-6 py-3 bg-bg-secondary/50 border-b border-border text-xs font-medium text-text-muted uppercase tracking-wider">
                  <div>Meeting</div>
                  <div>Platform</div>
                  <div>Status</div>
                  <div>Start Time</div>
                  <div>Duration</div>
                  <div className="text-right">Actions</div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-border/50">
                  {group.meetings.map((meeting) => {
                    const durationSecs = calcDurationSeconds(
                      meeting.startTime,
                      meeting.endTime
                    );

                    return (
                      <div
                        key={meeting.id}
                        className="grid grid-cols-[1fr_110px_110px_140px_80px_80px] gap-4 px-6 py-4 items-center hover:bg-bg-tertiary/30 transition-colors cursor-pointer"
                        onClick={() => router.push(`/meetings/${meeting.id}`)}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {meeting.data?.botName || "MeetBot"}
                          </p>
                          <p className="text-xs text-text-muted truncate">
                            {meeting.nativeMeetingId}
                          </p>
                        </div>
                        <div>
                          <span className="text-sm text-text-secondary">
                            {formatPlatform(meeting.platform)}
                          </span>
                        </div>
                        <div>{statusBadge(meeting.status)}</div>
                        <div className="text-sm text-text-secondary">
                          {meeting.startTime
                            ? format(
                                new Date(meeting.startTime),
                                "MMM d, h:mm a"
                              )
                            : "\u2014"}
                        </div>
                        <div className="text-sm text-text-muted">
                          {durationSecs > 0
                            ? formatDuration(durationSecs)
                            : meeting.status === "active"
                              ? "Live"
                              : "\u2014"}
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/meetings/${meeting.id}`);
                            }}
                            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                            title="View details"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(meeting);
                            }}
                            disabled={deletingId === meeting.id}
                            className={cn(
                              "p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors",
                              deletingId === meeting.id && "opacity-50"
                            )}
                            title="Delete meeting"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
            {Math.min(page * PAGE_SIZE, meta.total)} of {meta.total} meetings
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              leftIcon={<ChevronLeft className="h-4 w-4" />}
            >
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {getPageNumbers().map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={cn(
                    "w-8 h-8 rounded-lg text-sm font-medium transition-colors",
                    pageNum === page
                      ? "bg-brand-primary text-white"
                      : "text-text-secondary hover:bg-bg-tertiary"
                  )}
                >
                  {pageNum}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              rightIcon={<ChevronRight className="h-4 w-4" />}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
