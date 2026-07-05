import { describe, expect, test } from 'bun:test'
import {
  resolveBaseUrl,
  resolveCacheOptions,
  resolveLogger,
  resolveRateLimiterOptions,
  resolveRetryOptions,
} from '../../src/client/config'
import { KVCache } from '../../src/core/cache/kv-cache'
import { MemoryCache } from '../../src/core/cache/memory-cache'
import { DEFAULT_NAMESPACE_TTL_MS } from '../../src/core/cache/namespace-defaults'
import { RedisCache } from '../../src/core/cache/redis-cache'
import { LogLevel, noopLogger } from '../../src/core/logger'
import { DEFAULT_BASE_URL } from '../../src/endpoints/endpoint'
import { CacheNamespace } from '../../src/enums/cache-namespace'

describe('resolveRetryOptions', () => {
  test('applies defaults when omitted or true', () => {
    const defaults = resolveRetryOptions(undefined)
    expect(defaults).toEqual({
      enabled: true,
      maxAttempts: 3,
      maxRetryAfterSeconds: 120,
      retryOnServiceUnavailable: true,
      backoffBaseMs: 1000,
    })
    expect(resolveRetryOptions(true)).toEqual(defaults)
  })

  test('disables retries when false', () => {
    expect(resolveRetryOptions(false).enabled).toBe(false)
  })

  test('merges a partial override onto the defaults', () => {
    const resolved = resolveRetryOptions({ maxAttempts: 5, backoffBaseMs: 250 })
    expect(resolved.maxAttempts).toBe(5)
    expect(resolved.backoffBaseMs).toBe(250)
    expect(resolved.maxRetryAfterSeconds).toBe(120)
  })
})

describe('resolveRateLimiterOptions', () => {
  test('proactive limiting is OFF by default (undefined or false)', () => {
    expect(resolveRateLimiterOptions(undefined)).toEqual({ enabled: false })
    expect(resolveRateLimiterOptions(false)).toEqual({ enabled: false })
  })

  test('true enables the limiter', () => {
    expect(resolveRateLimiterOptions(true)).toEqual({ enabled: true })
  })

  test('an object keeps enabled true and spreads overrides', () => {
    const resolved = resolveRateLimiterOptions({ syncWithHeaders: false })
    expect(resolved.enabled).toBe(true)
    expect(resolved.syncWithHeaders).toBe(false)
  })
})

describe('resolveCacheOptions', () => {
  test('off by default', () => {
    expect(resolveCacheOptions(undefined).store).toBeNull()
    expect(resolveCacheOptions(false).store).toBeNull()
  })

  test('true yields an in-memory store with the default TTL', () => {
    const resolved = resolveCacheOptions(true)
    expect(resolved.store).toBeInstanceOf(MemoryCache)
    expect(resolved.ttlMs).toBe(60_000)
  })

  test('honours a custom store and TTL', () => {
    const store = new MemoryCache()
    const resolved = resolveCacheOptions({ store, ttlMs: 5000 })
    expect(resolved.store).toBe(store)
    expect(resolved.ttlMs).toBe(5000)
  })

  test('enabled:false keeps caching off but retains ttl', () => {
    const resolved = resolveCacheOptions({ enabled: false, ttlMs: 5000 })
    expect(resolved.store).toBeNull()
    expect(resolved.ttlMs).toBe(5000)
  })

  test('wraps a raw Cloudflare KV namespace in a KVCache', () => {
    const kv = {
      get: () => Promise.resolve(null),
      put: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    }
    expect(resolveCacheOptions({ store: kv }).store).toBeInstanceOf(KVCache)
  })

  test('wraps a raw Redis client in a RedisCache', () => {
    const redis = {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve('OK'),
      del: () => Promise.resolve(1),
    }
    expect(resolveCacheOptions({ store: redis }).store).toBeInstanceOf(RedisCache)
  })
})

describe('resolveCacheOptions namespaces', () => {
  test('cache:true resolves each namespace to its built-in default TTL', () => {
    const resolved = resolveCacheOptions(true)
    expect(resolved.enabled).toBe(true)
    expect(resolved.namespaces[CacheNamespace.LolMatch].ttlMs).toBe(
      DEFAULT_NAMESPACE_TTL_MS[CacheNamespace.LolMatch],
    )
    expect(resolved.namespaces[CacheNamespace.LolSpectator].ttlMs).toBe(10_000)
    expect(resolved.namespaces[CacheNamespace.RiotAccount].enabled).toBe(true)
  })

  test('off → store null and every namespace disabled', () => {
    const resolved = resolveCacheOptions(false)
    expect(resolved.store).toBeNull()
    expect(resolved.enabled).toBe(false)
    expect(resolved.namespaces[CacheNamespace.LolSummoner].enabled).toBe(false)
  })

  test('a global ttlMs overrides all namespace defaults', () => {
    const resolved = resolveCacheOptions({ ttlMs: 1000 })
    expect(resolved.namespaces[CacheNamespace.LolMatch].ttlMs).toBe(1000)
    expect(resolved.namespaces[CacheNamespace.LolSpectator].ttlMs).toBe(1000)
  })

  test('a per-namespace override wins over the global ttlMs', () => {
    const resolved = resolveCacheOptions({
      ttlMs: 1000,
      namespaces: { 'lol.match': { ttlMs: 5000 } },
    })
    expect(resolved.namespaces[CacheNamespace.LolMatch].ttlMs).toBe(5000)
    expect(resolved.namespaces[CacheNamespace.LolSummoner].ttlMs).toBe(1000)
  })

  test('per-namespace enabled:false disables only that namespace', () => {
    const resolved = resolveCacheOptions({ namespaces: { 'lol.spectator': { enabled: false } } })
    expect(resolved.namespaces[CacheNamespace.LolSpectator].enabled).toBe(false)
    expect(resolved.namespaces[CacheNamespace.LolMatch].enabled).toBe(true)
  })

  test('enabled:false still builds the ttl table but disables everything', () => {
    const resolved = resolveCacheOptions({ enabled: false, ttlMs: 2000 })
    expect(resolved.store).toBeNull()
    expect(resolved.namespaces[CacheNamespace.LolMatch].enabled).toBe(false)
    expect(resolved.namespaces[CacheNamespace.LolMatch].ttlMs).toBe(2000)
  })
})

describe('resolveLogger', () => {
  test('returns a custom logger verbatim', () => {
    expect(resolveLogger({ logger: noopLogger })).toBe(noopLogger)
  })

  test('builds a console logger from the log level when none is given', () => {
    const logger = resolveLogger({ logLevel: LogLevel.ERROR })
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')
  })
})

describe('resolveBaseUrl', () => {
  test('falls back to the Riot default host', () => {
    expect(resolveBaseUrl(undefined)).toBe(DEFAULT_BASE_URL)
  })

  test('returns a custom base url unchanged', () => {
    expect(resolveBaseUrl('https://proxy.local/{game}/{routing}')).toBe(
      'https://proxy.local/{game}/{routing}',
    )
  })
})
