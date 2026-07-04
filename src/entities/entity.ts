import type { ResponseInfo, ResponseMeta } from '../dto/common.dto'
import type { ApiError } from '../errors/api-error'
import type { EntityContext } from './entity-context'

/**
 * Base class for every rich entity returned by the client.
 *
 * An entity **is** the response: the raw Riot payload (its fields are copied
 * onto the instance) augmented with lazy-relation methods and the HTTP context
 * of the request that produced it — {@link Entity.http} and {@link Entity.error}.
 *
 * Requests never throw for an API-level failure: on failure the DTO fields are
 * absent, {@link Entity.error} holds the original error and `http.ok` is `false`;
 * on success `error` is `null`. (Opt into throwing with `.execute({ throw: true })`.)
 *
 * @typeParam TData - The raw payload shape whose fields are exposed on the entity.
 */
export abstract class Entity<TData extends object> {
  /** The originating error, or `null` when the request succeeded. */
  readonly error: ApiError | null
  /** HTTP context of the response (`status`, `headers`, `rateLimits`, `ok`, `url`). */
  readonly http: ResponseInfo
  /** Raw response metadata, used internally by lazy relations. */
  protected readonly meta: ResponseMeta
  /** Context used by lazy relations to make follow-up requests. */
  protected readonly context: EntityContext

  constructor(
    data: TData,
    meta: ResponseMeta,
    context: EntityContext,
    error: ApiError | null = null,
  ) {
    Object.assign(this, data)
    this.meta = meta
    this.context = context
    this.error = error
    this.http = { ...meta, ok: error === null }
  }
}
