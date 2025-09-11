"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { SortBy, NPMPackage } from "../types";
import Filters from "../components/Filters";
import PackageList from "../components/PackageList";
import OtherPackageList from "../components/OtherPackageList";
import posthog from "posthog-js";
import Alert from "../components/Alert";

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
const TOASTS_ENABLED =
  (process.env.NEXT_PUBLIC_SMART_SEARCH_TOASTS || "true").toLowerCase() ===
  "true";
const LIMITS_HINT_ENABLED =
  (process.env.NEXT_PUBLIC_SMART_SEARCH_LIMITS_HINT || "true").toLowerCase() ===
  "true";

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

  // New: server-driven and local cooldown control
  const [smartDisabledUntil, setSmartDisabledUntil] = useState<number | null>(
    null,
  );
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

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

  // Hydrate local cooldown from localStorage (so multiple tabs share state)
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

  // Local timer to re-enable button when disabledUntil elapses
  useEffect(() => {
    if (!smartDisabledUntil) return;
    const remaining = smartDisabledUntil - Date.now();
    if (remaining <= 0) {
      setSmartDisabledUntil(null);
      return;
    }
    const id = setTimeout(() => {
      setSmartDisabledUntil(null);
    }, remaining);
    return () => clearTimeout(id);
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

  // Smart search: explicit trigger
  const runSmartSearch = async () => {
    const q = smartQuery.trim();
    if (!q || q === lastSmartQueryRef.current) return;

    // Local cooldown gate
    if (smartDisabledUntil && smartDisabledUntil > Date.now()) {
      // Already disabled by cooldown
      return;
    }

    lastSmartQueryRef.current = q;

    // Reset banner for new run
    setBannerMessage(null);

    // Start loading; keep list visible but show skeletons via loading flags
    setSmartLoading(true);
    bumpLocalCooldown(); // prevent spam immediately

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

        if (TOASTS_ENABLED) {
          console.info(
            `Rate limited. Please wait ${retryAfter}s before trying again.`,
          );
        }
        posthog.capture("smart_search_rate_limited", {
          query: q,
          retryAfterSec: retryAfter,
          rid,
        });
        return; // Do not update lists on rate limit
      }

      if (res.status === 503) {
        // Unavailable / circuit breaker
        setBannerMessage(
          "Smart Search is temporarily unavailable. Please use classic filters or try again later.",
        );
        posthog.capture("smart_search_unavailable", { query: q, rid });
        return; // Do not update lists
      }

      if (!res.ok) {
        // Other errors
        setBannerMessage(
          "Smart Search failed. Please try again or use classic filters.",
        );
        posthog.capture("smart_search_error", {
          query: q,
          rid,
          code: res.status,
        });
        return;
      }

      // Success
      setPackages(data.packages || []);
      setOtherPackages(data.otherPackages || []);

      posthog.capture("smart_search_success", {
        query: q,
        rid,
        result_count: (data.packages || []).length,
        other_count: (data.otherPackages || []).length,
        cache: data?.meta?.cache,
      });
    } catch (e) {
      console.error("Smart search failed:", e);
      setBannerMessage(
        "Smart Search encountered an error. Please try again shortly.",
      );
      posthog.capture("smart_search_error", {
        query: smartQuery.trim(),
        rid,
        code: "client_exception",
      });
    } finally {
      setSmartLoading(false);
    }
  };

  // Toggle between classic and smart modes
  const handleToggleSmartMode = (next: boolean) => {
    if (!SMART_ENABLED) return;
    if (next) {
      // Entering smart mode: keep current packages until user runs search
      setSmartMode(true);
      return;
    }
    // Leaving smart mode: reset to initial classic state
    setSmartMode(false);
    setSmartQuery("");
    lastSmartQueryRef.current = "";
    setSortBy("growth");
    setDependsOn("");
    setDebouncedDependsOn("");
    setKeywords("");
    setDebouncedKeywords("");
    setModified("");
    setOtherPackages([]);
    setLoading(true); // classic effect will refetch
    setBannerMessage(null);
  };

  // Title builder: show combined count in smart mode with meta.counts if available
  const buildTitle = () => {
    if (smartMode) {
      if (smartLoading) return currentSmartMessage;
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
          limitsHintEnabled={LIMITS_HINT_ENABLED}
        />

        {bannerMessage && (
          <div className="mb-4">
            <Alert kind="warning">{bannerMessage}</Alert>
          </div>
        )}

        <h2 className="mb-4 text-xl font-semibold text-[#d4d4d4]">
          {buildTitle()}
        </h2>

        {/* Main packages: in smart mode, pass loading from smartLoading to show skeletons */}
        <PackageList
          packages={packages}
          loading={(smartMode && smartLoading) || (!smartMode && loading)}
          showGrowth={false}
        />

        {/* Other Packages section (only visible after smart results are in, not during loading) */}
        {smartMode && !smartLoading && otherPackages.length > 0 && (
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
