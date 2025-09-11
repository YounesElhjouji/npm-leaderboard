"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import posthog from "posthog-js";
import { NPMPackage, SortBy } from "../types";

// Env controls
const SMART_ENABLED =
  (process.env.NEXT_PUBLIC_SMART_SEARCH_ENABLED || "true").toLowerCase() ===
  "true";
const SMART_DEFAULT =
  (process.env.NEXT_PUBLIC_SMART_SEARCH_DEFAULT || "classic").toLowerCase() ===
  "smart";
const LOCAL_COOLDOWN_MS = Math.max(
  0,
  parseInt(
    process.env.NEXT_PUBLIC_SMART_SEARCH_LOCAL_COOLDOWN_MS || "3000",
    10,
  ) || 3000,
);

const MAX_LEN = 160;
const MIN_LEN = 6;

type ServerBlockKind = "cooldown" | "hourly_limit" | "daily_limit";

export function useSmartSearch() {
  // classic
  const [sortBy, setSortBy] = useState<SortBy>("growth");
  const [dependsOn, setDependsOn] = useState<string>("");
  const [debouncedDependsOn, setDebouncedDependsOn] =
    useState<string>(dependsOn);
  const [keywords, setKeywords] = useState<string>("");
  const [debouncedKeywords, setDebouncedKeywords] = useState<string>(keywords);
  const [modified, setModified] = useState<string>("");

  const [packages, setPackages] = useState<NPMPackage[]>([]);
  const [otherPackages, setOtherPackages] = useState<
    Array<{ name: string; description: string; link: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  // smart
  const [smartMode, setSmartMode] = useState<boolean>(false);
  const [smartQuery, setSmartQuery] = useState<string>("");
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartLoadingIndex, setSmartLoadingIndex] = useState(0);
  const lastSmartQueryRef = useRef<string>("");

  // limits/quota
  const [smartDisabledUntil, setSmartDisabledUntil] = useState<number | null>(
    null,
  );
  const [quotaInfo, setQuotaInfo] = useState<{
    allowedPerHour?: number;
    usedThisHour?: number;
    remainingThisHour?: number;
    resetAtIso?: string | null;
    userScoped?: boolean;
  } | null>(null);

  const [smartBlockNotice, setSmartBlockNotice] = useState<
    | {
        kind: "local";
        tryAgainAtMs: number;
        allowedPerHour?: number;
        resetAtIso?: string;
      }
    | {
        kind: "server";
        serverKind: ServerBlockKind;
        tryAgainAtMs: number;
        allowedPerHour?: number;
        remaining?: number;
        resetAtIso?: string;
        userScoped?: boolean;
      }
    | null
  >(null);

  // Page view
  useEffect(() => {
    if (typeof window !== "undefined") {
      posthog.capture("page_view", { path: window.location.pathname });
    }
  }, []);

  // Smart default
  useEffect(() => {
    if (!SMART_ENABLED) {
      setSmartMode(false);
      return;
    }
    if (SMART_DEFAULT) setSmartMode(true);
  }, []);

  // Debounce classic filters
  useEffect(() => {
    const t = setTimeout(() => setDebouncedDependsOn(dependsOn), 300);
    return () => clearTimeout(t);
  }, [dependsOn]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeywords(keywords), 300);
    return () => clearTimeout(t);
  }, [keywords]);

  // Classic fetch (when NOT in smart mode)
  useEffect(() => {
    if (smartMode) return;
    async function fetchPackages() {
      setLoading(true);
      try {
        let url = `/api/packages?sortBy=${sortBy}&dependsOn=${encodeURIComponent(
          debouncedDependsOn,
        )}&keywords=${encodeURIComponent(debouncedKeywords)}`;
        if (modified) url += `&modified=${modified}`;
        const res = await fetch(url);
        const data = await res.json();
        setPackages(data.packages);
        setOtherPackages([]); // ensure empty in classic mode
      } catch (e) {
        console.error("Failed to fetch packages:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchPackages();
  }, [sortBy, debouncedDependsOn, debouncedKeywords, modified, smartMode]);

  // Rotate smart loading messages
  useEffect(() => {
    if (!smartLoading) return;
    const id = setInterval(() => {
      setSmartLoadingIndex((i) => (i + 1) % 5);
    }, 1800);
    return () => clearInterval(id);
  }, [smartLoading]);

  // Local cooldown hydration (do NOT show inline message here; only block button)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tsRaw = localStorage.getItem("smart.lastRunAt");
    if (!tsRaw) return;
    const last = parseInt(tsRaw, 10);
    if (!Number.isFinite(last)) return;
    const until = last + LOCAL_COOLDOWN_MS;
    if (until > Date.now()) {
      setSmartDisabledUntil(until);
      // Important: do NOT set a local smartBlockNotice here
      // We only block the button for cooldown; no inline message.
    }
  }, []);

  // Local cooldown timer
  useEffect(() => {
    if (!smartDisabledUntil) return;
    const remaining = smartDisabledUntil - Date.now();
    if (remaining <= 0) {
      setSmartDisabledUntil(null);
      // If a local notice existed for some reason, clear it
      setSmartBlockNotice((prev) =>
        prev && prev.kind === "local" ? null : prev,
      );
      return;
    }
    const id = setTimeout(() => {
      setSmartDisabledUntil(null);
      setSmartBlockNotice((prev) =>
        prev && prev.kind === "local" ? null : prev,
      );
    }, remaining);
    return () => clearTimeout(id);
  }, [smartDisabledUntil]);

  // Keep local notice in sync with quota changes (but we don't show local notices anymore)
  useEffect(() => {
    // If a previous version set a local notice, ensure it is cleared when only cooldown applies
    if (!smartDisabledUntil || smartDisabledUntil <= Date.now()) {
      setSmartBlockNotice((prev) =>
        prev && prev.kind === "local" ? null : prev,
      );
    }
  }, [smartDisabledUntil, quotaInfo?.allowedPerHour]);

  // Helpers
  const disabledSeconds = useMemo(() => {
    if (!smartDisabledUntil) return 0;
    const s = Math.ceil((smartDisabledUntil - Date.now()) / 1000);
    return s > 0 ? s : 0;
  }, [smartDisabledUntil]);

  const bumpLocalCooldown = () => {
    const now = Date.now();
    if (typeof window !== "undefined") {
      localStorage.setItem("smart.lastRunAt", String(now));
    }
    if (LOCAL_COOLDOWN_MS > 0) {
      setSmartDisabledUntil(now + LOCAL_COOLDOWN_MS);
    }
  };

  const runSmartSearch = async () => {
    let q = smartQuery.trim();
    if (q.length > MAX_LEN) q = q.slice(0, MAX_LEN);
    if (!q || q === lastSmartQueryRef.current || q.length < MIN_LEN) return;

    // If local cooldown is active, only block the button; do not show inline message
    if (smartDisabledUntil && smartDisabledUntil > Date.now()) {
      // Keep results as-is or clear if you prefer; not showing an inline notice.
      return;
    }

    lastSmartQueryRef.current = q;

    // Clear server notice if any
    setSmartBlockNotice((prev) => (prev?.kind === "server" ? null : prev));

    setSmartLoading(true);
    bumpLocalCooldown();

    try {
      const res = await fetch("/api/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        // ignore parse failure
      }

      const rid: string | undefined = data?.meta?.rid || data?.rid;

      if (res.ok) {
        const metaQuota = data?.meta?.quota;
        setQuotaInfo(
          metaQuota
            ? {
                allowedPerHour: metaQuota.allowedPerHour,
                usedThisHour: metaQuota.usedThisHour,
                remainingThisHour: metaQuota.remainingThisHour,
                resetAtIso: metaQuota.resetAtIso ?? null,
                userScoped: metaQuota.userScoped,
              }
            : null,
        );

        setPackages(data.packages || []);
        setOtherPackages(data.otherPackages || []);
        setSmartBlockNotice(null);

        posthog.capture("smart_search_success", {
          query: q,
          rid,
          result_count: (data.packages || []).length,
          other_count: (data.otherPackages || []).length,
          cache: data?.meta?.cache,
        });
        return;
      }

      // Blocked/unavailable
      if (res.status === 429 || res.status === 503) {
        const retryAfterSec =
          typeof data?.retryAfterSec === "number" && data.retryAfterSec > 0
            ? data.retryAfterSec
            : Math.ceil(LOCAL_COOLDOWN_MS / 1000);

        const untilMs =
          typeof data?.resetAtIso === "string"
            ? new Date(data.resetAtIso).getTime()
            : Date.now() + retryAfterSec * 1000;

        setSmartDisabledUntil(untilMs);

        // Clear results and show inline block only for server rate limits
        setPackages([]);
        setOtherPackages([]);

        const serverKind: ServerBlockKind | undefined = data?.kind;
        const allowedPerHour: number | undefined =
          typeof data?.allowedPerHour === "number"
            ? data.allowedPerHour
            : undefined;

        setSmartBlockNotice({
          kind: "server",
          serverKind: (serverKind ||
            (res.status === 503
              ? "daily_limit"
              : "hourly_limit")) as ServerBlockKind,
          tryAgainAtMs: untilMs,
          allowedPerHour,
          remaining:
            typeof data?.remainingRequests === "number"
              ? data.remainingRequests
              : undefined,
          resetAtIso:
            typeof data?.resetAtIso === "string" ? data.resetAtIso : undefined,
          userScoped:
            typeof data?.userScoped === "boolean" ? data.userScoped : undefined,
        });

        // Update quota info if available
        setQuotaInfo((prev) => {
          if (typeof allowedPerHour === "number") {
            return {
              allowedPerHour,
              usedThisHour: prev?.usedThisHour,
              remainingThisHour: prev?.remainingThisHour,
              resetAtIso:
                typeof data?.resetAtIso === "string"
                  ? data.resetAtIso
                  : (prev?.resetAtIso ?? null),
              userScoped:
                typeof data?.userScoped === "boolean"
                  ? data.userScoped
                  : prev?.userScoped,
            };
          }
          return prev;
        });

        posthog.capture("smart_search_rate_limited", {
          query: q,
          rid,
          code: res.status,
          server_kind: serverKind,
          retryAfterSec,
        });
        return;
      }

      // Other errors: clear server notice
      setSmartBlockNotice(null);
    } catch (e) {
      console.error("Smart search failed:", e);
    } finally {
      setSmartLoading(false);
    }
  };

  const handleToggleSmartMode = (next: boolean) => {
    if (!SMART_ENABLED) return;

    if (next) {
      setSmartMode(true);
      // Important: when entering Smart mode, do NOT show an inline message for local cooldown.
      // The Run button will be disabled by props; that's sufficient.
      return;
    }

    // Switch to classic
    setSmartMode(false);
    setSmartQuery("");
    lastSmartQueryRef.current = "";
    setOtherPackages([]);
    setSmartLoading(false);
    setSmartBlockNotice(null);
  };

  return {
    // classic
    sortBy,
    setSortBy,
    dependsOn,
    setDependsOn,
    keywords,
    setKeywords,
    modified,
    setModified,
    loading,

    // smart
    smartMode,
    handleToggleSmartMode,
    smartQuery,
    setSmartQuery,
    runSmartSearch,
    smartLoading,
    smartLoadingIndex,

    // results
    packages,
    otherPackages,

    // limits/quota
    smartDisabledSeconds: useMemo(() => {
      if (!smartDisabledUntil) return 0;
      const s = Math.ceil((smartDisabledUntil - Date.now()) / 1000);
      return s > 0 ? s : 0;
    }, [smartDisabledUntil]),
    smartDisabledUntilMs: smartDisabledUntil,
    smartBlockNotice, // now only set for server (hourly/daily) limits
    quotaInfo,
    smartFeatureEnabled: SMART_ENABLED,
  };
}
