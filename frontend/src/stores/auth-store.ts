import { create } from "zustand";
import { api, type User } from "@/lib/api";
import {
  setToken,
  setStoredUser,
  clearAuth,
  getToken,
  getStoredUser,
} from "@/lib/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  initialize: () => void;
  fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isAdmin: false,
  isLoading: true,

  initialize: () => {
    const token = getToken();
    const user = getStoredUser();
    if (token && user) {
      const storedUser = user as User;
      set({
        token,
        user: storedUser,
        isAuthenticated: true,
        isAdmin: storedUser?.role === 'admin',
        isLoading: false,
      });
    } else {
      set({ isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    const response = await api.login(email, password);
    setToken(response.accessToken);
    setStoredUser(response.user);
    set({
      user: response.user,
      token: response.accessToken,
      isAuthenticated: true,
      isAdmin: response.user.role === 'admin',
    });
  },

  register: async (name: string, email: string, password: string) => {
    const response = await api.register(name, email, password);
    setToken(response.accessToken);
    setStoredUser(response.user);
    set({
      user: response.user,
      token: response.accessToken,
      isAuthenticated: true,
      isAdmin: response.user.role === 'admin',
    });
  },

  logout: () => {
    clearAuth();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isAdmin: false,
    });
  },

  setUser: (user: User) => {
    setStoredUser(user);
    set({ user });
  },

  fetchProfile: async () => {
    try {
      const profile = await api.getProfile();
      setStoredUser(profile);
      set({ user: profile, isAdmin: profile.role === 'admin' });
    } catch {
      get().logout();
    }
  },
}));
