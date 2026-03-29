"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/auth-store";
import { Menu, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const { isAuthenticated } = useAuthStore();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: "Get Started", href: "/get-started" },
    { label: "API Docs", href: "/docs" },
  ];

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-bg-primary/80 backdrop-blur-xl border-b border-border"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg shadow-brand-primary/20 group-hover:shadow-brand-primary/40 transition-shadow">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-text-primary">
              Meet<span className="text-brand-primary">Bot</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-lg hover:bg-white/5 transition-all"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-brand-primary to-[#7c6cf7] rounded-lg hover:shadow-[0_0_20px_rgba(108,92,231,0.4)] transition-all"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-brand-primary to-[#7c6cf7] rounded-lg hover:shadow-[0_0_20px_rgba(108,92,231,0.4)] transition-all"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-white/5"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-bg-primary/95 backdrop-blur-xl border-b border-border">
          <div className="px-4 py-4 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary rounded-lg hover:bg-white/5 transition-all"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-border">
              {isAuthenticated ? (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-brand-primary to-[#7c6cf7] rounded-lg text-center"
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="block px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary rounded-lg hover:bg-white/5 transition-all"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileOpen(false)}
                    className="block px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-brand-primary to-[#7c6cf7] rounded-lg text-center mt-2"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
