"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  className?: string;
}

export function FeatureCard({ icon, title, description, className }: FeatureCardProps) {
  return (
    <div
      className={cn(
        "group relative rounded-2xl p-6 transition-all duration-300",
        "bg-bg-secondary/50 border border-border hover:border-brand-primary/30",
        "hover:bg-bg-secondary/80 hover:shadow-[0_0_40px_rgba(108,92,231,0.08)]",
        className
      )}
    >
      {/* Glow effect on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="relative z-10">
        <div className="w-12 h-12 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center mb-4 group-hover:bg-brand-primary/15 group-hover:border-brand-primary/30 transition-all">
          <div className="text-brand-primary">{icon}</div>
        </div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
        <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
