# Transport & middleware

yasuo lets you swap the HTTP transport entirely and wrap every request in
**axios-style middleware** that stacks — globally and per service.

## Custom HTTP client

Every network call (except Data Dragon) goes through an `HttpClient`: a single
`send(request)` method. The default is `FetchHttpClient`, backed by the
platform's `fetch`. Inject your own to route through a proxy, use an `undici`
pool, add instrumentation, or mock the network in tests.

```ts
import { Yasuo, type HttpClient, type HttpRequest, type HttpResponse } from 'yasuo'

const myClient: HttpClient = {
  async send(request: HttpRequest): Promise<HttpResponse> {
    const res = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      signal: request.signal,
    })
    return {
      status: res.status,
      ok: res.ok,
      headers: Object.fromEntries(res.headers), // lower-cased keys
      body: await res.json().catch(() => undefined),
    }
  },
}

const yasuo = new Yasuo({ key, httpClient: myClient })
```

`FetchHttpClient` also accepts a custom `fetch` implementation, handy for
environments without a global `fetch` or to point at a mock:

```ts
import { FetchHttpClient } from 'yasuo'

const yasuo = new Yasuo({ key, httpClient: new FetchHttpClient(myFetch) })
```

An `HttpRequest` is `{ url, method, headers, signal? }`; an `HttpResponse` is
`{ status, ok, headers, body }` with **lower-cased** header keys and the body
already parsed (JSON, falling back to text, `undefined` for empty bodies).

## Middleware

A middleware wraps a request in an **onion**: it receives the outbound request
and a `next` handler, calls `next(request)` — optionally with a modified request
— to continue the chain, and gets the response back to inspect or replace.

```ts
import type { HttpMiddleware } from 'yasuo'

const timing: HttpMiddleware = async (request, next, context) => {
  const started = performance.now()
  const response = await next(request)
  console.log(`${context.endpointId} → ${response.status} in ${(performance.now() - started).toFixed(0)}ms`)
  return response
}
```

The third argument is a `MiddlewareContext`: `{ endpointId, routing, attempt }`
— the endpoint's rate-limit id, the routing value used to pick the host, and the
zero-based transport attempt (it increments on a reactive retry).

### Global vs per-service — and how they stack

Middleware registers at two levels, and they **stack**: global middleware wraps
per-service middleware, which wraps the transport. Within a level they run in
registration order (the first registered is the outermost).

```ts
// Global — applies to every request across all services.
const yasuo = new Yasuo({ key, middleware: [timing] })
yasuo.use((request, next) => next({ ...request, headers: { ...request.headers, 'x-app': 'my-bot' } }))

// Per service — only requests made through that namespace.
yasuo.lol.match.use((request, next) => {
  console.debug('match request', request.url)
  return next(request)
})
yasuo.lol.summoner.use(/* … summoner-only middleware … */)
```

For a summoner request with the setup above, the chain is:

```
timing → x-app header → (summoner middleware) → transport → back up
```

Both `yasuo.use(...)` and `namespace.use(...)` return the receiver, so calls
chain.

### What middleware can do

- **Rewrite the request** — add headers, change the URL, attach a trace id:
  `next({ ...request, headers: { ...request.headers, 'x-trace': id } })`.
- **Inspect or replace the response** — the value you return from the middleware
  is what the caller sees.
- **Short-circuit** — return a response without calling `next` (e.g. a stub in
  tests, or serving from a bespoke cache) and the transport is never hit.
- **Retry** — call `next` more than once. (This composes with yasuo's own
  reactive `429`/`503` retry, which surrounds the whole chain.)

```ts
// A short-circuit stub — the transport is skipped entirely.
yasuo.use(async (request, next) =>
  request.url.includes('/status/') ? { status: 200, ok: true, headers: {}, body: STUB } : next(request),
)
```

Middleware sits **inside** the reactive retry loop and the concurrency limiter,
and **outside** the transport, so it sees every attempt and can pace or annotate
each one. It does not run for `yasuo.dataDragon.*`, which bypasses the executor.

## Testing without the network

Because the transport is injectable, unit tests never touch the network — pass a
fake `HttpClient` (or the bundled `MockHttpClient` in the test suite) and assert
on the request/response. This is how yasuo keeps its own tests
[coverage-gated at 95%](architecture.md) with zero live calls.

```ts
const calls: string[] = []
const stub: HttpClient = {
  send: (request) => {
    calls.push(request.url)
    return Promise.resolve({ status: 200, ok: true, headers: {}, body: { puuid: 'p' } })
  },
}
const yasuo = new Yasuo({ key: 'RGAPI-test', httpClient: stub })
const summoner = await yasuo.lol.summoner.byPuuid('p', Region.KR).execute()
```
