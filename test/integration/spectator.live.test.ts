import { expect, test } from 'bun:test'
import { client, describeLive, puuid, REGION, tolerate } from './support'

describeLive('lol.spectator (live)', () => {
  test('the active game resolves to a game or null (404 is not an error)', async () => {
    const id = await puuid()
    const game = await client().lol.spectator.active(id, REGION).execute()

    expect(game === null || typeof game.gameId === 'number').toBe(true)
    if (game) {
      expect(game.error).toBeNull()
    }
  })

  test('featured games (tolerating dev-key restrictions)', async () => {
    const featured = tolerate(await client().lol.spectator.featured(REGION).execute())
    if (featured) {
      expect(featured.gameList.length).toBeGreaterThanOrEqual(0)
    }
  })
})
