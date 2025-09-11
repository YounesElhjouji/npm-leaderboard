"use client";
import { useMemo } from "react";
import Filters from "../components/Filters";
import PackageList from "../components/PackageList";
import OtherPackageList from "../components/OtherPackageList";
import SmartNotices from "../components/SmartNotices";
import { useSmartSearch } from "../hooks/useSmartSearch";

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

export default function HomePage() {
  const {
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
    smartLoadingIndex,

    // results
    packages,
    otherPackages,

    // limits and quota
    smartDisabledSeconds,
    smartDisabledUntilMs,
    smartBlockNotice,
    quotaInfo,
    smartFeatureEnabled,

    // NEW
    smartGenericError,
  } = useSmartSearch();

  const title = useMemo(() => {
    if (smartMode) {
      if (smartLoading) return smartLoadingMessages[smartLoadingIndex];
      const total = (packages?.length || 0) + (otherPackages?.length || 0);
      return `${total} npm packages found (Smart Search)`;
    }
    if (loading) return "Loading packages...";
    let t = `${packages.length} `;
    t +=
      sortBy === "growth"
        ? "fastest growing "
        : sortBy === "downloads"
          ? "most downloaded "
          : "most relied-upon ";
    t += "npm packages";
    if (dependsOn && modified) {
      t += ` that depend on '${dependsOn}' and have been updated in the ${daysMapping[modified]}`;
    } else if (dependsOn) {
      t += ` that depend on '${dependsOn}'`;
    } else if (modified) {
      t += ` that have been updated in the ${daysMapping[modified]}`;
    }
    return t;
  }, [
    smartMode,
    smartLoading,
    smartLoadingIndex,
    packages,
    otherPackages,
    loading,
    sortBy,
    dependsOn,
    modified,
  ]);

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
          // limits UI
          smartFeatureEnabled={smartFeatureEnabled}
          smartDisabledSeconds={smartDisabledSeconds}
          limitsHintEnabled={true}
          smartDisabledUntilMs={smartDisabledUntilMs}
        />

        <SmartNotices
          smartMode={smartMode}
          smartBlockNotice={smartBlockNotice}
          quotaInfo={quotaInfo}
          onSwitchToClassic={() => handleToggleSmartMode(false)}
          smartGenericError={smartGenericError}
        />

        <h2 className="mb-4 text-xl font-semibold text-[#d4d4d4]">{title}</h2>

        {!smartBlockNotice && !smartGenericError && (
          <PackageList
            packages={packages}
            loading={(smartMode && smartLoading) || (!smartMode && loading)}
            showGrowth={false}
          />
        )}

        {smartMode &&
          !smartLoading &&
          !smartBlockNotice &&
          !smartGenericError &&
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
