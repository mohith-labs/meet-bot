"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-error/10">
          <svg
            className="h-8 w-8 text-error"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-text-primary">
            Something went wrong
          </h2>
          <p className="text-sm text-text-secondary">
            {error.message || "An unexpected error occurred. Please try again."}
          </p>
        </div>
        <button
          onClick={reset}
          className="px-6 py-2.5 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
