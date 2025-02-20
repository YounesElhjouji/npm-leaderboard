import { NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sortBy = searchParams.get("sortBy") || "downloads";
  const dependsOn = searchParams.get("dependsOn") || "";

  // Build filter query: if a dependency is specified, filter for packages that include it.
  const query: any = {};
  if (dependsOn) {
    query.$or = [
      { dependencies: { $in: [dependsOn] } },
      { peerDependencies: { $in: [dependsOn] } },
    ];
  }

  let sortCriteria = {};
  if (sortBy === "downloads") {
    sortCriteria = { "downloads.total": -1 };
  } else if (sortBy === "dependents") {
    sortCriteria = { dependent_packages_count: -1 };
  }

  const client = await clientPromise;
  const db = client.db("npm-leaderboard");

  let packages;
  if (sortBy === "growth") {
    // Aggregation pipeline to compute average weekly percentage growth excluding the last week.
    const pipeline = [];
    if (Object.keys(query).length > 0) {
      pipeline.push({ $match: query });
    }
    pipeline.push(
      // Create an array of weekly download numbers.
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
      // Exclude the last week (which may have fewer than 7 days)
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
      // Compute percentage growth for each full week relative to the previous week.
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
                    $multiply: [
                      {
                        $divide: [
                          {
                            $subtract: [
                              { $arrayElemAt: ["$fullWeeklyDownloads", "$$i"] },
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
              [],
            ],
          },
        },
      },
      // Calculate the average percentage growth.
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
    packages = await db.collection("packages").aggregate(pipeline).toArray();
  } else {
    packages = await db
      .collection("packages")
      .find(query)
      .sort(sortCriteria)
      .limit(100)
      .toArray();
  }

  return NextResponse.json({ packages });
}
