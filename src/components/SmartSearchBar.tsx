import posthog from "posthog-js";

interface SmartSearchBarProps {
  smartQuery: string;
  loading: boolean;
  onSmartQueryChange: (value: string) => void;
  onRunSmartSearch: () => void;
}

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

const SmartSearchBar = ({
  smartQuery,
  loading,
  onSmartQueryChange,
  onRunSmartSearch,
}: SmartSearchBarProps) => {
  const handleRun = () => {
    posthog.capture("smart_search_run", { query: smartQuery });
    onRunSmartSearch();
  };

  return (
    <div className="flex w-full flex-col gap-2 md:flex-row md:items-end md:justify-between">
      {/* Input */}
      <div className="flex-1">
        <label
          htmlFor="smartQuery"
          className="text-sm font-medium text-[#d4d4d4]"
        >
          Smart Search (AI)
        </label>
        <input
          type="text"
          id="smartQuery"
          value={smartQuery}
          onChange={(e) => onSmartQueryChange(e.target.value)}
          placeholder="e.g., lightweight csv parser for Node 18 with TS types"
          className="mt-1 w-full rounded-md border border-violet-600 bg-[#252526] p-2 text-[#d4d4d4] focus:ring-2 focus:ring-violet-500"
          disabled={loading}
        />
      </div>

      {/* Button */}
      <div className="md:ml-4">
        <label className="invisible block text-sm font-medium md:visible">
          &nbsp;
        </label>
        <button
          type="button"
          onClick={handleRun}
          disabled={loading || !smartQuery.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-violet-600 px-4 py-2 font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
          title="Run Smart Search"
        >
          <SparkleIcon />
          Run Smart Search
        </button>
      </div>
    </div>
  );
};

export default SmartSearchBar;
