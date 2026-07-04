import { describe, expect, test } from 'bun:test'
import {
  resolveBaseUrl,
  resolveCacheOptions,
  resolveLogger,
  resolveRateLimiterOptions,
  resolveRetryOptions,
} from '../../src/client/config'
import { MemoryCache } from '../../src/core/cache/memory-cache'
import { LogLevel, noopLogger } from '../../src/core/logger'
import { DEFAULT_BASE_URL } from '../../src/endpoints/endpoint'

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
