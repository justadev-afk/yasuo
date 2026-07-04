import { describe, expect, test } from 'bun:test'
import { Yasuo } from '../../src/client/yasuo'
import { Region } from '../../src/enums/region'
import { TftRatedLadderQueue } from '../../src/enums/tft'
import { MockHttpClient } from '../support/mock-http-client'

function client(http: MockHttpClient): Yasuo {
  return new Yasuo({ key: 'RGAPI-test', httpClient: http, rateLimit: false, retry: false })
}

describe('TFT namespace', () => {
  test('exposes the TFT service tree', () => {
    const yasuo = client(new MockHttpClient())
    expect(typeof yasuo.tft.summoner.byPuuid).toBe('function')
    expect(typeof yasuo.tft.league.byPuuid).toBe('function')
    expect(typeof yasuo.tft.league.bySummonerId).toBe('function')
    expect(typeof yasuo.tft.league.ratedLadder).toBe('function')
    expect(typeof yasuo.tft.match.get).toBe('function')
  })

  test('ratedLadder hits the Hyper Roll endpoint and maps rows to entities', async () => {
    const http = new MockHttpClient([
      {
        status: 200,
        body: [
          {
            puuid: 'p1',
            ratedTier: 'ORANGE',
            ratedRating: 900,
            wins: 40,
            previousUpdateLadderPosition: 1,
          },
          {
            puuid: 'p2',
            ratedTier: 'PURPLE',
            ratedRating: 700,
            wins: 20,
            previousUpdateLadderPosition: 2,
          },
        ],
      },
    ])
    const yasuo = client(http)

    const ladder = await yasuo.tft.league.ratedLadder(Region.KR).execute()

    expect(ladder.error).toBeNull()
    expect(ladder.length).toBe(2)
    expect(ladder[0]?.puuid).toBe('p1')
    expect(ladder[0]?.ratedRating).toBe(900)
    expect(http.callCount).toBe(1)
    expect(http.lastUrl).toContain('/tft/league/v1/rated-ladders/RANKED_TFT_TURBO/top')
    // Metadata travels with the collection.
    expect(ladder.http.status).toBe(200)
  })

  test('ratedLadder accepts an explicit queue enum', async () => {
    const http = new MockHttpClient([{ status: 200, body: [] }])
    const yasuo = client(http)
    await yasuo.tft.league.ratedLadder(Region.KR, TftRatedLadderQueue.HYPER_ROLL).execute()
    expect(http.lastUrl).toContain('RANKED_TFT_TURBO')
  })

  test('a rated-ladder entity can resolve its summoner lazily', async () => {
    const http = new MockHttpClient([
      {
        status: 200,
        body: [
          {
            puuid: 'p1',
            ratedTier: 'BLUE',
            ratedRating: 500,
            wins: 10,
            previousUpdateLadderPosition: 3,
          },
        ],
      },
    ])
    const yasuo = client(http)
    const ladder = await yasuo.tft.league.ratedLadder(Region.KR).execute()
    const row = ladder[0]
    expect(row).toBeDefined()
    // The relation is a chainable ref, no request made yet.
    expect(typeof row?.summoner).toBe('function')
    expect(http.callCount).toBe(1)
  })
})
