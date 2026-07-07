import { describe, expect, test } from 'bun:test'
import { FetchHttpClient } from '../../src/core/http/http-client'
import { RequestExecutor } from '../../src/core/request/request-executor'
import type { Endpoint } from '../../src/endpoints/endpoint'
import { Game } from '../../src/enums/game'
import { HttpHeader, HttpMethod } from '../../src/enums/http'
import { MockHttpClient } from '../support/mock-http-client'

const GET_EP: Endpoint = {
  id: 'lol.tournament.getCode',
  game: Game.LOL,
  path: 'tournament/v5/codes/:code',
}
const POST_EP: Endpoint = {
  id: 'lol.tournament.createCodes',
  game: Game.LOL,
  path: 'tournament/v5/codes',
  method: HttpMethod.POST,
}
const PUT_EP: Endpoint = {
  id: 'lol.tournament.updateCode',
  game: Game.LOL,
  path: 'tournament/v5/codes/:code',
  method: HttpMethod.PUT,
}

describe('RequestExecutor POST/PUT bodies', () => {
  test('a POST sends the method, JSON body and content-type header', async () => {
    const http = new MockHttpClient([{ status: 200, body: ['CODE1', 'CODE2'] }])
    const executor = new RequestExecutor({ key: 'K', httpClient: http, rateLimit: false })
    const result = await executor.request<string[]>('AMERICAS', POST_EP, {
      body: { teamSize: 5, mapType: 'SUMMONERS_RIFT' },
      query: { count: 2, tournamentId: 42 },
    })
    const sent = http.requests[0]
    expect(sent?.method).toBe(HttpMethod.POST)
    expect(sent?.body).toEqual({ teamSize: 5, mapType: 'SUMMONERS_RIFT' })
    expect(sent?.headers[HttpHeader.CONTENT_TYPE]).toBe('application/json')
    expect(sent?.url).toContain('?count=2&tournamentId=42')
    expect(result.data).toEqual(['CODE1', 'CODE2'])
  })

  test('a GET carries no body and no content-type header', async () => {
    const http = new MockHttpClient([{ status: 200, body: { code: 'ABC' } }])
    const executor = new RequestExecutor({ key: 'K', httpClient: http, rateLimit: false })
    await executor.request('AMERICAS', GET_EP, { pathParams: { code: 'ABC' } })
    expect(http.requests[0]?.method).toBe(HttpMethod.GET)
    expect(http.requests[0]?.body).toBeUndefined()
    expect(http.requests[0]?.headers[HttpHeader.CONTENT_TYPE]).toBeUndefined()
  })

  test('a PUT with an empty response body resolves undefined data', async () => {
    const http = new MockHttpClient([{ status: 200, body: undefined }])
    const executor = new RequestExecutor({ key: 'K', httpClient: http, rateLimit: false })
    const result = await executor.request('AMERICAS', PUT_EP, {
      pathParams: { code: 'ABC' },
      body: { pickType: 'TOURNAMENT_DRAFT' },
    })
    expect(http.requests[0]?.method).toBe(HttpMethod.PUT)
    expect(result.data).toBeUndefined()
    expect(result.meta.status).toBe(200)
  })

  test('POST responses are never cached, even with the cache enabled', async () => {
    const http = new MockHttpClient([
      { status: 200, body: { id: 1 } },
      { status: 200, body: { id: 2 } },
    ])
    const executor = new RequestExecutor({
      key: 'K',
      httpClient: http,
      rateLimit: false,
      cache: true,
    })
    const first = await executor.request<{ id: number }>('AMERICAS', POST_EP, { body: {} })
    const second = await executor.request<{ id: number }>('AMERICAS', POST_EP, { body: {} })
    expect(first.data.id).toBe(1)
    // A cached POST would have replayed `id: 1`; instead a second request was made.
    expect(second.data.id).toBe(2)
    expect(http.callCount).toBe(2)
  })
})

describe('FetchHttpClient body serialization', () => {
  test('serializes a body to a JSON string and omits it for GET', async () => {
    let captured: RequestInit | undefined
    const fakeFetch = ((_url: string, init?: RequestInit) => {
      captured = init
      return Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      )
    }) as unknown as typeof fetch
    const client = new FetchHttpClient(fakeFetch)

    await client.send({ url: 'https://x', method: HttpMethod.POST, headers: {}, body: { a: 1 } })
    expect(captured?.body).toBe(JSON.stringify({ a: 1 }))

    await client.send({ url: 'https://x', method: HttpMethod.GET, headers: {} })
    expect(captured?.body).toBeUndefined()
  })
})
