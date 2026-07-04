import { describe, expect, test } from 'bun:test'
import { FetchHttpClient } from '../../src/core/http/http-client'
import { HttpMethod } from '../../src/enums/http'

function fetchReturning(
  response: Response,
  record?: (url: string, init?: RequestInit) => void,
): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    record?.(url, init)
    return Promise.resolve(response)
  }) as unknown as typeof fetch
}

const REQUEST = {
  url: 'https://kr.api.riotgames.com/x',
  method: HttpMethod.GET,
  headers: { 'x-riot-token': 'k' },
}

describe('FetchHttpClient', () => {
  test('parses a JSON body and lower-cases response headers', async () => {
    const response = new Response(JSON.stringify({ puuid: 'p' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-App-Rate-Limit': '20:1' },
    })
    const client = new FetchHttpClient(fetchReturning(response))

    const result = await client.send(REQUEST)
    expect(result.status).toBe(200)
    expect(result.ok).toBe(true)
    expect(result.body).toEqual({ puuid: 'p' })
    expect(result.headers['x-app-rate-limit']).toBe('20:1')
  })

  test('falls back to text for a non-JSON body', async () => {
    const client = new FetchHttpClient(fetchReturning(new Response('PLAINTEXT', { status: 200 })))
    const result = await client.send(REQUEST)
    expect(result.body).toBe('PLAINTEXT')
  })

  test('returns undefined for an empty body', async () => {
    const client = new FetchHttpClient(fetchReturning(new Response('', { status: 204 })))
    const result = await client.send(REQUEST)
    expect(result.body).toBeUndefined()
  })

  test('a non-2xx response is reported as not ok', async () => {
    const client = new FetchHttpClient(fetchReturning(new Response('{}', { status: 404 })))
    const result = await client.send(REQUEST)
    expect(result.ok).toBe(false)
    expect(result.status).toBe(404)
  })

  test('forwards the method and headers to fetch', async () => {
    let seenUrl = ''
    let seenInit: RequestInit | undefined
    const client = new FetchHttpClient(
      fetchReturning(new Response('{}', { status: 200 }), (url, init) => {
        seenUrl = url
        seenInit = init
      }),
    )
    await client.send(REQUEST)
    expect(seenUrl).toBe(REQUEST.url)
    expect(seenInit?.method).toBe(HttpMethod.GET)
    expect((seenInit?.headers as Record<string, string>)['x-riot-token']).toBe('k')
  })
})
