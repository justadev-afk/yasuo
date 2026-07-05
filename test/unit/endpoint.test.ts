import { describe, expect, test } from 'bun:test'
import {
  buildQueryString,
  DEFAULT_BASE_URL,
  type Endpoint,
  resolveRequest,
} from '../../src/endpoints/endpoint'
import { Game } from '../../src/enums/game'

const SUMMONER: Endpoint = {
  id: 'summoner.byPuuid',
  game: Game.LOL,
  path: 'summoner/v4/summoners/by-puuid/:puuid',
}

describe('resolveRequest', () => {
  test('substitutes path params and lower-cases the routing host', () => {
    const { url, host } = resolveRequest(DEFAULT_BASE_URL, 'KR', SUMMONER, { puuid: 'abc' })
    expect(url).toBe('https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/abc')
    expect(host).toBe('kr')
  })

  test('URL-encodes path parameters', () => {
    const { url } = resolveRequest(DEFAULT_BASE_URL, 'EUW1', SUMMONER, { puuid: 'a/b c' })
    expect(url).toContain('by-puuid/a%2Fb%20c')
  })

  test('appends a query string when params are given', () => {
    const endpoint: Endpoint = {
      id: 'match.ids',
      game: Game.LOL,
      path: 'match/v5/matches/by-puuid/:puuid/ids',
    }
    const { url } = resolveRequest(
      DEFAULT_BASE_URL,
      'AMERICAS',
      endpoint,
      { puuid: 'p' },
      {
        count: 5,
        start: 0,
      },
    )
    expect(url).toContain('?')
    expect(url).toContain('count=5')
    expect(url).toContain('start=0')
  })

  test('throws when a required path param is missing', () => {
    expect(() => resolveRequest(DEFAULT_BASE_URL, 'KR', SUMMONER, {})).toThrow(
      /Missing path parameter "puuid"/,
    )
  })
})

describe('buildQueryString', () => {
  test('returns an empty string for no params', () => {
    expect(buildQueryString(undefined)).toBe('')
  })

  test('skips null and undefined values', () => {
    const qs = buildQueryString({ a: 1, b: null, c: undefined, d: 'x' })
    expect(qs).toContain('a=1')
    expect(qs).toContain('d=x')
    expect(qs).not.toContain('b=')
    expect(qs).not.toContain('c=')
  })

  test('expands array values into repeated keys', () => {
    expect(buildQueryString({ id: [1, 2, 3] })).toBe('id=1&id=2&id=3')
  })
})
