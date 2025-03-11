import { NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";
import { Document, SortDirection } from "mongodb";

interface WeeklyTrend {
  week_ending: string;
  downloads: number;
}

interface NPMPackage {
  _id: unknown;
  downloads?: {
    total: number;
    weekly_trends: WeeklyTrend[];
  };
  dependent_packages_count: number;
  dependent_repos_count: number;
  avgGrowth?: number;
  link: string;
  name: string;
  description: string;
}
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sortBy = searchParams.get("sortBy") || "downloads";
  const dependsOn = searchParams.get("dependsOn") || "";
  const keywords = searchParams.get("keywords") || ""; // Space separated keywords
  const modifiedParam = searchParams.get("modified"); // Number of days as a string

  // Build the base query
  const query: Record<string, unknown> = {};
  if (dependsOn) {
    const regex = new RegExp(dependsOn, "i");
    query.$or = [
      { dependencies: { $in: [regex] } },
      { peerDependencies: { $in: [regex] } },
    ];
  }

  // If the modified parameter is provided and is a valid number > 0,
  // filter packages modified within that many days.
  if (modifiedParam) {
    const days = parseInt(modifiedParam, 10);
    if (!isNaN(days) && days > 0) {
      const thresholdDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      query["npm_timestamps.modified_at"] = {
        $gte: thresholdDate.toISOString(),
      };
    }
  }

  // --- New: Lenient keyword search ---
  // If keywords are provided, split by space and convert each into a regex.
  // This simple approach strips any trailing "s" and allows an optional "s".
  if (keywords) {
    const keywordArray = keywords.split(/\s+/).map((kw) => {
      // Remove trailing "s" to get a base form
      const base = kw.replace(/s$/i, "");
      // Create a regex that matches the base with an optional "s" at the end, case-insensitively
      return new RegExp(`^${base}s?$`, "i");
    });
    // Use $all to ensure that every keyword must be matched in the keywords array.
    query.keywords = { $all: keywordArray };
  }
  // --------------------------------

  let sortCriteria: Record<string, number> = {};
  if (sortBy === "downloads") {
    sortCriteria = { "downloads.total": -1 };
  } else if (sortBy === "dependents") {
    sortCriteria = { dependent_repos_count: -1 };
  }

  const client = await clientPromise;
  const db = client.db("npm-leaderboard");

  let packages: NPMPackage[] = [];
  if (sortBy === "growth") {
    const pipeline: Document[] = [];
    if (Object.keys(query).length > 0) {
      pipeline.push({ $match: query });
    }
    pipeline.push(
      {
        $match: {
          name: { $not: { $regex: "^@" } },
        },
      },
      {
        $addFields: {
          weeklyDownloads: {
            $map: {
              input: "$downloads.weekly_trends",
              as: "wt",
              in: "$$wt.downloads",
            },
          },
        },
      },
      {
        $addFields: {
          fullWeeklyDownloads: {
            $slice: [
              "$weeklyDownloads",
              0,
              { $subtract: [{ $size: "$weeklyDownloads" }, 1] },
            ],
          },
        },
      },
      {
        $addFields: {
          growthPercentages: {
            $cond: [
              { $gt: [{ $size: "$fullWeeklyDownloads" }, 1] },
              {
                $map: {
                  input: { $range: [1, { $size: "$fullWeeklyDownloads" }] },
                  as: "i",
                  in: {
                    $cond: {
                      if: {
                        $eq: [
                          {
                            $arrayElemAt: [
                              "$fullWeeklyDownloads",
                              { $subtract: ["$$i", 1] },
                            ],
                          },
                          0,
                        ],
                      },
                      then: 0,
                      else: {
                        $multiply: [
                          {
                            $divide: [
                              {
                                $subtract: [
                                  {
                                    $arrayElemAt: [
                                      "$fullWeeklyDownloads",
                                      "$$i",
                                    ],
                                  },
                                  {
                                    $arrayElemAt: [
                                      "$fullWeeklyDownloads",
                                      { $subtract: ["$$i", 1] },
                                    ],
                                  },
                                ],
                              },
                              {
                                $arrayElemAt: [
                                  "$fullWeeklyDownloads",
                                  { $subtract: ["$$i", 1] },
                                ],
                              },
                            ],
                          },
                          100,
                        ],
                      },
                    },
                  },
                },
              },
              [],
            ],
          },
        },
      },
      {
        $addFields: {
          avgGrowth: {
            $cond: [
              { $gt: [{ $size: "$growthPercentages" }, 0] },
              { $avg: "$growthPercentages" },
              0,
            ],
          },
        },
      },
      { $sort: { avgGrowth: -1 } },
      { $limit: 100 },
    );

    packages = (await db
      .collection("packages")
      .aggregate(pipeline)
      .toArray()) as NPMPackage[];
  } else {
    packages = (await db
      .collection("packages")
      .find(query)
      .sort(sortCriteria as unknown as [string, SortDirection])
      .limit(100)
      .toArray()) as NPMPackage[];
  }

  return NextResponse.json({ packages });
}
