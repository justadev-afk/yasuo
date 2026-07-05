import { expect, test } from 'bun:test'
import { Division, RankedQueue, Tier } from '../../src/enums/ranked'
import { client, describeLive, puuid, REGION } from './support'

describeLive('lol.league (live)', () => {
  test('reads a player’s ranked entries (may be empty)', async () => {
    const id = await puuid()
    const entries = await client().lol.league.byPuuid(id, REGION).execute()

    expect(entries.error).toBeNull()
    for (const entry of entries) {
      expect(entry.puuid).toBe(id)
      expect(entry.leaguePoints).toBeGreaterThanOrEqual(0)
    }
  })

  test('reads one page of the Diamond I ladder — filters + paging', async () => {
    const page = await client()
      .lol.league.entries(RankedQueue.SOLO_5x5, Tier.DIAMOND, Division.I, REGION, 1)
      .execute()

    expect(page.error).toBeNull()
    expect(page.length).toBeGreaterThan(0)
    for (const entry of page) {
      expect(entry.tier).toBe(Tier.DIAMOND)
      expect(entry.rank).toBe(Division.I)
      expect(entry.queueType).toBe(RankedQueue.SOLO_5x5)
    }
  })

  test('streams the ladder with the async iterator, capped by maxItems', async () => {
    const collected: string[] = []
    for await (const entry of client().lol.league.streamEntries(
      RankedQueue.SOLO_5x5,
      Tier.DIAMOND,
      Division.I,
      REGION,
      { startPage: 1, maxItems: 12 },
    )) {
      collected.push(entry.puuid)
    }

    expect(collected.length).toBeGreaterThan(0)
    expect(collected.length).toBeLessThanOrEqual(12)
  })
})
