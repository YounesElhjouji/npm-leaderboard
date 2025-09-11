import { NextResponse } from "next/server";
import clientPromise from "../../../../lib/mongodb";
import {
  getRedis,
  normalizeQuery,
  cacheGet,
  cacheSet,
  cooldownCheckAndSet,
  hourlyCheckAndIncrement,
  circuitCheckAndIncrement,
  auditLog,
} from "../../../lib/redis-smart-search";

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
const DEFAULT_MODEL = "sonar";
const PPLX_MODEL = process.env.PPLX_MODEL || DEFAULT_MODEL;

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
    "- Return at most 20 names.",
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
        maxItems: 20,
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

// Helper to compute ISO timestamp in the future
function isoAfterSeconds(sec: number): string {
  return new Date(Date.now() + Math.max(0, sec) * 1000).toISOString();
}

export async function POST(request: Request) {
  const rid = reqId();
  const t0 = Date.now();

  // Extract IP best-effort
  const ipHeader =
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "";
  const ip = ipHeader || "unknown";

  const cooldownSec =
    parseInt(process.env.SMART_SEARCH_COOLDOWN_SEC || "3", 10) || 3;
  const pplxTimeout =
    parseInt(process.env.SMART_SEARCH_PERPLEXITY_TIMEOUT_MS || "15000", 10) ||
    15000;
  const npmFallbackTimeout =
    parseInt(process.env.SMART_SEARCH_NPM_FALLBACK_TIMEOUT_MS || "12000", 10) ||
    12000;
  const hourlyLimit = parseInt(
    process.env.SMART_SEARCH_HOURLY_LIMIT || "5",
    10,
  );

  try {
    const reqBody = await request.json().catch(() => ({}));
    const rawQuery = sanitizeQuery((reqBody as any).query);
    const queryNorm = normalizeQuery(rawQuery);

    // Basic request log
    console.info(
      JSON.stringify({
        rid,
        event: "smart_search_request",
        ip,
        query: redact(rawQuery, 500),
        query_norm: queryNorm,
      }),
    );

    if (!rawQuery) {
      const totalMs = Date.now() - t0;
      await auditLog({
        rid,
        ts: Date.now(),
        ip,
        query_norm: queryNorm,
        status: 200,
        latency_ms: totalMs,
        cache: "none",
        pkg_count: 0,
        other_count: 0,
        note: "empty_query",
      });
      return NextResponse.json(
        {
          packages: [],
          otherPackages: [],
          meta: {
            rid,
            counts: { packages: 0, otherPackages: 0, total: 0 },
            quota: {
              // We cannot increment counters on empty query; return static info
              allowedPerHour: hourlyLimit,
              usedThisHour: 0,
              remainingThisHour: hourlyLimit,
              resetAtIso: null,
              userScoped: true,
            },
          },
        },
        { status: 200 },
      );
    }

    // Ensure Redis is initialized (best-effort)
    await getRedis().catch(() => {});

    // Cooldown per IP
    const cd = await cooldownCheckAndSet(ip, cooldownSec).catch(() => ({
      active: false,
      ttl: cooldownSec,
    }));
    if (cd.active) {
      const totalMs = Date.now() - t0;
      await auditLog({
        rid,
        ts: Date.now(),
        ip,
        query_norm: queryNorm,
        status: 429,
        latency_ms: totalMs,
        cache: "none",
        error_code: "cooldown",
        retry_after_sec: cd.ttl,
      });

      // Include enriched rate-limit info
      const payload = {
        error: "rate_limited",
        message: "Please wait a few seconds before trying again.",
        kind: "cooldown" as const,
        retryAfterSec: cd.ttl,
        resetAtIso: isoAfterSeconds(cd.ttl),
        allowedPerHour: hourlyLimit,
        remainingRequests: undefined as number | undefined, // cooldown is short; remaining is not meaningful here
        userScoped: true,
        rid,
      };
      const resp = NextResponse.json(payload, { status: 429 });
      resp.headers.set("Retry-After", String(cd.ttl));
      return resp;
    }

    // Hourly limit per IP (strict, atomic)
    const hourly = await hourlyCheckAndIncrement(ip).catch(() => ({
      allowed: true,
      remaining: 0,
      resetSec: 30,
      count: 0,
    }));

    // NEW: human-readable hourly usage log (plus structured fields)
    console.info(
      JSON.stringify({
        rid,
        event: "smart_search_hourly_progress",
        message: `request from user with ip ${ip} ${hourly.count}/${hourlyLimit} so far in this hour`,
        ip,
        count: hourly.count,
        limit: hourlyLimit,
        resetSec: hourly.resetSec,
      }),
    );

    if (!hourly.allowed) {
      const totalMs = Date.now() - t0;
      console.info(
        JSON.stringify({
          rid,
          event: "smart_search_hourly_block",
          ip,
          count: hourly.count,
          limit: hourlyLimit,
          resetSec: hourly.resetSec,
        }),
      );
      await auditLog({
        rid,
        ts: Date.now(),
        ip,
        query_norm: queryNorm,
        status: 429,
        latency_ms: totalMs,
        cache: "none",
        error_code: "hourly_limit",
        retry_after_sec: hourly.resetSec,
        count: hourly.count,
      });

      // Enriched hourly rate limit info
      const remainingRequests = 0;
      const payload = {
        error: "rate_limited",
        message: "Hourly limit reached. Try again later.",
        kind: "hourly_limit" as const,
        retryAfterSec: hourly.resetSec,
        resetAtIso: isoAfterSeconds(hourly.resetSec),
        allowedPerHour: hourlyLimit,
        remainingRequests,
        userScoped: true,
        rid,
      };
      const resp = NextResponse.json(payload, { status: 429 });
      resp.headers.set("Retry-After", String(hourly.resetSec));
      return resp;
    }

    // Optional global circuit breaker (daily)
    const circuit = await circuitCheckAndIncrement().catch(() => ({
      allowed: true,
      remaining: 0,
      count: 0,
      resetSec: undefined as number | undefined,
    }));
    if (!circuit.allowed) {
      const totalMs = Date.now() - t0;
      await auditLog({
        rid,
        ts: Date.now(),
        ip,
        query_norm: queryNorm,
        status: 503,
        latency_ms: totalMs,
        cache: "none",
        error_code: "circuit_breaker",
        count: circuit.count,
      });

      // Daily/global limit payload
      const retryAfterSec =
        typeof circuit.remaining === "number" && circuit.remaining > 0
          ? circuit.remaining
          : 60 * 60 * 24; // fallback 24h if not provided
      return NextResponse.json(
        {
          error: "unavailable",
          message:
            "Smart Search daily capacity reached. Please use classic filters and try again later.",
          kind: "daily_limit",
          retryAfterSec,
          resetAtIso: isoAfterSeconds(retryAfterSec),
          allowedPerHour: hourlyLimit, // still report per-user quota
          remainingRequests: 0,
          userScoped: false,
          rid,
        },
        { status: 503 },
      );
    }

    // Cache lookup (normalized query)
    let cached = await cacheGet<any>(queryNorm).catch(() => null);
    if (cached) {
      const totalMs = Date.now() - t0;

      // Attach quota meta so frontend can display "x/y until time"
      const usedThisHour = typeof hourly.count === "number" ? hourly.count : 0;
      const remainingThisHour = Math.max(0, hourlyLimit - usedThisHour);
      cached.meta = {
        ...(cached.meta || {}),
        rid,
        counts: cached.meta?.counts,
        cache: "hit",
        quota: {
          allowedPerHour: hourlyLimit,
          usedThisHour,
          remainingThisHour,
          resetAtIso: isoAfterSeconds(hourly.resetSec ?? 0),
          userScoped: true,
        },
      };

      console.info(
        JSON.stringify({
          rid,
          event: "smart_search_cache_hit",
          packages_count: cached?.packages?.length ?? 0,
          other_count: cached?.otherPackages?.length ?? 0,
          duration_ms: totalMs,
        }),
      );
      await auditLog({
        rid,
        ts: Date.now(),
        ip,
        query_norm: queryNorm,
        status: 200,
        latency_ms: totalMs,
        cache: "hit",
        pkg_count: cached?.packages?.length ?? 0,
        other_count: cached?.otherPackages?.length ?? 0,
      });

      const packagesLen = cached?.packages?.length ?? 0;
      const otherLen = cached?.otherPackages?.length ?? 0;
      return NextResponse.json(
        {
          ...cached,
          meta: {
            ...(cached.meta || {}),
            rid,
            counts: {
              packages: packagesLen,
              otherPackages: otherLen,
              total: packagesLen + otherLen,
            },
            cache: "hit",
            quota: cached.meta?.quota,
          },
        },
        { status: 200 },
      );
    }

    // Use secure server-side key
    const apiKey = process.env.PPLX_API_KEY;
    if (!apiKey) {
      console.error(
        JSON.stringify({
          rid,
          event: "smart_search_config_error",
          message: "Perplexity API key not configured",
        }),
      );
      const totalMs = Date.now() - t0;
      await auditLog({
        rid,
        ts: Date.now(),
        ip,
        query_norm: queryNorm,
        status: 500,
        latency_ms: totalMs,
        cache: "none",
        error_code: "config_missing",
      });
      return NextResponse.json(
        {
          error: "Perplexity API key not configured",
          rid,
          meta: {
            quota: {
              allowedPerHour: hourlyLimit,
              usedThisHour: typeof hourly.count === "number" ? hourly.count : 0,
              remainingThisHour: Math.max(
                0,
                hourlyLimit -
                  (typeof hourly.count === "number" ? hourly.count : 0),
              ),
              resetAtIso: isoAfterSeconds(hourly.resetSec ?? 0),
              userScoped: true,
            },
          },
        },
        { status: 500 },
      );
    }

    const pplxBody = {
      model: PPLX_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(rawQuery) },
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
      pplxTimeout,
      "perplexity",
    ).catch((e) => {
      throw new Error(
        `Perplexity error: ${e instanceof Error ? e.message : "unknown"}`,
      );
    });
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
      // If cache exists (race), serve it; else 502
      cached = await cacheGet<any>(queryNorm).catch(() => null);
      if (cached) {
        const totalMs = Date.now() - t0;

        const usedThisHour =
          typeof hourly.count === "number" ? hourly.count : 0;
        const remainingThisHour = Math.max(0, hourlyLimit - usedThisHour);

        await auditLog({
          rid,
          ts: Date.now(),
          ip,
          query_norm: queryNorm,
          status: 200,
          latency_ms: totalMs,
          cache: "hit_stale",
          note: "served_stale_on_ai_error",
        });
        return NextResponse.json(
          {
            ...cached,
            meta: {
              ...(cached.meta || {}),
              rid,
              cache: "hit_stale",
              quota: {
                allowedPerHour: hourlyLimit,
                usedThisHour,
                remainingThisHour,
                resetAtIso: isoAfterSeconds(hourly.resetSec ?? 0),
                userScoped: true,
              },
            },
          },
          { status: 200 },
        );
      }
      const totalMs = Date.now() - t0;
      await auditLog({
        rid,
        ts: Date.now(),
        ip,
        query_norm: queryNorm,
        status: 502,
        latency_ms: totalMs,
        cache: "miss",
        error_code: "ai_http",
      });
      return NextResponse.json(
        {
          error: "Perplexity API error",
          details: text,
          rid,
          meta: {
            quota: {
              allowedPerHour: hourlyLimit,
              usedThisHour: typeof hourly.count === "number" ? hourly.count : 0,
              remainingThisHour: Math.max(
                0,
                hourlyLimit -
                  (typeof hourly.count === "number" ? hourly.count : 0),
              ),
              resetAtIso: isoAfterSeconds(hourly.resetSec ?? 0),
              userScoped: true,
            },
          },
        },
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

    // Normalize and dedupe while preserving order and enforcing ≤20
    const seen = new Set<string>();
    const uniqueNames: string[] = [];
    for (const n of packageNames) {
      if (typeof n !== "string") continue;
      const trimmed = n.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueNames.push(trimmed);
      }
      if (uniqueNames.length >= 20) break;
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

      const usedThisHour = typeof hourly.count === "number" ? hourly.count : 0;
      const remainingThisHour = Math.max(0, hourlyLimit - usedThisHour);

      await auditLog({
        rid,
        ts: Date.now(),
        ip,
        query_norm: queryNorm,
        status: 200,
        latency_ms: totalMs,
        cache: "miss",
        pkg_count: 0,
        other_count: 0,
        note: "no_ai_names",
      });
      return NextResponse.json(
        {
          packages: [],
        },
        {
          status: 200,
          headers: {},
        },
      ).json
        ? NextResponse.json(
            {
              packages: [],
              otherPackages: [],
              meta: {
                rid,
                counts: { packages: 0, otherPackages: 0, total: 0 },
                cache: "miss",
                quota: {
                  allowedPerHour: hourlyLimit,
                  usedThisHour,
                  remainingThisHour,
                  resetAtIso: isoAfterSeconds(hourly.resetSec ?? 0),
                  userScoped: true,
                },
              },
            },
            { status: 200 },
          )
        : NextResponse.json(
            {
              packages: [],
              otherPackages: [],
              meta: {
                rid,
                counts: { packages: 0, otherPackages: 0, total: 0 },
                cache: "miss",
                quota: {
                  allowedPerHour: hourlyLimit,
                  usedThisHour,
                  remainingThisHour,
                  resetAtIso: isoAfterSeconds(hourly.resetSec ?? 0),
                  userScoped: true,
                },
              },
            },
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
      const timeoutId = setTimeout(
        () => abort.abort(),
        npmFallbackTimeout, // 12s default for fallbacks
      );

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

    const packagesLen = orderedDbPackages.length;
    const otherLen = otherPackages.length;

    // Build response with meta, counts, and quota
    const usedThisHour = typeof hourly.count === "number" ? hourly.count : 0;
    const remainingThisHour = Math.max(0, hourlyLimit - usedThisHour);

    const responsePayload = {
      packages: orderedDbPackages,
      otherPackages,
      meta: {
        rid,
        cache: "miss",
        counts: {
          packages: packagesLen,
          otherPackages: otherLen,
          total: packagesLen + otherLen,
        },
        timings: {
          aiLatencyMs: aiLatency,
          dbLatencyMs: dbLatency,
          totalMs: Date.now() - t0,
        },
        quota: {
          allowedPerHour: hourlyLimit,
          usedThisHour,
          remainingThisHour,
          resetAtIso: isoAfterSeconds(hourly.resetSec ?? 0),
          userScoped: true,
        },
      },
    };

    // Cache the payload (best-effort)
    await cacheSet(queryNorm, responsePayload).catch(() => {});

    const totalMs = Date.now() - t0;
    console.info(
      JSON.stringify({
        rid,
        event: "smart_search_done",
        status: "ok",
        packages_count: packagesLen,
        other_count: otherLen,
        ai_latency_ms: aiLatency,
        db_latency_ms: dbLatency,
        duration_ms: totalMs,
      }),
    );
    await auditLog({
      rid,
      ts: Date.now(),
      ip,
      query_norm: queryNorm,
      status: 200,
      latency_ms: totalMs,
      cache: "miss",
      pkg_count: packagesLen,
      other_count: otherLen,
    });

    return NextResponse.json(responsePayload, { status: 200 });
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
    await auditLog({
      rid,
      ts: Date.now(),
      ip,
      status: 500,
      latency_ms: totalMs,
      cache: "none",
      error_code: "server_error",
      error: message,
    });
    return NextResponse.json({ error: message, rid }, { status: 500 });
  }
}
