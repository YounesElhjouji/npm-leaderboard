import { NPMPackage } from "../types";
import PackageCard from "./PackageCard";
import LoadingSkeleton from "./LoadingSkeleton";

interface PackageListProps {
  packages: NPMPackage[];
  loading: boolean;
  showGrowth?: boolean;
}

const PackageList = ({
  packages,
  loading,
  showGrowth = false,
}: PackageListProps) => {
  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {packages.map((pkg) => (
        <PackageCard key={pkg._id} pkg={pkg} showGrowth={showGrowth} />
      ))}
    </div>
  );
};

export default PackageList;
