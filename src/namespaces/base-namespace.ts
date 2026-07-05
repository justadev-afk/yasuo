import type { Yasuo } from '../client/yasuo'
import type { HttpMiddleware } from '../core/http/middleware'
import type { Fetched, RequestExecutor, RequestOptions } from '../core/request/request-executor'
import type { ResponseMeta } from '../dto/common.dto'
import type { Endpoint } from '../endpoints/endpoint'
import { Collection } from '../entities/collection'
import type { Entity } from '../entities/entity'
import type { EntityContext } from '../entities/entity-context'
import { ValueResult } from '../entities/value-result'
import type { CacheNamespace } from '../enums/cache-namespace'
import { type Region, type RegionGroup, regionToRegionGroup } from '../enums/region'
import { ApiError } from '../errors'
import { CollectionQuery } from '../query/collection-query'
import type { ExecuteOptions } from '../query/execute-options'
import { SingleQuery } from '../query/single-query'

/** Constructor signature every {@link Entity} subclass satisfies. */
export type EntityConstructor<TData extends object, E extends Entity<TData>> = new (
  data: TData,
  meta: ResponseMeta,
  context: EntityContext,
  error?: ApiError | null,
) => E

/**
 * Base class for every API namespace. Holds the shared {@link RequestExecutor}
 * and a back-reference to the client (so entities can traverse lazy relations),
 * plus factory helpers that turn an endpoint into a lazy {@link SingleQuery} or
 * {@link CollectionQuery} and the shared plumbing that maps a request into an
 * entity/collection/value carrying its own `.error`/`.http`.
 */
export abstract class BaseNamespace {
  /**
   * Stable key identifying this namespace for per-namespace cache configuration.
   * Each concrete namespace declares its own {@link CacheNamespace}; it is
   * injected into every request so the executor can resolve the right TTL.
   */
  protected abstract readonly cacheNamespace: CacheNamespace
  /** Service-scoped middleware, stacked inside the client's global middleware. */
  private readonly middlewares: HttpMiddleware[] = []

  constructor(
    protected readonly executor: RequestExecutor,
    protected readonly client: Yasuo,
  ) {}

  /**
   * Register a request {@link HttpMiddleware} scoped to **this service only**
   * (e.g. `yasuo.lol.summoner.use(...)`). It runs inside any global middleware
   * added with `yasuo.use(...)`, and in registration order. Returns `this`.
   *
   * @example
   * ```ts
   * yasuo.lol.match.use((request, next) => {
   *   console.debug('match request', request.url)
   *   return next(request)
   * })
   * ```
   */
  use(middleware: HttpMiddleware): this {
    this.middlewares.push(middleware)
    return this
  }

  /** Build an {@link EntityContext} for a region-group-scoped resource. */
  protected groupContext(regionGroup: RegionGroup): EntityContext {
    return { client: this.client, regionGroup }
  }

  /** A deferred request that resolves to a {@link Collection} of entities. */
  protected many<TData extends object, E extends Entity<TData>>(
    Ctor: EntityConstructor<TData, E>,
    routing: string,
    endpoint: Endpoint,
    context: EntityContext,
    options?: RequestOptions,
  ): CollectionQuery<E> {
    return new CollectionQuery<E>((exec) =>
      this.runResult<Collection<E>>(
        routing,
        endpoint,
        options,
        exec,
        (data, meta) =>
          Collection.create(
            (data as TData[]).map((item) => new Ctor(item, meta, context)),
            meta,
          ),
        (error, meta) => Collection.create<E>([], meta, error),
      ),
    )
  }

  /** Build an {@link EntityContext} for a platform-region-scoped resource. */
  protected regionContext(region: Region): EntityContext {
    return { client: this.client, region, regionGroup: regionToRegionGroup(region) }
  }

  /**
   * Dispatch a request through the shared executor, injecting this service's
   * middleware. Every namespace request goes through here so per-service
   * middleware is always applied.
   */
  protected request<T>(
    routing: string,
    endpoint: Endpoint,
    options?: RequestOptions,
  ): Promise<Fetched<T>> {
    return this.executor.request<T>(routing, endpoint, {
      ...options,
      middleware: this.middlewares,
      cacheNamespace: this.cacheNamespace,
    })
  }

  /**
   * Shared request→map plumbing behind every builder. Honours `{ raw }` (returns
   * the untouched payload) and `{ throw }` (rethrows on failure). Otherwise it
   * catches an {@link ApiError} into a failure result via `onFailure`, and
   * rethrows anything else — a misuse such as `ApiKeyMissingError` always throws.
   */
  protected async runResult<R>(
    routing: string,
    endpoint: Endpoint,
    options: RequestOptions | undefined,
    exec: ExecuteOptions,
    onSuccess: (data: unknown, meta: ResponseMeta) => R,
    onFailure: (error: ApiError, meta: ResponseMeta) => R,
  ): Promise<R | unknown> {
    try {
      const fetched = await this.request<unknown>(
        routing,
        endpoint,
        mergeExecOptions(options, exec),
      )
      return exec.raw ? fetched.data : onSuccess(fetched.data, fetched.meta)
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error
      }
      if (exec.throw) {
        throw error
      }
      return exec.raw ? error.body : onFailure(error, metaFromError(error))
    }
  }

  /** A deferred request that resolves to a boxed scalar {@link ValueResult}. */
  protected scalar<T>(
    routing: string,
    endpoint: Endpoint,
    options?: RequestOptions,
  ): SingleQuery<ValueResult<T>> {
    return new SingleQuery<ValueResult<T>>((exec) =>
      this.runResult<ValueResult<T>>(
        routing,
        endpoint,
        options,
        exec,
        (data, meta) => new ValueResult<T>(data as T, meta),
        (error, meta) => new ValueResult<T>(null, meta, error),
      ),
    )
  }

  /** A deferred request that resolves to a {@link Collection} of scalars. */
  protected scalarMany<T>(
    routing: string,
    endpoint: Endpoint,
    options?: RequestOptions,
  ): CollectionQuery<T> {
    return new CollectionQuery<T>((exec) =>
      this.runResult<Collection<T>>(
        routing,
        endpoint,
        options,
        exec,
        (data, meta) => Collection.create(data as T[], meta),
        (error, meta) => Collection.create<T>([], meta, error),
      ),
    )
  }

  /** A deferred request that resolves to a single entity. */
  protected single<TData extends object, E extends Entity<TData>>(
    Ctor: EntityConstructor<TData, E>,
    routing: string,
    endpoint: Endpoint,
    context: EntityContext,
    options?: RequestOptions,
  ): SingleQuery<E> {
    return new SingleQuery<E>((exec) =>
      this.runResult<E>(
        routing,
        endpoint,
        options,
        exec,
        (data, meta) => new Ctor(data as TData, meta, context),
        (error, meta) => new Ctor({} as TData, meta, context, error),
      ),
    )
  }
}

/** Reconstruct {@link ResponseMeta} from a failed request's {@link ApiError}. */
export function metaFromError(error: ApiError): ResponseMeta {
  return {
    status: error.status,
    url: error.url,
    headers: error.headers,
    rateLimits: error.rateLimits,
  }
}

/** Fold execute-time options (abort signal, per-call cache override) into the request options. */
function mergeExecOptions(
  options: RequestOptions | undefined,
  exec: ExecuteOptions,
): RequestOptions {
  if (exec.signal === undefined && exec.cache === undefined) {
    return options ?? {}
  }
  return {
    ...options,
    ...(exec.signal !== undefined ? { signal: exec.signal } : {}),
    ...(exec.cache !== undefined ? { cache: exec.cache } : {}),
  }
}
