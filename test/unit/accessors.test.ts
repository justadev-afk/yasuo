import { describe, expect, test } from 'bun:test'
import { Yasuo } from '../../src/client/yasuo'
import { RankedQueue } from '../../src/enums/ranked'
import { Region, RegionGroup } from '../../src/enums/region'
import { MockHttpClient } from '../support/mock-http-client'

const R = Region.KR
const G = RegionGroup.ASIA

function make(...responses: Array<{ status?: number; body?: unknown }>): Yasuo {
  const http = new MockHttpClient(responses.length ? responses : [{ status: 200, body: {} }])
  return new Yasuo({ key: 'RGAPI-test', httpClient: http, rateLimit: false, retry: false })
}

describe('ChampionRotationEntity normalises both API shapes', () => {
  test('current shape (sr / newplayer)', async () => {
    const rotation = await make({ body: { sr: [1, 2], newplayer: [3] } })
      .lol.champion.rotation(R)
      .execute()
    expect(rotation.freeChampions).toEqual([1, 2])
    expect(rotation.newPlayerChampions).toEqual([3])
  })

  test('legacy shape (freeChampionIds / …)', async () => {
    const rotation = await make({
      body: { freeChampionIds: [9], freeChampionIdsForNewPlayers: [8], maxNewPlayerLevel: 10 },
    })
      .lol.champion.rotation(R)
      .execute()
    expect(rotation.freeChampions).toEqual([9])
    expect(rotation.newPlayerChampions).toEqual([8])
  })

  test('neither shape → empty arrays', async () => {
    const rotation = await make({ body: {} }).lol.champion.rotation(R).execute()
    expect(rotation.freeChampions).toEqual([])
    expect(rotation.newPlayerChampions).toEqual([])
  })
})

describe('list-entity accessors', () => {
  test('LeagueListEntity.puuids()', async () => {
    const list = await make({ body: { entries: [{ puuid: 'a' }, { puuid: 'b' }] } })
      .lol.league.challenger(RankedQueue.SOLO_5x5, R)
      .execute()
    expect(list.puuids()).toEqual(['a', 'b'])
  })

  test('TftLeagueListEntity.puuids()', async () => {
    const list = await make({ body: { entries: [{ puuid: 'a' }] } })
      .tft.league.challenger(R)
      .execute()
    expect(list.puuids()).toEqual(['a'])
  })

  test('PlatformStatusEntity.hasActiveIssues()', async () => {
    const quiet = await make({ body: { maintenances: [], incidents: [] } })
      .lol.status.get(R)
      .execute()
    expect(quiet.hasActiveIssues()).toBe(false)
    const noisy = await make({ body: { maintenances: [{ id: 1 }], incidents: [] } })
      .lol.status.get(R)
      .execute()
    expect(noisy.hasActiveIssues()).toBe(true)
  })
})

describe('spectator error / raw branches', () => {
  test('a non-404 failure comes back as a CurrentGameEntity carrying the error', async () => {
    const game = await make({ status: 403, body: {} }).lol.spectator.active('p', R).execute()
    expect(game?.error?.status).toBe(403)
  })

  test('raw returns the payload on success and the error body on failure', async () => {
    const ok = await make({ status: 200, body: { gameId: 7, platformId: 'KR' } })
      .lol.spectator.active('p', R)
      .execute({ raw: true })
    expect(ok).toEqual({ gameId: 7, platformId: 'KR' })

    const err = await make({ status: 403, body: { msg: 'nope' } })
      .lol.spectator.active('p', R)
      .execute({ raw: true })
    expect(err).toEqual({ msg: 'nope' })
  })

  test('a 404 maps to null even in raw mode', async () => {
    const raw = await make({ status: 404, body: {} })
      .lol.spectator.active('p', R)
      .execute({ raw: true })
    expect(raw).toBeNull()
  })

  test('tft spectator mirrors the same 404 → null and error behaviour', async () => {
    expect(await make({ status: 404, body: {} }).tft.spectator.active('p', R).execute()).toBeNull()
    const err = await make({ status: 403, body: {} }).tft.spectator.active('p', R).execute()
    expect(err?.error?.status).toBe(403)
    const ok = await make({ status: 200, body: { gameId: 1, platformId: 'KR' } })
      .tft.spectator.active('p', R)
      .execute()
    expect(ok?.gameId).toBe(1)
  })
})

describe('composed byPuuid raw and failure branches', () => {
  test('lol.match.byPuuid raw returns an array of raw match payloads', async () => {
    const raw = await make({ body: ['KR_1'] }, { body: { metadata: { matchId: 'KR_1' } } })
      .lol.match.byPuuid('p', G, { count: 1 })
      .execute({ raw: true })
    expect(Array.isArray(raw)).toBe(true)
    expect((raw as unknown[]).length).toBe(1)
  })

  test('lol.match.byPuuid returns an error collection when a match fetch fails', async () => {
    const matches = await make({ body: ['KR_1'] }, { status: 404, body: {} })
      .lol.match.byPuuid('p', G, { count: 1 })
      .execute()
    expect(matches.length).toBe(0)
    expect(matches.error?.status).toBe(404)
  })

  test('tft.match.byPuuid raw + id-failure short-circuit', async () => {
    const raw = await make({ body: ['KR_1'] }, { body: { metadata: { match_id: 'KR_1' } } })
      .tft.match.byPuuid('p', G, { count: 1 })
      .execute({ raw: true })
    expect((raw as unknown[]).length).toBe(1)

    const failed = await make({ status: 403, body: { m: 1 } })
      .tft.match.byPuuid('p', G)
      .execute({ raw: true })
    expect(failed).toEqual({ m: 1 })
  })
})
