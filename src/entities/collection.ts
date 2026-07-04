import type { ResponseInfo, ResponseMeta } from '../dto/common.dto'
import type { ApiError } from '../errors/api-error'

/**
 * An array of entities (or scalars) returned by a list endpoint, augmented with
 * the HTTP context of the response that produced it — {@link Collection.http}
 * and {@link Collection.error}.
 *
 * Behaves like a normal array (`length`, indexing, `for..of`, `map`, …). On a
 * failed request the collection is empty and {@link Collection.error} is set;
 * on success `error` is `null`. Note that array methods returning a new array
 * (`map`, `filter`, `slice`) return a plain `Array`, so the derived result has
 * no `.http`/`.error`.
 *
 * @typeParam T - The element type.
 */
export class Collection<T> extends Array<T> {
  /** The originating error, or `null` when the request succeeded. */
  readonly error: ApiError | null
  /** HTTP context of the response (`status`, `headers`, `rateLimits`, `ok`, `url`). */
  readonly http: ResponseInfo
  /** Raw response metadata. */
  readonly meta: ResponseMeta

  private constructor(meta: ResponseMeta, error: ApiError | null, items: readonly T[]) {
    super(items.length)
    for (let index = 0; index < items.length; index += 1) {
      this[index] = items[index] as T
    }
    this.meta = meta
    this.error = error
    this.http = { ...meta, ok: error === null }
  }

  /**
   * Build a {@link Collection} from items and the response metadata they share.
   *
   * @param items - The elements.
   * @param meta - Metadata shared by every element.
   * @param error - The originating error, or `null` on success (default `null`).
   */
  static create<T>(
    items: readonly T[],
    meta: ResponseMeta,
    error: ApiError | null = null,
  ): Collection<T> {
    return new Collection<T>(meta, error, items)
  }

  // Ensure derived array operations (`map`, `filter`, …) produce plain arrays
  // rather than attempting to construct a metadata-less Collection.
  static override get [Symbol.species](): ArrayConstructor {
    return Array
  }
}
