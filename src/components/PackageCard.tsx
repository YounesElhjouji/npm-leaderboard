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
    <div className="bg-[#252526] p-4 rounded shadow hover:shadow-lg transition border border-gray-600 w-full">
      {" "}
      {/* Added w-full */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-6 w-full">
        {" "}
        {/* Added w-full */}
        {/* Left: Name, Description, and Stats */}
        <div className="flex-1 w-full">
          {" "}
          {/* Added w-full */}
          <h2 className="text-xl font-semibold mb-1 w-full">
            {" "}
            {/* Added w-full */}
            <a
              href={pkg.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#569CD6] hover:underline break-words" // Added break-words here as well for the title
            >
              {pkg.name}
            </a>
          </h2>
          <p className="text-gray-400 mb-2 text-sm break-words w-full">
            {" "}
            {/* Added w-full */}
            {pkg.description}
          </p>
          <div className="flex flex-wrap items-center gap-4 w-full">
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
          <div className="w-full md:w-60 mt-4 md:mt-0">
            <LineGraph data={pkg.downloads.weekly_trends} />
          </div>
        )}
      </div>
    </div>
  );
};

export default PackageCard;
