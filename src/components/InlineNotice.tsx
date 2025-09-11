import React from "react";

interface InlineNoticeProps {
  title?: string;
  children: React.ReactNode;
  kind?: "info" | "warning";
  // Lowkey variant: compact, borderless, subtle background
  lowkey?: boolean;
}

const kinds = {
  // For informational quota hints
  info: {
    border: "border-sky-800",
    bg: "bg-[#1e2d3f]",
    text: "text-sky-200",
    lowBg: "bg-[#1b2633]/70",
    lowText: "text-sky-200/90",
  },
  // For rate limit blocks
  warning: {
    border: "border-violet-700",
    bg: "bg-[#28213b]",
    text: "text-violet-200",
    lowBg: "bg-[#241d33]/70",
    lowText: "text-violet-200/90",
  },
};

const InlineNotice = ({
  title,
  children,
  kind = "info",
  lowkey = false,
}: InlineNoticeProps) => {
  const k = kinds[kind];

  if (lowkey) {
    // Compact, borderless, minimal vertical space
    return (
      <div
        className={`rounded-md ${k.lowBg} ${k.lowText} px-2 py-1 text-sm leading-6`}
        role="status"
        aria-live="polite"
      >
        {/* No title in lowkey to keep it compact */}
        {children}
      </div>
    );
  }

  // Default: fuller notice with border and larger text
  return (
    <div
      className={`rounded-md border ${k.border} ${k.bg} p-4 ${k.text}`}
      role="status"
      aria-live="polite"
    >
      {title && <div className="mb-2 font-semibold">{title}</div>}
      <div className="text-base leading-7">{children}</div>
    </div>
  );
};

export default InlineNotice;
