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
}: FiltersProps) => {
  // Wrap sort change to capture event before calling the handler
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSort = e.target.value as SortBy;
    posthog.capture("sort_change", { sort_by: newSort });
    onSortChange(newSort);
  };

  const handleModifiedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onModifiedChange(e.target.value);
  };

  return (
    <div className="mb-6 flex flex-col gap-4 space-y-4 md:flex-row md:items-end md:justify-between md:space-y-0">
      {/* Left Side - Sort Dropdown */}
      <div className="flex flex-col space-y-1">
        <label htmlFor="sort" className="text-sm font-medium text-[#d4d4d4]">
          Sort by
        </label>
        <select
          id="sort"
          value={sortBy}
          onChange={handleSortChange}
          className="w-full rounded-md border border-gray-600 bg-[#252526] p-2 text-[#d4d4d4] focus:ring-2 focus:ring-[#569CD6] md:w-auto"
          disabled={loading}
        >
          <option value="downloads">Most Downloaded</option>
          <option value="growth">Trending</option>
          <option value="dependents">Most Dependents</option>
        </select>
      </div>

      {/* Right Side - Filters Group */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Keyword Filter Input */}
        <div className="flex flex-col space-y-1">
          <label
            htmlFor="keyword"
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
        {/* Dependency Filter Input */}
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

        {/* Updated Within Dropdown */}
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
    </div>
  );
};

export default Filters;
