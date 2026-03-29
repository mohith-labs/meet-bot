"use client";

import { type ReactNode } from "react";
import { Navbar } from "@/components/landing/navbar";
import { Zap } from "lucide-react";
import Link from "next/link";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />

      {/* Page content */}
      <main className="relative z-10">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-text-primary">
                Meet<span className="text-brand-primary">Bot</span>
              </span>
            </div>

            <div className="flex items-center gap-6">
              <Link
                href="/docs"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                API Docs
              </Link>
              <Link
                href="/get-started"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Get Started
              </Link>
              <a
                href="https://github.com/your-org/meetbot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                GitHub
              </a>
            </div>

            <p className="text-xs text-text-muted">
              &copy; {new Date().getFullYear()} MeetBot. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
