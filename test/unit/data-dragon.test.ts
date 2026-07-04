import { describe, expect, test } from 'bun:test'
import { DataDragonNamespace } from '../../src/namespaces/data-dragon/data-dragon.namespace'

/** A `fetch` stand-in that replies with JSON for the first matching URL fragment. */
function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return ((url: string) => {
    for (const [fragment, body] of Object.entries(routes)) {
      if (url.includes(fragment)) {
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
      }
    }
    return Promise.resolve(new Response('nope', { status: 404, statusText: 'Not Found' }))
  }) as unknown as typeof fetch
}

const ROUTES = {
  'api/versions.json': ['14.1.1', '14.1.0'],
  'languages.json': ['en_US', 'ko_KR'],
  'realms/na.json': { n: 'na', v: '14.1.1' },
  'champion/Aatrox.json': { data: { Aatrox: { id: 'Aatrox', key: '266' } } },
  'champion/Ghost.json': { data: {} },
  'champion.json': { data: { Aatrox: { id: 'Aatrox', key: '266' } } },
  'runesReforged.json': [{ id: 8000 }],
  'queues.json': [{ queueId: 420 }],
  'maps.json': [{ mapId: 11 }],
  'gameModes.json': [{ gameMode: 'CLASSIC' }],
  'gameTypes.json': [{ gametype: 'MATCHED_GAME' }],
  'seasons.json': [{ id: 13 }],
}

function dd(routes: Record<string, unknown> = ROUTES): DataDragonNamespace {
  return new DataDragonNamespace(fakeFetch(routes))
}

describe('DataDragonNamespace', () => {
  test('versions (memoised), languages, realm', async () => {
    const d = dd()
    const versions = await d.versions()
    expect(versions[0]).toBe('14.1.1')
    // Memoised — same promise on a second call.
    expect(d.versions()).toBe(d.versions())
    expect(await d.languages()).toContain('ko_KR')
    expect(await d.realm('na')).toBeDefined()
  })

  test('champions list (versioned + memoised), champion detail, championById', async () => {
    const d = dd()
    const list = await d.champions()
    expect(Object.keys(list.data)).toContain('Aatrox')

    const detail = await d.champion('Aatrox')
    expect(detail.id).toBe('Aatrox')

    expect(await d.championById(266)).not.toBeNull()
    expect(await d.championById(999)).toBeNull()
  })

  test('runes + the static reference lists', async () => {
    const d = dd()
    expect((await d.runesReforged()).length).toBe(1)
    expect((await d.queues())[0]?.queueId).toBe(420)
    expect((await d.maps()).length).toBe(1)
    expect((await d.gameModes()).length).toBe(1)
    expect((await d.gameTypes()).length).toBe(1)
    expect((await d.seasons()).length).toBe(1)
  })

  test('a non-OK response throws', async () => {
    await expect(dd({}).languages()).rejects.toThrow(/Data Dragon request failed/)
  })

  test('a missing champion in the payload throws', async () => {
    await expect(dd().champion('Ghost')).rejects.toThrow(/not found/)
  })

  test('no versions available throws', async () => {
    await expect(dd({ 'api/versions.json': [] }).champions()).rejects.toThrow(/no versions/)
  })
})
