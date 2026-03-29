import { create } from "zustand";
import { api, type Meeting, type BotStatusItem } from "@/lib/api";

interface MeetingsState {
  meetings: Meeting[];
  activeBots: BotStatusItem[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchMeetings: () => Promise<void>;
  fetchActiveBots: () => Promise<void>;
  deleteMeeting: (platform: string, nativeMeetingId: string) => Promise<void>;
  reset: () => void;
}

export const useMeetingsStore = create<MeetingsState>((set, get) => ({
  meetings: [],
  activeBots: [],
  isLoading: false,
  error: null,

  fetchMeetings: async () => {
    set({ isLoading: true, error: null });
    try {
      const meetings = await api.listMeetings();
      set({ meetings, isLoading: false });
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
    // (filtering locally by platform+nativeMeetingId is unsafe because
    //  multiple meetings can share the same meeting code)
    const meetings = await api.listMeetings();
    set({ meetings });
  },

  reset: () => {
    set({
      meetings: [],
      activeBots: [],
      isLoading: false,
      error: null,
    });
  },
}));
