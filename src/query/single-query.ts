import type { ExecuteOptions, QueryRunner } from './execute-options'

/**
 * A deferred request for a **single** resource.
 *
 * Building the query performs no I/O — call {@link execute} to run it. It
 * resolves to the entity (or {@link ValueResult}) **directly**, carrying its own
 * `.error` and `.http`; it does not throw for an API-level failure unless you
 * pass `{ throw: true }`. Pass `{ raw: true }` to get the raw Riot payload as
 * `unknown` instead.
 *
 * @typeParam E - The resolved entity/result type.
 * @example
 * ```ts
 * const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()
 * if (summoner.error) return
 * console.log(summoner.summonerLevel, summoner.http.status)
 * ```
 */
export class SingleQuery<E> {
  /**
   * @param runner - Runs the request and resolves the mapped result.
   */
  constructor(private readonly runner: QueryRunner<E>) {}

  /** Run the request and resolve the raw Riot payload as `unknown`. */
  execute(options: ExecuteOptions & { raw: true }): Promise<unknown>
  /** Run the request and resolve the entity/result directly. */
  execute(options?: ExecuteOptions): Promise<E>
  execute(options: ExecuteOptions = {}): Promise<E | unknown> {
    return this.runner(options)
  }
}
