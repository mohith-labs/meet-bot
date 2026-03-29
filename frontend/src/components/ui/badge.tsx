"use client";

import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral" | "brand";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
  pulse?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  error: "bg-error/10 text-error border-error/20",
  info: "bg-info/10 text-info border-info/20",
  neutral: "bg-bg-tertiary text-text-secondary border-border",
  brand: "bg-brand-primary/10 text-brand-secondary border-brand-primary/20",
};

const dotColors: Record<BadgeVariant, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
  neutral: "bg-text-muted",
  brand: "bg-brand-primary",
};

export function Badge({
  variant = "neutral",
  children,
  className,
  dot = false,
  pulse = false,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium rounded-full border",
        variantStyles[variant],
        className
      )}
    >
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
                dotColors[variant]
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex rounded-full h-2 w-2",
              dotColors[variant]
            )}
          />
        </span>
      )}
      {children}
    </span>
  );
}
