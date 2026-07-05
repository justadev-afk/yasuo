import {
  type ResolvedCacheOptions,
  type ResolvedNamespaceCache,
  type ResolvedRetryOptions,
  resolveBaseUrl,
  resolveCacheOptions,
  resolveLogger,
  resolveRateLimiterOptions,
  resolveRetryOptions,
  type YasuoConfig,
} from '../../client/config'
import type { ResponseMeta } from '../../dto/common.dto'
import type { Endpoint, PathParams, QueryParams } from '../../endpoints/endpoint'
import { resolveRequest } from '../../endpoints/endpoint'
import type { CacheNamespace } from '../../enums/cache-namespace'
import { HttpHeader, HttpMethod, HttpStatus } from '../../enums/http'
import { ApiError, ApiKeyMissingError, apiErrorFromStatus } from '../../errors'
import type { ExecuteCacheOptions } from '../../query/execute-options'
import type { CacheStore } from '../cache'
import { FetchHttpClient, type HttpClient, type HttpResponse } from '../http/http-client'
import { composeMiddleware, type HttpMiddleware, type MiddlewareContext } from '../http/middleware'
import type { Logger } from '../logger'
import { EMPTY_RATE_LIMITS, parseRateLimits } from '../rate-limit/rate-limit-headers'
import { RateLimiter } from '../rate-limit/rate-limiter'
import { Semaphore, sleep } from '../util'

const MS_PER_SECOND = 1000

/** Options for a single {@link RequestExecutor.request} call. */
export interface RequestOptions {
  /** Values for the endpoint's `:placeholder` path segments. */
  readonly pathParams?: PathParams
  /** Query-string parameters. */
  readonly query?: QueryParams
  /** Abort signal to cancel the request. */
  readonly signal?: AbortSignal
  /**
   * Service-scoped middleware, applied inside the global middleware for this
   * request only (a namespace passes its own {@link HttpMiddleware} list here).
   */
  readonly middleware?: readonly HttpMiddleware[]
  /**
   * The namespace this request belongs to, used to look up its per-namespace
   * cache settings. A namespace injects its own key automatically.
   */
  readonly cacheNamespace?: CacheNamespace
  /** Per-call cache override, forwarded from `execute({ cache })`. */
  readonly cache?: boolean | ExecuteCacheOptions
}

/** The raw data + metadata produced by an executed request. */
export interface Fetched<T> {
  /** Parsed response payload. */
  readonly data: T
  /** Response metadata (status, rate limits, url, headers). */
  readonly meta: ResponseMeta
}

/**
 * Central request pipeline shared by every namespace.
 *
 * Responsibilities, in order:
 * 1. Ensure an API key is present.
 * 2. Resolve the endpoint into a URL.
 * 3. Serve from the cache when a fresh entry exists.
 * 4. Proactively wait on the {@link RateLimiter}.
 * 5. Send the request through the (concurrency-capped) {@link HttpClient}.
 * 6. Parse rate-limit headers and, on success, feed them back to the limiter
 *    and store the result in the cache.
 * 7. On `429`/`503`, penalise the limiter and reactively retry with backoff.
 * 8. Otherwise throw the most specific {@link ApiError}.
 */
export class RequestExecutor {
  /** Whether an API key is configured. */
  get hasKey(): boolean {
    return this.key.length > 0
  }

  private readonly baseUrl: string
  private readonly cache: CacheStore | null
  private readonly cacheOptions: ResolvedCacheOptions
  private readonly httpClient: HttpClient
  private readonly key: string
  private readonly logger: Logger
  private readonly middleware: HttpMiddleware[]
  private readonly rateLimiter: RateLimiter
  private readonly retry: ResolvedRetryOptions
  private readonly semaphore: Semaphore

  constructor(config: YasuoConfig) {
    this.key = config.key ?? readEnvKey()
    this.baseUrl = resolveBaseUrl(config.baseUrl)
    this.rateLimiter = new RateLimiter(resolveRateLimiterOptions(config.rateLimit))
    this.retry = resolveRetryOptions(config.retry)
    this.semaphore = new Semaphore(config.concurrency ?? Number.POSITIVE_INFINITY)
    this.httpClient = config.httpClient ?? new FetchHttpClient()
    this.logger = resolveLogger(config)
    this.middleware = [...(config.middleware ?? [])]
    this.cacheOptions = resolveCacheOptions(config.cache)
    this.cache = this.cacheOptions.store
  }

  /**
   * Execute a request against an {@link Endpoint}.
   *
   * @typeParam T - Expected shape of the response body.
   * @param routing - Platform region or region-group value for the host.
   * @param endpoint - The endpoint to call.
   * @param options - Path/query params and an optional abort signal.
   * @returns The parsed payload and its {@link ResponseMeta}.
   * @throws {ApiKeyMissingError} If no API key is configured.
   * @throws {ApiError} For any non-2xx response once retries are exhausted.
   */
  async request<T>(
    routing: string,
    endpoint: Endpoint,
    options: RequestOptions = {},
  ): Promise<Fetched<T>> {
    if (!this.hasKey) {
      throw new ApiKeyMissingError()
    }
    const { url, host } = resolveRequest(
      this.baseUrl,
      routing,
      endpoint,
      options.pathParams,
      options.query,
    )

    const cacheControl = this.resolveCacheControl(options)
    if (this.cache && cacheControl.read) {
      const cached = await this.cache.get(url)
      if (cached) {
        this.logger.debug(`cache hit ${url}`)
        return cached as Fetched<T>
      }
    }

    const appKey = host
    const methodKey = `${host}:${endpoint.id}`
    const headers = { [HttpHeader.RIOT_TOKEN]: this.key }
    this.logger.debug(`GET ${url}`)

    const middleware = options.middleware
      ? [...this.middleware, ...options.middleware]
      : this.middleware

    let attempt = 0
    for (;;) {
      await this.rateLimiter.acquire(appKey, methodKey)
      const context: MiddlewareContext = { endpointId: endpoint.id, routing, attempt }
      const handler = composeMiddleware(
        middleware,
        (request) => this.httpClient.send(request),
        context,
      )
      let response: HttpResponse
      try {
        response = await this.semaphore.run(() =>
          handler({ url, method: HttpMethod.GET, headers, signal: options.signal }),
        )
      } catch (cause) {
        this.logger.error(`request errored ${url}: ${String(cause)}`)
        throw networkError(url, endpoint.id, cause)
      }
      const rateLimits = parseRateLimits(response.headers)
      // Learn/refresh the real limits from every response, success or failure.
      this.rateLimiter.update(appKey, methodKey, rateLimits)

      const meta: ResponseMeta = {
        status: response.status,
        rateLimits,
        url,
        headers: response.headers,
      }

      if (response.ok) {
        const result: Fetched<T> = { data: response.body as T, meta }
        if (this.cache && cacheControl.write && cacheControl.ttlMs > 0) {
          await this.cache.set(url, result, cacheControl.ttlMs)
        }
        return result
      }

      const throttled =
        response.status === HttpStatus.TOO_MANY_REQUESTS ||
        response.status === HttpStatus.SERVICE_UNAVAILABLE
      if (throttled) {
        this.rateLimiter.penalize(appKey, methodKey, rateLimits)
      }

      if (
        this.retry.enabled &&
        this.isRetryable(response.status) &&
        attempt < this.retry.maxAttempts
      ) {
        attempt += 1
        const waitMs = this.computeRetryWaitMs(rateLimits.retryAfterSeconds, attempt)
        this.logger.warn(
          `retry ${attempt}/${this.retry.maxAttempts} after ${waitMs}ms (status ${response.status}) ${url}`,
        )
        await sleep(waitMs)
        continue
      }

      this.logger.error(`request failed (${response.status}) ${url}`)
      throw apiErrorFromStatus({
        status: response.status,
        url,
        method: endpoint.id,
        rateLimits,
        body: response.body,
        headers: response.headers,
        response,
      })
    }
  }

  /**
   * Register a global {@link HttpMiddleware}, appended after any already
   * present (so it becomes the innermost of the global layers). Applies to
   * every subsequent request across all services.
   */
  use(middleware: HttpMiddleware): void {
    this.middleware.push(middleware)
  }

  /** Milliseconds to wait before a retry: `retry-after` if present, else backoff. */
  private computeRetryWaitMs(retryAfterSeconds: number | null, attempt: number): number {
    if (retryAfterSeconds !== null && retryAfterSeconds > 0) {
      return Math.min(retryAfterSeconds, this.retry.maxRetryAfterSeconds) * MS_PER_SECOND
    }
    return this.retry.backoffBaseMs * 2 ** (attempt - 1)
  }

  /** Whether an HTTP status is eligible for a reactive retry. */
  private isRetryable(status: number): boolean {
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return true
    }
    return (
      this.retry.retryOnServiceUnavailable &&
      (status === HttpStatus.BAD_GATEWAY ||
        status === HttpStatus.SERVICE_UNAVAILABLE ||
        status === HttpStatus.GATEWAY_TIMEOUT)
    )
  }

  /**
   * Resolve whether this request should read from and/or write to the cache,
   * and with what TTL — folding the namespace's configured settings with the
   * per-call `execute({ cache })` override.
   *
   * A per-call `false`/`{ enabled: false }` skips the **read** only: the fresh
   * response is still written back (a force-refresh). `true`/`{ enabled: true }`
   * forces both, even for a namespace whose caching is disabled.
   */
  private resolveCacheControl(options: RequestOptions): {
    read: boolean
    write: boolean
    ttlMs: number
  } {
    if (!this.cache) {
      return { read: false, write: false, ttlMs: 0 }
    }
    const nsKey = options.cacheNamespace
    const base: ResolvedNamespaceCache =
      nsKey !== undefined
        ? this.cacheOptions.namespaces[nsKey]
        : { enabled: this.cacheOptions.enabled, ttlMs: this.cacheOptions.ttlMs }
    let read = base.enabled
    let write = base.enabled
    let ttlMs = base.ttlMs
    const override = options.cache
    if (override === true) {
      read = true
      write = true
    } else if (override === false) {
      read = false
    } else if (override) {
      if (override.enabled === true) {
        read = true
        write = true
      } else if (override.enabled === false) {
        read = false
      }
      if (override.ttlMs !== undefined) {
        ttlMs = override.ttlMs
      }
    }
    return { read, write, ttlMs }
  }
}

/** Wrap a transport/network failure into an {@link ApiError} with status `0`. */
function networkError(url: string, method: string, cause: unknown): ApiError {
  const message = cause instanceof Error ? cause.message : String(cause)
  return new ApiError(
    {
      status: 0,
      url,
      method,
      rateLimits: EMPTY_RATE_LIMITS,
      body: cause,
      headers: {},
      response: null,
    },
    `Network request to ${url} failed: ${message}`,
  )
}

/** Read the API key from the environment when not passed explicitly. */
function readEnvKey(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  return env?.RIOT_API_KEY ?? ''
}
