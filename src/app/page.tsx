"use client";
import { useState, useEffect, useRef } from "react";
import { SortBy, NPMPackage } from "../types";
import Filters from "../components/Filters";
import PackageList from "../components/PackageList";
import posthog from "posthog-js";

const daysMapping: Record<string, string> = {
  "30": "last month",
  "180": "last 6 months",
  "365": "last year",
};

export default function HomePage() {
  const [sortBy, setSortBy] = useState<SortBy>("growth");
  const [dependsOn, setDependsOn] = useState<string>("");
  const [debouncedDependsOn, setDebouncedDependsOn] =
    useState<string>(dependsOn);
  const [keywords, setKeywords] = useState<string>("");
  const [debouncedKeywords, setDebouncedKeywords] = useState<string>(keywords);
  const [modified, setModified] = useState<string>("");

  const [packages, setPackages] = useState<NPMPackage[]>([]);
  const [loading, setLoading] = useState(true);

  const [smartMode, setSmartMode] = useState<boolean>(false);
  const [smartQuery, setSmartQuery] = useState<string>("");
  const lastSmartQueryRef = useRef<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      posthog.capture("page_view", { path: window.location.pathname });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDependsOn(dependsOn), 300);
    return () => clearTimeout(timer);
  }, [dependsOn]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeywords(keywords), 300);
    return () => clearTimeout(timer);
  }, [keywords]);

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
      } catch (e) {
        console.error("Failed to fetch packages:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchPackages();
  }, [sortBy, debouncedDependsOn, debouncedKeywords, modified, smartMode]);

  const runSmartSearch = async () => {
    const q = smartQuery.trim();
    if (!q || q === lastSmartQueryRef.current) return;
    lastSmartQueryRef.current = q;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/smart-search?query=${encodeURIComponent(q)}`,
      );
      const data = await res.json();
      setPackages(data.packages || []);
      posthog.capture("smart_search_result", {
        query: q,
        result_count: (data.packages || []).length,
      });
    } catch (e) {
      console.error("Smart search failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const generateTitle = () => {
    if (smartMode) {
      return loading
        ? "Running smart search..."
        : `${packages.length} npm packages found (Smart Search)`;
    }
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

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#d4d4d4]">
      <main className="container mx-auto px-4 py-6">
        <Filters
          // classic
          sortBy={sortBy}
          dependsOn={dependsOn}
          keywords={keywords}
          modified={modified}
          loading={loading}
          onSortChange={setSortBy}
          onDependsOnChange={setDependsOn}
          onKeywordsChange={setKeywords}
          onModifiedChange={setModified}
          // smart
          smartMode={smartMode}
          smartQuery={smartQuery}
          onToggleSmartMode={setSmartMode}
          onSmartQueryChange={setSmartQuery}
          onRunSmartSearch={runSmartSearch}
        />

        <h2 className="mb-4 text-xl font-semibold text-[#d4d4d4]">
          {loading ? "Loading packages..." : generateTitle()}
        </h2>

        <PackageList packages={packages} loading={loading} showGrowth={false} />
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
