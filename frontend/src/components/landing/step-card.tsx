"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StepCardProps {
  number: number;
  title: string;
  description: string;
  icon?: ReactNode;
  className?: string;
}

export function StepCard({ number, title, description, icon, className }: StepCardProps) {
  return (
    <div className={cn("relative flex items-start gap-5", className)}>
      {/* Step number */}
      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-brand-primary/20">
        {icon || number}
      </div>

      {/* Content */}
      <div className="pt-1">
        <h3 className="text-lg font-semibold text-text-primary mb-1">{title}</h3>
        <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
