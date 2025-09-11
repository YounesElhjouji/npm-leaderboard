import React from "react";

interface InlineNoticeProps {
  title?: string;
  children: React.ReactNode;
  kind?: "info" | "warning";
}

const kinds = {
  // For informational quota hints
  info: {
    border: "border-sky-800",
    bg: "bg-[#1e2d3f]",
    text: "text-sky-200",
  },
  // For rate limit blocks
  warning: {
    border: "border-violet-700",
    bg: "bg-[#28213b]",
    text: "text-violet-200",
  },
};

const InlineNotice = ({
  title,
  children,
  kind = "info",
}: InlineNoticeProps) => {
  const k = kinds[kind];
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
