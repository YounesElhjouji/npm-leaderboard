import { NPMPackage } from "../types";
import LineGraph from "./LineGraph";

interface PackageCardProps {
  pkg: NPMPackage;
  showGrowth?: boolean;
}

const formatNumber = (num: number): string => {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return num.toString();
};

const PackageCard = ({ pkg, showGrowth = false }: PackageCardProps) => {
  return (
    <div className="w-full rounded border border-gray-600 bg-[#252526] p-4 shadow transition hover:shadow-lg">
      {" "}
      {/* Added w-full */}
      <div className="flex w-full flex-col items-start justify-between gap-6 md:flex-row">
        {" "}
        {/* Added w-full */}
        {/* Left: Name, Description, and Stats */}
        <div className="w-full flex-1">
          {" "}
          {/* Added w-full */}
          <h2 className="mb-1 w-full text-xl font-semibold">
            {" "}
            {/* Added w-full */}
            <a
              href={pkg.link}
              target="_blank"
              rel="noopener noreferrer"
              className="break-words text-[#569CD6] hover:underline" // Added break-words here as well for the title
            >
              {pkg.name}
            </a>
          </h2>
          <p className="mb-2 w-full break-words text-sm text-gray-400">
            {" "}
            {/* Added w-full */}
            {pkg.description}
          </p>
          <div className="flex w-full flex-wrap items-center gap-4">
            {" "}
            {/* Added w-full */}
            <div className="flex items-center gap-1 text-sm">
              <span className="font-medium text-gray-400">Downloads:</span>
              <span className="text-[#d4d4d4]">
                {formatNumber(pkg.downloads?.total ?? 0)}
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <span className="font-medium text-gray-400">Dependents:</span>
              <span className="text-[#d4d4d4]">
                {formatNumber(pkg.dependent_packages_count)}
              </span>
            </div>
            {pkg.avgGrowth !== undefined && showGrowth && (
              <div className="flex items-center gap-1 text-sm">
                <span className="font-medium text-gray-400">Growth Score:</span>
                <span className="text-[#d4d4d4]">
                  {pkg.avgGrowth.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        </div>
        {/* Right: Line Graph */}
        {pkg.downloads?.weekly_trends && (
          <div className="mt-4 w-full md:mt-0 md:w-60">
            <LineGraph data={pkg.downloads.weekly_trends} />
          </div>
        )}
      </div>
    </div>
  );
};

export default PackageCard;
