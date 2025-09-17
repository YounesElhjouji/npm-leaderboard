"use client";
import React from "react";
import type { Toast } from "../hooks/useToast";

const styles: Record<
  string,
  { bg: string; border: string; text: string; icon: string }
> = {
  info: {
    bg: "bg-[#252526]/95",
    border: "border-[#3c3c3c]",
    text: "text-[#d4d4d4]",
    icon: "ℹ️",
  },
  success: {
    bg: "bg-[#1f3a28]/95",
    border: "border-green-800",
    text: "text-[#d6ffe5]",
    icon: "✅",
  },
  warning: {
    bg: "bg-[#2b2240]/95",
    border: "border-violet-700",
    text: "text-[#e5d5ff]",
    icon: "⚠️",
  },
  error: {
    bg: "bg-[#3a1f1f]/95",
    border: "border-red-800",
    text: "text-[#ffd6d6]",
    icon: "⛔",
  },
};

export default function Toasts({
  toasts,
  onClose,
}: {
  toasts: Toast[];
  onClose: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const c = styles[t.kind] || styles.info;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-screen-sm items-start gap-2 rounded-md border px-3 py-2 shadow-lg backdrop-blur ${c.bg} ${c.border} ${c.text}`}
            role="status"
          >
            <span className="select-none">{c.icon}</span>
            <div className="text-sm leading-snug">{t.message}</div>
            <button
              className="ml-2 text-xs opacity-75 hover:opacity-100"
              onClick={() => onClose(t.id)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
