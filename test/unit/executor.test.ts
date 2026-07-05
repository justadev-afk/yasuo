import { describe, expect, test } from 'bun:test'
import type { CachedResult, CacheStore } from '../../src/core/cache'
import { RequestExecutor } from '../../src/core/request/request-executor'
import type { Endpoint } from '../../src/endpoints/endpoint'
import { CacheNamespace } from '../../src/enums/cache-namespace'
import { Game } from '../../src/enums/game'
import { HttpHeader } from '../../src/enums/http'
import { ApiKeyMissingError, NotFoundError } from '../../src/errors'
import { MockHttpClient } from '../support/mock-http-client'

/** A {@link CacheStore} that records the TTL of every write, for assertions. */
class RecordingCache implements CacheStore {
  readonly sets: { key: string; ttlMs: number }[] = []
  private readonly map = new Map<string, CachedResult>()

  clear(): void {
    this.map.clear()
  }

  delete(key: string): void {
    this.map.delete(key)
  }

  get(key: string): CachedResult | undefined {
    return this.map.get(key)
  }

  set(key: string, value: CachedResult, ttlMs: number): void {
    this.sets.push({ key, ttlMs })
    this.map.set(key, value)
  }
}

const SUMMONER: Endpoint = {
  id: 'summoner.byPuuid',
  game: Game.LOL,
  path: 'summoner/v4/summoners/by-puuid/:puuid',
}

describe('RequestExecutor', () => {
  test('returns parsed data and meta on success', async () => {
    const http = new MockHttpClient([
      {
        status: 200,
        body: { puuid: 'abc', summonerLevel: 500 },
        headers: {
          [HttpHeader.APP_RATE_LIMIT]: '100:120',
          [HttpHeader.APP_RATE_LIMIT_COUNT]: '1:120',
        },
      },
    ])
    const executor = new RequestExecutor({ key: 'RGAPI-test', httpClient: http, rateLimit: false })
    const result = await executor.request<{ puuid: string }>('KR', SUMMONER, {
      pathParams: { puuid: 'abc' },
    })
    expect(result.data.puuid).toBe('abc')
    expect(result.meta.status).toBe(200)
    expect(result.meta.url).toContain('by-puuid/abc')
    expect(result.meta.rateLimits.app).toEqual([{ limit: 100, intervalSeconds: 120, count: 1 }])
  })

  test('sends the API key in the x-riot-token header', async () => {
    const http = new MockHttpClient([{ status: 200, body: {} }])
    const executor = new RequestExecutor({
      key: 'RGAPI-secret',
      httpClient: http,
      rateLimit: false,
    })
    await executor.request('KR', SUMMONER, { pathParams: { puuid: 'p' } })
    expect(http.requests[0]?.headers[HttpHeader.RIOT_TOKEN]).toBe('RGAPI-secret')
  })

  test('throws ApiKeyMissingError when no key is configured', async () => {
    const http = new MockHttpClient([{ status: 200, body: {} }])
    // An empty-string key is treated as missing (does not fall through to env).
    const executor = new RequestExecutor({ key: '', httpClient: http })
    await expect(
      executor.request('KR', SUMMONER, { pathParams: { puuid: 'p' } }),
    ).rejects.toBeInstanceOf(ApiKeyMissingError)
    expect(http.callCount).toBe(0)
  })

  test('throws a typed NotFoundError on 404', async () => {
    const http = new MockHttpClient([{ status: 404, body: { status: { message: 'not found' } } }])
    const executor = new RequestExecutor({
      key: 'RGAPI-test',
      httpClient: http,
      rateLimit: false,
      retry: false,
    })
    await expect(
      executor.request('KR', SUMMONER, { pathParams: { puuid: 'p' } }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  test('retries a 429 then succeeds', async () => {
    const http = new MockHttpClient([
      { status: 429, headers: {} },
      { status: 200, body: { ok: true } },
    ])
    const executor = new RequestExecutor({
      key: 'RGAPI-test',
      httpClient: http,
      rateLimit: false,
      retry: { enabled: true, maxAttempts: 3, backoffBaseMs: 1 },
    })
    const result = await executor.request<{ ok: boolean }>('KR', SUMMONER, {
      pathParams: { puuid: 'p' },
    })
    expect(result.data.ok).toBe(true)
    expect(http.callCount).toBe(2)
  })

  test('serves a cache hit without a second network call', async () => {
    const http = new MockHttpClient([{ status: 200, body: { puuid: 'cached' } }])
    const executor = new RequestExecutor({
      key: 'RGAPI-test',
      httpClient: http,
      rateLimit: false,
      cache: true,
    })
    const first = await executor.request<{ puuid: string }>('KR', SUMMONER, {
      pathParams: { puuid: 'p' },
    })
    const second = await executor.request<{ puuid: string }>('KR', SUMMONER, {
      pathParams: { puuid: 'p' },
    })
    expect(first.data.puuid).toBe('cached')
    expect(second.data.puuid).toBe('cached')
    expect(http.callCount).toBe(1)
  })
})

describe('RequestExecutor cache control', () => {
  function executorWith(store: CacheStore, responses: { status?: number; body?: unknown }[]) {
    const http = new MockHttpClient(responses)
    const executor = new RequestExecutor({
      key: 'RGAPI-test',
      httpClient: http,
      rateLimit: false,
      cache: { store },
    })
    return { http, executor }
  }

  test('applies the per-namespace default TTL on write', async () => {
    const store = new RecordingCache()
    const { executor } = executorWith(store, [{ status: 200, body: { ok: true } }])
    await executor.request('KR', SUMMONER, {
      pathParams: { puuid: 'p' },
      cacheNamespace: CacheNamespace.LolSummoner,
    })
    // lol.summoner → 5 minutes.
    expect(store.sets).toHaveLength(1)
    expect(store.sets[0]?.ttlMs).toBe(300_000)
  })

  test('falls back to the global default TTL when no namespace is given', async () => {
    const store = new RecordingCache()
    const { executor } = executorWith(store, [{ status: 200, body: { ok: true } }])
    await executor.request('KR', SUMMONER, { pathParams: { puuid: 'p' } })
    expect(store.sets[0]?.ttlMs).toBe(60_000)
  })

  test('execute cache:false skips the read but still writes (force refresh)', async () => {
    const store = new RecordingCache()
    const { http, executor } = executorWith(store, [
      { status: 200, body: { puuid: 'a' } },
      { status: 200, body: { puuid: 'b' } },
    ])
    const opts = { pathParams: { puuid: 'p' }, cacheNamespace: CacheNamespace.LolSummoner }
    const first = await executor.request<{ puuid: string }>('KR', SUMMONER, opts)
    const second = await executor.request<{ puuid: string }>('KR', SUMMONER, {
      ...opts,
      cache: false,
    })
    expect(first.data.puuid).toBe('a')
    // Not served from cache — a fresh network response.
    expect(second.data.puuid).toBe('b')
    expect(http.callCount).toBe(2)
    // Both calls wrote, so the entry is now refreshed.
    expect(store.sets).toHaveLength(2)
  })

  test('execute cache.ttlMs overrides the write TTL', async () => {
    const store = new RecordingCache()
    const { executor } = executorWith(store, [{ status: 200, body: { ok: true } }])
    await executor.request('KR', SUMMONER, {
      pathParams: { puuid: 'p' },
      cacheNamespace: CacheNamespace.LolMatch,
      cache: { ttlMs: 5_000 },
    })
    expect(store.sets[0]?.ttlMs).toBe(5_000)
  })

  test('a namespace disabled in config is never read nor written', async () => {
    const store = new RecordingCache()
    const http = new MockHttpClient([{ status: 200, body: { ok: true } }])
    const executor = new RequestExecutor({
      key: 'RGAPI-test',
      httpClient: http,
      rateLimit: false,
      cache: { store, namespaces: { 'lol.spectator': { enabled: false } } },
    })
    const opts = { pathParams: { puuid: 'p' }, cacheNamespace: CacheNamespace.LolSpectator }
    await executor.request('KR', SUMMONER, opts)
    await executor.request('KR', SUMMONER, opts)
    expect(http.callCount).toBe(2)
    expect(store.sets).toHaveLength(0)
  })

  test('execute cache:true forces caching on an otherwise-disabled namespace', async () => {
    const store = new RecordingCache()
    const http = new MockHttpClient([{ status: 200, body: { ok: true } }])
    const executor = new RequestExecutor({
      key: 'RGAPI-test',
      httpClient: http,
      rateLimit: false,
      cache: { store, namespaces: { 'lol.spectator': { enabled: false } } },
    })
    const opts = {
      pathParams: { puuid: 'p' },
      cacheNamespace: CacheNamespace.LolSpectator,
      cache: true as const,
    }
    await executor.request('KR', SUMMONER, opts)
    await executor.request('KR', SUMMONER, opts)
    // First wrote, second was served from cache.
    expect(http.callCount).toBe(1)
    expect(store.sets).toHaveLength(1)
  })

  test('a global ttlMs overrides every namespace default', async () => {
    const store = new RecordingCache()
    const http = new MockHttpClient([{ status: 200, body: { ok: true } }])
    const executor = new RequestExecutor({
      key: 'RGAPI-test',
      httpClient: http,
      rateLimit: false,
      cache: { store, ttlMs: 1234 },
    })
    await executor.request('KR', SUMMONER, {
      pathParams: { puuid: 'p' },
      cacheNamespace: CacheNamespace.LolMatch,
    })
    expect(store.sets[0]?.ttlMs).toBe(1234)
  })
})
