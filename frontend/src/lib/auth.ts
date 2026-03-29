const TOKEN_KEY = "meetbot_token";
const USER_KEY = "meetbot_user";

export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role?: 'admin' | 'user';
  isActive?: boolean;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token || token === "undefined" || token === "null") return null;
  return token;
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  if (!token || token === "undefined" || token === "null") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeStoredUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function clearAuth(): void {
  removeToken();
  removeStoredUser();
}
