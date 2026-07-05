import { expect, test } from 'bun:test'
import { Game } from '../../src/enums/game'
import {
  ACCOUNT_GROUP,
  client,
  describeLive,
  GAME_NAME,
  puuid,
  TAG_LINE,
  tolerate,
} from './support'

describeLive('riot.account (live)', () => {
  test('resolves an account by Riot ID and carries HTTP context', async () => {
    const account = await client()
      .riot.account.byRiotId(GAME_NAME, TAG_LINE, ACCOUNT_GROUP)
      .execute()

    expect(account.error).toBeNull()
    expect(account.http.ok).toBe(true)
    expect(account.puuid).toBeString()
    expect(account.puuid.length).toBeGreaterThan(0)
    expect(account.gameName?.toLowerCase()).toBe(GAME_NAME.toLowerCase())

    // The result IS the entity — HTTP context travels with the data.
    expect(account.http.status).toBe(200)
    expect(account.http.rateLimits.app.length).toBeGreaterThan(0)
  })

  test('round-trips by PUUID', async () => {
    const id = await puuid()
    const account = await client().riot.account.byPuuid(id, ACCOUNT_GROUP).execute()

    expect(account.error).toBeNull()
    expect(account.puuid).toBe(id)
  })

  test('resolves the active region for LoL (tolerating dev-key limits)', async () => {
    const id = await puuid()
    const region = tolerate(
      await client().riot.account.activeRegion(Game.LOL, id, ACCOUNT_GROUP).execute(),
    )
    if (region) {
      expect(region.puuid).toBe(id)
    }
  })
})
