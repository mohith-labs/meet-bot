"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "@/stores/auth-store";

function AuthInitializer({ children }: { children: ReactNode }) {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "#16162a",
              color: "#e4e4f0",
              border: "1px solid #2a2a3e",
              borderRadius: "12px",
              fontSize: "14px",
            },
            success: {
              iconTheme: {
                primary: "#00d68f",
                secondary: "#16162a",
              },
            },
            error: {
              iconTheme: {
                primary: "#ff3d71",
                secondary: "#16162a",
              },
            },
          }}
        />
      </AuthInitializer>
    </QueryClientProvider>
  );
}
