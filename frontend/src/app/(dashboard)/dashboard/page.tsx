"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Video,
  Bot,
  Clock,
  Key,
  Plus,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { format } from "date-fns";
import { StatsCard } from "@/components/ui/stats-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/loading";
import {
  api,
  type Meeting,
  type MeetingStatus,
  type BotStatusItem,
} from "@/lib/api";
import { formatDuration } from "@/lib/utils";

interface DashboardStats {
  totalMeetings: number;
  activeBots: number;
  totalMinutes: number;
  apiKeys: number;
}

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

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    totalMeetings: 0,
    activeBots: 0,
    totalMinutes: 0,
    apiKeys: 0,
  });
  const [recentMeetings, setRecentMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [meetingsRes, botsRes, keysRes] = await Promise.allSettled([
          api.listMeetings(),
          api.getBotStatus(),
          api.listApiKeys(),
        ]);

        if (meetingsRes.status === "fulfilled") {
          const result = meetingsRes.value;
          const meetings = result.meetings;
          // Sort by createdAt desc and take first 5 for recent list
          const sorted = [...meetings].sort(
            (a, b) =>
              new Date(b.createdAt).getTime() -
              new Date(a.createdAt).getTime()
          );
          setRecentMeetings(sorted.slice(0, 5));

          // Calculate total minutes from completed meetings
          const totalSeconds = meetings.reduce(
            (sum, m) => sum + calcDurationSeconds(m.startTime, m.endTime),
            0
          );

          setStats((prev) => ({
            ...prev,
            totalMeetings: result.meta.total,
            totalMinutes: Math.round(totalSeconds / 60),
          }));
        }

        if (botsRes.status === "fulfilled") {
          const activeBots = botsRes.value.length;
          setStats((prev) => ({
            ...prev,
            activeBots,
          }));
        }

        if (keysRes.status === "fulfilled") {
          setStats((prev) => ({
            ...prev,
            apiKeys: keysRes.value.filter((k) => k.isActive).length,
          }));
        }
      } catch {
        // Silently handle — dashboard data is non-critical
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, []);

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
      awaiting_admission: { variant: "warning", label: "Awaiting Admission" },
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

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-bg-card border border-border p-5"
            >
              <Skeleton className="h-10 w-10 rounded-lg mb-4" />
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))
        ) : (
          <>
            <StatsCard
              icon={<Video className="h-5 w-5" />}
              label="Total Meetings"
              value={stats.totalMeetings}
            />
            <StatsCard
              icon={<Bot className="h-5 w-5" />}
              label="Active Bots"
              value={stats.activeBots}
            />
            <StatsCard
              icon={<Clock className="h-5 w-5" />}
              label="Total Minutes"
              value={stats.totalMinutes}
            />
            <StatsCard
              icon={<Key className="h-5 w-5" />}
              label="Active API Keys"
              value={stats.apiKeys}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Meetings */}
        <Card className="lg:col-span-2" padding="none">
          <CardHeader className="px-6 pt-6 pb-0">
            <CardTitle>Recent Meetings</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<ArrowRight className="h-4 w-4" />}
              onClick={() => router.push("/meetings")}
            >
              View all
            </Button>
          </CardHeader>

          <div className="px-6 pb-6 pt-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 p-3 rounded-lg"
                  >
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-4 w-24 ml-auto" />
                  </div>
                ))}
              </div>
            ) : recentMeetings.length === 0 ? (
              <EmptyState
                icon={<Video className="h-8 w-8" />}
                title="No meetings yet"
                description="Start by sending a bot to join a meeting"
                action={
                  <Button
                    leftIcon={<Plus className="h-4 w-4" />}
                    onClick={() => router.push("/live")}
                  >
                    Join Meeting
                  </Button>
                }
              />
            ) : (
              <div className="space-y-1">
                {recentMeetings.map((meeting) => {
                  const durationSecs = calcDurationSeconds(
                    meeting.startTime,
                    meeting.endTime
                  );
                  const displayTime = meeting.startTime || meeting.createdAt;

                  return (
                    <button
                      key={meeting.id}
                      onClick={() => router.push(`/meetings/${meeting.id}`)}
                      className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-bg-tertiary/50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {meeting.data?.botName || "MeetBot"}
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatPlatform(meeting.platform)} &middot;{" "}
                          {format(
                            new Date(displayTime),
                            "MMM d, h:mm a"
                          )}
                        </p>
                      </div>
                      {statusBadge(meeting.status)}
                      {durationSecs > 0 && (
                        <span className="text-xs text-text-muted">
                          {formatDuration(durationSecs)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Quick Actions & Chart Placeholder */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <Button
                className="w-full justify-start"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => router.push("/live")}
              >
                Join a Meeting
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                leftIcon={<Key className="h-4 w-4" />}
                onClick={() => router.push("/api-keys")}
              >
                Manage API Keys
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                leftIcon={<Video className="h-4 w-4" />}
                onClick={() => router.push("/meetings")}
              >
                Browse Meetings
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="p-3 rounded-xl bg-bg-tertiary/50 text-text-muted mb-3">
                <BarChart3 className="h-8 w-8" />
              </div>
              <p className="text-sm text-text-secondary">
                Activity chart coming soon
              </p>
              <p className="text-xs text-text-muted mt-1">
                Track your meeting trends over time
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
