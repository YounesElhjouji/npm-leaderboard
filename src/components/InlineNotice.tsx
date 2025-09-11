import React from "react";

interface InlineNoticeProps {
  title?: string;
  children: React.ReactNode;
  kind?: "info" | "warning";
}

const kinds = {
  info: {
    border: "border-blue-700",
    bg: "bg-[#1f2a3a]",
    text: "text-[#cfe0ff]",
  },
  warning: {
    border: "border-yellow-700",
    bg: "bg-[#3a2f1f]",
    text: "text-[#fff1c2]",
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
      {title && <div className="mb-1 font-semibold">{title}</div>}
      <div className="text-sm leading-6">{children}</div>
    </div>
  );
};

export default InlineNotice;
