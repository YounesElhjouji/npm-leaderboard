import React from "react";

export default async function Header() {
  let lastSync = null;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:4200";
    const res = await fetch(`${baseUrl}/api/metadata`, {
      cache: "no-store",
    });
    const data = await res.json();
    lastSync = data.lastSync;
  } catch (error) {
    console.error("Failed to fetch last sync date", error);
  }

  const formattedDate = lastSync
    ? new Date(lastSync).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    : "N/A";

  return (
    <header className="border-b border-gray-700 bg-[#1e1e1e] py-4 text-[#d4d4d4] shadow-md">
      <div className="container mx-auto flex flex-col items-start px-4 md:flex-row md:justify-between">
        <div className="w-full text-left">
          <h1 className="text-3xl font-bold text-[#569CD6]">NPM Leaderboard</h1>
          <p className="text-md mt-1">
            Explore the most popular npm packages by downloads, growth, and
            dependent repos.
          </p>
        </div>
        <div className="mt-4 w-full text-right md:mt-0">
          <p className="mb-1">
            Last sync: <span className="font-semibold">{formattedDate}</span>
          </p>
          <p>
            <a
              href="https://younes.elhjouji.com"
              className="text-[#569CD6] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              My Website
            </a>
          </p>
          <p>
            <a
              href="https://github.com/YounesElhjouji/npm-leaderboard"
              className="text-[#569CD6] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub Repo
            </a>
          </p>
        </div>
      </div>
    </header>
  );
}
