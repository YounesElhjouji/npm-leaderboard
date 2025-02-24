import posthog from "posthog-js";
import { SortBy } from "../types";

interface FiltersProps {
  sortBy: SortBy;
  dependsOn: string;
  modified: string;
  loading: boolean;
  onSortChange: (sort: SortBy) => void;
  onDependsOnChange: (value: string) => void;
  onModifiedChange: (value: string) => void;
}

const Filters = ({
  sortBy,
  dependsOn,
  modified,
  loading,
  onSortChange,
  onDependsOnChange,
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
    <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between">
      {/* Left Group: Sort Dropdown */}
      <div className="flex w-full items-center space-x-2 md:w-auto">
        <label htmlFor="sort" className="text-md font-medium text-[#d4d4d4]">
          Sort by:
        </label>
        <select
          id="sort"
          value={sortBy}
          onChange={handleSortChange}
          className="rounded-md border border-gray-600 bg-[#252526] p-2 text-[#d4d4d4] focus:ring-2 focus:ring-[#569CD6]"
          disabled={loading}
        >
          <option value="downloads">Most Downloaded</option>
          <option value="growth">Trending</option>
          <option value="dependents">Most Dependents</option>
        </select>
      </div>

      {/* Right Group: Dependency and Update Filters */}
      <div className="flex w-full flex-col gap-4 md:w-auto md:flex-row md:items-center">
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
            onChange={(e) => onDependsOnChange(e.target.value)}
            placeholder="e.g., react"
            className="rounded-md border border-gray-600 bg-[#252526] p-2 text-[#d4d4d4] focus:ring-2 focus:ring-[#569CD6]"
            disabled={loading}
          />
        </div>

        {/* Updated Within Dropdown */}
        <div className="flex items-center space-x-2">
          <label
            htmlFor="modified"
            className="text-md font-medium text-[#d4d4d4]"
          >
            Updated within:
          </label>
          <select
            id="modified"
            value={modified}
            onChange={handleModifiedChange}
            className="rounded-md border border-gray-600 bg-[#252526] p-2 text-[#d4d4d4] focus:ring-2 focus:ring-[#569CD6]"
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
