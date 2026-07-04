import { describe, expect, test } from 'bun:test'
import { Yasuo } from '../../src/client/yasuo'
import { ChallengeLevel } from '../../src/enums/challenge'
import { Game } from '../../src/enums/game'
import { Division, RankedQueue, Tier } from '../../src/enums/ranked'
import { Region, RegionGroup, regionToAccountRegionGroup } from '../../src/enums/region'
import type { CollectionQuery } from '../../src/query/collection-query'
import type { SingleQuery } from '../../src/query/single-query'
import { MockHttpClient } from '../support/mock-http-client'

const R = Region.KR
const G = RegionGroup.ASIA
const ACC = regionToAccountRegionGroup(Region.KR)

/** A fresh client whose transport replays `body` for every request. */
function make(body: unknown): { yasuo: Yasuo; http: MockHttpClient } {
  const http = new MockHttpClient([{ status: 200, body }])
  return {
    yasuo: new Yasuo({ key: 'RGAPI-test', httpClient: http, rateLimit: false, retry: false }),
    http,
  }
}

// A generic object payload that satisfies every single-entity mapping. It must
// not carry keys that collide with an entity's getter (e.g. `id`), since
// `Object.assign` cannot write a getter-only property — a real DTO never does.
const OBJ = {
  puuid: 'p',
  gameId: 1,
  platformId: 'KR',
  name: 'x',
  summonerLevel: 1,
  metadata: { matchId: 'KR_1', match_id: 'KR_1' },
  info: { participants: [], frames: [], gameDuration: 1 },
}

type Result = { error: { status: number } | null; length?: number }
type SingleBuild = (y: Yasuo) => SingleQuery<unknown>
type CollectionBuild = (y: Yasuo) => CollectionQuery<unknown>

const SINGLE_OBJECT: [string, SingleBuild][] = [
  ['lol.summoner.byPuuid', (y) => y.lol.summoner.byPuuid('p', R)],
  ['lol.summoner.byId', (y) => y.lol.summoner.byId('s', R)],
  ['lol.summoner.byAccountId', (y) => y.lol.summoner.byAccountId('a', R)],
  ['lol.league.challenger', (y) => y.lol.league.challenger(RankedQueue.SOLO_5x5, R)],
  ['lol.league.grandmaster', (y) => y.lol.league.grandmaster(RankedQueue.SOLO_5x5, R)],
  ['lol.league.master', (y) => y.lol.league.master(RankedQueue.SOLO_5x5, R)],
  ['lol.league.byId', (y) => y.lol.league.byId('l', R)],
  ['lol.mastery.byChampion', (y) => y.lol.mastery.byChampion('p', 1, R)],
  ['lol.champion.rotation', (y) => y.lol.champion.rotation(R)],
  ['lol.match.get', (y) => y.lol.match.get('KR_1', G)],
  ['lol.match.timeline', (y) => y.lol.match.timeline('KR_1', G)],
  ['lol.spectator.featured', (y) => y.lol.spectator.featured(R)],
  ['lol.status.get', (y) => y.lol.status.get(R)],
  ['lol.clash.teamById', (y) => y.lol.clash.teamById('t', R)],
  ['lol.clash.tournamentByTeam', (y) => y.lol.clash.tournamentByTeam('t', R)],
  ['lol.clash.tournamentById', (y) => y.lol.clash.tournamentById(1, R)],
  ['lol.challenges.configById', (y) => y.lol.challenges.configById(1, R)],
  ['lol.challenges.percentilesById', (y) => y.lol.challenges.percentilesById(1, R)],
  ['lol.challenges.player', (y) => y.lol.challenges.player('p', R)],
  ['tft.summoner.byPuuid', (y) => y.tft.summoner.byPuuid('p', R)],
  ['tft.summoner.byId', (y) => y.tft.summoner.byId('s', R)],
  ['tft.match.get', (y) => y.tft.match.get('KR_1', G)],
  ['tft.league.challenger', (y) => y.tft.league.challenger(R)],
  ['tft.league.grandmaster', (y) => y.tft.league.grandmaster(R)],
  ['tft.league.master', (y) => y.tft.league.master(R)],
  ['tft.league.byId', (y) => y.tft.league.byId('l', R)],
  ['tft.spectator.featured', (y) => y.tft.spectator.featured(R)],
  ['riot.account.byPuuid', (y) => y.riot.account.byPuuid('p', ACC)],
  ['riot.account.byRiotId', (y) => y.riot.account.byRiotId('n', 't', ACC)],
  ['riot.account.activeShard', (y) => y.riot.account.activeShard(Game.LOL, 'p', ACC)],
  ['riot.account.activeRegion', (y) => y.riot.account.activeRegion(Game.LOL, 'p', ACC)],
]

const COLLECTION: [string, CollectionBuild][] = [
  ['lol.league.byPuuid', (y) => y.lol.league.byPuuid('p', R)],
  ['lol.league.bySummonerId', (y) => y.lol.league.bySummonerId('s', R)],
  [
    'lol.league.entries',
    (y) => y.lol.league.entries(RankedQueue.SOLO_5x5, Tier.DIAMOND, Division.I, R),
  ],
  [
    'lol.league.expEntries',
    (y) => y.lol.league.expEntries(RankedQueue.SOLO_5x5, Tier.DIAMOND, Division.I, R),
  ],
  ['lol.mastery.byPuuid', (y) => y.lol.mastery.byPuuid('p', R)],
  ['lol.mastery.top', (y) => y.lol.mastery.top('p', R, 3)],
  ['lol.match.idsByPuuid', (y) => y.lol.match.idsByPuuid('p', G)],
  ['lol.clash.playersByPuuid', (y) => y.lol.clash.playersByPuuid('p', R)],
  ['lol.clash.tournaments', (y) => y.lol.clash.tournaments(R)],
  ['lol.challenges.config', (y) => y.lol.challenges.config(R)],
  [
    'lol.challenges.leaderboards',
    (y) => y.lol.challenges.leaderboards(1, ChallengeLevel.CHALLENGER, R),
  ],
  ['tft.match.idsByPuuid', (y) => y.tft.match.idsByPuuid('p', G)],
  ['tft.league.byPuuid', (y) => y.tft.league.byPuuid('p', R)],
  ['tft.league.bySummonerId', (y) => y.tft.league.bySummonerId('s', R)],
  ['tft.league.entries', (y) => y.tft.league.entries(Tier.DIAMOND, Division.I, R)],
  ['tft.league.ratedLadder', (y) => y.tft.league.ratedLadder(R)],
]

describe('every single-entity endpoint wires up and executes', () => {
  for (const [name, build] of SINGLE_OBJECT) {
    test(name, async () => {
      const { yasuo, http } = make(OBJ)
      const result = (await build(yasuo).execute()) as Result
      expect(result.error).toBeNull()
      expect(http.callCount).toBe(1)
    })
  }
})

describe('every collection endpoint wires up and executes', () => {
  for (const [name, build] of COLLECTION) {
    test(name, async () => {
      const { yasuo, http } = make([
        { puuid: 'p', leaguePoints: 1, championPoints: 1, ratedRating: 1 },
      ])
      const result = (await build(yasuo).execute()) as Result
      expect(result.error).toBeNull()
      expect(result.length).toBe(1)
      expect(http.callCount).toBe(1)
    })
  }
})

describe('scalar endpoints', () => {
  test('lol.mastery.score boxes a number', async () => {
    const { yasuo } = make(4242)
    const score = await yasuo.lol.mastery.score('p', R).execute()
    expect(score.value).toBe(4242)
  })

  test('lol.challenges.percentiles boxes an object', async () => {
    const { yasuo } = make({ OVERALL: {} })
    const percentiles = await yasuo.lol.challenges.percentiles(R).execute()
    expect(percentiles.error).toBeNull()
    expect(percentiles.value).toEqual({ OVERALL: {} })
  })
})

describe('async-iterator endpoints', () => {
  test('lol.league.streamEntries pages', async () => {
    const { yasuo } = make([{ puuid: 'p', leaguePoints: 1 }])
    const rows = await yasuo.lol.league
      .streamEntries(RankedQueue.SOLO_5x5, Tier.DIAMOND, Division.I, R, { maxItems: 1 })
      .toArray()
    expect(rows.length).toBe(1)
  })

  test('lol.match.streamIds pages', async () => {
    const { yasuo } = make(['KR_1'])
    const ids = await yasuo.lol.match.streamIds('p', G, { pageSize: 1, maxItems: 1 }).toArray()
    expect(ids.length).toBe(1)
  })
})

describe('composed match.byPuuid (ids → full matches)', () => {
  test('lol.match.byPuuid fetches ids then each match', async () => {
    const http = new MockHttpClient([
      { status: 200, body: ['KR_1'] },
      { status: 200, body: { metadata: { matchId: 'KR_1' }, info: { participants: [] } } },
    ])
    const yasuo = new Yasuo({ key: 'RGAPI-test', httpClient: http, rateLimit: false, retry: false })
    const matches = await yasuo.lol.match.byPuuid('p', G, { count: 1 }).execute()
    expect(matches.error).toBeNull()
    expect(matches.length).toBe(1)
    expect(http.callCount).toBe(2)
  })

  test('tft.match.byPuuid fetches ids then each match', async () => {
    const http = new MockHttpClient([
      { status: 200, body: ['KR_1'] },
      { status: 200, body: { metadata: { match_id: 'KR_1' }, info: { participants: [] } } },
    ])
    const yasuo = new Yasuo({ key: 'RGAPI-test', httpClient: http, rateLimit: false, retry: false })
    const matches = await yasuo.tft.match.byPuuid('p', G, { count: 1 }).execute()
    expect(matches.error).toBeNull()
    expect(matches.length).toBe(1)
  })

  test('byPuuid short-circuits when the id request fails', async () => {
    const { yasuo } = make(undefined)
    const failing = new MockHttpClient([{ status: 403, body: {} }])
    const y = new Yasuo({ key: 'RGAPI-test', httpClient: failing, rateLimit: false, retry: false })
    void yasuo
    const matches = await y.lol.match.byPuuid('p', G).execute()
    expect(matches.error?.status).toBe(403)
    expect(matches.length).toBe(0)
  })
})
