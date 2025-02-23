"use client";
import { useState, useEffect } from "react";
import { SortBy, NPMPackage } from "../types";
import Filters from "../components/Filters";
import PackageList from "../components/PackageList";
import posthog from "posthog-js";

export default function HomePage() {
  const [sortBy, setSortBy] = useState<SortBy>("growth");
  const [dependsOn, setDependsOn] = useState<string>("react");
  const [debouncedDependsOn, setDebouncedDependsOn] =
    useState<string>(dependsOn);
  const [packages, setPackages] = useState<NPMPackage[]>([]);
  const [loading, setLoading] = useState(true);

  // Track page view on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      posthog.capture("page_view", { path: window.location.pathname });
    }
  }, []);

  // Debounce the dependsOn value so that API calls don't happen on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDependsOn(dependsOn);
    }, 300);
    return () => clearTimeout(timer);
  }, [dependsOn]);

  // Fetch packages based on search term and sort criteria
  useEffect(() => {
    async function fetchPackages() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/packages?sortBy=${sortBy}&dependsOn=${debouncedDependsOn}`,
        );
        const data = await res.json();
        setPackages(data.packages);
      } catch (error) {
        console.error("Failed to fetch packages:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchPackages();
  }, [sortBy, debouncedDependsOn]);

  // Track search events with PostHog when the debounced search term changes
  useEffect(() => {
    if (!loading && debouncedDependsOn && typeof window !== "undefined") {
      posthog.capture("search", { search_term: debouncedDependsOn });
    }
  }, [debouncedDependsOn, loading]);

  // Function to generate the dynamic title
  const generateTitle = () => {
    let title = `${packages.length} `;
    if (sortBy === "growth") {
      title += "trending ";
    } else if (sortBy === "downloads") {
      title += "most downloaded ";
    } else if (sortBy === "dependents") {
      title += "most relied-upon ";
    }
    title += "npm packages";
    if (debouncedDependsOn) {
      title += ` that depend on '${debouncedDependsOn}'`;
    }
    return title;
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#d4d4d4]">
      <main className="container mx-auto px-4 py-6">
        <Filters
          sortBy={sortBy}
          dependsOn={dependsOn}
          loading={loading}
          onSortChange={setSortBy}
          onDependsOnChange={setDependsOn}
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
