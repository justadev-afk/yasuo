import { type CacheStore, type CacheStoreLike, coerceCacheStore, MemoryCache } from '../core/cache'
import { DEFAULT_NAMESPACE_TTL_MS } from '../core/cache/namespace-defaults'
import type { HttpClient } from '../core/http/http-client'
import type { HttpMiddleware } from '../core/http/middleware'
import { createConsoleLogger, type Logger, type LogLevel, resolveLogLevel } from '../core/logger'
import type { RateLimiterOptions } from '../core/rate-limit/rate-limiter'
import { DEFAULT_BASE_URL } from '../endpoints/endpoint'
import { CacheNamespace, type CacheNamespaceKey } from '../enums/cache-namespace'
import { Game } from '../enums/game'

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
 * Per-product API keys, keyed by {@link Game} — the product a request belongs to
 * (its URL path segment). Riot recommends registering a separate product, and
 * therefore a separate key, per game; map each product to its key here and yasuo
 * signs every request with the key for that request's game automatically.
 *
 * Every entry is optional and the string form is interchangeable with the enum
 * (`{ lol: '…' }` or `{ [Game.LOL]: '…' }`). `riot` is the shared Account API.
 *
 * @see {@link YasuoConfig.keys} for the full resolution order.
 */
export type ApiKeyMap = Partial<Record<`${Game}`, string>>

/**
 * Configuration accepted by the {@link Yasuo} constructor. Every field is
 * optional; sensible, production-safe defaults are applied.
 */
export interface YasuoConfig {
  /**
   * Shared Riot Games API key, used for any product without a dedicated
   * {@link YasuoConfig.keys} entry. Falls back to the `RIOT_API_KEY` environment
   * variable when omitted.
   */
  key?: string
  /**
   * Per-product API keys (see {@link ApiKeyMap}). Riot advises one product/key
   * per game; set them here to keep each product's traffic — and its rate-limit
   * budget — isolated. Distinct keys get independent rate-limit buckets.
   *
   * The key for a given request is resolved in this order:
   * 1. `keys[game]` — the product's explicit key;
   * 2. `RIOT_<GAME>_API_KEY` env var (`RIOT_LOL_API_KEY`, `RIOT_TFT_API_KEY`,
   *    `RIOT_VAL_API_KEY`, `RIOT_LOR_API_KEY`, `RIOT_ACCOUNT_API_KEY`);
   * 3. the shared {@link YasuoConfig.key};
   * 4. the `RIOT_API_KEY` env var.
   *
   * The Account API (`riot`) additionally borrows any configured product key as
   * a last resort, since Account-V1 accepts any valid Riot key. When no key
   * resolves for a request's product, an `ApiKeyMissingError` is thrown.
   *
   * @example
   * ```ts
   * new Yasuo({
   *   keys: {
   *     lol: process.env.RIOT_LOL_KEY,
   *     tft: process.env.RIOT_TFT_KEY,
   *     val: process.env.RIOT_VAL_KEY,
   *   },
   *   key: process.env.RIOT_API_KEY, // shared fallback for lor + account
   * })
   * ```
   */
  keys?: ApiKeyMap
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

/** Fully-resolved per-product keys: the concrete key each {@link Game} uses (`''` = none). */
export type ResolvedApiKeys = Readonly<Record<Game, string>>

/** Products that can lend their key to the Account API, in stable precedence order. */
const BORROWABLE_PRODUCTS: readonly Game[] = [Game.LOL, Game.TFT, Game.VAL, Game.LOR]

/** Environment-variable name holding each product's dedicated key. */
const PRODUCT_ENV_VAR: Readonly<Record<Game, string>> = {
  [Game.LOL]: 'RIOT_LOL_API_KEY',
  [Game.TFT]: 'RIOT_TFT_API_KEY',
  [Game.VAL]: 'RIOT_VAL_API_KEY',
  [Game.LOR]: 'RIOT_LOR_API_KEY',
  [Game.RIOT]: 'RIOT_ACCOUNT_API_KEY',
}

/** Read an environment variable, returning `''` when unset or unavailable. */
function readEnv(name: string): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  return env?.[name] ?? ''
}

/**
 * Resolve the concrete API key each {@link Game} will use, folding the per-product
 * {@link YasuoConfig.keys}, per-product environment variables, the shared
 * {@link YasuoConfig.key}, and `RIOT_API_KEY` — in that precedence — into a flat
 * table. An empty string means no key is configured for that product (a request
 * for it throws `ApiKeyMissingError`).
 *
 * The Account API (`riot`) additionally borrows the first configured product key
 * (LoL → TFT → VAL → LoR) as a last resort, since Account-V1 accepts any valid
 * Riot key.
 */
export function resolveApiKeys(config: YasuoConfig): ResolvedApiKeys {
  // An explicit config value (even `''`) suppresses the env read at its level —
  // `key: ''` means "no key", never "read RIOT_API_KEY". Empty strings only fall
  // through *between* levels (product → shared), hence `??` here but `||` below.
  const shared = config.key ?? readEnv('RIOT_API_KEY')
  // A product's own key: explicit config first, then its dedicated env var.
  const dedicated = (game: Game): string => config.keys?.[game] ?? readEnv(PRODUCT_ENV_VAR[game])

  const resolved = {} as Record<Game, string>
  for (const game of Object.values(Game)) {
    resolved[game] = dedicated(game) || shared
  }
  if (!resolved[Game.RIOT]) {
    resolved[Game.RIOT] = BORROWABLE_PRODUCTS.map(dedicated).find((key) => key.length > 0) ?? ''
  }
  return resolved
}
