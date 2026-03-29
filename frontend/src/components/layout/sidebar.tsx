"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Video,
  Radio,
  Key,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Meetings",
    href: "/meetings",
    icon: Video,
  },
  {
    label: "Live Transcription",
    href: "/live",
    icon: Radio,
  },
  {
    label: "API Keys",
    href: "/api-keys",
    icon: Key,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 72 : 260 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="relative flex flex-col h-screen bg-bg-secondary border-r border-border"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-border">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center">
          <Bot className="h-4.5 w-4.5 text-white" />
        </div>
        {!isCollapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-lg font-bold text-text-primary tracking-tight"
          >
            Meet<span className="text-brand-primary">Bot</span>
          </motion.span>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 z-10 w-6 h-6 rounded-full bg-bg-tertiary border border-border flex items-center justify-center text-text-muted hover:text-text-primary hover:border-border-hover transition-colors"
      >
        {isCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "text-text-primary bg-brand-primary/10"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-primary rounded-full"
                  transition={{ duration: 0.2 }}
                />
              )}
              <item.icon
                className={cn(
                  "h-5 w-5 flex-shrink-0",
                  isActive ? "text-brand-primary" : "text-text-muted"
                )}
              />
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {item.label}
                </motion.span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-brand-primary/40 to-brand-secondary/40 flex items-center justify-center text-sm font-semibold text-text-primary">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 min-w-0"
            >
              <p className="text-sm font-medium text-text-primary truncate">
                {user?.name || "User"}
              </p>
              <p className="text-xs text-text-muted truncate">
                {user?.email || "user@example.com"}
              </p>
            </motion.div>
          )}
          {!isCollapsed && (
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
