import { create } from "zustand";
import {
  api,
  type Meeting,
  type BotStatusItem,
  type PaginationMeta,
} from "@/lib/api";

interface MeetingsState {
  meetings: Meeting[];
  meta: PaginationMeta | null;
  activeBots: BotStatusItem[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchMeetings: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }) => Promise<void>;
  fetchActiveBots: () => Promise<void>;
  deleteMeeting: (platform: string, nativeMeetingId: string) => Promise<void>;
  reset: () => void;
}

export const useMeetingsStore = create<MeetingsState>((set, get) => ({
  meetings: [],
  meta: null,
  activeBots: [],
  isLoading: false,
  error: null,

  fetchMeetings: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.listMeetings(params);
      set({ meetings: result.meetings, meta: result.meta, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to fetch meetings",
      });
    }
  },

  fetchActiveBots: async () => {
    try {
      const bots = await api.getBotStatus();
      set({ activeBots: bots });
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : "Failed to fetch bot status",
      });
    }
  },

  deleteMeeting: async (platform: string, nativeMeetingId: string) => {
    await api.deleteMeeting(platform, nativeMeetingId);
    // Re-fetch from the server to get the accurate list
    const { meta } = get();
    const result = await api.listMeetings({
      page: meta?.page || 1,
      limit: meta?.limit || 20,
    });
    set({ meetings: result.meetings, meta: result.meta });
  },

  reset: () => {
    set({
      meetings: [],
      meta: null,
      activeBots: [],
      isLoading: false,
      error: null,
    });
  },
}));
