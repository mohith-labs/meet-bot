/**
 * Runtime configuration for the frontend.
 *
 * NEXT_PUBLIC_* env vars are baked in at BUILD time in Next.js, so they
 * can't be changed on a deployed Docker container.  This module provides
 * a runtime alternative:
 *
 * 1. On the server (SSR / API routes) we read process.env directly.
 * 2. On the client we look at window.__RUNTIME_CONFIG__ which is injected
 *    by the /api/config endpoint that the root layout fetches, OR fall back
 *    to the build-time NEXT_PUBLIC_API_URL, OR localhost.
 */

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: { apiUrl: string };
  }
}

export function getApiUrl(): string {
  // Server-side: read env directly
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  }

  // Client-side: runtime config injected into window, or build-time fallback
  return (
    window.__RUNTIME_CONFIG__?.apiUrl ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001"
  );
}
