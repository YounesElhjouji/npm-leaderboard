import { useState, useEffect } from "react";
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
  // Local state for the dependency filter so typing doesn't trigger immediate updates
  const [localDependsOn, setLocalDependsOn] = useState(dependsOn);

  // Sync local state if the parent's dependsOn changes externally
  useEffect(() => {
    setLocalDependsOn(dependsOn);
  }, [dependsOn]);

  const handleApply = () => {
    onDependsOnChange(localDependsOn);
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-between mb-4 space-y-4 md:space-y-0">
      {/* Sort Dropdown */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full md:w-auto">
        <label htmlFor="sort" className="text-md font-medium text-[#d4d4d4]">
          Sort by:
        </label>
        <select
          id="sort"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortBy)}
          className="w-full sm:w-auto p-2 bg-[#252526] border border-gray-600 rounded-md focus:ring-2 focus:ring-[#569CD6] text-[#d4d4d4]"
          disabled={loading}
        >
          <option value="downloads">Most Downloaded</option>
          <option value="growth">Trending</option>
          <option value="dependents">Most Dependents</option>
        </select>
      </div>

      {/* Dependency Filter Input */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full md:w-auto">
        <label
          htmlFor="dependsOn"
          className="text-md font-medium text-[#d4d4d4]"
        >
          Depends on:
        </label>
        <div className="flex items-center">
          <input
            type="text"
            id="dependsOn"
            value={localDependsOn}
            onChange={(e) => setLocalDependsOn(e.target.value)}
            placeholder="e.g., react"
            className="w-full sm:w-auto p-2 bg-[#252526] border border-gray-600 rounded-md focus:ring-2 focus:ring-[#569CD6] text-[#d4d4d4]"
            disabled={loading}
          />
          <button
            type="button"
            onClick={handleApply}
            disabled={loading}
            className="ml-2 p-2 bg-[#252526] border border-gray-600 rounded-md focus:ring-2 focus:ring-[#569CD6] text-[#d4d4d4]"
          >
            {/* You can replace the text with an icon if preferred */}
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default Filters;
