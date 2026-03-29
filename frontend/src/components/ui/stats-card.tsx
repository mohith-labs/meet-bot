"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatsCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  trend?: {
    value: number;
    label: string;
    isPositive?: boolean;
  };
  className?: string;
}

export function StatsCard({
  icon,
  label,
  value,
  trend,
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-bg-card border border-border p-5 transition-all duration-200",
        "hover:border-border-hover hover:shadow-[0_0_30px_rgba(108,92,231,0.06)]",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="p-2.5 rounded-lg bg-brand-primary/10 text-brand-primary">
          {icon}
        </div>
        {trend && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
              trend.isPositive
                ? "text-success bg-success/10"
                : "text-error bg-error/10"
            )}
          >
            {trend.isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {trend.value}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        <p className="text-sm text-text-secondary mt-0.5">{label}</p>
      </div>
      {trend && (
        <p className="text-xs text-text-muted mt-2">{trend.label}</p>
      )}
    </div>
  );
}
