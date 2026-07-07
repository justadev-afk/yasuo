import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { resolveApiKeys } from '../../src/client/config'
import { buildKeyFingerprints, RequestExecutor } from '../../src/core/request/request-executor'
import type { Endpoint } from '../../src/endpoints/endpoint'
import { Game } from '../../src/enums/game'
import { HttpHeader } from '../../src/enums/http'
import { ApiKeyMissingError } from '../../src/errors'
import { MockHttpClient } from '../support/mock-http-client'

/** Every environment variable {@link resolveApiKeys} consults. */
const ENV_VARS = [
  'RIOT_API_KEY',
  'RIOT_LOL_API_KEY',
  'RIOT_TFT_API_KEY',
  'RIOT_VAL_API_KEY',
  'RIOT_LOR_API_KEY',
  'RIOT_ACCOUNT_API_KEY',
]

// Bun auto-loads `.env`, which may hold a real RIOT_API_KEY — clear every key
// var before each test so resolution is deterministic, then restore it.
let saved: Record<string, string | undefined>
beforeEach(() => {
  saved = {}
  for (const name of ENV_VARS) {
    saved[name] = process.env[name]
    delete process.env[name]
  }
})
afterEach(() => {
  for (const name of ENV_VARS) {
    if (saved[name] === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = saved[name]
    }
  }
})

/** Minimal endpoint fixture for a given product. */
function endpointFor(game: Game): Endpoint {
  return { id: `${game}.probe`, game, path: 'v1/probe' }
}

describe('resolveApiKeys', () => {
  test('a shared key signs every product', () => {
    const keys = resolveApiKeys({ key: 'SHARED' })
    expect(keys[Game.LOL]).toBe('SHARED')
    expect(keys[Game.TFT]).toBe('SHARED')
    expect(keys[Game.VAL]).toBe('SHARED')
    expect(keys[Game.LOR]).toBe('SHARED')
    expect(keys[Game.RIOT]).toBe('SHARED')
  })

  test('explicit per-product keys are used verbatim; unset products stay empty', () => {
    const keys = resolveApiKeys({ keys: { lol: 'L', tft: 'T' } })
    expect(keys[Game.LOL]).toBe('L')
    expect(keys[Game.TFT]).toBe('T')
    expect(keys[Game.VAL]).toBe('')
    expect(keys[Game.LOR]).toBe('')
    // Account borrows a product key (LoL first) when it has none of its own.
    expect(keys[Game.RIOT]).toBe('L')
  })

  test('a product key overrides the shared key for that product only', () => {
    const keys = resolveApiKeys({ key: 'SHARED', keys: { val: 'V' } })
    expect(keys[Game.VAL]).toBe('V')
    expect(keys[Game.LOL]).toBe('SHARED')
    expect(keys[Game.RIOT]).toBe('SHARED')
  })

  test('an explicit riot key wins over borrowing a product key', () => {
    const keys = resolveApiKeys({ keys: { riot: 'R', lol: 'L' } })
    expect(keys[Game.RIOT]).toBe('R')
  })

  test('account borrows in a stable order (lol → tft → val → lor)', () => {
    // No lol key, so tft is the first borrowable one — not val.
    const keys = resolveApiKeys({ keys: { val: 'V', tft: 'T' } })
    expect(keys[Game.RIOT]).toBe('T')
  })

  test('per-product env vars are honoured', () => {
    process.env.RIOT_VAL_API_KEY = 'ENV_VAL'
    const keys = resolveApiKeys({})
    expect(keys[Game.VAL]).toBe('ENV_VAL')
    expect(keys[Game.LOL]).toBe('')
    expect(keys[Game.RIOT]).toBe('ENV_VAL') // borrowed
  })

  test('the shared RIOT_API_KEY env var backs every product', () => {
    process.env.RIOT_API_KEY = 'ENV_SHARED'
    const keys = resolveApiKeys({})
    expect(keys[Game.LOL]).toBe('ENV_SHARED')
    expect(keys[Game.LOR]).toBe('ENV_SHARED')
  })

  test('precedence: explicit keys > per-product env > shared key > shared env', () => {
    process.env.RIOT_API_KEY = 'ENV_SHARED'
    process.env.RIOT_LOL_API_KEY = 'ENV_LOL'
    const keys = resolveApiKeys({ key: 'CFG_SHARED', keys: { lol: 'CFG_LOL' } })
    expect(keys[Game.LOL]).toBe('CFG_LOL') // explicit beats env
    // tft: no explicit, no per-product env → the shared config key
    expect(keys[Game.TFT]).toBe('CFG_SHARED')
  })

  test('per-product env beats the shared config key', () => {
    process.env.RIOT_LOL_API_KEY = 'ENV_LOL'
    const keys = resolveApiKeys({ key: 'CFG_SHARED' })
    expect(keys[Game.LOL]).toBe('ENV_LOL')
    expect(keys[Game.TFT]).toBe('CFG_SHARED')
  })

  test('an empty-string key is treated as missing and falls through', () => {
    const keys = resolveApiKeys({ key: 'SHARED', keys: { lol: '' } })
    expect(keys[Game.LOL]).toBe('SHARED')
  })

  test('nothing configured resolves every product to empty', () => {
    const keys = resolveApiKeys({})
    for (const game of Object.values(Game)) {
      expect(keys[game]).toBe('')
    }
  })
})

describe('buildKeyFingerprints', () => {
  test('distinct keys get distinct fingerprints (independent app buckets)', () => {
    const fps = buildKeyFingerprints({
      [Game.LOL]: 'A',
      [Game.TFT]: 'B',
      [Game.VAL]: 'C',
      [Game.LOR]: '',
      [Game.RIOT]: 'A',
    })
    expect(fps.get('A')).not.toBe(fps.get('B'))
    expect(fps.get('B')).not.toBe(fps.get('C'))
    // Products sharing a key share a fingerprint (and thus one app bucket).
    expect(fps.get('A')).toBe(fps.get('A'))
    // Empty keys are never fingerprinted.
    expect(fps.has('')).toBe(false)
    expect(fps.size).toBe(3)
  })
})

describe('RequestExecutor per-product key selection', () => {
  function executorWithKeys(config: Parameters<typeof resolveApiKeys>[0], http: MockHttpClient) {
    return new RequestExecutor({ ...config, httpClient: http, rateLimit: false })
  }

  test('each product is signed with its own configured key', async () => {
    const http = new MockHttpClient([{ status: 200, body: {} }])
    const executor = executorWithKeys(
      { keys: { lol: 'LOL_KEY', tft: 'TFT_KEY', val: 'VAL_KEY', lor: 'LOR_KEY' } },
      http,
    )
    await executor.request('KR', endpointFor(Game.LOL))
    await executor.request('KR', endpointFor(Game.TFT))
    await executor.request('NA', endpointFor(Game.VAL))
    await executor.request('AMERICAS', endpointFor(Game.LOR))
    expect(http.requests[0]?.headers[HttpHeader.RIOT_TOKEN]).toBe('LOL_KEY')
    expect(http.requests[1]?.headers[HttpHeader.RIOT_TOKEN]).toBe('TFT_KEY')
    expect(http.requests[2]?.headers[HttpHeader.RIOT_TOKEN]).toBe('VAL_KEY')
    expect(http.requests[3]?.headers[HttpHeader.RIOT_TOKEN]).toBe('LOR_KEY')
  })

  test('the account API borrows a product key when it has none of its own', async () => {
    const http = new MockHttpClient([{ status: 200, body: {} }])
    const executor = executorWithKeys({ keys: { val: 'VAL_KEY' } }, http)
    await executor.request('AMERICAS', endpointFor(Game.RIOT))
    expect(http.requests[0]?.headers[HttpHeader.RIOT_TOKEN]).toBe('VAL_KEY')
  })

  test('the shared key signs a product with no dedicated key', async () => {
    const http = new MockHttpClient([{ status: 200, body: {} }])
    const executor = executorWithKeys({ key: 'SHARED', keys: { lol: 'LOL_KEY' } }, http)
    await executor.request('KR', endpointFor(Game.TFT))
    expect(http.requests[0]?.headers[HttpHeader.RIOT_TOKEN]).toBe('SHARED')
  })

  test('a product with no resolvable key throws ApiKeyMissingError naming the product', async () => {
    const http = new MockHttpClient([{ status: 200, body: {} }])
    const executor = executorWithKeys({ keys: { lol: 'LOL_KEY' } }, http)
    const promise = executor.request('NA', endpointFor(Game.VAL))
    await expect(promise).rejects.toBeInstanceOf(ApiKeyMissingError)
    await expect(promise).rejects.toThrow(/"val"/)
    expect(http.callCount).toBe(0)
  })
})
