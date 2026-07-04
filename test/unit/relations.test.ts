import { describe, expect, test } from 'bun:test'
import { Yasuo } from '../../src/client/yasuo'
import { Game } from '../../src/enums/game'
import { Region, RegionGroup } from '../../src/enums/region'
import { MockHttpClient } from '../support/mock-http-client'

const R = Region.KR
const G = RegionGroup.ASIA

function make(body: unknown): Yasuo {
  const http = new MockHttpClient([{ status: 200, body }])
  return new Yasuo({ key: 'RGAPI-test', httpClient: http, rateLimit: false, retry: false })
}

describe('SummonerEntity relations return lazy builders', () => {
  test('each relation is callable without issuing a request', async () => {
    const summoner = await make({ puuid: 'p', summonerLevel: 1 })
      .lol.summoner.byPuuid('p', R)
      .execute()

    expect(summoner.account()).toBeDefined()
    expect(summoner.leagueEntries()).toBeDefined()
    expect(summoner.championMasteries()).toBeDefined()
    expect(summoner.topChampionMasteries(3)).toBeDefined()
    expect(summoner.championMastery(1)).toBeDefined()
    expect(summoner.masteryScore()).toBeDefined()
    expect(summoner.matchIds()).toBeDefined()
    expect(summoner.matches()).toBeDefined()
    expect(summoner.streamMatchIds()).toBeDefined()
    expect(summoner.streamMatches()).toBeDefined()
    expect(summoner.activeGame()).toBeDefined()
    expect(summoner.clashPlayers()).toBeDefined()
    expect(summoner.challenges()).toBeDefined()
  })
})

describe('TftSummonerEntity relations', () => {
  test('each relation is callable', async () => {
    const summoner = await make({ puuid: 'p' }).tft.summoner.byPuuid('p', R).execute()
    expect(summoner.account()).toBeDefined()
    expect(summoner.leagueEntries()).toBeDefined()
    expect(summoner.matchIds()).toBeDefined()
    expect(summoner.matches()).toBeDefined()
    expect(summoner.streamMatches()).toBeDefined()
    expect(summoner.activeGame()).toBeDefined()
  })
})

describe('AccountEntity relations', () => {
  test('summoner / tftSummoner / active region + shard', async () => {
    const account = await make({ puuid: 'p', gameName: 'n', tagLine: 't' })
      .riot.account.byPuuid('p', RegionGroup.AMERICAS)
      .execute()
    expect(account.summoner(R)).toBeDefined()
    expect(account.tftSummoner(R)).toBeDefined()
    expect(account.activeRegion(Game.LOL)).toBeDefined()
    expect(account.activeShard(Game.LOL)).toBeDefined()
  })
})

describe('MatchEntity relations and accessors', () => {
  test('id, winner, participant, timeline, summoners', async () => {
    const match = await make({
      metadata: { matchId: 'KR_1', participants: ['a'] },
      info: {
        platformId: 'KR',
        participants: [{ puuid: 'a' }],
        teams: [{ teamId: 100, win: true }],
      },
    })
      .lol.match.get('KR_1', G)
      .execute()

    expect(match.id).toBe('KR_1')
    expect(match.winningTeam()?.teamId).toBe(100)
    expect(match.participant('a')?.puuid).toBe('a')
    expect(match.platformRegion()).toBe(Region.KR)
    expect(match.timeline()).toBeDefined()
    const summoners = match.summoners()
    expect(summoners.length).toBe(1)
  })
})

describe('MatchTimelineEntity relation', () => {
  test('back-reference to the match', async () => {
    const timeline = await make({ metadata: { matchId: 'KR_1' }, info: { frames: [] } })
      .lol.match.timeline('KR_1', G)
      .execute()
    expect(timeline.id).toBe('KR_1')
    expect(timeline.match()).toBeDefined()
  })
})

describe('CurrentGameEntity relations', () => {
  test('platformRegion + summoners', async () => {
    const game = await make({
      gameId: 1,
      platformId: 'KR',
      participants: [{ puuid: 'a' }, { puuid: '' }],
    })
      .lol.spectator.active('p', R)
      .execute()
    expect(game?.platformRegion()).toBe(Region.KR)
    // The anonymised participant (empty puuid) is skipped.
    expect(game?.summoners().length).toBe(1)
  })
})

describe('TftMatchEntity relations and accessors', () => {
  test('id, winner, participant, summoners', async () => {
    const match = await make({
      metadata: { match_id: 'KR_1' },
      info: { participants: [{ puuid: 'a', placement: 1 }] },
    })
      .tft.match.get('KR_1', G)
      .execute()

    expect(match.id).toBe('KR_1')
    expect(match.winner()?.puuid).toBe('a')
    expect(match.participant('a')?.placement).toBe(1)
    expect(match.platformRegion()).toBe(Region.KR)
    expect(match.summoners().length).toBe(1)
  })
})

describe('collection-item entities expose a lazy summoner relation', () => {
  test('league / mastery / clash / tft rows', async () => {
    const yasuo = make([{ puuid: 'p', teamId: 't', championId: 1, ratedRating: 1 }])

    const league = await yasuo.lol.league.byPuuid('p', R).execute()
    expect(league[0]?.summoner()).toBeDefined()

    const mastery = await yasuo.lol.mastery.byPuuid('p', R).execute()
    expect(mastery[0]?.summoner()).toBeDefined()

    const clash = await yasuo.lol.clash.playersByPuuid('p', R).execute()
    expect(clash[0]?.team()).toBeDefined()

    const tftLeague = await yasuo.tft.league.byPuuid('p', R).execute()
    expect(tftLeague[0]?.summoner()).toBeDefined()

    const ladder = await yasuo.tft.league.ratedLadder(R).execute()
    expect(ladder[0]?.summoner()).toBeDefined()
  })

  test('clash team → tournament', async () => {
    const team = await make({ id: 1, tournamentId: 5 }).lol.clash.teamById('t', R).execute()
    expect(team.tournament()).toBeDefined()
  })
})
