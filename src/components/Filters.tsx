import { SortBy } from "../types";
import ClassicFilters from "./ClassicFilters";
import SmartSearchBar from "./SmartSearchBar";

interface FiltersProps {
  // classic
  sortBy: SortBy;
  dependsOn: string;
  keywords: string;
  modified: string;
  loading: boolean;
  onSortChange: (sort: SortBy) => void;
  onDependsOnChange: (value: string) => void;
  onKeywordsChange: (value: string) => void;
  onModifiedChange: (value: string) => void;

  // smart
  smartMode: boolean;
  smartQuery: string;
  onToggleSmartMode: (value: boolean) => void;
  onSmartQueryChange: (value: string) => void;
  onRunSmartSearch: () => void;

  // new
  smartFeatureEnabled: boolean;
  smartDisabledSeconds: number;
  // optional: absolute timestamp millis when it will be re-enabled
  smartDisabledUntilMs?: number | null;
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

const Filters = (props: FiltersProps) => {
  const {
    smartMode,
    onToggleSmartMode,
    smartQuery,
    onSmartQueryChange,
    onRunSmartSearch,
    smartFeatureEnabled,
    smartDisabledSeconds,
    smartDisabledUntilMs,
  } = props;

  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      {/* Left: either Classic or Smart */}
      <div className="flex-1">
        {!smartMode ? (
          <ClassicFilters {...props} />
        ) : (
          <SmartSearchBar
            smartQuery={smartQuery}
            loading={props.loading}
            onSmartQueryChange={onSmartQueryChange}
            onRunSmartSearch={onRunSmartSearch}
            disabledSeconds={smartDisabledSeconds}
            disabledUntilMs={smartDisabledUntilMs ?? null}
          />
        )}
      </div>

      {/* Right: Toggle button (hidden if feature gate off) */}
      {smartFeatureEnabled && (
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => onToggleSmartMode(!smartMode)}
            className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              smartMode
                ? "border-violet-500 text-violet-400 hover:bg-[#2b2240]"
                : "border-violet-600 text-violet-500 hover:bg-[#211a33]"
            }`}
            title={smartMode ? "Use classic filters" : "Try Smart Search (AI)"}
          >
            <SparkleIcon />
            {smartMode ? "Use Classic Filters" : "Try Smart Search (AI)"}
          </button>
        </div>
      )}
    </div>
  );
};

export default Filters;
