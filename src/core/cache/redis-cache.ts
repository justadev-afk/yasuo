import type { CachedResult, CacheStore } from './cache-store'

/**
 * A minimal Redis client shape compatible with `ioredis` and Bun's `RedisClient`
 * (`set(key, value, 'PX', ttlMs)`). node-redis v4 users can pass a small
 * adapter.
 */
export interface RedisClientLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode: 'PX', ttl: number): Promise<unknown>
  del(key: string): Promise<unknown>
}

/** Options for a {@link RedisCache}. */
export interface RedisCacheOptions {
  /** Key prefix applied to every entry. Default `yasuo:`. */
  keyPrefix?: string
}

/**
 * A {@link CacheStore} backed by a Redis-compatible client. Values are stored
 * as JSON with a native Redis TTL, so multiple processes share the cache.
 *
 * @example
 * ```ts
 * import Redis from 'ioredis'
 * const cache = new RedisCache(new Redis(process.env.REDIS_URL))
 * const yasuo = new Yasuo({ key, cache: { store: cache, ttlMs: 60_000 } })
 * ```
 */
export class RedisCache implements CacheStore {
  private readonly keyPrefix: string

  constructor(
    private readonly client: RedisClientLike,
    options: RedisCacheOptions = {},
  ) {
    this.keyPrefix = options.keyPrefix ?? 'yasuo:'
  }

  private prefixed(key: string): string {
    return `${this.keyPrefix}${key}`
  }

  async get(key: string): Promise<CachedResult | undefined> {
    const raw = await this.client.get(this.prefixed(key))
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
    await this.client.set(this.prefixed(key), JSON.stringify(value), 'PX', Math.ceil(ttlMs))
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.prefixed(key))
  }

  async clear(): Promise<void> {
    // Intentionally unsupported: clearing a shared Redis instance is dangerous.
    // Delete specific keys, or flush the database out-of-band.
    throw new Error('RedisCache.clear() is not supported; delete specific keys instead')
  }
}
