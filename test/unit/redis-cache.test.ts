import { describe, expect, test } from 'bun:test'
import type { CachedResult } from '../../src/core/cache'
import { RedisCache } from '../../src/core/cache/redis-cache'
import type { RedisClientLike } from '../../src/core/cache/redis-cache'

interface SetCall {
  key: string
  value: string
  mode: string
  ttl: number
}

/** An in-memory stand-in for a Redis client that records its `set` calls. */
class FakeRedis implements RedisClientLike {
  readonly store = new Map<string, string>()
  readonly sets: SetCall[] = []
  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null)
  }
  set(key: string, value: string, mode: 'PX', ttl: number): Promise<unknown> {
    this.sets.push({ key, value, mode, ttl })
    this.store.set(key, value)
    return Promise.resolve('OK')
  }
  del(key: string): Promise<unknown> {
    this.store.delete(key)
    return Promise.resolve(1)
  }
}

const RESULT: CachedResult = {
  data: { puuid: 'p' },
  meta: {
    status: 200,
    rateLimits: { app: [], method: [], type: null, retryAfterSeconds: null, edgeTraceId: null },
    url: 'u',
    headers: {},
  },
}

describe('RedisCache', () => {
  test('set stores a prefixed, PX-expiring JSON value; get round-trips it', async () => {
    const redis = new FakeRedis()
    const cache = new RedisCache(redis)

    await cache.set('k', RESULT, 5000)
    expect(redis.sets[0]?.key).toBe('yasuo:k')
    expect(redis.sets[0]?.mode).toBe('PX')
    expect(redis.sets[0]?.ttl).toBe(5000)

    expect(await cache.get('k')).toEqual(RESULT)
  })

  test('get returns undefined on a miss and on malformed JSON', async () => {
    const redis = new FakeRedis()
    const cache = new RedisCache(redis)
    expect(await cache.get('missing')).toBeUndefined()

    redis.store.set('yasuo:bad', '{not json')
    expect(await cache.get('bad')).toBeUndefined()
  })

  test('set is a no-op when the TTL is non-positive', async () => {
    const redis = new FakeRedis()
    await new RedisCache(redis).set('k', RESULT, 0)
    expect(redis.sets.length).toBe(0)
  })

  test('a custom key prefix is applied', async () => {
    const redis = new FakeRedis()
    await new RedisCache(redis, { keyPrefix: 'app:' }).set('k', RESULT, 1000)
    expect(redis.sets[0]?.key).toBe('app:k')
  })

  test('delete removes the prefixed key', async () => {
    const redis = new FakeRedis()
    const cache = new RedisCache(redis)
    await cache.set('k', RESULT, 1000)
    await cache.delete('k')
    expect(await cache.get('k')).toBeUndefined()
  })

  test('clear is unsupported and throws', async () => {
    await expect(new RedisCache(new FakeRedis()).clear()).rejects.toThrow(/not supported/)
  })
})
