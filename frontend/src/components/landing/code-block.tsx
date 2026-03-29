"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  className?: string;
}

function highlightCurl(code: string): React.ReactNode[] {
  const lines = code.split("\n");
  return lines.map((line, lineIdx) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let keyIdx = 0;

    // Process the line character by character with regex patterns
    while (remaining.length > 0) {
      // Comments (# ...)
      const commentMatch = remaining.match(/^(#.*)$/);
      if (commentMatch) {
        parts.push(
          <span key={`${lineIdx}-${keyIdx++}`} className="text-text-muted italic">
            {commentMatch[1]}
          </span>
        );
        remaining = "";
        continue;
      }

      // Strings ("..." or '...')
      const stringMatch = remaining.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
      if (stringMatch) {
        parts.push(
          <span key={`${lineIdx}-${keyIdx++}`} className="text-[#a6e3a1]">
            {stringMatch[1]}
          </span>
        );
        remaining = remaining.slice(stringMatch[1].length);
        continue;
      }

      // curl command
      const curlMatch = remaining.match(/^(curl)\b/);
      if (curlMatch) {
        parts.push(
          <span key={`${lineIdx}-${keyIdx++}`} className="text-[#89b4fa] font-semibold">
            {curlMatch[1]}
          </span>
        );
        remaining = remaining.slice(curlMatch[1].length);
        continue;
      }

      // HTTP methods
      const methodMatch = remaining.match(/^(GET|POST|PUT|DELETE|PATCH)\b/);
      if (methodMatch) {
        parts.push(
          <span key={`${lineIdx}-${keyIdx++}`} className="text-[#f9e2af] font-semibold">
            {methodMatch[1]}
          </span>
        );
        remaining = remaining.slice(methodMatch[1].length);
        continue;
      }

      // Flags (-X, -H, -d, --header, etc.)
      const flagMatch = remaining.match(/^(--?[a-zA-Z][\w-]*)/);
      if (flagMatch) {
        parts.push(
          <span key={`${lineIdx}-${keyIdx++}`} className="text-brand-secondary">
            {flagMatch[1]}
          </span>
        );
        remaining = remaining.slice(flagMatch[1].length);
        continue;
      }

      // URLs (http://... or https://...)
      const urlMatch = remaining.match(/^(https?:\/\/[^\s'"\\]+)/);
      if (urlMatch) {
        parts.push(
          <span key={`${lineIdx}-${keyIdx++}`} className="text-[#94e2d5] underline decoration-[#94e2d5]/30">
            {urlMatch[1]}
          </span>
        );
        remaining = remaining.slice(urlMatch[1].length);
        continue;
      }

      // JSON keys ("key":)
      const jsonKeyMatch = remaining.match(/^(\w+)(\s*:)/);
      if (jsonKeyMatch) {
        parts.push(
          <span key={`${lineIdx}-${keyIdx++}`} className="text-[#89b4fa]">
            {jsonKeyMatch[1]}
          </span>
        );
        parts.push(
          <span key={`${lineIdx}-${keyIdx++}`} className="text-text-muted">
            {jsonKeyMatch[2]}
          </span>
        );
        remaining = remaining.slice(jsonKeyMatch[0].length);
        continue;
      }

      // Backslash continuation
      const bsMatch = remaining.match(/^(\\)$/);
      if (bsMatch) {
        parts.push(
          <span key={`${lineIdx}-${keyIdx++}`} className="text-text-muted">
            {bsMatch[1]}
          </span>
        );
        remaining = "";
        continue;
      }

      // Default: single character
      parts.push(
        <span key={`${lineIdx}-${keyIdx++}`}>{remaining[0]}</span>
      );
      remaining = remaining.slice(1);
    }

    return (
      <div key={lineIdx} className="leading-relaxed">
        {parts.length > 0 ? parts : "\u00A0"}
      </div>
    );
  });
}

export function CodeBlock({ code, title, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-[#0d0d15] overflow-hidden",
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-bg-secondary/50">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="text-xs text-text-muted font-medium ml-2">
              {title}
            </span>
          </div>
          <button
            onClick={handleCopy}
            className={cn(
              "p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-white/5 transition-all",
              copied && "text-success hover:text-success"
            )}
            title={copied ? "Copied!" : "Copy"}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}
      <div className="relative group">
        {!title && (
          <button
            onClick={handleCopy}
            className={cn(
              "absolute top-3 right-3 p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100",
              copied && "text-success hover:text-success opacity-100"
            )}
            title={copied ? "Copied!" : "Copy"}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        <pre className="p-4 text-sm font-mono overflow-x-auto text-text-primary/90">
          <code>{highlightCurl(code)}</code>
        </pre>
      </div>
    </div>
  );
}
