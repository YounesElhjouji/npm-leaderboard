export function formatClockTime(isoOrMillis: string | number | Date): string {
  const d =
    typeof isoOrMillis === "string"
      ? new Date(isoOrMillis)
      : typeof isoOrMillis === "number"
        ? new Date(isoOrMillis)
        : isoOrMillis;
  if (Number.isNaN(d.getTime())) return "";
  // Use user's local time. If you need UTC, use d.getUTCHours() etc.
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export function secondsToHMS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}
