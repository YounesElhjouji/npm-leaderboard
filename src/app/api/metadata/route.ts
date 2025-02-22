import { NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";

interface Settings {
  _id: string;
  date: string;
}

export async function GET(request: Request) { // eslint-disable-line @typescript-eslint/no-unused-vars
  const client = await clientPromise;
  const db = client.db("npm-leaderboard");

  // Tell TypeScript that the document _id is a string.
  const settings = await db
    .collection<Settings>("settings")
    .findOne({ _id: "lastSync" });

  // Return the date or null if not set.
  return NextResponse.json({ lastSync: settings?.date || null });
}
