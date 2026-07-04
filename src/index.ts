/**
 * Yasuo — the modern, fully-typed, zero-dependency Riot Games API client.
 * The evolution of Twisted.
 *
 * @packageDocumentation
 */

// Client
export { Yasuo } from './client/yasuo'
export type {
  CacheOptions,
  ResolvedCacheOptions,
  ResolvedRetryOptions,
  RetryOptions,
  YasuoConfig,
} from './client/config'

// Query builders + execute options
export { SingleQuery } from './query/single-query'
export { CollectionQuery } from './query/collection-query'
export type { ExecuteOptions, QueryRunner } from './query/execute-options'

// Enums (no magic strings)
export * from './enums'

// DTOs (raw Riot payload shapes)
export * from './dto'

// Entities (rich responses with lazy relations)
export * from './entities'

// Errors
export * from './errors'

// Pagination
export { Paginator, type Page, type PaginatorConfig } from './core/pagination/paginator'

// Rate limiting (advanced / custom limiters)
export { RateLimiter, type RateLimiterOptions } from './core/rate-limit/rate-limiter'

// Caching
export {
  type CachedResult,
  type CacheStore,
  MemoryCache,
  type MemoryCacheOptions,
  RedisCache,
  type RedisCacheOptions,
  type RedisClientLike,
} from './core/cache'

// Logging
export {
  createConsoleLogger,
  type Logger,
  LogLevel,
  noopLogger,
  parseLogLevel,
  resolveLogLevel,
} from './core/logger'

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

// Endpoints (advanced)
export {
  type Endpoint,
  LOL_ENDPOINTS,
  RIOT_ENDPOINTS,
  TFT_ENDPOINTS,
} from './endpoints'
