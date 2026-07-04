import type { HttpResponse } from '../core/http/http-client'
import type { RateLimits } from '../dto/common.dto'
import { YasuoError } from './yasuo-error'

/**
 * Constructor payload shared by every {@link ApiError}.
 */
export interface ApiErrorInit {
  /** HTTP status code returned by Riot. */
  readonly status: number
  /** Final request URL (query string included). */
  readonly url: string
  /** Rate-limit method key of the endpoint that failed (for diagnostics). */
  readonly method: string
  /** Rate-limit information parsed from the response headers. */
  readonly rateLimits: RateLimits
  /** Parsed response body, when Riot returned one. */
  readonly body: unknown
  /** Raw, lower-cased response headers. */
  readonly headers: Readonly<Record<string, string>>
  /** The original HTTP response, or `null` for transport/network failures. */
  readonly response?: HttpResponse | null
}

/**
 * Thrown for any non-2xx Riot response that is not represented by a more
 * specific subclass. Also the base class for all HTTP errors, so
 * `catch (e) { if (e instanceof ApiError) ... }` matches every failed request.
 */
export class ApiError extends YasuoError {
  /** HTTP status code returned by Riot. */
  readonly status: number
  /** Final request URL (query string included). */
  readonly url: string
  /** Rate-limit method key of the endpoint that failed. */
  readonly method: string
  /** Rate-limit information parsed from the response headers. */
  readonly rateLimits: RateLimits
  /** Parsed response body, when Riot returned one. */
  readonly body: unknown
  /** Raw, lower-cased response headers. */
  readonly headers: Readonly<Record<string, string>>
  /** The original HTTP response, or `null` for transport/network failures. */
  readonly response: HttpResponse | null

  constructor(init: ApiErrorInit, message?: string) {
    super(message ?? `Riot API request failed with status ${init.status} (${init.url})`)
    this.status = init.status
    this.url = init.url
    this.method = init.method
    this.rateLimits = init.rateLimits
    this.body = init.body
    this.headers = init.headers
    this.response = init.response ?? null
  }
}
