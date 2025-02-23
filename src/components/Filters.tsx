import posthog from "posthog-js";
import { SortBy } from "../types";

interface FiltersProps {
  sortBy: SortBy;
  dependsOn: string;
  loading: boolean;
  onSortChange: (sort: SortBy) => void;
  onDependsOnChange: (value: string) => void;
}

const Filters = ({
  sortBy,
  dependsOn,
  loading,
  onSortChange,
  onDependsOnChange,
}: FiltersProps) => {
  // Wrap sort change to capture the event before calling the handler
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSort = e.target.value as SortBy;
    posthog.capture("sort_change", { sort_by: newSort });
    onSortChange(newSort);
  };

  return (
    <div className="mb-4 flex flex-col items-center justify-between space-y-4 md:flex-row md:space-y-0">
      {/* Sort Dropdown */}
      <div className="flex w-full flex-col items-start space-y-2 sm:flex-row sm:items-center sm:space-x-2 sm:space-y-0 md:w-auto">
        <label htmlFor="sort" className="text-md font-medium text-[#d4d4d4]">
          Sort by:
        </label>
        <select
          id="sort"
          value={sortBy}
          onChange={handleSortChange}
          className="w-full rounded-md border border-gray-600 bg-[#252526] p-2 text-[#d4d4d4] focus:ring-2 focus:ring-[#569CD6] sm:w-auto"
          disabled={loading}
        >
          <option value="downloads">Most Downloaded</option>
          <option value="growth">Trending</option>
          <option value="dependents">Most Dependents</option>
        </select>
      </div>

      {/* Dependency Filter Input */}
      <div className="flex w-full flex-col items-start space-y-2 sm:flex-row sm:items-center sm:space-x-2 sm:space-y-0 md:w-auto">
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
          className="w-full rounded-md border border-gray-600 bg-[#252526] p-2 text-[#d4d4d4] focus:ring-2 focus:ring-[#569CD6] sm:w-auto"
        />
      </div>
    </div>
  );
};

export default Filters;
