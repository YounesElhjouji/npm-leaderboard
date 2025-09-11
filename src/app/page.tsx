"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { SortBy, NPMPackage } from "../types";
import Filters from "../components/Filters";
import PackageList from "../components/PackageList";
import OtherPackageList from "../components/OtherPackageList";
import posthog from "posthog-js";
import InlineNotice from "../components/InlineNotice";
import { formatClockTime } from "../utils/time";

const daysMapping: Record<string, string> = {
  "30": "last month",
  "180": "last 6 months",
  "365": "last year",
};

const smartLoadingMessages = [
  "Thinking deeply about your question…",
  "Checking the sources…",
  "Pondering profoundly…",
  "Exploring the npm universe…",
  "Comparing trade‑offs…",
];

// Public env controls
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

// Input limits
const MAX_LEN = 160;
const MIN_LEN = 6;

export default function HomePage() {
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

  const [smartMode, setSmartMode] = useState<boolean>(false);
  const [smartQuery, setSmartQuery] = useState<string>("");
  const lastSmartQueryRef = useRef<string>("");

  // Smart search loading UI control
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartLoadingIndex, setSmartLoadingIndex] = useState(0);

  // Server-driven and local cooldown control
  const [smartDisabledUntil, setSmartDisabledUntil] = useState<number | null>(
    null,
  );

  // Unified inline block notice for Smart Search
  // kind = "server" (HTTP 429) or "local" (client cooldown)
  const [smartBlockNotice, setSmartBlockNotice] = useState<{
    kind: "server" | "local";
    tryAgainAtMs: number;
    allowedPerHour?: number; // from server 429 payload
    remaining?: number; // optional server field
    resetAtIso?: string; // optional server field
  } | null>(null);

  // Track page view on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      posthog.capture("page_view", { path: window.location.pathname });
    }
  }, []);

  // Initialize Smart mode default from env on mount
  useEffect(() => {
    if (!SMART_ENABLED) {
      setSmartMode(false);
      return;
    }
    if (SMART_DEFAULT) {
      setSmartMode(true);
    }
  }, []);

  // Hydrate local cooldown from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tsRaw = localStorage.getItem("smart.lastRunAt");
    if (!tsRaw) return;
    const last = parseInt(tsRaw, 10);
    if (!Number.isFinite(last)) return;
    const until = last + LOCAL_COOLDOWN_MS;
    if (until > Date.now()) {
      setSmartDisabledUntil(until);
      // Show inline message for local cooldown on load if still active
      setSmartBlockNotice({
        kind: "local",
        tryAgainAtMs: until,
      });
    }
  }, []);

  // Local timer to re-enable button when disabledUntil elapses
  useEffect(() => {
    if (!smartDisabledUntil) return;
    const remaining = smartDisabledUntil - Date.now();
    if (remaining <= 0) {
      setSmartDisabledUntil(null);
      // Clear local block notice when cooldown ends (maintain server notice if any)
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

  // Also reactively keep inline local block notice in sync with smartDisabledUntil
  useEffect(() => {
    if (smartDisabledUntil && smartDisabledUntil > Date.now()) {
      // Only set if not overridden by a server block notice
      setSmartBlockNotice((prev) => {
        if (prev && prev.kind === "server") return prev;
        return { kind: "local", tryAgainAtMs: smartDisabledUntil };
      });
    } else {
      // Clear local notice if cooldown expired
      setSmartBlockNotice((prev) =>
        prev && prev.kind === "local" ? null : prev,
      );
    }
  }, [smartDisabledUntil]);

  // Debounce classic filters
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDependsOn(dependsOn), 300);
    return () => clearTimeout(timer);
  }, [dependsOn]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeywords(keywords), 300);
    return () => clearTimeout(timer);
  }, [keywords]);

  // Classic fetch (runs only when NOT in smart mode)
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

  // Rotate loading messages while smart search is running
  useEffect(() => {
    if (!smartLoading) return;
    const id = setInterval(() => {
      setSmartLoadingIndex((i) => (i + 1) % smartLoadingMessages.length);
    }, 1800);
    return () => clearInterval(id);
  }, [smartLoading]);

  const currentSmartMessage = useMemo(
    () => smartLoadingMessages[smartLoadingIndex],
    [smartLoadingIndex],
  );

  // Utility: set local cooldown timestamp
  const bumpLocalCooldown = () => {
    const now = Date.now();
    if (typeof window !== "undefined") {
      localStorage.setItem("smart.lastRunAt", String(now));
    }
    if (LOCAL_COOLDOWN_MS > 0) {
      setSmartDisabledUntil(now + LOCAL_COOLDOWN_MS);
    }
  };

  // Utility: compute disabled seconds for UI
  const disabledSeconds = useMemo(() => {
    if (!smartDisabledUntil) return 0;
    const s = Math.ceil((smartDisabledUntil - Date.now()) / 1000);
    return s > 0 ? s : 0;
  }, [smartDisabledUntil]);

  // Helpers for input length validation
  const smartLen = smartQuery.length;
  const smartTooShort = smartLen > 0 && smartLen < MIN_LEN;
  const smartTooLong = smartLen > MAX_LEN;

  // Smart search: explicit trigger
  const runSmartSearch = async () => {
    let q = smartQuery.trim();
    if (smartTooLong) q = q.slice(0, MAX_LEN); // hard enforce max
    if (!q || q === lastSmartQueryRef.current || q.length < MIN_LEN) return;

    // If currently local rate-limited, block and keep inline message
    if (smartDisabledUntil && smartDisabledUntil > Date.now()) {
      setPackages([]);
      setOtherPackages([]);
      setSmartBlockNotice({
        kind: "local",
        tryAgainAtMs: smartDisabledUntil,
      });
      return;
    }

    lastSmartQueryRef.current = q;

    // Reset any previous server block notice for a new run
    setSmartBlockNotice((prev) => (prev?.kind === "server" ? null : prev));

    // Start loading; keep list visible but show skeletons via loading flags
    setSmartLoading(true);
    bumpLocalCooldown(); // prevent click spam immediately

    let rid: string | undefined;
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
        // Leave data as {} and fall through
      }

      // server rid is helpful for correlating
      rid = data?.meta?.rid || data?.rid;

      if (res.status === 429) {
        // Respect Retry-After
        const retryHeader = res.headers.get("Retry-After");
        const retryAfter =
          Number.isFinite(parseInt(retryHeader || "", 10)) &&
          parseInt(retryHeader || "", 10) > 0
            ? parseInt(retryHeader || "", 10)
            : data?.retryAfterSec && Number.isFinite(data.retryAfterSec)
              ? Number(data.retryAfterSec)
              : Math.ceil(LOCAL_COOLDOWN_MS / 1000);

        const until = Date.now() + retryAfter * 1000;
        setSmartDisabledUntil(until);

        // Clear results and show retry-at message (inline for server 429)
        setPackages([]);
        setOtherPackages([]);

        const remaining: number | undefined =
          typeof data?.remainingRequests === "number"
            ? data.remainingRequests
            : undefined;
        const resetAtIso: string | undefined =
          typeof data?.resetAtIso === "string" ? data.resetAtIso : undefined;
        const allowedPerHour: number | undefined =
          typeof data?.allowedPerHour === "number"
            ? data.allowedPerHour
            : undefined;

        setSmartBlockNotice({
          kind: "server",
          tryAgainAtMs: until,
          allowedPerHour,
          remaining,
          resetAtIso,
        });

        posthog.capture("smart_search_rate_limited", {
          query: q,
          retryAfterSec: retryAfter,
          rid,
          remaining,
          resetAtIso,
          allowedPerHour,
        });
        return; // Do not update lists on rate limit
      }

      if (res.status === 503) {
        const resetAtIso =
          typeof data?.resetAtIso === "string" ? data.resetAtIso : undefined;

        // Unavailable / circuit breaker: show inline unavailability message
        setSmartBlockNotice({
          kind: "server",
          tryAgainAtMs: Date.now(), // used only for formatting fallback
          resetAtIso,
          allowedPerHour: data?.allowedPerHour,
        });
        return; // Do not update lists
      }

      if (!res.ok) {
        // Other errors: clear any block notice and let user try again
        setSmartBlockNotice(null);
        return;
      }

      // Success
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
    } catch (e) {
      console.error("Smart search failed:", e);
      // Keep existing content; inline notices cover UX
    } finally {
      setSmartLoading(false);
    }
  };

  // Toggle between classic and smart modes (smooth, rational behavior)
  const handleToggleSmartMode = (next: boolean) => {
    if (!SMART_ENABLED) return;

    if (next) {
      // Entering smart mode:
      // - Keep current results (classic) until a smart search is run or a block is active
      // - If a block (local cooldown) is active, show its inline notice immediately
      setSmartMode(true);
      // If currently blocked locally, ensure notice is shown
      if (smartDisabledUntil && smartDisabledUntil > Date.now()) {
        setSmartBlockNotice({
          kind: "local",
          tryAgainAtMs: smartDisabledUntil,
        });
      }
      return;
    }

    // Leaving smart mode:
    // - Clear smart query but do not nuke classic filters; classic effect will refetch if needed
    // - Remove any smart block notices (they only apply to smart mode)
    setSmartMode(false);
    setSmartQuery("");
    lastSmartQueryRef.current = "";
    setOtherPackages([]);
    setSmartLoading(false);
    setSmartBlockNotice(null);
  };

  // Title builder: show combined count in smart mode
  const buildTitle = () => {
    if (smartMode) {
      if (smartLoading) return smartLoadingMessages[smartLoadingIndex];
      const total = (packages?.length || 0) + (otherPackages?.length || 0); // fallback
      return `${total} npm packages found (Smart Search)`;
    }
    if (loading) return "Loading packages...";
    let title = `${packages.length} `;
    title +=
      sortBy === "growth"
        ? "fastest growing "
        : sortBy === "downloads"
          ? "most downloaded "
          : "most relied-upon ";
    title += "npm packages";
    if (debouncedDependsOn && modified) {
      title += ` that depend on '${debouncedDependsOn}' and have been updated in the ${daysMapping[modified]}`;
    } else if (debouncedDependsOn) {
      title += ` that depend on '${debouncedDependsOn}'`;
    } else if (modified) {
      title += ` that have been updated in the ${daysMapping[modified]}`;
    }
    return title;
  };

  // Whether smart UI should be shown at all
  const smartFeatureEnabled = SMART_ENABLED;

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#d4d4d4]">
      <main className="container mx-auto px-4 py-6">
        <Filters
          // classic
          sortBy={sortBy}
          dependsOn={dependsOn}
          keywords={keywords}
          modified={modified}
          loading={smartMode ? smartLoading : loading}
          onSortChange={setSortBy}
          onDependsOnChange={setDependsOn}
          onKeywordsChange={setKeywords}
          onModifiedChange={setModified}
          // smart
          smartMode={smartMode && smartFeatureEnabled}
          smartQuery={smartQuery}
          onToggleSmartMode={handleToggleSmartMode}
          onSmartQueryChange={setSmartQuery}
          onRunSmartSearch={runSmartSearch}
          // new props
          smartFeatureEnabled={smartFeatureEnabled}
          smartDisabledSeconds={disabledSeconds}
          limitsHintEnabled={true}
          smartDisabledUntilMs={smartDisabledUntil}
        />

        {/* Inline block notice for Smart Search (shown even before a query) */}
        {smartMode && smartBlockNotice && (
          <div className="mb-4">
            <InlineNotice
              title={
                smartBlockNotice.kind === "server"
                  ? "Smart Search limit reached"
                  : "Smart Search temporarily paused"
              }
              kind="warning"
            >
              <p className="mb-2">
                This open‑source project offers Smart Search with a limited
                quota to control costs.
                {typeof smartBlockNotice.allowedPerHour === "number" &&
                  smartBlockNotice.allowedPerHour > 0 && (
                    <>
                      {" "}
                      You get {smartBlockNotice.allowedPerHour} request
                      {smartBlockNotice.allowedPerHour === 1 ? "" : "s"} per
                      user per hour.
                    </>
                  )}
              </p>
              {smartBlockNotice.kind === "server" &&
                typeof smartBlockNotice.remaining === "number" &&
                smartBlockNotice.remaining <= 0 && (
                  <p className="mb-2">
                    You have 0 requests left in the current window.
                  </p>
                )}
              <p className="mb-2">
                Please try again at{" "}
                <strong>
                  {formatClockTime(
                    smartBlockNotice.resetAtIso ||
                      smartBlockNotice.tryAgainAtMs,
                  )}
                </strong>
                .
              </p>
              <p className="mb-0">
                In the meantime, you can continue using{" "}
                <button
                  type="button"
                  className="text-[#9d7dff] underline hover:text-[#c4b3ff]"
                  onClick={() => handleToggleSmartMode(false)}
                >
                  Classic Filters
                </button>{" "}
                (unlimited) to explore packages without restrictions.
              </p>
            </InlineNotice>
          </div>
        )}

        <h2 className="mb-4 text-xl font-semibold text-[#d4d4d4]">
          {buildTitle()}
        </h2>

        {/* Main packages: hide when blocked to show a clean message */}
        {!smartBlockNotice && (
          <PackageList
            packages={packages}
            loading={(smartMode && smartLoading) || (!smartMode && loading)}
            showGrowth={false}
          />
        )}

        {/* Other Packages section (only visible after smart results are in, not during loading) */}
        {smartMode &&
          !smartLoading &&
          !smartBlockNotice &&
          otherPackages.length > 0 && (
            <section className="mt-8">
              <h3 className="mb-3 text-lg font-semibold text-[#d4d4d4]">
                Smaller packages (not in leaderboard)
              </h3>
              <OtherPackageList items={otherPackages} />
            </section>
          )}
      </main>

      <footer className="bg-[#1e1e1e] py-2 text-center text-sm text-[#d4d4d4]">
        Made with ❤️ by{" "}
        <a
          href="https://younes.elhjouji.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#569CD6] hover:underline"
        >
          Younes El Hjouji
        </a>
        . Enjoy exploring!
      </footer>
    </div>
  );
}
