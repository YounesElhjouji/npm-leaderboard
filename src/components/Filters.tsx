import posthog from "posthog-js";
import { SortBy } from "../types";

interface FiltersProps {
  sortBy: SortBy;
  dependsOn: string;
  keywords: string;
  modified: string;
  loading: boolean;
  onSortChange: (sort: SortBy) => void;
  onDependsOnChange: (value: string) => void;
  onKeywordsChange: (value: string) => void;
  onModifiedChange: (value: string) => void;

  // Smart search props
  smartMode: boolean;
  smartQuery: string;
  onToggleSmartMode: (value: boolean) => void;
  onSmartQueryChange: (value: string) => void;
  onRunSmartSearch: () => void;
}

const Filters = ({
  sortBy,
  dependsOn,
  keywords,
  modified,
  loading,
  onSortChange,
  onDependsOnChange,
  onKeywordsChange,
  onModifiedChange,
  smartMode,
  smartQuery,
  onToggleSmartMode,
  onSmartQueryChange,
  onRunSmartSearch,
}: FiltersProps) => {
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSort = e.target.value as SortBy;
    posthog.capture("sort_change", { sort_by: newSort });
    onSortChange(newSort);
  };

  const handleModifiedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onModifiedChange(e.target.value);
  };

  const handleToggleSmart = () => {
    const next = !smartMode;
    posthog.capture("smart_search_toggle", { enabled: next });
    onToggleSmartMode(next);
  };

  const handleRunSmart = () => {
    posthog.capture("smart_search_run", { query: smartQuery });
    onRunSmartSearch();
  };

  // AI icon (sparkle) SVG
  const SparkleIcon = () => (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M11.5 2l1.7 4.7L18 8.5l-4.8 1.4L11.5 15l-1.7-5.1L5 8.5l4.8-1.8L11.5 2zM19 12l1 2.8L23 16l-3 1-.9 3L18 17l-3-1 3-1 .9-3zM4 13l1.2 3.1L8 17l-2.8.9L4 21l-1.1-3.1L0 17l2.9-.9L4 13z" />
    </svg>
  );

  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      {/* Left: Sort + (conditional) classic filters OR Smart Search bar */}
      <div className="flex-1">
        {!smartMode ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {/* Sort by */}
            <div className="flex flex-col space-y-1">
              <label
                htmlFor="sort"
                className="text-sm font-medium text-[#d4d4d4]"
              >
                Sort by
              </label>
              <select
                id="sort"
                value={sortBy}
                onChange={handleSortChange}
                className="w-full rounded-md border border-gray-600 bg-[#252526] p-2 text-[#d4d4d4] focus:ring-2 focus:ring-[#569CD6]"
                disabled={loading}
              >
                <option value="downloads">Most Downloaded</option>
                <option value="growth">Trending</option>
                <option value="dependents">Most Dependents</option>
              </select>
            </div>

            {/* Keywords */}
            <div className="flex flex-col space-y-1">
              <label
                htmlFor="keywords"
                className="text-sm font-medium text-[#d4d4d4]"
              >
                Keywords
              </label>
              <input
                type="text"
                id="keywords"
                value={keywords}
                onChange={(e) => onKeywordsChange(e.target.value)}
                placeholder="e.g., stream parse"
                className="w-full rounded-md border border-gray-600 bg-[#252526] p-2 text-[#d4d4d4] focus:ring-2 focus:ring-[#569CD6]"
              />
            </div>

            {/* Depends on */}
            <div className="flex flex-col space-y-1">
              <label
                htmlFor="dependsOn"
                className="text-sm font-medium text-[#d4d4d4]"
              >
                Depends on
              </label>
              <input
                type="text"
                id="dependsOn"
                value={dependsOn}
                onChange={(e) => onDependsOnChange(e.target.value)}
                placeholder="e.g., react"
                className="w-full rounded-md border border-gray-600 bg-[#252526] p-2 text-[#d4d4d4] focus:ring-2 focus:ring-[#569CD6]"
              />
            </div>

            {/* Updated within */}
            <div className="flex flex-col space-y-1">
              <label
                htmlFor="modified"
                className="text-sm font-medium text-[#d4d4d4]"
              >
                Updated within
              </label>
              <select
                id="modified"
                value={modified}
                onChange={handleModifiedChange}
                className="w-full rounded-md border border-gray-600 bg-[#252526] p-2 text-[#d4d4d4] focus:ring-2 focus:ring-[#569CD6]"
                disabled={loading}
              >
                <option value="">All Time</option>
                <option value="30">Last Month</option>
                <option value="180">Last 6 Months</option>
                <option value="365">Last Year</option>
              </select>
            </div>
          </div>
        ) : (
          // Smart Search mode: a single compact row using horizontal space
          <div className="flex flex-col space-y-1">
            <label
              htmlFor="smartQuery"
              className="text-sm font-medium text-[#d4d4d4]"
            >
              Smart Search (Natural Language)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                id="smartQuery"
                value={smartQuery}
                onChange={(e) => onSmartQueryChange(e.target.value)}
                placeholder="e.g., lightweight csv parser for Node 18 with TS types"
                className="flex-1 rounded-md border border-gray-600 bg-[#252526] p-2 text-[#d4d4d4] focus:ring-2 focus:ring-[#D97706]"
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleRunSmart}
                disabled={loading || !smartQuery.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[#D97706] px-4 py-2 font-medium text-black transition-colors hover:bg-[#f59e0b] disabled:opacity-60"
                title="Run Smart Search"
              >
                <SparkleIcon />
                Run Smart Search
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Toggle button placed at the end of the row */}
      <div className="flex items-end">
        <button
          type="button"
          onClick={handleToggleSmart}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${smartMode
              ? "border-[#D97706] text-[#D97706] hover:bg-[#2b210f]"
              : "border-[#569CD6] text-[#569CD6] hover:bg-[#1e2a35]"
            }`}
          title={smartMode ? "Use classic filters" : "Try Smart Search (AI)"}
        >
          <SparkleIcon />
          {smartMode ? "Use Classic Filters" : "Try Smart Search (AI)"}
        </button>
      </div>
    </div>
  );
};

export default Filters;
