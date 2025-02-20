"use client";
import { useState, useEffect } from "react";
import { SortBy, NPMPackage } from "../types";
import Header from "../components/Header";
import Filters from "../components/Filters";
import PackageList from "../components/PackageList";

export default function HomePage() {
  const [sortBy, setSortBy] = useState<SortBy>("growth");
  const [dependsOn, setDependsOn] = useState<string>("react");
  const [packages, setPackages] = useState<NPMPackage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPackages() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/packages?sortBy=${sortBy}&dependsOn=${dependsOn}`,
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
  }, [sortBy, dependsOn]);

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
    if (dependsOn) {
      title += ` that depend on '${dependsOn}'`;
    }

    return title;
  };

  return (
    <div className="font-mono bg-[#1e1e1e] min-h-screen text-[#d4d4d4]">
      <Header />

      <main className="container mx-auto px-4 py-6">
        <Filters
          sortBy={sortBy}
          dependsOn={dependsOn}
          loading={loading}
          onSortChange={setSortBy}
          onDependsOnChange={setDependsOn}
        />

        <h2 className="text-xl font-semibold mb-4 text-[#d4d4d4]">
          {loading ? "Loading packages..." : generateTitle()}
        </h2>

        <PackageList packages={packages} loading={loading} showGrowth={false} />
      </main>

      <footer className="bg-[#1e1e1e] py-2 text-center text-sm text-[#d4d4d4]">
        &copy; {new Date().getFullYear()} NPM Leaderboard. All rights reserved.
      </footer>
    </div>
  );
}
