import { describe } from 'bun:test'
import { Yasuo } from '../../src/client/yasuo'
import { LogLevel } from '../../src/core/logger'
import { Region, RegionGroup, regionToAccountRegionGroup } from '../../src/enums/region'
import type { ApiError } from '../../src/errors'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../src/errors'

/**
 * Shared harness for the live integration suite.
 *
 * Every `*.live.test.ts` file goes through this module so the whole suite:
 *   - shares ONE {@link Yasuo} client, so caching and the proactive rate limiter
 *     span every file (Bun runs them in a single process, sequentially);
 *   - resolves the test account's PUUID exactly once ({@link puuid});
 *   - self-paces under the development key's basic limit (20 req/s, 100 req/2min)
 *     because `rateLimit: true` syncs to the `X-App-Rate-Limit` headers;
 *   - is skipped wholesale when no `RIOT_API_KEY` is present, so `bun test`
 *     stays green offline and on forks without the secret.
 */
const KEY = process.env.RIOT_API_KEY
export const hasKey = typeof KEY === 'string' && KEY.startsWith('RGAPI')

/** `describe` when a key is present, `describe.skip` otherwise. */
export const describeLive = hasKey ? describe : describe.skip

if (!hasKey) {
  console.warn('[integration] RIOT_API_KEY not set — skipping live tests')
}

/** The test account. Override via env to point at a different summoner. */
export const GAME_NAME = process.env.YASUO_TEST_GAME_NAME ?? 'Hide on bush'
export const TAG_LINE = process.env.YASUO_TEST_TAG_LINE ?? 'KR1'

/** Accept both enum keys (`KR`) and friendly names (`KOREA`) in the env. */
const REGION_ALIASES: Record<string, Region> = {
  KR: Region.KR,
  KOREA: Region.KR,
  NA: Region.NA,
  EUW: Region.EUW,
}
export const REGION =
  REGION_ALIASES[(process.env.YASUO_TEST_REGION ?? 'KR').toUpperCase()] ?? Region.KR
export const ACCOUNT_GROUP = regionToAccountRegionGroup(REGION)
export const MATCH_GROUP =
  REGION === Region.KR ? RegionGroup.ASIA : regionToAccountRegionGroup(REGION)

let singleton: Yasuo | undefined

/** The one shared, self-pacing, cached client for the whole live suite. */
export function client(): Yasuo {
  if (!singleton) {
    singleton = new Yasuo({
      key: KEY,
      logLevel: LogLevel.SILENT,
      rateLimit: true, // proactive pacing — learns the dev key's limit from headers
      cache: true, // dedupe identical reads across files
    })
  }
  return singleton
}

let puuidPromise: Promise<string> | undefined

/** Resolve the shared account's PUUID once and reuse it across every file. */
export function puuid(): Promise<string> {
  if (!puuidPromise) {
    puuidPromise = client()
      .riot.account.byRiotId(GAME_NAME, TAG_LINE, ACCOUNT_GROUP)
      .execute({ throw: true })
      .then((account) => account.puuid)
  }
  return puuidPromise
}

/**
 * Pass a result through, tolerating the `401/403/404`s a development key
 * legitimately cannot reach (returned as `null`). Any other error still throws
 * so real regressions fail the suite. Accepts `null` (e.g. spectator's
 * "not in game") verbatim.
 */
export function tolerate<T extends { error: ApiError | null }>(result: T | null): T | null {
  if (result === null || result.error === null) {
    return result
  }
  const { error } = result
  if (
    error instanceof ForbiddenError ||
    error instanceof NotFoundError ||
    error instanceof UnauthorizedError
  ) {
    return null
  }
  throw error
}
