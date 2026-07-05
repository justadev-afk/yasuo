/**
 * Yasuo — the modern, fully-typed, zero-dependency Riot Games API client.
 * The evolution of Twisted.
 *
 * @packageDocumentation
 */

export type {
  CacheOptions,
  NamespaceCacheOptions,
  ResolvedCacheOptions,
  ResolvedNamespaceCache,
  ResolvedRetryOptions,
  RetryOptions,
  YasuoConfig,
} from './client/config'
// Client
export { Yasuo } from './client/yasuo'
// Caching
export {
  type CachedResult,
  type CacheStore,
  type CacheStoreLike,
  coerceCacheStore,
  KVCache,
  type KVCacheOptions,
  type KVNamespaceLike,
  MemoryCache,
  type MemoryCacheOptions,
  RedisCache,
  type RedisCacheOptions,
  type RedisClientLike,
} from './core/cache'
// HTTP transport (custom clients)
export {
  FetchHttpClient,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
} from './core/http/http-client'
// Request middleware (axios-style, global + per-service)
export {
  composeMiddleware,
  type HttpHandler,
  type HttpMiddleware,
  type MiddlewareContext,
} from './core/http/middleware'
// Logging
export {
  createConsoleLogger,
  type Logger,
  LogLevel,
  noopLogger,
  parseLogLevel,
  resolveLogLevel,
} from './core/logger'
// Pagination
export { type Page, Paginator, type PaginatorConfig } from './core/pagination/paginator'
// Rate limiting (advanced / custom limiters)
export { RateLimiter, type RateLimiterOptions } from './core/rate-limit/rate-limiter'
// DTOs (raw Riot payload shapes)
export * from './dto'
// Endpoints (advanced)
export {
  type Endpoint,
  LOL_ENDPOINTS,
  RIOT_ENDPOINTS,
  TFT_ENDPOINTS,
} from './endpoints'
// Entities (rich responses with lazy relations)
export * from './entities'
// Enums (no magic strings)
export * from './enums'
// Errors
export * from './errors'
export { CollectionQuery } from './query/collection-query'
export type { ExecuteCacheOptions, ExecuteOptions, QueryRunner } from './query/execute-options'
// Query builders + execute options
export { SingleQuery } from './query/single-query'
