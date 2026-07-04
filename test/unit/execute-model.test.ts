import { describe, expect, test } from 'bun:test'
import { Yasuo } from '../../src/client/yasuo'
import { Collection } from '../../src/entities/collection'
import { SummonerEntity } from '../../src/entities/lol/summoner.entity'
import { ValueResult } from '../../src/entities/value-result'
import { Region } from '../../src/enums/region'
import { ApiError, ApiKeyMissingError, NotFoundError } from '../../src/errors'
import { MockHttpClient } from '../support/mock-http-client'

const PUUID = 'p'

function client(http: MockHttpClient, key = 'RGAPI-test'): Yasuo {
  return new Yasuo({ key, httpClient: http, rateLimit: false, retry: false })
}

describe('.execute() returns the entity directly (success)', () => {
  test('DTO fields sit on the entity, error is null, http is populated', async () => {
    const http = new MockHttpClient([
      {
        status: 200,
        headers: { 'x-app-rate-limit': '20:1', 'x-app-rate-limit-count': '1:1' },
        body: { puuid: PUUID, summonerLevel: 442, profileIconId: 7 },
      },
    ])
    const summoner = await client(http).lol.summoner.byPuuid(PUUID, Region.KR).execute()

    expect(summoner).toBeInstanceOf(SummonerEntity)
    expect(summoner.summonerLevel).toBe(442)
    expect(summoner.error).toBeNull()
    expect(summoner.http.ok).toBe(true)
    expect(summoner.http.status).toBe(200)
    expect(summoner.http.rateLimits.app.length).toBeGreaterThan(0)
  })
})

describe('.execute() surfaces API failures on the result, without throwing', () => {
  test('a 404 comes back as an entity carrying the NotFoundError', async () => {
    const http = new MockHttpClient([{ status: 404, body: { status: { message: 'Not found' } } }])
    const summoner = await client(http).lol.summoner.byPuuid(PUUID, Region.KR).execute()

    expect(summoner).toBeInstanceOf(SummonerEntity)
    expect(summoner.error).toBeInstanceOf(NotFoundError)
    expect(summoner.http.ok).toBe(false)
    expect(summoner.http.status).toBe(404)
    // DTO fields are absent on a failed entity.
    expect(summoner.summonerLevel).toBeUndefined()
  })

  test('a 500 comes back as an entity carrying a generic ApiError', async () => {
    const http = new MockHttpClient([{ status: 500, body: 'boom' }])
    const summoner = await client(http).lol.summoner.byPuuid(PUUID, Region.KR).execute()
    expect(summoner.error).toBeInstanceOf(ApiError)
    expect(summoner.http.status).toBe(500)
  })
})

describe('.execute({ throw: true })', () => {
  test('throws the underlying ApiError on failure', async () => {
    const http = new MockHttpClient([{ status: 404, body: {} }])
    const query = client(http).lol.summoner.byPuuid(PUUID, Region.KR)
    await expect(query.execute({ throw: true })).rejects.toBeInstanceOf(NotFoundError)
  })

  test('returns the entity on success', async () => {
    const http = new MockHttpClient([{ status: 200, body: { puuid: PUUID, summonerLevel: 1 } }])
    const summoner = await client(http)
      .lol.summoner.byPuuid(PUUID, Region.KR)
      .execute({ throw: true })
    expect(summoner.summonerLevel).toBe(1)
  })
})

describe('.execute({ raw: true })', () => {
  test('returns exactly the Riot payload as unknown on success', async () => {
    const payload = { puuid: PUUID, summonerLevel: 9, extra: 'kept' }
    const http = new MockHttpClient([{ status: 200, body: payload }])
    const raw = await client(http).lol.summoner.byPuuid(PUUID, Region.KR).execute({ raw: true })
    expect(raw).toEqual(payload)
    expect(raw).not.toBeInstanceOf(SummonerEntity)
  })

  test('returns the error body on failure (never throws)', async () => {
    const errorBody = { status: { message: 'Data not found', status_code: 404 } }
    const http = new MockHttpClient([{ status: 404, body: errorBody }])
    const raw = await client(http).lol.summoner.byPuuid(PUUID, Region.KR).execute({ raw: true })
    expect(raw).toEqual(errorBody)
  })
})

describe('collections carry error + http', () => {
  test('success yields a populated Collection with error null', async () => {
    const http = new MockHttpClient([
      { status: 200, body: [{ leaguePoints: 10 }, { leaguePoints: 20 }] },
    ])
    const entries = await client(http).lol.league.byPuuid(PUUID, Region.KR).execute()
    expect(entries).toBeInstanceOf(Collection)
    expect(entries.length).toBe(2)
    expect(entries.error).toBeNull()
    expect(entries.http.ok).toBe(true)
  })

  test('failure yields an empty Collection carrying the error', async () => {
    const http = new MockHttpClient([{ status: 403, body: {} }])
    const entries = await client(http).lol.league.byPuuid(PUUID, Region.KR).execute()
    expect(entries.length).toBe(0)
    expect(entries.error?.status).toBe(403)
    expect(entries.http.ok).toBe(false)
  })
})

describe('scalar endpoints box the value in a ValueResult', () => {
  test('success exposes .value and a null error', async () => {
    const http = new MockHttpClient([{ status: 200, body: 123456 }])
    const score = await client(http).lol.mastery.score(PUUID, Region.KR).execute()
    expect(score).toBeInstanceOf(ValueResult)
    expect(score.value).toBe(123456)
    expect(score.error).toBeNull()
    expect(score.http.status).toBe(200)
  })

  test('failure exposes a null value and the error', async () => {
    const http = new MockHttpClient([{ status: 404, body: {} }])
    const score = await client(http).lol.mastery.score(PUUID, Region.KR).execute()
    expect(score.value).toBeNull()
    expect(score.error).toBeInstanceOf(NotFoundError)
  })
})

describe('spectator.active maps 404 to null (not in game)', () => {
  test('404 resolves to null even with { throw: true }', async () => {
    const http = new MockHttpClient([{ status: 404, body: {} }])
    const c = client(http)
    expect(await c.lol.spectator.active(PUUID, Region.KR).execute()).toBeNull()
    expect(await c.lol.spectator.active(PUUID, Region.KR).execute({ throw: true })).toBeNull()
  })

  test('a live game resolves to a CurrentGameEntity', async () => {
    const http = new MockHttpClient([{ status: 200, body: { gameId: 42, platformId: 'KR' } }])
    const game = await client(http).lol.spectator.active(PUUID, Region.KR).execute()
    expect(game?.gameId).toBe(42)
    expect(game?.error).toBeNull()
  })
})

describe('misuse still throws (never surfaced as .error)', () => {
  test('a missing key throws ApiKeyMissingError from execute()', async () => {
    const query = client(new MockHttpClient(), '').lol.summoner.byPuuid(PUUID, Region.KR)
    await expect(query.execute()).rejects.toBeInstanceOf(ApiKeyMissingError)
  })
})
