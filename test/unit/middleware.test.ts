import { describe, expect, test } from 'bun:test'
import type { YasuoConfig } from '../../src/client/config'
import { Yasuo } from '../../src/client/yasuo'
import type { HttpClient, HttpResponse } from '../../src/core/http/http-client'
import { composeMiddleware, type HttpMiddleware } from '../../src/core/http/middleware'
import { HttpMethod } from '../../src/enums/http'
import { Region } from '../../src/enums/region'
import { MockHttpClient } from '../support/mock-http-client'

const OK: HttpResponse = {
  status: 200,
  ok: true,
  headers: {},
  body: { puuid: 'p', summonerLevel: 1 },
}

function client(http: MockHttpClient, extra: Partial<YasuoConfig> = {}): Yasuo {
  return new Yasuo({
    key: 'RGAPI-test',
    httpClient: http,
    rateLimit: false,
    retry: false,
    ...extra,
  })
}

describe('composeMiddleware', () => {
  test('wraps in onion order — middlewares[0] is outermost', async () => {
    const order: string[] = []
    const wrap =
      (label: string): HttpMiddleware =>
      async (request, next) => {
        order.push(`>${label}`)
        const response = await next(request)
        order.push(`<${label}`)
        return response
      }
    const send = async (): Promise<HttpResponse> => {
      order.push('send')
      return OK
    }
    const handler = composeMiddleware([wrap('a'), wrap('b')], send, {
      endpointId: 'x',
      routing: 'kr',
      attempt: 0,
    })

    await handler({ url: 'u', method: HttpMethod.GET, headers: {} })
    expect(order).toEqual(['>a', '>b', 'send', '<b', '<a'])
  })

  test('an empty chain calls the transport directly', async () => {
    let hit = false
    const handler = composeMiddleware(
      [],
      async () => {
        hit = true
        return OK
      },
      { endpointId: 'x', routing: 'kr', attempt: 0 },
    )
    await handler({ url: 'u', method: HttpMethod.GET, headers: {} })
    expect(hit).toBe(true)
  })
})

describe('client middleware stacking', () => {
  test('global (config + .use) then per-service middleware, in registration order', async () => {
    const order: string[] = []
    const record =
      (label: string): HttpMiddleware =>
      (request, next) => {
        order.push(label)
        return next(request)
      }
    const http = new MockHttpClient([OK])
    const yasuo = client(http, { middleware: [record('global-1')] })
    yasuo.use(record('global-2'))
    yasuo.lol.summoner.use(record('summoner-1'))
    // A middleware on a different service must NOT run for this request.
    yasuo.lol.match.use(record('match-1'))

    await yasuo.lol.summoner.byPuuid('p', Region.KR).execute()
    expect(order).toEqual(['global-1', 'global-2', 'summoner-1'])
  })

  test('.use() returns the client / namespace for chaining', () => {
    const yasuo = client(new MockHttpClient([OK]))
    expect(yasuo.use((request, next) => next(request))).toBe(yasuo)
    expect(yasuo.lol.summoner.use((request, next) => next(request))).toBe(yasuo.lol.summoner)
  })

  test('a middleware can mutate the request that reaches the transport', async () => {
    const http = new MockHttpClient([OK])
    const yasuo = client(http)
    yasuo.use((request, next) =>
      next({ ...request, headers: { ...request.headers, 'x-trace': 'abc' } }),
    )

    await yasuo.lol.summoner.byPuuid('p', Region.KR).execute()
    expect(http.requests.at(-1)?.headers['x-trace']).toBe('abc')
  })

  test('a middleware can short-circuit and skip the transport entirely', async () => {
    const http = new MockHttpClient([OK])
    const yasuo = client(http)
    yasuo.use(async () => ({
      status: 200,
      ok: true,
      headers: {},
      body: { puuid: 'p', summonerLevel: 99 },
    }))

    const summoner = await yasuo.lol.summoner.byPuuid('p', Region.KR).execute()
    expect(summoner.summonerLevel).toBe(99)
    expect(http.callCount).toBe(0)
  })

  test('the middleware context carries the endpoint id', async () => {
    let seen: string | undefined
    const http = new MockHttpClient([OK])
    const yasuo = client(http)
    yasuo.use((request, next, context) => {
      seen = context.endpointId
      return next(request)
    })
    await yasuo.lol.summoner.byPuuid('p', Region.KR).execute()
    expect(typeof seen).toBe('string')
    expect(seen?.length).toBeGreaterThan(0)
  })
})

describe('custom HTTP client', () => {
  test('any object implementing HttpClient can be injected', async () => {
    const urls: string[] = []
    const custom: HttpClient = {
      send: (request) => {
        urls.push(request.url)
        return Promise.resolve({
          status: 200,
          ok: true,
          headers: {},
          body: { puuid: 'p', summonerLevel: 5 },
        })
      },
    }
    const yasuo = new Yasuo({
      key: 'RGAPI-test',
      httpClient: custom,
      rateLimit: false,
      retry: false,
    })
    const summoner = await yasuo.lol.summoner.byPuuid('p', Region.KR).execute()

    expect(summoner.summonerLevel).toBe(5)
    expect(urls.length).toBe(1)
    expect(urls[0]).toContain('/summoner/v4/summoners/by-puuid/')
  })
})
