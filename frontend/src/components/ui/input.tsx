"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftIcon, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-text-secondary mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full bg-bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary",
              "placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary",
              "hover:border-border-hover",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              leftIcon && "pl-10",
              error && "border-error focus:ring-error/50 focus:border-error",
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-error">{error}</p>
        )}
        {hint && !error && (
          <p className="mt-1.5 text-xs text-text-muted">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
