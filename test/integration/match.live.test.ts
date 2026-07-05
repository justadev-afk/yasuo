import { expect, test } from 'bun:test'
import { client, describeLive, MATCH_GROUP, puuid } from './support'

describeLive('lol.match (live)', () => {
  test('lists match ids with filters, then fetches one full match + its timeline', async () => {
    const id = await puuid()
    const ids = await client()
      .lol.match.idsByPuuid(id, MATCH_GROUP, { count: 2, start: 0 })
      .execute()

    expect(ids.error).toBeNull()
    const matchId = ids[0]
    expect(matchId).toBeDefined()
    if (!matchId) {
      return
    }

    const match = await client().lol.match.get(matchId, MATCH_GROUP).execute()
    expect(match.error).toBeNull()
    expect(match.metadata.matchId).toBe(matchId)
    expect(match.info.participants.length).toBe(10)

    // Traverse the entity relation back to the timeline (routing reused).
    const timeline = await match.timeline().execute()
    expect(timeline.error).toBeNull()
    expect(timeline.metadata.matchId).toBe(matchId)
    expect(timeline.info.frames.length).toBeGreaterThan(0)
  })

  test('streams match ids across pages from an offset, without duplicates', async () => {
    const id = await puuid()
    const collected: string[] = []
    for await (const matchId of client().lol.match.streamIds(id, MATCH_GROUP, {
      start: 0,
      pageSize: 5,
      maxItems: 8,
    })) {
      collected.push(matchId)
    }

    expect(collected.length).toBeGreaterThan(0)
    expect(collected.length).toBeLessThanOrEqual(8)
    expect(new Set(collected).size).toBe(collected.length)
  })
})
