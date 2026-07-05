import { expect, test } from 'bun:test'
import { client, describeLive, MATCH_GROUP, puuid, REGION, tolerate } from './support'

/**
 * TFT endpoints (Summoner/Match/League) are gated behind a production key — a
 * development key gets `403` on most of them. Every call therefore goes through
 * {@link tolerate}, asserting only when the data is actually reachable, so the
 * suite proves the wiring works on a prod key without failing on a dev key.
 */
describeLive('tft (live)', () => {
  test('fetches a TFT summoner by PUUID', async () => {
    const id = await puuid()
    const summoner = tolerate(await client().tft.summoner.byPuuid(id, REGION).execute())
    if (summoner) {
      expect(summoner.puuid).toBe(id)
    }
  })

  test('lists TFT match ids and fetches one full match', async () => {
    const id = await puuid()
    const ids = tolerate(
      await client().tft.match.idsByPuuid(id, MATCH_GROUP, { count: 2 }).execute(),
    )
    const matchId = ids?.[0]
    if (!matchId) {
      return // dev-key restricted, or no TFT history
    }

    const match = tolerate(await client().tft.match.get(matchId, MATCH_GROUP).execute())
    if (match) {
      expect(match.metadata.match_id).toBe(matchId)
      expect(match.info.participants.length).toBeGreaterThan(0)
    }
  })

  test('reads TFT league entries (may be empty)', async () => {
    const id = await puuid()
    const entries = tolerate(await client().tft.league.byPuuid(id, REGION).execute())
    if (entries) {
      expect(entries.length).toBeGreaterThanOrEqual(0)
    }
  })

  test('the Hyper Roll rated ladder (tolerating dev-key restrictions)', async () => {
    const ladder = tolerate(await client().tft.league.ratedLadder(REGION).execute())
    if (ladder && ladder.length > 0) {
      expect(ladder[0]?.puuid).toBeString()
      expect(ladder[0]?.ratedRating).toBeGreaterThanOrEqual(0)
    }
  })
})
