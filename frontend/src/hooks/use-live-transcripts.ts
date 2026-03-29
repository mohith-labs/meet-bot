"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import {
  useWebSocket,
  type TranscriptMutableData,
  type TranscriptFinalData,
  type MeetingStatusData,
} from "./use-websocket";

export interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  absoluteStartTime: number;
  isFinal: boolean;
}

export interface GroupedTranscript {
  speaker: string;
  entries: TranscriptEntry[];
  startTime: number;
  endTime: number;
}

const SPEAKER_GROUP_GAP_MS = 3000; // 3 seconds gap starts new group

export function useLiveTranscripts(meetingId: string | null) {
  const [segments, setSegments] = useState<Map<number, TranscriptEntry>>(
    new Map()
  );
  const [meetingStatus, setMeetingStatus] = useState<string | null>(null);
  const seenFinalIds = useRef<Set<string>>(new Set());

  const handleTranscriptMutable = useCallback(
    (data: TranscriptMutableData) => {
      if (meetingId && data.meetingId !== meetingId) return;

      setSegments((prev) => {
        const next = new Map(prev);
        const key = data.segment.absoluteStartTime;
        const existing = next.get(key);

        // Don't overwrite final segments with mutable ones
        if (existing?.isFinal) return prev;

        next.set(key, {
          id: data.segment.id,
          speaker: data.segment.speaker,
          text: data.segment.text,
          startTime: data.segment.startTime,
          endTime: data.segment.endTime,
          absoluteStartTime: data.segment.absoluteStartTime,
          isFinal: false,
        });

        return next;
      });
    },
    [meetingId]
  );

  const handleTranscriptFinal = useCallback(
    (data: TranscriptFinalData) => {
      if (meetingId && data.meetingId !== meetingId) return;

      // Deduplication: skip if we've already processed this final segment
      if (seenFinalIds.current.has(data.segment.id)) return;
      seenFinalIds.current.add(data.segment.id);

      setSegments((prev) => {
        const next = new Map(prev);
        const key = data.segment.absoluteStartTime;

        next.set(key, {
          id: data.segment.id,
          speaker: data.segment.speaker,
          text: data.segment.text,
          startTime: data.segment.startTime,
          endTime: data.segment.endTime,
          absoluteStartTime: data.segment.absoluteStartTime,
          isFinal: true,
        });

        return next;
      });
    },
    [meetingId]
  );

  const handleMeetingStatus = useCallback(
    (data: MeetingStatusData) => {
      if (meetingId && data.meetingId !== meetingId) return;
      setMeetingStatus(data.status);
    },
    [meetingId]
  );

  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    onTranscriptMutable: handleTranscriptMutable,
    onTranscriptFinal: handleTranscriptFinal,
    onMeetingStatus: handleMeetingStatus,
    autoConnect: !!meetingId,
  });

  // Sort segments by absoluteStartTime
  const sortedSegments = useMemo(() => {
    const arr = Array.from(segments.values());
    arr.sort((a, b) => a.absoluteStartTime - b.absoluteStartTime);
    return arr;
  }, [segments]);

  // Group consecutive segments by speaker (same speaker within gap threshold)
  const groupedTranscripts = useMemo((): GroupedTranscript[] => {
    if (sortedSegments.length === 0) return [];

    const groups: GroupedTranscript[] = [];
    let currentGroup: GroupedTranscript | null = null;

    for (const segment of sortedSegments) {
      const shouldStartNewGroup =
        !currentGroup ||
        currentGroup.speaker !== segment.speaker ||
        segment.absoluteStartTime - currentGroup.endTime > SPEAKER_GROUP_GAP_MS;

      if (shouldStartNewGroup) {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          speaker: segment.speaker,
          entries: [segment],
          startTime: segment.startTime,
          endTime: segment.endTime,
        };
      } else {
        currentGroup!.entries.push(segment);
        currentGroup!.endTime = segment.endTime;
      }
    }

    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  }, [sortedSegments]);

  const subscribeToMeeting = useCallback(
    (id: string) => {
      subscribe(id);
    },
    [subscribe]
  );

  const unsubscribeFromMeeting = useCallback(
    (id: string) => {
      unsubscribe(id);
    },
    [unsubscribe]
  );

  const clearTranscripts = useCallback(() => {
    setSegments(new Map());
    seenFinalIds.current.clear();
    setMeetingStatus(null);
  }, []);

  return {
    segments: sortedSegments,
    groupedTranscripts,
    meetingStatus,
    isConnected,
    subscribeToMeeting,
    unsubscribeFromMeeting,
    clearTranscripts,
    segmentCount: segments.size,
  };
}
