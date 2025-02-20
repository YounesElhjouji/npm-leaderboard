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
  return (
    <div className="flex flex-col md:flex-row items-center justify-between mb-4">
      {/* Sort Dropdown */}
      <div className="flex items-center space-x-2">
        <label htmlFor="sort" className="text-md font-medium text-[#d4d4d4]">
          Sort by:
        </label>
        <select
          id="sort"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortBy)}
          className="p-2 bg-[#252526] border border-gray-600 rounded-md focus:ring-2 focus:ring-[#569CD6] text-[#d4d4d4]"
          disabled={loading}
        >
          <option value="downloads">Most Downloaded</option>
          <option value="growth">Trending</option>
          <option value="dependents">Most Dependents</option>
        </select>
      </div>

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
          className="p-2 bg-[#252526] border border-gray-600 rounded-md focus:ring-2 focus:ring-[#569CD6] text-[#d4d4d4]"
          disabled={loading}
        />
      </div>
    </div>
  );
};

export default Filters;
