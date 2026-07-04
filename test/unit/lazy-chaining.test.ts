import { describe, expect, test } from 'bun:test'
import { Yasuo } from '../../src/client/yasuo'
import { Region } from '../../src/enums/region'
import { MockHttpClient } from '../support/mock-http-client'

const PUUID = 'test-puuid'

function client(http: MockHttpClient): Yasuo {
  return new Yasuo({ key: 'RGAPI-test', httpClient: http, rateLimit: false, retry: false })
}

describe('lazy SummonerRef chaining', () => {
  test('exposes the namespace tree', () => {
    const yasuo = client(new MockHttpClient())
    expect(typeof yasuo.lol.summoner.byPuuid).toBe('function')
    expect(typeof yasuo.tft.summoner.byPuuid).toBe('function')
    expect(typeof yasuo.riot.account.byPuuid).toBe('function')
    expect(typeof yasuo.dataDragon.versions).toBe('function')
  })

  test('.matchIds().execute() performs exactly one request — the match-ids call, not the summoner fetch', async () => {
    const http = new MockHttpClient([{ status: 200, body: ['KR_1', 'KR_2', 'KR_3'] }])
    const yasuo = client(http)

    const ids = await yasuo.lol.summoner.byPuuid(PUUID, Region.KR).matchIds({ count: 3 }).execute()

    expect(ids.error).toBeNull()
    expect([...ids]).toEqual(['KR_1', 'KR_2', 'KR_3'])
    expect(http.callCount).toBe(1)
    // The single request went to MATCH-V5 (regional host), never SUMMONER-V4.
    expect(http.lastUrl).toContain('/match/v5/matches/by-puuid/')
    expect(http.lastUrl).not.toContain('/summoner/')
  })

  test('.leagueEntries().execute() performs exactly one request and skips the summoner fetch', async () => {
    const http = new MockHttpClient([{ status: 200, body: [{ leagueId: 'x', leaguePoints: 42 }] }])
    const yasuo = client(http)

    const entries = await yasuo.lol.summoner.byPuuid(PUUID, Region.KR).leagueEntries().execute()

    expect(entries.error).toBeNull()
    expect(entries.length).toBe(1)
    expect(http.callCount).toBe(1)
    expect(http.lastUrl).toContain('/league/v4/entries/by-puuid/')
  })

  test('the ref itself is a SingleQuery — .execute() fetches the summoner', async () => {
    const http = new MockHttpClient([{ status: 200, body: { puuid: PUUID, summonerLevel: 321 } }])
    const yasuo = client(http)

    const summoner = await yasuo.lol.summoner.byPuuid(PUUID, Region.KR).execute()

    expect(summoner.error).toBeNull()
    expect(summoner.summonerLevel).toBe(321)
    expect(http.callCount).toBe(1)
    expect(http.lastUrl).toContain('/summoner/v4/summoners/by-puuid/')
  })

  test('the match-ids traversal uses the region group that serves the platform (KR → ASIA)', async () => {
    const http = new MockHttpClient([{ status: 200, body: [] }])
    const yasuo = client(http)

    await yasuo.lol.summoner.byPuuid(PUUID, Region.KR).matchIds().execute()

    expect(http.lastUrl).toContain('https://asia.api.riotgames.com/')
  })
})
