"use client";
import { useState, useEffect } from "react";

export default function HomePage() {
  const showGrowth = false;
  const [sortBy, setSortBy] = useState("growth"); // Default to "Trending"
  const [dependsOn, setDependsOn] = useState("react"); // Default to "react"
  const [packages, setPackages] = useState<any[]>([]);

  useEffect(() => {
    async function fetchPackages() {
      const res = await fetch(
        `/api/packages?sortBy=${sortBy}&dependsOn=${dependsOn}`,
      );
      const data = await res.json();
      setPackages(data.packages);
    }
    fetchPackages();
  }, [sortBy, dependsOn]);

  // Function to generate the dynamic title
  const generateTitle = () => {
    let title = `100 `;

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
      {/* Header */}
      <header className="bg-[#1e1e1e] text-[#d4d4d4] py-4 shadow-md border-b border-gray-700">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-[#569CD6]">NPM Leaderboard</h1>
          <p className="mt-1 text-md">
            Explore the most popular npm packages by downloads, growth, and
            dependents.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Filters */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-4">
          {/* Sort Dropdown */}
          <div className="flex items-center space-x-2">
            <label
              htmlFor="sort"
              className="text-md font-medium text-[#d4d4d4]"
            >
              Sort by:
            </label>
            <select
              id="sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="p-2 bg-[#252526] border border-gray-600 rounded-md focus:ring-2 focus:ring-[#569CD6] text-[#d4d4d4]"
            >
              <option value="downloads">Most Downloaded</option>
              <option value="growth">Trending</option>
              <option value="dependents">Most Dependents</option>
            </select>
          </div>

          {/* Dependency Filter Input */}
          <div className="flex items-center space-x-2">
            <label
              htmlFor="dependsOn"
              className="text-md font-medium text-[#d4d4d4]"
            >
              Depends on:
            </label>
            <input
              type="text"
              id="dependsOn"
              value={dependsOn}
              onChange={(e) => setDependsOn(e.target.value)}
              placeholder="e.g., react"
              className="p-2 bg-[#252526] border border-gray-600 rounded-md focus:ring-2 focus:ring-[#569CD6] text-[#d4d4d4]"
            />
          </div>
        </div>

        {/* Dynamic Title (Now Below Filters) */}
        <h2 className="text-xl font-semibold mb-4 text-[#d4d4d4]">
          {generateTitle()}
        </h2>

        {/* Package List */}
        <div className="grid grid-cols-1 gap-3">
          {packages.map((pkg) => (
            <div
              key={pkg._id}
              className="bg-[#252526] p-4 rounded shadow hover:shadow-lg transition border border-gray-600"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                {/* Left: Name (Clickable) and Description */}
                <div className="max-w-[40rem]">
                  <h2 className="text-xl font-semibold mb-1">
                    <a
                      href={pkg.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#569CD6] hover:underline"
                    >
                      {pkg.name}
                    </a>
                  </h2>
                  <p className="text-gray-400 mb-2 text-sm">
                    {pkg.description}
                  </p>
                </div>

                {/* Right: Stats & Growth Score */}
                <div className="flex flex-wrap items-center gap-4 md:justify-end">
                  <div className="flex items-center gap-1 text-sm">
                    <span className="font-medium text-gray-400">
                      Downloads:
                    </span>
                    <span className="text-[#d4d4d4]">
                      {pkg.downloads?.total}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-sm">
                    <span className="font-medium text-gray-400">
                      Dependents:
                    </span>
                    <span className="text-[#d4d4d4]">
                      {pkg.dependent_packages_count}
                    </span>
                  </div>
                  {pkg.avgGrowth !== undefined && showGrowth && (
                    <div className="flex items-center gap-1 text-sm">
                      <span className="font-medium text-gray-400">
                        Growth Score:
                      </span>
                      <span className="text-[#d4d4d4]">
                        {pkg.avgGrowth.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#1e1e1e] py-2 text-center text-sm text-[#d4d4d4]">
        &copy; {new Date().getFullYear()} NPM Leaderboard. All rights reserved.
      </footer>
    </div>
  );
}
