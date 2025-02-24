"use client";
import { useState, useEffect } from "react";
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

  // New state for modified filter (number of days)
  const [modified, setModified] = useState<string>("");

  const [packages, setPackages] = useState<NPMPackage[]>([]);
  const [loading, setLoading] = useState(true);

  // Track page view on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      posthog.capture("page_view", { path: window.location.pathname });
    }
  }, []);

  // Debounce the dependsOn value
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDependsOn(dependsOn);
    }, 300);
    return () => clearTimeout(timer);
  }, [dependsOn]);

  // Fetch packages based on search term, sort criteria, and modified filter
  useEffect(() => {
    async function fetchPackages() {
      setLoading(true);
      try {
        // Build query URL
        let url = `/api/packages?sortBy=${sortBy}&dependsOn=${debouncedDependsOn}`;
        if (modified) {
          url += `&modified=${modified}`;
        }
        const res = await fetch(url);
        const data = await res.json();
        setPackages(data.packages);
      } catch (error) {
        console.error("Failed to fetch packages:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchPackages();
  }, [sortBy, debouncedDependsOn, modified]);

  // Track search events with PostHog when the debounced search term changes
  useEffect(() => {
    if (!loading && debouncedDependsOn && typeof window !== "undefined") {
      posthog.capture("search", { search_term: debouncedDependsOn });
    }
  }, [debouncedDependsOn, loading]);

  // Function to generate the dynamic title
  // Function to generate the dynamic title with the new format
  const generateTitle = () => {
    let title = `${packages.length} `;

    // Add the ranking type (most downloaded, most relied-upon, etc.)
    if (sortBy === "growth") {
      title += "fastest growing ";
    } else if (sortBy === "downloads") {
      title += "most downloaded ";
    } else if (sortBy === "dependents") {
      title += "most relied-upon ";
    }

    title += "npm packages";

    // Handle different combinations of filters
    if (debouncedDependsOn && modified) {
      // Both filters are set
      title += ` that depend on '${debouncedDependsOn}' and have been updated in the ${daysMapping[modified]}`;
    } else if (debouncedDependsOn) {
      // Only dependency filter is set
      title += ` that depend on '${debouncedDependsOn}'`;
    } else if (modified) {
      // Only time period filter is set
      title += ` that have been updated in the ${daysMapping[modified]}`;
    }

    return title;
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#d4d4d4]">
      <main className="container mx-auto px-4 py-6">
        <Filters
          sortBy={sortBy}
          dependsOn={dependsOn}
          modified={modified}
          loading={loading}
          onSortChange={setSortBy}
          onDependsOnChange={setDependsOn}
          onModifiedChange={setModified}
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
