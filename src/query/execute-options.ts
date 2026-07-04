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
   * Return **exactly** what the Riot API returned — the parsed JSON payload,
   * typed `unknown` — bypassing entity mapping. On a failed request this is the
   * error body Riot sent. Default `false`.
   */
  raw?: boolean
  /** Abort signal for the underlying request. */
  signal?: AbortSignal
}

/**
 * The runner behind a query builder: performs the request and resolves the
 * mapped result (or, with `{ raw: true }`, the raw payload).
 *
 * @typeParam R - The mapped result type (an entity, {@link Collection} or {@link ValueResult}).
 */
export type QueryRunner<R> = (options: ExecuteOptions) => Promise<R | unknown>
