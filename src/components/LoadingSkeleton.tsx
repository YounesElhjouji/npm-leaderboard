import React from "react";

const LoadingSkeleton = () => {
  // Create an array of 6 items for skeleton placeholders
  const skeletonCards = Array(6).fill(null);

  return (
    <div className="grid animate-pulse grid-cols-1 gap-3">
      {skeletonCards.map((_, index) => (
        <div
          key={index}
          className="rounded border border-gray-600 bg-[#252526] p-4 shadow"
        >
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row">
            {/* Left side content */}
            <div className="flex-1">
              {/* Package name skeleton */}
              <div className="mb-2 h-6 w-48 rounded bg-gray-600"></div>

              {/* Description skeleton - two lines */}
              <div className="mb-4 space-y-2">
                <div className="h-4 w-full rounded bg-gray-600"></div>
                <div className="h-4 w-3/4 rounded bg-gray-600"></div>
              </div>

              {/* Stats skeleton */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="h-4 w-24 rounded bg-gray-600"></div>
                <div className="h-4 w-24 rounded bg-gray-600"></div>
              </div>
            </div>

            {/* Right side - Graph skeleton */}
            <div className="mt-4 h-24 w-full rounded bg-gray-600 md:mt-0 md:w-60"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LoadingSkeleton;
