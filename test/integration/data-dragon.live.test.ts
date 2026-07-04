import { expect, test } from 'bun:test'
import { client, describeLive } from './support'

/**
 * Data Dragon is a public CDN — no key, no rate limits, no query builder. Its
 * methods return the raw payloads directly (the documented exception to the
 * `.execute()` result model).
 */
describeLive('dataDragon (live CDN)', () => {
  test('lists versions, newest first', async () => {
    const versions = await client().dataDragon.versions()
    expect(versions.length).toBeGreaterThan(0)
    expect(versions[0]).toMatch(/^\d+\.\d+/)
  })

  test('reads the champion list for the latest version', async () => {
    const champions = await client().dataDragon.champions()
    const names = Object.keys(champions.data)
    expect(names.length).toBeGreaterThan(100)
    expect(names).toContain('Yasuo')
  })
})
