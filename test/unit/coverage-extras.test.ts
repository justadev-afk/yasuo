import { describe, expect, test } from 'bun:test'
import { Yasuo } from '../../src/client/yasuo'
import type { HttpClient } from '../../src/core/http/http-client'
import { Collection } from '../../src/entities/collection'
import { Game } from '../../src/enums/game'
import { Region, RegionGroup } from '../../src/enums/region'
import { MockHttpClient } from '../support/mock-http-client'

const R = Region.KR

function make(body: unknown): Yasuo {
  const http = new MockHttpClient([{ status: 200, body }])
  return new Yasuo({ key: 'RGAPI-test', httpClient: http, rateLimit: false, retry: false })
}

describe('transport failures surface as a status-0 ApiError', () => {
  test('a rejecting HttpClient yields an entity carrying a status-0 error', async () => {
    const throwing: HttpClient = { send: () => Promise.reject(new Error('ECONNREFUSED')) }
    const yasuo = new Yasuo({
      key: 'RGAPI-test',
      httpClient: throwing,
      rateLimit: false,
      retry: false,
    })

    const summoner = await yasuo.lol.summoner.byPuuid('p', R).execute()
    expect(summoner.error?.status).toBe(0)
    expect(summoner.error?.message).toContain('Network request')
  })
})

describe('Collection behaviour', () => {
  test('map() returns a plain Array (Symbol.species), not a Collection', async () => {
    const entries = await make([{ leaguePoints: 1 }, { leaguePoints: 2 }])
      .lol.league.byPuuid('p', R)
      .execute()
    const mapped = entries.map((entry) => entry.leaguePoints)
    expect(mapped).toEqual([1, 2])
    expect(Array.isArray(mapped)).toBe(true)
    expect(mapped).not.toBeInstanceOf(Collection)
  })
})

describe('nullable relations / accessors', () => {
  test('ClashPlayerEntity.team() is null when no team is assigned', async () => {
    const withTeam = await make([{ puuid: 'p', teamId: 't' }])
      .lol.clash.playersByPuuid('p', R)
      .execute()
    expect(withTeam[0]?.team()).not.toBeNull()

    const withoutTeam = await make([{ puuid: 'p' }])
      .lol.clash.playersByPuuid('p', R)
      .execute()
    expect(withoutTeam[0]?.team()).toBeNull()
    expect(withoutTeam[0]?.summoner()).toBeDefined()
  })

  test('AccountRegionEntity.toRegion() maps known regions and null otherwise', async () => {
    const known = await make({ puuid: 'p', game: 'lol', region: 'kr' })
      .riot.account.activeRegion(Game.LOL, 'p', RegionGroup.ASIA)
      .execute()
    expect(known.toRegion()).toBe(Region.KR)

    const unknown = await make({ puuid: 'p', game: 'lol', region: 'nowhere' })
      .riot.account.activeRegion(Game.LOL, 'p', RegionGroup.ASIA)
      .execute()
    expect(unknown.toRegion()).toBeNull()
  })
})
