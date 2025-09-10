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
// Use a chat-capable Sonar model. "sonar-small-chat" tends to be fast/cost-effective.
const MODEL = "sonar";

// Utility: shallow redact for logs
function redact(input: unknown, maxLen = 300): string {
  try {
    const s = typeof input === "string" ? input : JSON.stringify(input);
    if (!s) return "";
    return s.length > maxLen ? s.slice(0, maxLen) + " …[truncated]" : s;
  } catch {
    return "[unserializable]";
  }
}

// Generate a simple request ID for correlation
function reqId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Timeout helper
function withTimeout<T>(p: Promise<T>, ms: number, name = "op"): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${name} timed out`)), ms);
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

function sanitizeQuery(q: unknown): string {
  if (typeof q !== "string") return "";
  let s = q.trim();
  // Bound size to protect downstream API and logs
  if (s.length > 800) s = s.slice(0, 800);
  return s;
}

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

export async function POST(request: Request) {
  const rid = reqId();
  const t0 = Date.now();

  try {
    const reqBody = await request.json().catch(() => ({}));
    const query = sanitizeQuery((reqBody as any).query);

    // Basic request log
    console.info(
      JSON.stringify({
        rid,
        event: "smart_search_request",
        query: redact(query, 500),
      }),
    );

    if (!query) {
      console.info(
        JSON.stringify({
          rid,
          event: "smart_search_early_return",
          reason: "empty_query",
        }),
      );
      return NextResponse.json(
        { packages: [], otherPackages: [] },
        { status: 200 },
      );
    }

    // Use secure server-side key, not NEXT_PUBLIC
    const apiKey = process.env.NEXT_PUBLIC_PPLX_API_KEY;
    if (!apiKey) {
      console.error(
        JSON.stringify({
          rid,
          event: "smart_search_config_error",
          message: "Perplexity API key not configured",
        }),
      );
      return NextResponse.json(
        { error: "Perplexity API key not configured" },
        { status: 500 },
      );
    }

    const pplxBody = {
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

    const aiStart = Date.now();
    const pplxRes = await withTimeout(
      fetch(PPLX_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(pplxBody),
      }),
      15000,
      "perplexity",
    );
    const aiLatency = Date.now() - aiStart;

    if (!pplxRes.ok) {
      const text = await pplxRes.text().catch(() => "");
      console.error(
        JSON.stringify({
          rid,
          event: "smart_search_ai_http_error",
          status: pplxRes.status,
          details: redact(text),
          latency_ms: aiLatency,
        }),
      );
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
    } catch (e) {
      console.error(
        JSON.stringify({
          rid,
          event: "smart_search_ai_parse_error",
          content_preview: redact(content),
          error: (e as Error)?.message || "parse_error",
        }),
      );
      packageNames = [];
    }

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

    console.info(
      JSON.stringify({
        rid,
        event: "smart_search_ai_result",
        count_raw: packageNames.length,
        count_unique: uniqueNames.length,
        names_preview: uniqueNames.slice(0, 10),
        ai_latency_ms: aiLatency,
      }),
    );

    if (uniqueNames.length === 0) {
      const totalMs = Date.now() - t0;
      console.info(
        JSON.stringify({
          rid,
          event: "smart_search_done",
          status: "ok",
          packages_count: 0,
          other_count: 0,
          duration_ms: totalMs,
        }),
      );
      return NextResponse.json(
        { packages: [], otherPackages: [] },
        { status: 200 },
      );
    }

    // Mongo lookup
    const dbStart = Date.now();
    const client = await clientPromise;
    const db = client.db("npm-leaderboard");

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
    const dbLatency = Date.now() - dbStart;

    const foundSet = new Set(dbDocs.map((d) => d.name));
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

      const npmStart = Date.now();
      const workers = Array.from({
        length: Math.min(concurrency, queue.length),
      }).map(() => worker());

      await Promise.race([
        Promise.allSettled(workers),
        new Promise((resolve) => {
          abort.signal.addEventListener("abort", resolve, { once: true });
        }),
      ]);
      const npmLatency = Date.now() - npmStart;

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

      console.info(
        JSON.stringify({
          rid,
          event: "smart_search_npm_lookup",
          missing_count: missing.length,
          resolved_count: otherPackages.length,
          npm_latency_ms: npmLatency,
        }),
      );
    }

    // Preserve AI order for DB packages
    const dbOrder = new Map<string, number>();
    uniqueNames.forEach((n, i) => dbOrder.set(n, i));
    const orderedDbPackages = dbDocs.slice().sort((a, b) => {
      const ia = dbOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER;
      const ib = dbOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });

    const totalMs = Date.now() - t0;
    console.info(
      JSON.stringify({
        rid,
        event: "smart_search_done",
        status: "ok",
        packages_count: orderedDbPackages.length,
        other_count: otherPackages.length,
        ai_latency_ms: aiLatency,
        db_latency_ms: dbLatency,
        duration_ms: totalMs,
      }),
    );

    return NextResponse.json(
      {
        packages: orderedDbPackages,
        otherPackages,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const totalMs = Date.now() - t0;
    const message =
      err instanceof Error ? err.message : "Unknown error in smart search";
    console.error(
      JSON.stringify({
        rid,
        event: "smart_search_error",
        status: "error",
        error: message,
        duration_ms: totalMs,
      }),
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
