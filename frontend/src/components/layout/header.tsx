"use client";

import { Search, Bell, ChevronDown } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { Dropdown } from "@/components/ui/dropdown";
import { LogOut, Settings, User } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/meetings": "Meetings",
  "/live": "Live Transcription",
  "/api-keys": "API Keys",
  "/settings": "Settings",
};

export function Header() {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  const pageTitle =
    Object.entries(pageTitles).find(([path]) =>
      pathname.startsWith(path)
    )?.[1] || "Dashboard";

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-bg-secondary/50 backdrop-blur-sm">
      {/* Left: Page Title */}
      <h1 className="text-xl font-semibold text-text-primary">{pageTitle}</h1>

      {/* Right: Search, Notifications, User */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search..."
            className="w-64 bg-bg-tertiary/50 border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary transition-colors"
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-primary rounded-full" />
        </button>

        {/* User Dropdown */}
        <Dropdown
          trigger={
            <button className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-tertiary transition-colors">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-primary/40 to-brand-secondary/40 flex items-center justify-center text-sm font-semibold text-text-primary">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <span className="text-sm font-medium text-text-primary hidden sm:block">
                {user?.name || "User"}
              </span>
              <ChevronDown className="h-4 w-4 text-text-muted" />
            </button>
          }
          items={[
            {
              label: "Profile",
              icon: <User className="h-4 w-4" />,
              onClick: () => router.push("/settings"),
            },
            {
              label: "Settings",
              icon: <Settings className="h-4 w-4" />,
              onClick: () => router.push("/settings"),
            },
            {
              label: "Logout",
              icon: <LogOut className="h-4 w-4" />,
              onClick: logout,
              variant: "danger",
            },
          ]}
        />
      </div>
    </header>
  );
}
