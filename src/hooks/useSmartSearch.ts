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

// API response types from /api/smart-search (subset needed by the hook)
type SmartSearchQuota = {
  allowedPerHour: number;
  usedThisHour: number;
  remainingThisHour: number;
  resetAtIso: string | null;
  userScoped: boolean;
};

type SmartSearchMeta = {
  rid?: string;
  cache?: "hit" | "miss" | "hit_stale";
  quota?: SmartSearchQuota;
  counts?: {
    packages?: number;
    otherPackages?: number;
    total?: number;
  };
  [k: string]: unknown;
};

type SmartSearchSuccess = {
  packages?: NPMPackage[];
  otherPackages?: Array<{ name: string; description: string; link: string }>;
  meta?: SmartSearchMeta;
};

type SmartSearchRateLimit = {
  error?: string;
  message?: string;
  kind?: ServerBlockKind;
  retryAfterSec?: number;
  resetAtIso?: string;
  allowedPerHour?: number;
  remainingRequests?: number;
  userScoped?: boolean;
  rid?: string;
};

type SmartSearchError = {
  error?: string;
  details?: string;
  rid?: string;
  meta?: SmartSearchMeta;
};

type SmartSearchResponse = SmartSearchSuccess &
  SmartSearchRateLimit &
  SmartSearchError;

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
  const [hasRunSmartSearch, setHasRunSmartSearch] = useState(false);
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

  // NEW: generic error state for unknown failures (non rate-limit)
  const [smartGenericError, setSmartGenericError] = useState<boolean>(false);

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
        const data: { packages: NPMPackage[] } = await res.json();
        setPackages(Array.isArray(data.packages) ? data.packages : []);
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

  // Local cooldown hydration
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tsRaw = localStorage.getItem("smart.lastRunAt");
    if (!tsRaw) return;
    const last = parseInt(tsRaw, 10);
    if (!Number.isFinite(last)) return;
    const until = last + LOCAL_COOLDOWN_MS;
    if (until > Date.now()) {
      setSmartDisabledUntil(until);
    }
  }, []);

  // Local cooldown timer
  useEffect(() => {
    if (!smartDisabledUntil) return;
    const remaining = smartDisabledUntil - Date.now();
    if (remaining <= 0) {
      setSmartDisabledUntil(null);
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

  useEffect(() => {
    if (!smartDisabledUntil || smartDisabledUntil <= Date.now()) {
      setSmartBlockNotice((prev) =>
        prev && prev.kind === "local" ? null : prev,
      );
    }
  }, [smartDisabledUntil, quotaInfo?.allowedPerHour]);

  const bumpLocalCooldown = () => {
    const now = Date.now();
    if (typeof window !== "undefined") {
      localStorage.setItem("smart.lastRunAt", String(now));
    }
    if (LOCAL_COOLDOWN_MS > 0) {
      setSmartDisabledUntil(now + LOCAL_COOLDOWN_MS);
    }
  };

  const runSmartSearch = async (): Promise<void> => {
    let q = smartQuery.trim();
    if (q.length > MAX_LEN) q = q.slice(0, MAX_LEN);
    if (!q || q === lastSmartQueryRef.current || q.length < MIN_LEN) return;

    if (smartDisabledUntil && smartDisabledUntil > Date.now()) {
      return;
    }

    lastSmartQueryRef.current = q;

    // Clear previous server notice and generic error for a new run
    setSmartBlockNotice((prev) => (prev?.kind === "server" ? null : prev));
    setSmartGenericError(false);

    setSmartLoading(true);
    setHasRunSmartSearch(true);
    bumpLocalCooldown();

    try {
      const res = await fetch("/api/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      const text = await res.text();
      let data: SmartSearchResponse = {};
      try {
        data = text ? (JSON.parse(text) as SmartSearchResponse) : {};
      } catch {
        // parsing failed — treat as generic error
      }

      const rid: string | undefined =
        (data.meta && typeof data.meta.rid === "string" && data.meta.rid) ||
        (typeof data.rid === "string" ? data.rid : undefined);

      if (res.ok) {
        const metaQuota = data.meta?.quota;
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

        const pkgs = Array.isArray(data.packages) ? data.packages : [];
        const others = Array.isArray(data.otherPackages)
          ? data.otherPackages
          : [];
        setPackages(pkgs);
        setOtherPackages(others);
        setSmartBlockNotice(null);
        setSmartGenericError(false);

        posthog.capture("smart_search_success", {
          query: q,
          rid,
          result_count: pkgs.length,
          other_count: others.length,
          cache:
            data.meta && typeof data.meta.cache === "string"
              ? data.meta.cache
              : undefined,
        });
        return;
      }

      // Rate-limited/unavailable
      if (res.status === 429 || res.status === 503) {
        const retryAfterSec =
          typeof data.retryAfterSec === "number" && data.retryAfterSec > 0
            ? data.retryAfterSec
            : Math.ceil(LOCAL_COOLDOWN_MS / 1000);

        const untilMs =
          typeof data.resetAtIso === "string"
            ? new Date(data.resetAtIso).getTime()
            : Date.now() + retryAfterSec * 1000;

        setSmartDisabledUntil(untilMs);

        setPackages([]);
        setOtherPackages([]);

        const serverKindVal: ServerBlockKind | undefined = data.kind;
        const allowedPerHourVal: number | undefined =
          typeof data.allowedPerHour === "number"
            ? data.allowedPerHour
            : undefined;

        setSmartBlockNotice({
          kind: "server",
          serverKind: (serverKindVal ||
            (res.status === 503
              ? "daily_limit"
              : "hourly_limit")) as ServerBlockKind,
          tryAgainAtMs: untilMs,
          allowedPerHour: allowedPerHourVal,
          remaining:
            typeof data.remainingRequests === "number"
              ? data.remainingRequests
              : undefined,
          resetAtIso:
            typeof data.resetAtIso === "string" ? data.resetAtIso : undefined,
          userScoped:
            typeof data.userScoped === "boolean" ? data.userScoped : undefined,
        });

        // Keep generic error off for rate limits
        setSmartGenericError(false);
        return;
      }

      // Other errors -> show generic inline notice
      setSmartBlockNotice(null);
      setSmartGenericError(true);
    } catch (e) {
      console.error("Smart search failed:", e);
      setSmartBlockNotice(null);
      setSmartGenericError(true);
    } finally {
      setSmartLoading(false);
    }
  };

  const handleToggleSmartMode = (next: boolean): void => {
    if (!SMART_ENABLED) return;

    if (next) {
      setSmartMode(true);
      // Entering Smart mode: keep previous results and clear generic error
      setSmartGenericError(false);
      return;
    }

    // Switch to classic
    setSmartMode(false);
    setSmartQuery("");
    lastSmartQueryRef.current = "";
    setOtherPackages([]);
    setSmartLoading(false);
    setHasRunSmartSearch(false);
    setSmartBlockNotice(null);
    setSmartGenericError(false);
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
    hasRunSmartSearch,
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
    smartBlockNotice, // only server (hourly/daily) limits
    quotaInfo,
    smartFeatureEnabled: SMART_ENABLED,

    // generic error
    smartGenericError,
  };
}
