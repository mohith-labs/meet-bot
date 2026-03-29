"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  className?: string;
  size?: "sm" | "md";
  label?: string;
}

export function CopyButton({
  text,
  className,
  size = "sm",
  label,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors",
        size === "sm" ? "p-1 rounded-md text-xs" : "p-1.5 rounded-lg text-sm",
        "hover:bg-bg-tertiary",
        copied && "text-success hover:text-success",
        className
      )}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? (
        <Check className={iconSize} />
      ) : (
        <Copy className={iconSize} />
      )}
      {label && <span>{copied ? "Copied!" : label}</span>}
    </button>
  );
}
