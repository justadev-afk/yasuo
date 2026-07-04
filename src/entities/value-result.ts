import type { ResponseInfo, ResponseMeta } from '../dto/common.dto'
import type { ApiError } from '../errors/api-error'

/**
 * The boxed result of a **scalar** endpoint (one that returns a bare value, e.g.
 * a mastery score `number` or a raw percentile map). A primitive can't carry
 * HTTP context, so the value is wrapped: read it from {@link ValueResult.value},
 * with the same {@link ValueResult.error}/{@link ValueResult.http} as every
 * other result.
 *
 * On failure `value` is `null`, `error` holds the original error and `http.ok`
 * is `false`; on success `error` is `null`.
 *
 * @typeParam T - The scalar payload type.
 */
export class ValueResult<T> {
  /** HTTP context of the response (`status`, `headers`, `rateLimits`, `ok`, `url`). */
  readonly http: ResponseInfo

  constructor(
    /** The scalar value, or `null` when the request failed. */
    readonly value: T | null,
    meta: ResponseMeta,
    /** The originating error, or `null` when the request succeeded. */
    readonly error: ApiError | null = null,
  ) {
    this.http = { ...meta, ok: error === null }
  }
}
