import { describe, expect, test } from 'bun:test'
import { Yasuo } from '../../src/client/yasuo'
import { Region, RegionGroup } from '../../src/enums/region'
import { forwardExec } from '../../src/query/execute-options'
import { MockHttpClient } from '../support/mock-http-client'

describe('execute({ cache }) end-to-end', () => {
  test('cache:false forces a fresh request but refreshes the cached entry', async () => {
    const http = new MockHttpClient([
      { status: 200, body: { puuid: 'p', summonerLevel: 1 } },
      { status: 200, body: { puuid: 'p', summonerLevel: 2 } },
    ])
    const yasuo = new Yasuo({ key: 'RGAPI-test', httpClient: http, cache: true })

    const first = await yasuo.lol.summoner.byPuuid('p', Region.KR).execute()
    expect(first.summonerLevel).toBe(1)

    // Skips the cached read → hits Riot again → sees the fresh value…
    const fresh = await yasuo.lol.summoner.byPuuid('p', Region.KR).execute({ cache: false })
    expect(fresh.summonerLevel).toBe(2)
    expect(http.callCount).toBe(2)

    // …and it wrote that fresh value back, so a normal read now serves it with no call.
    const cached = await yasuo.lol.summoner.byPuuid('p', Region.KR).execute()
    expect(cached.summonerLevel).toBe(2)
    expect(http.callCount).toBe(2)
  })

  test('a normal cached read is served without a second call', async () => {
    const http = new MockHttpClient([{ status: 200, body: { puuid: 'p', summonerLevel: 7 } }])
    const yasuo = new Yasuo({ key: 'RGAPI-test', httpClient: http, cache: true })

    await yasuo.lol.summoner.byPuuid('p', Region.KR).execute()
    const second = await yasuo.lol.summoner.byPuuid('p', Region.KR).execute()
    expect(second.summonerLevel).toBe(7)
    expect(http.callCount).toBe(1)
  })

  test('match.byPuuid propagates the cache override to every sub-request', async () => {
    const http = new MockHttpClient([
      { status: 200, body: ['KR_1'] },
      { status: 200, body: { metadata: { matchId: 'KR_1' }, info: { participants: [] } } },
      { status: 200, body: ['KR_1'] },
      { status: 200, body: { metadata: { matchId: 'KR_1' }, info: { participants: [] } } },
    ])
    const yasuo = new Yasuo({ key: 'RGAPI-test', httpClient: http, cache: true })

    await yasuo.lol.match.byPuuid('p', RegionGroup.ASIA, { count: 1 }).execute()
    const afterFirst = http.callCount

    // With cache:false forwarded, both the id list and each match are re-fetched.
    await yasuo.lol.match.byPuuid('p', RegionGroup.ASIA, { count: 1 }).execute({ cache: false })
    expect(http.callCount).toBe(afterFirst + 2)
  })
})

describe('forwardExec', () => {
  test('keeps only the cache override and abort signal', () => {
    const signal = new AbortController().signal
    expect(forwardExec({ throw: true, raw: true })).toEqual({})
    expect(forwardExec({ cache: false, signal })).toEqual({ cache: false, signal })
    expect(forwardExec({ cache: { ttlMs: 500 } })).toEqual({ cache: { ttlMs: 500 } })
  })
})
