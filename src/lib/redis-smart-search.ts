import crypto from "crypto";
import { createClient, RedisClientType } from "redis";

type NullableRedis = RedisClientType | null;

let redis: NullableRedis = null;
let initPromise: Promise<void> | null = null;

export async function getRedis(): Promise<NullableRedis> {
  if (redis) return redis;
  if (initPromise) {
    try {
      await initPromise;
      return redis;
    } catch {
      return null;
    }
  }
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const client: RedisClientType = createClient({ url });
  initPromise = client
    .connect()
    .then(() => {
      redis = client;
    })
    .catch(() => {
      redis = null;
    });
  try {
    await initPromise;
  } catch {
    // swallow
  }
  return redis;
}

export function normalizeQuery(q: string): string {
  const maxLen =
    parseInt(process.env.SMART_SEARCH_CACHE_MAX_QUERY_LEN || "256", 10) || 256;
  return q.toLowerCase().trim().replace(/\s+/g, " ").slice(0, maxLen);
}

export function cacheKeyFor(q: string): string {
  const h = crypto.createHash("sha256").update(q).digest("hex");
  return `smart:cache:q:${h}`;
}

export async function cacheGet<T extends object = Record<string, unknown>>(
  qNorm: string,
): Promise<T | null> {
  const r = await getRedis();
  if (!r) return null;
  const key = cacheKeyFor(qNorm);
  const s = await r.get(key);
  if (!s) return null;
  try {
    const parsed = JSON.parse(s) as unknown;
    // We trust the cache content to match T at runtime; TS will enforce at call sites
    return parsed as T;
  } catch {
    return null;
  }
}

export async function cacheSet(
  qNorm: string,
  payload: unknown,
  ttlSec?: number,
): Promise<void> {
  const r = await getRedis();
  if (!r) return;
  const key = cacheKeyFor(qNorm);
  const ttl =
    ttlSec ??
    (parseInt(process.env.SMART_SEARCH_CACHE_TTL_SEC || "43200", 10) || 43200);
  await r.set(key, JSON.stringify(payload), { EX: ttl });
}

export async function cooldownCheckAndSet(
  ip: string,
  cooldownSec?: number,
): Promise<{ active: boolean; ttl: number }> {
  const r = await getRedis();
  const ttlDefault =
    parseInt(process.env.SMART_SEARCH_COOLDOWN_SEC || "3", 10) || 3;
  const cd = typeof cooldownSec === "number" ? cooldownSec : ttlDefault;

  if (!r) return { active: false, ttl: cd };

  const key = `smart:cooldown:ip:${ip}`;
  const ttl = await r.ttl(key);
  if (ttl > 0) {
    return { active: true, ttl };
  }
  await r.set(key, "1", { EX: cd, NX: true });
  return { active: false, ttl: cd };
}

export function hourBucket(d: Date = new Date()): string {
  // UTC hour bucket
  return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

export function secondsUntilHourBoundary(d: Date = new Date()): number {
  const ms =
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours() + 1,
      0,
      0,
      0,
    ) - d.getTime();
  return Math.max(1, Math.ceil(ms / 1000));
}

// Strict mode: if true and Redis unavailable, deny instead of allow
function strictLimiter(): boolean {
  return (process.env.SMART_SEARCH_STRICT_LIMITER || "false").toLowerCase() ===
    "true"
    ? true
    : false;
}

export async function hourlyCheckAndIncrement(
  ip: string,
  limit?: number,
): Promise<{
  allowed: boolean;
  remaining: number;
  resetSec: number;
  count: number;
}> {
  const r = await getRedis();
  const lim = parseInt(process.env.SMART_SEARCH_HOURLY_LIMIT || "5", 10);
  const cap = typeof limit === "number" ? limit : lim;

  const now = new Date();
  const resetSec = secondsUntilHourBoundary(now);

  if (!r) {
    // If Redis missing: either allow (default) or deny in strict mode
    if (strictLimiter()) {
      return { allowed: false, remaining: 0, resetSec, count: cap + 1 };
    }
    return { allowed: true, remaining: cap, resetSec, count: 0 };
  }

  const key = `smart:hourly:ip:${ip}:${hourBucket(now)}`;
  const count = await r.incr(key);
  if (count === 1) {
    // ensure key goes away not long after the hour window
    await r.expire(key, 2 * 3600);
  }

  const allowed = count <= cap;
  const remaining = Math.max(0, cap - count);
  return { allowed, remaining, resetSec, count };
}

export function dayBucket(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function circuitCheckAndIncrement(
  cap?: number,
): Promise<{ allowed: boolean; remaining: number; count: number }> {
  const r = await getRedis();
  const c = parseInt(process.env.SMART_SEARCH_CIRCUIT_CAP || "200", 10);
  const limit = typeof cap === "number" ? cap : c;

  if (!r) {
    if (strictLimiter()) {
      return { allowed: false, remaining: 0, count: limit + 1 };
    }
    return { allowed: true, remaining: limit, count: 0 };
  }

  const key = `smart:circuit:${dayBucket()}`;
  const count = await r.incr(key);
  if (count === 1) {
    await r.expire(key, 48 * 3600);
  }
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    count,
  };
}

export async function auditLog(entry: Record<string, unknown>): Promise<void> {
  if ((process.env.SMART_SEARCH_AUDIT_ENABLED || "true") === "false") return;
  const r = await getRedis();
  if (!r) return;
  const stream = "smart:stream:audit";
  const maxlen =
    parseInt(process.env.SMART_SEARCH_AUDIT_MAXLEN || "20000", 10) || 20000;

  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(entry)) {
    fields[k] =
      typeof v === "string"
        ? v
        : v == null
          ? ""
          : typeof v === "number" || typeof v === "boolean"
            ? String(v)
            : JSON.stringify(v);
  }
  try {
    await r.xAdd(stream, "*", fields);
    await r.xTrim(stream, "MAXLEN", maxlen, { LIMIT: 0 });
  } catch {
    // best-effort
  }
}
