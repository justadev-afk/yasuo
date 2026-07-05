# Caching

Opt-in response caching, served **before the rate limiter is even consulted**. A cache hit returns instantly and never touches Riot — or your rate-limit budget. Caching is **off by default**; you turn it on per client.

## Why cache

Most Riot data changes slowly relative to how often you read it. A summoner's profile, a player's champion mastery, the static reference lists in Data Dragon — none of these move minute to minute. Re-fetching them on every request buys you nothing but latency and burned quota.

Caching earns you two things:

- **Latency.** A hit is an in-process (or Redis) lookup, not a network round-trip to Riot.
- **Rate-limit budget.** yasuo checks the cache *before* the proactive rate limiter. A hit never acquires a limiter slot, so cached reads don't count against your app or method limits at all.

The trade-off is staleness: a cached entry can be up to its TTL old. Each namespace ships a **built-in default TTL** tuned to how volatile its data is, so you rarely have to think about it — but you can override any of them, globally or per call (see [Per-namespace defaults](#per-namespace-defaults) and [TTL guidance](#ttl-guidance)).

## Enabling the cache

The simplest form uses an in-memory store with each namespace's built-in default TTL:

```ts
import { Yasuo } from 'yasuo.js'

const yasuo = new Yasuo({ key, cache: true })   // in-memory MemoryCache, per-namespace TTLs
```

For control over the store and TTL, pass a `CacheOptions` object:

```ts
const yasuo = new Yasuo({
  key,
  cache: { ttlMs: 30_000 },   // still in-memory, but a blanket 30s for every namespace
})
```

To keep the tuned defaults but override just a few namespaces, use `namespaces`:

```ts
const yasuo = new Yasuo({
  key,
  cache: {
    namespaces: {
      'lol.match': { ttlMs: 86_400_000 }, // finished matches are immutable — cache a full day
      'lol.spectator': { enabled: false }, // never cache live games
    },
  },
})
```

### `CacheOptions`

| Field     | Type         | Default                | Description                                                        |
| --------- | ------------ | ---------------------- | ------------------------------------------------------------------ |
| `enabled` | `boolean`    | `true` when an object is given | Master switch. Set `false` to disable without removing the config. |
| `store`   | `CacheStoreLike` | a new `MemoryCache` | Backing store: a `CacheStore`, or a raw Redis client / Cloudflare KV namespace (auto-wrapped in `RedisCache`/`KVCache`). |
| `ttlMs`   | `number`     | per-namespace default  | **Blanket** TTL (ms) for every namespace, overriding their built-in defaults. Omit to keep each namespace's tuned default. |
| `namespaces` | `Partial<Record<CacheNamespaceKey, { enabled?, ttlMs? }>>` | `{}` | Per-namespace overrides, keyed by access path (`'lol.match'`, …). A per-namespace `ttlMs` wins over the global one. |

Shorthand mapping:

- `cache: true` → in-memory store, per-namespace default TTLs.
- `cache: false` / omitted → caching off.
- `cache: { … }` → enabled with your overrides (unless `enabled: false`).

## Per-namespace defaults

When the cache is on, each namespace uses its own default TTL, chosen for how fast its data moves. A global `ttlMs` overrides all of them; a `namespaces[key].ttlMs` overrides just one.

| Namespace | Default TTL | | Namespace | Default TTL |
| --------- | ----------- |-| --------- | ----------- |
| `riot.account` | 1 h | | `lol.spectator` / `tft.spectator` | 10 s |
| `lol.summoner` / `tft.summoner` | 5 min | | `lol.status` | 2 min |
| `lol.league` / `tft.league` | 1 min | | `lol.clash` | 5 min |
| `lol.mastery` | 5 min | | `lol.challenges` | 10 min |
| `lol.champion` | 1 h | | `lol.match` / `tft.match` | 1 h |

The keys are the same paths you use to reach a namespace (`yasuo.lol.match` → `'lol.match'`), exported as the `CacheNamespace` enum / `CacheNamespaceKey` type. An unmapped request (should one arise) falls back to a 60s global default.

## Per-call overrides — `execute({ cache })`

Any `.execute()` accepts a `cache` option scoped to that call's namespace:

```ts
// Force a fresh request but keep the cache warm for other readers (force-refresh):
await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute({ cache: false })

// Cache this one match for a full day, overriding the namespace default:
await yasuo.lol.match.get(id, RegionGroup.ASIA).execute({ cache: { ttlMs: 86_400_000 } })

// Force caching for a single call even where the namespace has it disabled:
await yasuo.lol.spectator.byPuuid(puuid, Region.KR).execute({ cache: true })
```

| Value | Read | Write | Meaning |
| ----- | ---- | ----- | ------- |
| *(omitted)* | namespace default | namespace default | Normal behaviour. |
| `false` / `{ enabled: false }` | **skipped** | yes¹ | **Force-refresh** — ignore any cached entry, but store the fresh response. |
| `true` / `{ enabled: true }` | yes | yes | Force read+write, even for a namespace with caching disabled. |
| `{ ttlMs }` | namespace default | yes, with this TTL | Cache normally but with a custom TTL for this write. |

¹ The write still requires the cache to be globally enabled and the namespace not disabled by config. Skipping the read never disables the write — so `cache: false` refreshes the entry rather than bypassing the cache entirely.

## How it works

The cache sits at the front of the request pipeline:

1. yasuo resolves the endpoint into a full request URL.
2. **Cache check** — if a fresh entry exists for that URL, it's returned immediately, before the rate limiter runs.
3. On a miss, the request proceeds through the limiter and out to Riot.
4. **On a successful (2xx) response only**, the result is stored under the URL for `ttlMs`.

A few consequences worth knowing:

- **Keyed by the resolved URL.** Two calls that produce the same URL (same routing, path params and query) share a cache entry. Different query params are different keys.
- **Only 2xx responses are cached.** Errors — `404`, `429`, `503` — are never stored, so a transient failure won't be served back to you until it expires.
- **Each entry stores `{ data, meta }`.** A hit reconstructs the exact same result, so the entity's own fields, `result.http.status`, `result.http.rateLimits` and friends are all present on a cached read, just as on a live one. (The `rateLimits` on a hit reflect the response that was cached, not a fresh measurement.)
- **TTL is per entry.** Each write stamps its own expiry; there's no global flush timer.

## `MemoryCache`

The default store when you enable caching without naming one. A zero-dependency, in-process `Map` with per-entry TTL and a bounded size.

```ts
import { Yasuo, MemoryCache } from 'yasuo.js'

const yasuo = new Yasuo({
  key,
  cache: { store: new MemoryCache({ maxEntries: 5000 }), ttlMs: 60_000 },
})
```

### `MemoryCacheOptions`

| Field        | Type     | Default | Description                                                       |
| ------------ | -------- | ------- | ---------------------------------------------------------------- |
| `maxEntries` | `number` | `10000` | Upper bound on stored entries. The oldest is evicted past this.  |
| `clock`      | `Clock`  | system  | Injectable time source, primarily for tests.                     |

Eviction is **FIFO** by insertion order: when the map exceeds `maxEntries`, the oldest key is dropped. Re-setting a key refreshes its position, so recently-written entries survive longest. Expired entries are also dropped lazily on read.

`MemoryCache` is per-process and per-client — it isn't shared across workers or restarts. For that, use Redis.

## Redis

`RedisCache` wraps any Redis-compatible client and stores values as JSON with a native Redis TTL, so **multiple processes share one cache**.

```ts
import { Yasuo, RedisCache } from 'yasuo.js'

const yasuo = new Yasuo({
  key,
  cache: { store: new RedisCache(redis), ttlMs: 30_000 },
})
```

> **yasuo has zero runtime dependencies — you bring your own Redis client.** yasuo does not bundle or install one; `RedisCache` just needs a client that satisfies the `RedisClientLike` shape (`get`, `set(key, value, 'PX', ttlMs)`, `del`).

Both of these work out of the box:

```ts
// Bun's built-in Redis client (preferred on Bun — no install):
import { redis } from 'bun'
const store = new RedisCache(redis)

// or ioredis, on Node:
import Redis from 'ioredis'
const store = new RedisCache(new Redis(process.env.REDIS_URL))
```

node-redis v4 users can pass a small adapter that maps `del`/`set` onto its API. You can also namespace entries with `keyPrefix` (default `yasuo:`):

```ts
new RedisCache(redis, { keyPrefix: 'myapp:riot:' })
```

Note that `RedisCache.clear()` intentionally throws — flushing a shared Redis instance is too dangerous to do implicitly. Delete specific keys or flush the database out-of-band instead.

## Cloudflare KV

Running on Cloudflare Workers? `KVCache` wraps a **KV namespace binding** the same way `RedisCache` wraps a Redis client — so a cache is shared across every isolate and edge location, again with **no dependency**: yasuo needs only the three methods (`get`, `put`, `delete`) that the real binding already exposes.

```ts
import { Yasuo, KVCache } from 'yasuo.js'

// `env.RIOT_CACHE` is a KV namespace binding declared in wrangler.toml.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const yasuo = new Yasuo({
      key: env.RIOT_API_KEY,
      cache: { store: new KVCache(env.RIOT_CACHE), ttlMs: 300_000 },
    })

    const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()
    return Response.json({ level: summoner.summonerLevel })
  },
}
```

A couple of KV-specific things to know:

- **Minimum TTL is 60 seconds.** Cloudflare rejects an `expirationTtl` below 60, so `KVCache` clamps any sub-minute `ttlMs` up to 60s. Pick `ttlMs >= 60_000` to get exactly what you ask for.
- **`clear()` is unsupported** (it throws), for the same reason as Redis — KV has no atomic flush. Delete specific keys out-of-band.
- **`keyPrefix`** works just like Redis (default `yasuo:`): `new KVCache(env.RIOT_CACHE, { keyPrefix: 'myapp:' })`.

### Passing a raw client — `RedisClientLike` or `KVNamespaceLike`

You don't have to construct the wrapper yourself. The `store` option accepts a **raw** Redis client or KV namespace and yasuo wraps it for you — it detects a KV namespace by its `put` method and a Redis client by its `del` method:

```ts
// Both of these are equivalent to wrapping by hand:
new Yasuo({ key, cache: { store: env.RIOT_CACHE } })   // -> KVCache
new Yasuo({ key, cache: { store: redis } })            // -> RedisCache
```

Anything that already implements the full `CacheStore` interface (below) is used as-is.

## Custom stores

Any object implementing the `CacheStore` interface can back the client. Methods may be **sync or async** — return a value or a promise, whichever suits your backend.

```ts
export interface CachedResult {
  readonly data: unknown
  readonly meta: ResponseMeta
}

export interface CacheStore {
  get(key: string): Promise<CachedResult | undefined> | CachedResult | undefined
  set(key: string, value: CachedResult, ttlMs: number): Promise<void> | void
  delete(key: string): Promise<void> | void
  clear(): Promise<void> | void
}
```

A minimal `Map`-backed store (no TTL — for illustration) is just:

```ts
import { Yasuo, type CacheStore, type CachedResult } from 'yasuo.js'

class SimpleCache implements CacheStore {
  private readonly map = new Map<string, CachedResult>()

  get(key: string) { return this.map.get(key) }
  set(key: string, value: CachedResult) { this.map.set(key, value) }
  delete(key: string) { this.map.delete(key) }
  clear() { this.map.clear() }
}

const yasuo = new Yasuo({ key, cache: { store: new SimpleCache() } })
```

Honour `ttlMs` in `set` if your backend supports expiry (`MemoryCache` and `RedisCache` do), and treat a miss or an expired entry as `undefined` from `get`. This is the same seam a CDN edge cache or Memcached adapter would plug into.

## TTL guidance

There's no universally right TTL — it depends on how fresh the data must be. A rule of thumb:

| Data                                          | Volatility | Suggested TTL      |
| --------------------------------------------- | ---------- | ------------------ |
| Live/spectator game, current ranked LP        | high       | seconds (`5_000`)  |
| Match details, timelines (immutable once done) | none       | long (`3_600_000`) |
| Summoner profile, champion mastery            | low        | minutes            |
| Champion rotation, Data Dragon / static lists | very low   | hours              |

Immutable resources — a finished match, a specific Data Dragon version — can be cached aggressively; they never change once published. Volatile resources — a live game, a climbing ladder — want short TTLs so you don't serve stale state. yasuo's [per-namespace defaults](#per-namespace-defaults) already encode this rule of thumb, so you usually get sensible freshness for free.

If you need different TTLs for different endpoints, set them per namespace with `cache.namespaces` (or per call with `execute({ cache: { ttlMs } })`) — no need for more than one `Yasuo` client.
