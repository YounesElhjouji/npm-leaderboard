
import { NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";

export async function GET(request: Request) {
  const client = await clientPromise;
  const db = client.db("npm-leaderboard");
  const settings = await db.collection("settings").findOne({ _id: "lastSync" });

  // Return the date or null if not set.
  return NextResponse.json({ lastSync: settings?.date || null });
}
