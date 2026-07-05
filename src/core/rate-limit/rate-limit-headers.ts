import type { RateLimits, RateLimitWindow } from '../../dto/common.dto'
import { HttpHeader } from '../../enums/http'
import { RateLimitType } from '../../enums/rate-limit'

/**
 * Parse a Riot rate-limit header value such as `"100:120,20:1"` into windows.
 *
 * @param value - The raw header value, or `undefined` when absent.
 * @returns One entry per comma-separated `limit:intervalSeconds` pair.
 */
function parseLimitPairs(
  value: string | undefined,
): Array<{ limit: number; intervalSeconds: number }> {
  if (!value) {
    return []
  }
  const pairs: Array<{ limit: number; intervalSeconds: number }> = []
  for (const part of value.split(',')) {
    const [limitRaw, intervalRaw] = part.split(':')
    const limit = Number(limitRaw)
    const intervalSeconds = Number(intervalRaw)
    if (Number.isFinite(limit) && Number.isFinite(intervalSeconds) && intervalSeconds > 0) {
      pairs.push({ limit, intervalSeconds })
    }
  }
  return pairs
}

/**
 * Parse a `*-count` header (e.g. `"1:120,1:1"`) into a lookup of current usage
 * keyed by the window interval in seconds.
 */
function parseCounts(value: string | undefined): Map<number, number> {
  const counts = new Map<number, number>()
  for (const { limit: count, intervalSeconds } of parseLimitPairs(value)) {
    counts.set(intervalSeconds, count)
  }
  return counts
}

/**
 * Merge a limit header and its matching count header into {@link RateLimitWindow}s.
 *
 * @param limitHeader - e.g. `x-app-rate-limit`.
 * @param countHeader - e.g. `x-app-rate-limit-count`.
 */
export function parseWindows(
  limitHeader: string | undefined,
  countHeader: string | undefined,
): RateLimitWindow[] {
  const counts = parseCounts(countHeader)
  return parseLimitPairs(limitHeader).map(({ limit, intervalSeconds }) => {
    const count = counts.get(intervalSeconds)
    return count === undefined ? { limit, intervalSeconds } : { limit, intervalSeconds, count }
  })
}

/**
 * Coerce a `x-rate-limit-type` header value into a {@link RateLimitType}.
 */
function parseRateLimitType(value: string | undefined): RateLimitType | null {
  switch (value) {
    case RateLimitType.APPLICATION:
      return RateLimitType.APPLICATION
    case RateLimitType.METHOD:
      return RateLimitType.METHOD
    case RateLimitType.SERVICE:
      return RateLimitType.SERVICE
    default:
      return null
  }
}

/**
 * Parse all rate-limit information out of a set of response headers.
 *
 * @param headers - Lower-cased response headers.
 * @returns The structured {@link RateLimits} exposed on every response's meta.
 */
export function parseRateLimits(headers: Readonly<Record<string, string>>): RateLimits {
  const retryAfterRaw = headers[HttpHeader.RETRY_AFTER]
  const retryAfter = retryAfterRaw === undefined ? null : Number(retryAfterRaw)
  return {
    type: parseRateLimitType(headers[HttpHeader.RATE_LIMIT_TYPE]),
    retryAfterSeconds: retryAfter !== null && Number.isFinite(retryAfter) ? retryAfter : null,
    app: parseWindows(headers[HttpHeader.APP_RATE_LIMIT], headers[HttpHeader.APP_RATE_LIMIT_COUNT]),
    method: parseWindows(
      headers[HttpHeader.METHOD_RATE_LIMIT],
      headers[HttpHeader.METHOD_RATE_LIMIT_COUNT],
    ),
    edgeTraceId: headers[HttpHeader.EDGE_TRACE_ID] ?? null,
  }
}

/** An empty {@link RateLimits}, used when no headers are available. */
export const EMPTY_RATE_LIMITS: RateLimits = {
  type: null,
  retryAfterSeconds: null,
  app: [],
  method: [],
  edgeTraceId: null,
}
