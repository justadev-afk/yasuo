/**
 * Per-call cache overrides for a single {@link SingleQuery.execute}/
 * {@link CollectionQuery.execute}, applied to the query's own namespace.
 */
export interface ExecuteCacheOptions {
  /**
   * Whether to **serve this call from the cache** (the read). Writes still
   * happen whenever the cache is enabled. `false` forces a fresh request but
   * refreshes the stored entry with the response. Default: the namespace's
   * configured state.
   */
  enabled?: boolean
  /**
   * TTL (ms) for the entry this call writes, overriding the namespace default.
   */
  ttlMs?: number
}

/**
 * Options for the terminal {@link SingleQuery.execute}/{@link CollectionQuery.execute}.
 */
export interface ExecuteOptions {
  /**
   * Throw the underlying `ApiError` on failure instead of returning an
   * error-carrying result. Default `false` — failures are surfaced via the
   * result's `.error`.
   */
  throw?: boolean
  /**
   * Return **exactly** what the Riot API returned — the parsed JSON payload —
   * bypassing entity mapping. Typed `unknown` by default; pass a type argument
   * to `execute` when you know the shape (`execute<SummonerDTO>({ raw: true })`).
   * On a failed request this is the error body Riot sent. Default `false`.
   */
  raw?: boolean
  /** Abort signal for the underlying request. */
  signal?: AbortSignal
  /**
   * Cache control for this call only, scoped to the query's namespace. Ignored
   * unless the client has a cache configured.
   *
   * - `false` — **skip the cached read** (force a fresh request) but still write
   *   the fresh response back, refreshing the entry.
   * - `true` — force a cached read + write for this call, even if the namespace
   *   has caching disabled.
   * - `{ ttlMs }` — cache normally but with a custom TTL for this write.
   * - `{ enabled: false }` — same as `false`; `{ enabled: true }` same as `true`.
   *
   * @example
   * ```ts
   * // Always hit Riot, but keep the cache warm for other readers:
   * await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute({ cache: false })
   * // Cache this one match for a full day:
   * await yasuo.lol.match.get(id, RegionGroup.ASIA).execute({ cache: { ttlMs: 86_400_000 } })
   * ```
   */
  cache?: boolean | ExecuteCacheOptions
}

/**
 * The runner behind a query builder: performs the request and resolves the
 * mapped result (or, with `{ raw: true }`, the raw payload).
 *
 * @typeParam R - The mapped result type (an entity, {@link Collection} or {@link ValueResult}).
 */
export type QueryRunner<R> = (options: ExecuteOptions) => Promise<R | unknown>

/**
 * Extract the parts of an {@link ExecuteOptions} that should propagate to the
 * sub-queries of a composite call (the per-call cache override and the abort
 * signal), leaving `raw`/`throw` for the composite to decide per sub-request.
 */
export function forwardExec(exec: ExecuteOptions): ExecuteOptions {
  const forwarded: ExecuteOptions = {}
  if (exec.cache !== undefined) {
    forwarded.cache = exec.cache
  }
  if (exec.signal !== undefined) {
    forwarded.signal = exec.signal
  }
  return forwarded
}
