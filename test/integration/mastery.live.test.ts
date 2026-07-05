import { expect, test } from 'bun:test'
import { client, describeLive, puuid, REGION } from './support'

describeLive('lol.mastery (live)', () => {
  test('reads the top champion masteries, capped by count', async () => {
    const id = await puuid()
    const top = await client().lol.mastery.top(id, REGION, 3).execute()

    expect(top.error).toBeNull()
    expect(top.length).toBeGreaterThan(0)
    expect(top.length).toBeLessThanOrEqual(3)
    expect(top[0]?.championPoints).toBeGreaterThan(0)
    // Descending by points.
    const points = top.map((mastery) => mastery.championPoints)
    expect(points).toEqual([...points].sort((a, b) => b - a))
  })

  test('reads the total mastery score, boxed in a ValueResult', async () => {
    const id = await puuid()
    const score = await client().lol.mastery.score(id, REGION).execute()

    expect(score.error).toBeNull()
    expect(score.value).toBeGreaterThanOrEqual(0)
  })
})
