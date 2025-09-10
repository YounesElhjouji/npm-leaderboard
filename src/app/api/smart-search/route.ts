import { NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";

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

const PPLX_API_URL = "https://api.perplexity.ai/chat/completions";
const MODEL = "sonar";

// Timeout helper
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("Request timed out")), ms);
    p.then(
      (res) => {
        clearTimeout(id);
        resolve(res);
      },
      (err) => {
        clearTimeout(id);
        reject(err);
      },
    );
  });
}

function buildSystemPrompt() {
  return [
    "You are an assistant for npm package discovery.",
    "Your task is to return ONLY a JSON object with a single field 'packages' that is an array of npm package names (strings).",
    "Rules:",
    "- Consider only JavaScript/TypeScript npm packages for the Node.js/web ecosystem.",
    '- If the user query is not a description of a JavaScript/TypeScript npm package need, return {"packages": []}.',
    "- Do not include explanations, markdown, comments, or any extra fields.",
    "- Do not include duplicates.",
    "- Prefer actively maintained, widely used packages when relevant.",
  ].join("\n");
}

function buildUserPrompt(query: string) {
  return [
    `Return npm packages that satisfy: "${query}".`,
    'Output format: {"packages": ["express", "zod", "@tanstack/react-query"]}',
    'If the query is not about npm packages or cannot be satisfied, return {"packages": []}.',
  ].join("\n");
}

// JSON schema to constrain output to { packages: string[] }
const RESPONSE_JSON_SCHEMA = {
  name: "npm_packages_response",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      packages: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["packages"],
  },
};

// Encode npm scoped names for registry URL
function encodeNpmName(name: string) {
  return name.startsWith("@")
    ? "@" + encodeURIComponent(name.slice(1))
    : encodeURIComponent(name);
}

// Fetch minimal info from npm registry for a package name
async function fetchFromNpm(
  name: string,
  signal?: AbortSignal,
): Promise<{ name: string; description: string; link: string } | null> {
  const url = `https://registry.npmjs.org/${encodeNpmName(name)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;

  const data = await res.json();
  console.log("data", data);

  const latestVersion =
    data?.["dist-tags"]?.latest && data.versions?.[data["dist-tags"].latest];
  const description =
    latestVersion?.description ||
    data?.description ||
    (typeof data?.readme === "string" ? data.readme.slice(0, 160) : "") ||
    "";

  const link =
    latestVersion?.homepage ||
    (typeof data?.homepage === "string" ? data.homepage : undefined) ||
    `https://www.npmjs.com/package/${name}`;

  return {
    name,
    description: description || "",
    link,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("query") || "").trim();

    if (!query) {
      return NextResponse.json(
        { packages: [], otherPackages: [] },
        { status: 200 },
      );
    }

    const apiKey = process.env.NEXT_PUBLIC_PPLX_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Perplexity API key not configured" },
        { status: 500 },
      );
    }

    const body = {
      model: MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(query) },
      ],
      temperature: 0.2,
      max_tokens: 256,
      response_format: {
        type: "json_schema",
        json_schema: RESPONSE_JSON_SCHEMA,
      },
    };

    const pplxRes = await withTimeout(
      fetch(PPLX_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      }),
      15000,
    );

    if (!pplxRes.ok) {
      const text = await pplxRes.text().catch(() => "");
      return NextResponse.json(
        { error: "Perplexity API error", details: text },
        { status: 502 },
      );
    }

    const pplxJson = await pplxRes.json();
    const content: string = pplxJson?.choices?.[0]?.message?.content ?? "{}";

    // Parse {"packages": string[]}
    let packageNames: string[] = [];
    try {
      const parsed = JSON.parse(content);
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray(parsed.packages)
      ) {
        packageNames = parsed.packages;
      }
    } catch {
      packageNames = [];
    }
    console.log("package names", packageNames);

    // Normalize and dedupe while preserving order
    const seen = new Set<string>();
    const uniqueNames: string[] = [];
    for (const n of packageNames) {
      if (typeof n !== "string") continue;
      const trimmed = n.trim();
      if (!trimmed) continue;
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        uniqueNames.push(trimmed);
      }
    }

    if (uniqueNames.length === 0) {
      return NextResponse.json(
        { packages: [], otherPackages: [] },
        { status: 200 },
      );
    }

    // Mongo lookup
    const client = await clientPromise;
    const db = client.db("npm-leaderboard");

    // Exact match by name; switch to case-insensitive if needed
    const dbDocs = (await db
      .collection("packages")
      .find({ name: { $in: uniqueNames } })
      .project({
        _id: 1,
        name: 1,
        description: 1,
        link: 1,
        downloads: 1,
        dependent_packages_count: 1,
        dependent_repos_count: 1,
        avgGrowth: 1,
      })
      .toArray()) as NPMPackage[];

    // Map for quick membership check
    const foundSet = new Set(dbDocs.map((d) => d.name));

    // Compute missing names preserving order
    const missing = uniqueNames.filter((n) => !foundSet.has(n));

    // Fetch missing from npm registry with modest concurrency and overall timeout
    let otherPackages: Array<{
      name: string;
      description: string;
      link: string;
    }> = [];

    if (missing.length > 0) {
      const abort = new AbortController();
      const timeoutId = setTimeout(() => abort.abort(), 12000); // 12s overall for fallbacks

      const concurrency = 4;
      const queue = [...missing];
      const results: Array<{
        name: string;
        description: string;
        link: string;
      }> = [];

      async function worker() {
        while (queue.length > 0) {
          const pkg = queue.shift()!;
          try {
            const info = await fetchFromNpm(pkg, abort.signal);
            if (info) results.push(info);
          } catch {
            // ignore per-package failure
          }
        }
      }

      const workers = Array.from({
        length: Math.min(concurrency, queue.length),
      }).map(() => worker());

      // Wait for either completion or abort
      await Promise.race([
        Promise.allSettled(workers),
        new Promise((resolve) => {
          abort.signal.addEventListener("abort", resolve, { once: true });
        }),
      ]);

      clearTimeout(timeoutId);

      // Preserve AI order for otherPackages
      const byName = new Map<
        string,
        { name: string; description: string; link: string }
      >();
      for (const r of results) byName.set(r.name, r);
      otherPackages = missing
        .map((n) => byName.get(n))
        .filter(Boolean) as Array<{
          name: string;
          description: string;
          link: string;
        }>;
    }

    // Preserve AI order for DB packages
    const dbOrder = new Map<string, number>();
    uniqueNames.forEach((n, i) => dbOrder.set(n, i));
    const orderedDbPackages = dbDocs.slice().sort((a, b) => {
      const ia = dbOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER;
      const ib = dbOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });

    return NextResponse.json(
      {
        packages: orderedDbPackages,
        otherPackages,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown error in smart search";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
