import type { HttpRequest, HttpResponse } from './http-client'

/**
 * Metadata about the request a middleware is wrapping. Useful for middleware
 * that behaves differently per endpoint, or that wants to know it is running
 * inside a reactive retry.
 */
export interface MiddlewareContext {
  /** The endpoint's rate-limit id, e.g. `summoner.byPuuid`. */
  readonly endpointId: string
  /** The platform-region or region-group routing value used to pick the host. */
  readonly routing: string
  /** Zero-based transport attempt (`0` on the first try, `1` on the first retry…). */
  readonly attempt: number
}

/**
 * Sends a request and resolves its response — the tail of a middleware chain.
 * Calling it hands control to the next middleware (or, at the innermost layer,
 * the transport {@link HttpClient}).
 */
export type HttpHandler = (request: HttpRequest) => Promise<HttpResponse>

/**
 * An axios-style middleware. It receives the outbound {@link HttpRequest} and a
 * `next` handler: call `next(request)` — optionally with a modified request — to
 * continue the chain and get the {@link HttpResponse} back, which you may also
 * inspect or replace before returning it.
 *
 * Middlewares **stack**: those registered globally on the client wrap those
 * registered on a specific service namespace, which in turn wrap the transport.
 * Within a level they run in registration order (the first registered is the
 * outermost). A middleware may short-circuit by returning a response without
 * calling `next`, or call `next` more than once to implement its own retry.
 *
 * @example
 * ```ts
 * const timing: HttpMiddleware = async (request, next, { endpointId }) => {
 *   const started = performance.now()
 *   const response = await next(request)
 *   console.log(`${endpointId} ${response.status} in ${performance.now() - started}ms`)
 *   return response
 * }
 *
 * const withHeader: HttpMiddleware = (request, next) =>
 *   next({ ...request, headers: { ...request.headers, 'x-trace': crypto.randomUUID() } })
 * ```
 */
export type HttpMiddleware = (
  request: HttpRequest,
  next: HttpHandler,
  context: MiddlewareContext,
) => Promise<HttpResponse>

/**
 * Fold a list of middlewares into a single {@link HttpHandler} around a final
 * `send` handler. `middlewares[0]` becomes the outermost layer (it sees the
 * request first and the response last).
 *
 * @param middlewares - Ordered middlewares, outermost first.
 * @param send - The innermost handler (typically the transport send).
 * @param context - Shared {@link MiddlewareContext} for this request attempt.
 */
export function composeMiddleware(
  middlewares: readonly HttpMiddleware[],
  send: HttpHandler,
  context: MiddlewareContext,
): HttpHandler {
  return middlewares.reduceRight<HttpHandler>(
    (next, middleware) => (request) => middleware(request, next, context),
    send,
  )
}
