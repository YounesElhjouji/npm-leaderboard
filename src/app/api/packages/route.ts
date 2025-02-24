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

  // Instead of "any", we use a generic object type for our query.
  const query: Record<string, unknown> = {};
  if (dependsOn) {
    query.$or = [
      { dependencies: { $in: [dependsOn] } },
      { peerDependencies: { $in: [dependsOn] } },
    ];
  }

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
                  input: {
                    $range: [1, { $size: "$fullWeeklyDownloads" }],
                  },
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

    // Use type assertion here to let TypeScript know the result matches NPMPackage[]
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
