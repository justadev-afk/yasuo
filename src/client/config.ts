import { type CacheStore, type CacheStoreLike, coerceCacheStore, MemoryCache } from '../core/cache'
import { DEFAULT_NAMESPACE_TTL_MS } from '../core/cache/namespace-defaults'
import type { HttpClient } from '../core/http/http-client'
import type { HttpMiddleware } from '../core/http/middleware'
import { createConsoleLogger, type Logger, type LogLevel, resolveLogLevel } from '../core/logger'
import type { RateLimiterOptions } from '../core/rate-limit/rate-limiter'
import { DEFAULT_BASE_URL } from '../endpoints/endpoint'
import { CacheNamespace, type CacheNamespaceKey } from '../enums/cache-namespace'

/**
 * Reactive retry behaviour, applied when Riot returns `429`/`503` even after
 * proactive throttling (e.g. another process shares the key, or a service
 * incident).
 */
export interface RetryOptions {
  /** Whether to retry throttled requests at all. Default `true`. */
  enabled?: boolean
  /** Maximum retry attempts after the initial request. Default `3`. */
  maxAttempts?: number
  /** Upper bound (seconds) on how long a single `retry-after` is honoured. Default `120`. */
  maxRetryAfterSeconds?: number
  /** Also retry `502`/`503`/`504` service errors. Default `true`. */
  retryOnServiceUnavailable?: boolean
  /** Base backoff (ms) used when no `retry-after` header is present. Default `1000`. */
  backoffBaseMs?: number
}

/**
 * Per-namespace cache overrides, keyed under {@link CacheOptions.namespaces}.
 * Every field is optional and overrides the corresponding default for that one
 * namespace only.
 */
export interface NamespaceCacheOptions {
  /** Turn caching off for this namespace even when the cache is globally on. Default `true`. */
  enabled?: boolean
  /**
   * TTL (ms) for this namespace's entries. Overrides both the namespace's
   * built-in default and any global {@link CacheOptions.ttlMs}.
   */
  ttlMs?: number
}

/**
 * Response cache options. Caching is opt-in; when enabled, successful `GET`
 * responses are stored by URL and served without hitting Riot (or the rate
 * limiter) until they expire.
 *
 * Each namespace has its own **built-in default TTL** tuned to how volatile its
 * data is (see {@link DEFAULT_NAMESPACE_TTL_MS}); override any of them via
 * {@link namespaces}, or set a blanket {@link ttlMs} for all of them.
 */
export interface CacheOptions {
  /** Whether caching is on. Default `true` when a {@link CacheOptions} object is given. */
  enabled?: boolean
  /**
   * Backing store. Defaults to an in-memory {@link MemoryCache}. Pass a full
   * {@link CacheStore}, or a raw client and yasuo wraps it: a Redis-compatible
   * client (→ {@link RedisCache}) or a Cloudflare KV namespace (→ {@link KVCache}).
   */
  store?: CacheStoreLike
  /**
   * Blanket TTL (ms) applied to **every** namespace, overriding their built-in
   * per-namespace defaults. Omit to keep each namespace's tuned default. A
   * per-namespace {@link NamespaceCacheOptions.ttlMs} still wins over this.
   */
  ttlMs?: number
  /**
   * Per-namespace overrides, keyed by the namespace's access path
   * (`'lol.match'`, `'riot.account'`, …). Anything omitted keeps its default.
   *
   * @example
   * ```ts
   * cache: {
   *   namespaces: {
   *     'lol.match': { ttlMs: 86_400_000 }, // immutable — cache a full day
   *     'lol.spectator': { enabled: false }, // never cache live games
   *   },
   * }
   * ```
   */
  namespaces?: Partial<Record<CacheNamespaceKey, NamespaceCacheOptions>>
}

/**
 * Configuration accepted by the {@link Yasuo} constructor. Every field is
 * optional; sensible, production-safe defaults are applied.
 */
export interface YasuoConfig {
  /**
   * Riot Games API key. Falls back to the `RIOT_API_KEY` environment variable
   * when omitted.
   */
  key?: string
  /**
   * Base-URL template with `{routing}` and `{game}` placeholders. Override to
   * route through a rate-limiting proxy. Defaults to {@link DEFAULT_BASE_URL}.
   */
  baseUrl?: string
  /**
   * Proactive rate limiter. **Off by default** — you never have to configure
   * limits, and reactive `429`/`503` retries still protect you. Pass `true` to
   * enable header-driven proactive pacing, or an object to customise it.
   */
  rateLimit?: boolean | RateLimiterOptions
  /**
   * Reactive retry policy. `true`/omitted uses defaults, `false` disables
   * retries, an object customises them.
   */
  retry?: boolean | RetryOptions
  /**
   * Maximum number of concurrent in-flight requests. Defaults to unbounded
   * (`Infinity`); the rate limiter still paces them.
   */
  concurrency?: number
  /**
   * Custom transport. Any object implementing {@link HttpClient} (a single
   * `send(request)` method) can be injected — e.g. one backed by `undici`, a
   * proxy, or a mock in tests. Defaults to a `fetch`-based client.
   */
  httpClient?: HttpClient
  /**
   * Global request middleware, applied to **every** request (across all
   * services) in registration order — the first is the outermost layer. They
   * stack on top of any service-scoped middleware added via `namespace.use(...)`.
   * More can be added at runtime with {@link Yasuo.use}.
   */
  middleware?: HttpMiddleware[]
  /**
   * Response cache. `true` enables an in-memory cache; an object customises the
   * store/TTL; omitted/`false` disables caching.
   */
  cache?: boolean | CacheOptions
  /**
   * Custom logger. When omitted, a console logger filtered by {@link logLevel}
   * (or the `YASUO_LOG_LEVEL`/`LOG_LEVEL` env var) is used.
   */
  logger?: Logger
  /** Minimum log level. Overrides the environment; defaults to `SILENT`. */
  logLevel?: LogLevel
}

/** Fully-resolved retry options with all defaults applied. */
export interface ResolvedRetryOptions {
  readonly enabled: boolean
  readonly maxAttempts: number
  readonly maxRetryAfterSeconds: number
  readonly retryOnServiceUnavailable: boolean
  readonly backoffBaseMs: number
}

/** Fully-resolved cache settings for a single namespace. */
export interface ResolvedNamespaceCache {
  readonly enabled: boolean
  readonly ttlMs: number
}

/** Fully-resolved cache configuration. `store` is `null` when caching is off. */
export interface ResolvedCacheOptions {
  readonly store: CacheStore | null
  /** Global default TTL (ms), used as the fallback for an unmapped namespace. */
  readonly ttlMs: number
  /** Whether the cache is globally enabled. */
  readonly enabled: boolean
  /** Resolved `{ enabled, ttlMs }` for every {@link CacheNamespace}. */
  readonly namespaces: Readonly<Record<CacheNamespace, ResolvedNamespaceCache>>
}

const DEFAULT_RETRY: ResolvedRetryOptions = {
  enabled: true,
  maxAttempts: 3,
  maxRetryAfterSeconds: 120,
  retryOnServiceUnavailable: true,
  backoffBaseMs: 1000,
}

const DEFAULT_CACHE_TTL_MS = 60_000

/**
 * Normalise the user-facing {@link RetryOptions} (or a boolean shorthand) into
 * a fully-populated {@link ResolvedRetryOptions}.
 */
export function resolveRetryOptions(retry: YasuoConfig['retry']): ResolvedRetryOptions {
  if (retry === false) {
    return { ...DEFAULT_RETRY, enabled: false }
  }
  if (retry === undefined || retry === true) {
    return DEFAULT_RETRY
  }
  return {
    enabled: retry.enabled ?? DEFAULT_RETRY.enabled,
    maxAttempts: retry.maxAttempts ?? DEFAULT_RETRY.maxAttempts,
    maxRetryAfterSeconds: retry.maxRetryAfterSeconds ?? DEFAULT_RETRY.maxRetryAfterSeconds,
    retryOnServiceUnavailable:
      retry.retryOnServiceUnavailable ?? DEFAULT_RETRY.retryOnServiceUnavailable,
    backoffBaseMs: retry.backoffBaseMs ?? DEFAULT_RETRY.backoffBaseMs,
  }
}

/**
 * Normalise the user-facing rate-limit option (or a boolean shorthand) into
 * {@link RateLimiterOptions}.
 *
 * Proactive throttling is **opt-in**: when unset it stays off, so a caller never
 * has to configure limits — reactive `429`/`503` retries still protect them.
 * Pass `true` (or an options object) to enable proactive pacing.
 */
export function resolveRateLimiterOptions(rateLimit: YasuoConfig['rateLimit']): RateLimiterOptions {
  if (rateLimit === undefined || rateLimit === false) {
    return { enabled: false }
  }
  if (rateLimit === true) {
    return { enabled: true }
  }
  return { enabled: true, ...rateLimit }
}

/**
 * Normalise the user-facing cache option into a {@link ResolvedCacheOptions},
 * resolving each namespace's `{ enabled, ttlMs }` from (in order of precedence)
 * a per-namespace override, a global `ttlMs`, then the namespace's built-in
 * default.
 */
export function resolveCacheOptions(cache: YasuoConfig['cache']): ResolvedCacheOptions {
  if (cache === undefined || cache === false) {
    return buildResolvedCache(null, false, undefined, undefined)
  }
  if (cache === true) {
    return buildResolvedCache(new MemoryCache(), true, undefined, undefined)
  }
  const enabled = cache.enabled !== false
  const store = enabled ? (cache.store ? coerceCacheStore(cache.store) : new MemoryCache()) : null
  return buildResolvedCache(store, enabled, cache.ttlMs, cache.namespaces)
}

/** Assemble the per-namespace resolved cache table from the normalised inputs. */
function buildResolvedCache(
  store: CacheStore | null,
  enabled: boolean,
  globalTtlMs: number | undefined,
  overrides: Partial<Record<CacheNamespaceKey, NamespaceCacheOptions>> | undefined,
): ResolvedCacheOptions {
  const namespaces = {} as Record<CacheNamespace, ResolvedNamespaceCache>
  for (const ns of Object.values(CacheNamespace)) {
    const override = overrides?.[ns]
    namespaces[ns] = {
      enabled: enabled && (override?.enabled ?? true),
      ttlMs: override?.ttlMs ?? globalTtlMs ?? DEFAULT_NAMESPACE_TTL_MS[ns],
    }
  }
  return { store, enabled, ttlMs: globalTtlMs ?? DEFAULT_CACHE_TTL_MS, namespaces }
}

/** Resolve the logger to use, honouring an explicit logger or the log level. */
export function resolveLogger(config: YasuoConfig): Logger {
  return config.logger ?? createConsoleLogger(resolveLogLevel(config.logLevel))
}

/** Resolve the base-URL template, falling back to Riot's default host. */
export function resolveBaseUrl(baseUrl: string | undefined): string {
  return baseUrl ?? DEFAULT_BASE_URL
}
