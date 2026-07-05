# Rate limiting

Riot enforces **two** independent rate limits on every key, and both must be respected:

- an **application** limit, shared across *every* method on a routing host, advertised in `x-app-rate-limit`;
- a **method** limit, specific to a single endpoint, advertised in `x-method-rate-limit`.

Each header carries one or more `limit:intervalSeconds` windows (e.g. `100:120,20:1` — "100 per 120s **and** 20 per 1s"), and the matching `-count` headers (`x-app-rate-limit-count` / `x-method-rate-limit-count`) report how many requests you have already spent in each window. Blow through either limit and Riot answers `429 Too Many Requests` with a `retry-after` (seconds) and an `x-rate-limit-type` naming which limit you tripped.

yasuo defends both limits on two fronts. **Reactively** — on by default — it honours `retry-after` with bounded backoff when a `429`/`503` slips through anyway. **Proactively** — opt-in — it can also pace requests *underneath* the advertised limits so `429`s are avoided before they happen; enable it with `rateLimit: true`.

## Proactive: pace under the limit

Proactive pacing is **off by default** — turn it on with `rateLimit: true` (or a `RateLimiterOptions` object). When enabled, the limiter keeps a **sliding window** per limit window, grouped into buckets:

- one **application bucket** per routing host (the app scope), and
- one **method bucket** per endpoint (`host:endpointId`).

Before a request is sent it must `acquire` a slot from *both* its app bucket and its method bucket. Each bucket permits a request only when **all** of its windows have a free slot and no penalty is active; otherwise the limiter sleeps until the oldest timestamp ages out. Because it reasons over a *rolling* window rather than fixed buckets, it never allows a boundary burst that would trip a `429` — provided yasuo is the only consumer of the key. Acquisition is serialised through an internal gate, so two concurrent requests can never both observe the same free slot and overshoot.

The real limits are **learned from response headers**: every response — success or failure — is fed back through `update`, which reconfigures the buckets in place from `x-app-rate-limit` / `x-method-rate-limit`. Existing windows keep their timestamp log, new intervals are added, and intervals Riot no longer advertises are dropped.

### Bootstrap: protecting the cold start

Before any headers have been seen, a fresh application bucket is seeded with conservative windows so an eager initial burst cannot trip a `429`:

```ts
// DEFAULT_BOOTSTRAP_APP_WINDOWS
[
  { limit: 20,  intervalSeconds: 1 },   // 20 req/s
  { limit: 100, intervalSeconds: 120 }, // 100 req / 2 min
]
```

These are Riot's **development-key defaults**. The moment a real response arrives, its headers replace them. (If you hold a production key with higher limits, the bootstrap only paces the very first handful of requests, then gets out of the way. Method buckets have no bootstrap — they stay unconstrained until Riot advertises a method limit.)

### `syncWithHeaders`: trusting Riot's count over your own

By default the limiter reconciles its local counters with Riot's `-count` headers (`syncWithHeaders: true`). When a response reports, say, `x-app-rate-limit-count: 7:1`, the window is **topped up** to at least 7 in-flight timestamps even if yasuo only recorded fewer locally. This protects you when the key is **shared** with another process (or another machine): you never believe you have more budget than Riot says you do. Set `syncWithHeaders: false` to ignore the counts and track only requests this client made.

## Reactive: honour `retry-after`

Proactive pacing cannot cover every case — a key shared across processes, a service blip, or a `503`. So when a `429` or `503` does come back:

1. If proactive pacing is enabled, the offending bucket is **penalised**: parked (`blockUntil`) until `retry-after` elapses. `x-rate-limit-type` decides which — `method` parks the method bucket, `application` the app bucket, and `service`/unknown parks **both** to be safe.
2. If retries are enabled and the status is retryable, the request is **retried** — this is independent of proactive pacing and on by default. The wait is Riot's `retry-after` when present (capped at `maxRetryAfterSeconds`), otherwise exponential backoff: `backoffBaseMs * 2 ** (attempt - 1)`.

Retries are bounded by `maxAttempts`. Retryable statuses are `429` always, plus `502`/`503`/`504` when `retryOnServiceUnavailable` is on. Once attempts are exhausted the most specific `ApiError` lands on the result's `.error` (a `429` surfaces as `RateLimitError`, whose `.rateLimits.retryAfterSeconds` you can read — see [errors.md](errors.md)). Prefer `.execute({ throw: true })` if you'd rather have that error thrown than attached.

## Configuration

Both fronts are configured on the `Yasuo` constructor. Each accepts a boolean shorthand or an options object.

```ts
const yasuo = new Yasuo({
  key,
  rateLimit: true, // proactive pacing — off by default; true | RateLimiterOptions to enable
  retry: true,     // reactive retries — on by default; true | false | RetryOptions
})
```

### `rateLimit: RateLimiterOptions`

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` *within an options object* | Proactive throttling on/off. Omitting `rateLimit` leaves it **off**; passing an object (or `true`) turns it on. Reactive retries are unaffected. |
| `bootstrapAppWindows` | `RateLimitWindow[]` | `20/1s` + `100/120s` | Windows an app bucket uses before real limits are learned. |
| `syncWithHeaders` | `boolean` | `true` | Reconcile local counters with Riot's `*-count` headers. |
| `clock` | `Clock` | system clock | Injectable time source, primarily for deterministic tests. |

`rateLimit: true` is shorthand for `{ enabled: true }`; `rateLimit: false` **or omitting it** is `{ enabled: false }` — proactive pacing stays off until you ask for it. Reactive retries are unaffected either way.

### `retry: RetryOptions`

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Retry throttled requests at all. |
| `maxAttempts` | `number` | `3` | Maximum retries after the initial request. |
| `maxRetryAfterSeconds` | `number` | `120` | Upper bound on how long a single `retry-after` is honoured. |
| `retryOnServiceUnavailable` | `boolean` | `true` | Also retry `502`/`503`/`504` service errors. |
| `backoffBaseMs` | `number` | `1000` | Base backoff (ms) used when no `retry-after` header is present. |

`retry: false` disables retries; `retry: true` (or omitted) uses the defaults above.

### Examples

```ts
import { Yasuo } from 'yasuo.js'

// 1. Defaults — bounded reactive retries only; proactive pacing is off. Nothing to configure.
const a = new Yasuo({ key })

// 2. Opt in to proactive pacing on top of the default reactive retries.
const b = new Yasuo({ key, rateLimit: true })

// 3. Custom retry policy: fewer attempts, faster backoff, ignore service errors.
const c = new Yasuo({
  key,
  retry: {
    maxAttempts: 5,
    backoffBaseMs: 250,
    maxRetryAfterSeconds: 30,
    retryOnServiceUnavailable: false,
  },
})

// 4. Enable proactive pacing (passing an object turns it on) with a higher bootstrap
//    ceiling for a production key, and trust only local counts.
const d = new Yasuo({
  key,
  rateLimit: {
    bootstrapAppWindows: [{ limit: 500, intervalSeconds: 10 }, { limit: 30000, intervalSeconds: 600 }],
    syncWithHeaders: false,
  },
})

// 5. Route through a rate-limiting proxy. The proxy owns the budget, so leave the
//    local limiter off (the default) and let it do the pacing. `{routing}`/`{game}` are filled in.
const e = new Yasuo({
  key,
  baseUrl: 'https://riot-proxy.internal/{routing}/{game}',
  rateLimit: false,
})
```

## Inspecting your budget at runtime

Rate-limit info travels *with* every result — success or failure — no envelope to unpack. Every entity, collection, and value result exposes `.http.rateLimits` (the parsed `RateLimits` from the response that produced it), alongside the rest of `.http` and `.error`:

```ts
const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()
const { rateLimits } = summoner.http

rateLimits.app     // readonly RateLimitWindow[] — app-scoped windows
rateLimits.method  // readonly RateLimitWindow[] — method-scoped windows

for (const w of rateLimits.app) {
  console.log(`${w.count ?? 0}/${w.limit} used in the last ${w.intervalSeconds}s`)
}
```

Each `RateLimitWindow` is `{ limit, intervalSeconds, count? }` — `count` is Riot's reported usage for that window (`undefined` before the first response). Collections expose it the same way — the collection *is* the array, with `.http` hanging off it:

```ts
const ids = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).matchIds({ count: 20 }).execute()
console.log(ids.http.rateLimits.app)
```

After a throttled response, `retryAfterSeconds` tells you how long Riot wants you to wait:

```ts
console.log(rateLimits.retryAfterSeconds) // number | null (null when not throttled)
```

`RateLimits` also carries `type` (the `x-rate-limit-type` that caused a `429`, else `null`) and `edgeTraceId` (Riot's `x-riot-edge-trace-id`, handy for support). The full raw headers remain on `.http.headers`.

## Concurrency

Independent of the limiter, the `concurrency` option caps how many requests may be **in flight** at once, via an internal semaphore:

```ts
const yasuo = new Yasuo({ key, concurrency: 10 }) // at most 10 requests on the wire at a time
```

It defaults to unbounded (`Infinity`). The two controls compose: when proactive pacing is enabled the rate limiter decides *when* a request may leave (pacing under Riot's limits), and the semaphore caps *how many* are outstanding at once. `concurrency` is about connection pressure and memory, not about staying under Riot's limits — for that you either lean on the reactive retries (the default) or opt in to proactive pacing.
