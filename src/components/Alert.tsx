interface AlertProps {
  kind?: "info" | "warning" | "error" | "success";
  children: React.ReactNode;
}

const colors: Record<string, { bg: string; text: string; border: string }> = {
  info: {
    bg: "bg-[#252526]",
    text: "text-[#d4d4d4]",
    border: "border-[#3c3c3c]",
  },
  warning: {
    bg: "bg-[#2b2240]",
    text: "text-[#e5d5ff]",
    border: "border-violet-700",
  },
  error: {
    bg: "bg-[#3a1f1f]",
    text: "text-[#ffd6d6]",
    border: "border-red-800",
  },
  success: {
    bg: "bg-[#1f3a28]",
    text: "text-[#d6ffe5]",
    border: "border-green-800",
  },
};

export default function Alert({ kind = "info", children }: AlertProps) {
  const c = colors[kind] || colors.info;
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${c.bg} ${c.text} ${c.border}`}
      role="status"
    >
      {children}
    </div>
  );
}
