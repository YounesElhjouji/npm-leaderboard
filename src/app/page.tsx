"use client";
import { useState, useEffect } from "react";

export default function HomePage() {
  const [sortBy, setSortBy] = useState("downloads");
  const [dependsOn, setDependsOn] = useState("");
  const [packages, setPackages] = useState<any[]>([]);

  useEffect(() => {
    async function fetchPackages() {
      // Pass both sortBy and dependsOn as query parameters
      const res = await fetch(
        `/api/packages?sortBy=${sortBy}&dependsOn=${dependsOn}`,
      );
      const data = await res.json();
      setPackages(data.packages);
    }
    fetchPackages();
  }, [sortBy, dependsOn]);

  return (
    <div className="min-h-screen dark bg-gray-900">
      <header className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-4 shadow-lg">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold">NPM Leaderboard</h1>
          <p className="mt-1 text-md">
            Discover the top npm packages by downloads, growth, and dependents.
          </p>
        </div>
      </header>
      <main className="container mx-auto px-4 py-4">
        <div className="flex flex-col md:flex-row items-center justify-between mb-4 space-y-2 md:space-y-0">
          <div className="flex items-center space-x-2">
            <label
              htmlFor="sort"
              className="text-md font-medium text-gray-700 dark:text-gray-300"
            >
              Sort by:
            </label>
            <select
              id="sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
            >
              <option value="downloads">Most Downloaded</option>
              <option value="growth">Fastest Growing</option>
              <option value="dependents">Most Dependents</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <label
              htmlFor="dependsOn"
              className="text-md font-medium text-gray-700 dark:text-gray-300"
            >
              Depends on:
            </label>
            <input
              type="text"
              id="dependsOn"
              value={dependsOn}
              onChange={(e) => setDependsOn(e.target.value)}
              placeholder="e.g., react"
              className="p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {packages.map((pkg) => (
            <div
              key={pkg._id}
              className="bg-white dark:bg-gray-800 p-4 rounded shadow hover:shadow-md transition duration-300"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                {/* Left: Name and Description */}
                <div className="max-w-[40rem]">
                  <h2 className="text-xl font-semibold mb-1 text-gray-800 dark:text-gray-100">
                    {pkg.name}
                  </h2>
                  <p className="text-gray-600 mb-2 text-sm dark:text-gray-300">
                    {pkg.description}
                  </p>
                </div>
                {/* Right: Stats, Growth Score & Link */}
                <div className="flex flex-wrap items-center gap-4 md:justify-end">
                  <div className="flex items-center gap-1 text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Downloads:
                    </span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {pkg.downloads?.total}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      Dependents:
                    </span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {pkg.dependent_packages_count}
                    </span>
                  </div>
                  {pkg.avgGrowth !== undefined && (
                    <div className="flex items-center gap-1 text-sm">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        Growth Score:
                      </span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {pkg.avgGrowth.toFixed(2)}%
                      </span>
                    </div>
                  )}
                  <a
                    href={pkg.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                  >
                    View on npm
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
      <footer className="bg-gray-200 dark:bg-gray-800 py-2">
        <div className="container mx-auto text-center text-gray-700 dark:text-gray-300 text-sm">
          &copy; {new Date().getFullYear()} NPM Leaderboard. All rights
          reserved.
        </div>
      </footer>
    </div>
  );
}
