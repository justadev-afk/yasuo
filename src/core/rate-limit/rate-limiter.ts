import type { RateLimits, RateLimitWindow } from '../../dto/common.dto'
import { RateLimitType } from '../../enums/rate-limit'
import { type Clock, sleep, systemClock } from '../util'
import { RateLimitBucket } from './rate-limit-bucket'

const MS_PER_SECOND = 1000

/**
 * Conservative windows applied to a fresh application bucket before Riot's
 * headers are seen. Matches the Riot development-key defaults (20 req/s and
 * 100 req/2min) so an eager initial burst cannot trip a `429` on cold start.
 */
export const DEFAULT_BOOTSTRAP_APP_WINDOWS: readonly RateLimitWindow[] = [
  { limit: 20, intervalSeconds: 1 },
  { limit: 100, intervalSeconds: 120 },
]

/** Options controlling {@link RateLimiter} behaviour. */
export interface RateLimiterOptions {
  /** Disable proactive throttling entirely (reactive retries still apply). */
  enabled?: boolean
  /** Injectable clock, primarily for deterministic tests. */
  clock?: Clock
  /** Windows applied to an app bucket before Riot's real limits are learned. */
  bootstrapAppWindows?: readonly RateLimitWindow[]
  /** Reconcile local counters with Riot's `*-count` headers (default `true`). */
  syncWithHeaders?: boolean
}

const NOOP = (): void => {}

/**
 * Proactive, header-aware rate limiter.
 *
 * Every request first {@link acquire}s a slot from both its application bucket
 * (shared per routing host) and its method bucket (per endpoint). The limiter
 * self-throttles so requests are paced *underneath* the limits Riot advertises
 * in `x-app-rate-limit` / `x-method-rate-limit`, avoiding `429`s before they
 * happen. When a `429`/`503` does slip through, {@link penalize} parks the
 * offending bucket until Riot's `retry-after` elapses.
 *
 * Acquisition bookkeeping is serialised through an internal gate so concurrent
 * requests can never both observe a free slot and overshoot the limit.
 */
export class RateLimiter {
  private readonly enabled: boolean
  private readonly clock: Clock
  private readonly bootstrapAppWindows: readonly RateLimitWindow[]
  private readonly syncWithHeaders: boolean
  private readonly appBuckets = new Map<string, RateLimitBucket>()
  private readonly methodBuckets = new Map<string, RateLimitBucket>()
  private gate: Promise<void> = Promise.resolve()

  constructor(options: RateLimiterOptions = {}) {
    this.enabled = options.enabled ?? true
    this.clock = options.clock ?? systemClock
    this.bootstrapAppWindows = options.bootstrapAppWindows ?? DEFAULT_BOOTSTRAP_APP_WINDOWS
    this.syncWithHeaders = options.syncWithHeaders ?? true
  }

  private getAppBucket(appKey: string): RateLimitBucket {
    let bucket = this.appBuckets.get(appKey)
    if (!bucket) {
      bucket = new RateLimitBucket()
      if (this.bootstrapAppWindows.length > 0) {
        bucket.configure(this.bootstrapAppWindows, this.clock())
      }
      this.appBuckets.set(appKey, bucket)
    }
    return bucket
  }

  private getMethodBucket(methodKey: string): RateLimitBucket {
    let bucket = this.methodBuckets.get(methodKey)
    if (!bucket) {
      bucket = new RateLimitBucket()
      this.methodBuckets.set(methodKey, bucket)
    }
    return bucket
  }

  /**
   * Wait until a request against `appKey` + `methodKey` may be sent, then
   * reserve a slot in each bucket.
   *
   * @param appKey - Application scope key (the routing host).
   * @param methodKey - Method scope key (`host:endpointId`).
   */
  async acquire(appKey: string, methodKey: string): Promise<void> {
    if (!this.enabled) {
      return
    }
    for (;;) {
      const wait = await this.reserve(appKey, methodKey)
      if (wait <= 0) {
        return
      }
      await sleep(wait)
    }
  }

  /**
   * Atomically inspect both buckets: if a slot is free, record the request and
   * return `0`; otherwise return how long to wait before retrying. Serialised
   * through {@link gate} so the check-and-record is race-free.
   */
  private reserve(appKey: string, methodKey: string): Promise<number> {
    const run = this.gate.then(() => {
      const now = this.clock()
      const app = this.getAppBucket(appKey)
      const method = this.getMethodBucket(methodKey)
      const wait = Math.max(app.timeUntilAvailable(now), method.timeUntilAvailable(now))
      if (wait <= 0) {
        app.record(now)
        method.record(now)
      }
      return wait
    })
    this.gate = run.then(NOOP, NOOP)
    return run
  }

  /**
   * Learn the real limits from a response's rate-limit headers.
   *
   * @param appKey - Application scope key.
   * @param methodKey - Method scope key.
   * @param rateLimits - Parsed headers from the response.
   */
  update(appKey: string, methodKey: string, rateLimits: RateLimits): void {
    if (!this.enabled) {
      return
    }
    const now = this.clock()
    if (rateLimits.app.length > 0) {
      this.getAppBucket(appKey).configure(this.stripCounts(rateLimits.app), now)
    }
    if (rateLimits.method.length > 0) {
      this.getMethodBucket(methodKey).configure(this.stripCounts(rateLimits.method), now)
    }
  }

  /**
   * Park the bucket(s) implicated by a `429`/`503` until `retry-after` elapses.
   *
   * @param appKey - Application scope key.
   * @param methodKey - Method scope key.
   * @param rateLimits - Parsed headers from the throttled response.
   */
  penalize(appKey: string, methodKey: string, rateLimits: RateLimits): void {
    if (!this.enabled) {
      return
    }
    const retryAfterMs = (rateLimits.retryAfterSeconds ?? 0) * MS_PER_SECOND
    if (retryAfterMs <= 0) {
      return
    }
    const until = this.clock() + retryAfterMs
    switch (rateLimits.type) {
      case RateLimitType.METHOD:
        this.getMethodBucket(methodKey).blockUntil(until)
        break
      case RateLimitType.APPLICATION:
        this.getAppBucket(appKey).blockUntil(until)
        break
      default:
        // `service` or unknown: block both to be safe.
        this.getAppBucket(appKey).blockUntil(until)
        this.getMethodBucket(methodKey).blockUntil(until)
        break
    }
  }

  private stripCounts(windows: readonly RateLimitWindow[]): RateLimitWindow[] {
    if (this.syncWithHeaders) {
      return [...windows]
    }
    return windows.map(({ limit, intervalSeconds }) => ({ limit, intervalSeconds }))
  }
}
