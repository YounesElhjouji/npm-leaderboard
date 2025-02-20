import React from "react";

const LoadingSkeleton = () => {
  // Create an array of 5 items for skeleton placeholders
  const skeletonCards = Array(6).fill(null);

  return (
    <div className="grid grid-cols-1 gap-3 animate-pulse">
      {skeletonCards.map((_, index) => (
        <div
          key={index}
          className="bg-[#252526] p-4 rounded shadow border border-gray-600"
        >
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            {/* Left side content */}
            <div className="flex-1">
              {/* Package name skeleton */}
              <div className="h-6 bg-gray-600 rounded w-48 mb-2"></div>

              {/* Description skeleton - two lines */}
              <div className="space-y-2 mb-4">
                <div className="h-4 bg-gray-600 rounded w-full"></div>
                <div className="h-4 bg-gray-600 rounded w-3/4"></div>
              </div>

              {/* Stats skeleton */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="h-4 bg-gray-600 rounded w-24"></div>
                <div className="h-4 bg-gray-600 rounded w-24"></div>
              </div>
            </div>

            {/* Right side - Graph skeleton */}
            <div className="w-60 mt-4 md:mt-0 h-24 bg-gray-600 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LoadingSkeleton;
