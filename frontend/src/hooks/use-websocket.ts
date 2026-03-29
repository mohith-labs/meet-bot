"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getToken } from "@/lib/auth";

const WS_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const PING_INTERVAL = 25000;

export interface WebSocketMessage {
  event: string;
  data: unknown;
}

interface UseWebSocketOptions {
  onTranscriptMutable?: (data: TranscriptMutableData) => void;
  onTranscriptFinal?: (data: TranscriptFinalData) => void;
  onMeetingStatus?: (data: MeetingStatusData) => void;
  onBotStatus?: (data: BotStatusData) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  autoConnect?: boolean;
}

export interface TranscriptMutableData {
  meetingId: string;
  segment: {
    id: string;
    speaker: string;
    text: string;
    startTime: number;
    endTime: number;
    absoluteStartTime: number;
    isFinal: boolean;
  };
}

export interface TranscriptFinalData {
  meetingId: string;
  segment: {
    id: string;
    speaker: string;
    text: string;
    startTime: number;
    endTime: number;
    absoluteStartTime: number;
    isFinal: boolean;
  };
}

export interface MeetingStatusData {
  meetingId: string;
  status: "requested" | "joining" | "awaiting_admission" | "active" | "stopping" | "completed" | "failed";
  endTime?: string;
  duration?: number;
}

export interface BotStatusData {
  botId: string;
  meetingId: string;
  status: string;
  message?: string;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    onTranscriptMutable,
    onTranscriptFinal,
    onMeetingStatus,
    onBotStatus,
    onConnect,
    onDisconnect,
    autoConnect = true,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    const token = getToken();
    if (!token) return;

    cleanup();

    const socket = io(WS_URL, {
      path: "/ws",
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      reconnectAttemptRef.current = 0;
      onConnect?.();

      // Start ping/pong keepalive
      pingIntervalRef.current = setInterval(() => {
        if (socket.connected) {
          socket.emit("ping");
        }
      }, PING_INTERVAL);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      onDisconnect?.();

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      // Auto-reconnect with backoff
      const attempt = reconnectAttemptRef.current;
      const delay =
        RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      reconnectAttemptRef.current = attempt + 1;

      setTimeout(() => {
        if (!socketRef.current?.connected) {
          connect();
        }
      }, delay);
    });

    socket.on("connect_error", () => {
      setIsConnected(false);

      const attempt = reconnectAttemptRef.current;
      const delay =
        RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      reconnectAttemptRef.current = attempt + 1;

      setTimeout(() => {
        if (!socketRef.current?.connected) {
          connect();
        }
      }, delay);
    });

    socket.on("transcript.mutable", (data: TranscriptMutableData) => {
      onTranscriptMutable?.(data);
    });

    socket.on("transcript.final", (data: TranscriptFinalData) => {
      onTranscriptFinal?.(data);
    });

    socket.on("meeting.status", (data: MeetingStatusData) => {
      onMeetingStatus?.(data);
    });

    socket.on("bot.status", (data: BotStatusData) => {
      onBotStatus?.(data);
    });

    socket.on("pong", () => {
      // Keepalive acknowledged
    });
  }, [
    cleanup,
    onConnect,
    onDisconnect,
    onTranscriptMutable,
    onTranscriptFinal,
    onMeetingStatus,
    onBotStatus,
  ]);

  const subscribe = useCallback(
    (meetingId: string) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit("subscribe", { meetingId });
      }
    },
    []
  );

  const unsubscribe = useCallback(
    (meetingId: string) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit("unsubscribe", { meetingId });
      }
    },
    []
  );

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return cleanup;
  }, [autoConnect, connect, cleanup]);

  return {
    isConnected,
    connect,
    disconnect: cleanup,
    subscribe,
    unsubscribe,
    socket: socketRef.current,
  };
}
