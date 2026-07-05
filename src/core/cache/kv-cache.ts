import type { CachedResult, CacheStore } from './cache-store'

/**
 * A minimal shape compatible with a Cloudflare Workers **KV namespace** binding
 * (`env.MY_KV`). It intentionally covers only the three methods yasuo needs, so
 * you can pass the real binding directly — no `@cloudflare/workers-types`
 * dependency required — or emulate it with any store that speaks the same API.
 *
 * The real `put` accepts more options (`expiration`, `metadata`, …); this
 * narrower type is structurally assignable from the real binding.
 */
export interface KVNamespaceLike {
  /** Read a value as text. Resolves `null` on a miss or after expiry. */
  get(key: string): Promise<string | null>
  /** Write a value, optionally with a TTL in **seconds** (`expirationTtl`). */
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>
  /** Remove a single key. */
  delete(key: string): Promise<unknown>
}

/** Options for a {@link KVCache}. */
export interface KVCacheOptions {
  /** Key prefix applied to every entry. Default `yasuo:`. */
  keyPrefix?: string
}

/**
 * Cloudflare KV enforces a **minimum `expirationTtl` of 60 seconds**; shorter
 * TTLs are rejected. yasuo clamps up to this floor so a small `ttlMs` never
 * fails the write.
 */
const KV_MIN_TTL_SECONDS = 60

/**
 * A {@link CacheStore} backed by a Cloudflare Workers **KV namespace**. Values
 * are stored as JSON with a native KV TTL, so every Worker isolate and every
 * edge location shares the cache.
 *
 * KV expiry is second-granular with a 60-second floor, so sub-minute `ttlMs`
 * values are clamped up to 60s (see {@link KV_MIN_TTL_SECONDS}).
 *
 * @example
 * ```ts
 * // Inside a Cloudflare Worker — `env.RIOT_CACHE` is a KV binding.
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const yasuo = new Yasuo({
 *       key: env.RIOT_API_KEY,
 *       cache: { store: new KVCache(env.RIOT_CACHE), ttlMs: 300_000 },
 *     })
 *     // …
 *   },
 * }
 * ```
 */
export class KVCache implements CacheStore {
  private readonly keyPrefix: string

  constructor(
    private readonly namespace: KVNamespaceLike,
    options: KVCacheOptions = {},
  ) {
    this.keyPrefix = options.keyPrefix ?? 'yasuo:'
  }

  private prefixed(key: string): string {
    return `${this.keyPrefix}${key}`
  }

  async get(key: string): Promise<CachedResult | undefined> {
    const raw = await this.namespace.get(this.prefixed(key))
    if (raw === null) {
      return undefined
    }
    try {
      return JSON.parse(raw) as CachedResult
    } catch {
      return undefined
    }
  }

  async set(key: string, value: CachedResult, ttlMs: number): Promise<void> {
    if (ttlMs <= 0) {
      return
    }
    const expirationTtl = Math.max(KV_MIN_TTL_SECONDS, Math.ceil(ttlMs / 1000))
    await this.namespace.put(this.prefixed(key), JSON.stringify(value), { expirationTtl })
  }

  async delete(key: string): Promise<void> {
    await this.namespace.delete(this.prefixed(key))
  }

  async clear(): Promise<void> {
    // Intentionally unsupported: KV has no atomic flush, and clearing a shared
    // namespace is dangerous. List and delete specific keys out-of-band instead.
    throw new Error('KVCache.clear() is not supported; delete specific keys instead')
  }
}
