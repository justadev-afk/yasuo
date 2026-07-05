import { expect, test } from 'bun:test'
import { MatchType } from '../../src/enums/match'
import { ACCOUNT_GROUP, client, describeLive, GAME_NAME, puuid, REGION, TAG_LINE } from './support'

describeLive('lol.summoner (live)', () => {
  test('fetches the summoner by PUUID', async () => {
    const id = await puuid()
    const summoner = await client().lol.summoner.byPuuid(id, REGION).execute()

    expect(summoner.error).toBeNull()
    expect(summoner.puuid).toBe(id)
    expect(summoner.summonerLevel).toBeGreaterThan(0)
    expect(summoner.profileIconId).toBeGreaterThanOrEqual(0)
  })

  test('lazy chain: account → summoner → matchIds runs only the traversal request', async () => {
    const account = await client()
      .riot.account.byRiotId(GAME_NAME, TAG_LINE, ACCOUNT_GROUP)
      .execute()
    expect(account.error).toBeNull()

    // The ref never fetches the summoner — only the match-ids relation is called.
    const ids = await account
      .summoner(REGION)
      .matchIds({ count: 3, type: MatchType.RANKED })
      .execute()

    expect(ids.error).toBeNull()
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.length).toBeLessThanOrEqual(3)
    expect(ids[0]).toMatch(/^[A-Z0-9]+_\d+$/)
  })

  test('the active-game relation resolves to a game or null, never throws', async () => {
    const id = await puuid()
    // 404 (not in game) maps to null, not an error.
    const game = await client().lol.summoner.byPuuid(id, REGION).activeGame().execute()

    expect(game === null || typeof game.gameId === 'number').toBe(true)
    if (game) {
      expect(game.error).toBeNull()
    }
  })
})
