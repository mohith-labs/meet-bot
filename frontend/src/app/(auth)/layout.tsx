"use client";

import { type ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  // While loading or redirecting, show nothing (prevents flash of auth UI)
  if (isLoading || isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center animated-gradient">
      {/* Decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-secondary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <span className="text-2xl font-bold text-text-primary tracking-tight">
            Meet<span className="text-brand-primary">Bot</span>
          </span>
        </div>

        {children}
      </div>
    </div>
  );
}
