import { expect, test } from 'bun:test'
import { client, describeLive, REGION } from './support'

describeLive('lol.champion + lol.status (live)', () => {
  test('reads the free champion rotation (normalised across API shapes)', async () => {
    const rotation = await client().lol.champion.rotation(REGION).execute()

    expect(rotation.error).toBeNull()
    expect(rotation.freeChampions.length).toBeGreaterThan(0)
    expect(rotation.newPlayerChampions.length).toBeGreaterThan(0)
  })

  test('reads platform status', async () => {
    const status = await client().lol.status.get(REGION).execute()

    expect(status.error).toBeNull()
    expect(status.id).toBeDefined()
    expect(status.name).toBeString()
  })
})
