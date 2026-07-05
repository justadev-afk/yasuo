# yasuo

**A modern, zero-dependency TypeScript client for the Riot Games API** — League of Legends, Teamfight Tactics and the Riot Account API.

> [!WARNING]
> **🚧 Under construction — not ready for use yet.** yasuo is being actively
> designed and its public API is still changing between commits. It is **not**
> published to npm and should **not** be used in any project yet. Watch this
> space; a first release will be announced when the surface is stable.

> yasuo is the evolution of [twisted](https://github.com/justadev-afk/twisted). It keeps everything that made twisted pleasant — a single client, typed responses, rate-limit info attached to every result — and rebuilds it around a Supabase-style **query builder**, lazy relation-aware chaining, a pluggable cache, a leveled logger and async iterators, all with **no runtime dependencies**.

```ts
import { Yasuo, Region, RegionGroup } from 'yasuo.js'

const yasuo = new Yasuo(process.env.RIOT_API_KEY)

// Every call is a query you run with .execute(). The result IS the entity —
// it carries its own `.error` and `.http`, and never throws for an API failure:
const account = await yasuo.riot.account
  .byRiotId('Hide on bush', 'KR1', RegionGroup.ASIA)
  .execute()

// Walk relations off the entity — this fetches ONLY the match list, not the summoner:
const matches = await account.summoner(Region.KR).matchIds({ count: 5 }).execute()

console.log(matches)              // Collection<string> — ['KR_1234…', …]
console.log(matches.error)        // null on success, the ApiError on failure
console.log(matches.http.rateLimits.app)  // rate-limit budget travels with every result
```

📚 **Full documentation: <https://justadev-afk.github.io/yasuo.js/>**

---

## Why yasuo?

| | twisted | **yasuo** |
| --- | --- | --- |
| Runtime dependencies | a few | **zero** |
| Response shape | `{ response, rateLimits }` envelope | the **entity itself**, carrying `.error` + `.http` — never throws for API errors |
| Requests | eager method calls | **query builders** — `.byPuuid(…)` builds, `.execute()` runs |
| Chaining | manual (fetch summoner → fetch matches) | `account.summoner(r).matchIds().execute()` — **only the final request runs** |
| Rate limiting | reactive (retry on 429) | **reactive by default**, opt-in **proactive** pacing under Riot's limits |
| Transport | fixed | **pluggable `HttpClient`** + stackable **axios-style middleware** (global & per-service) |
| Pagination | manual page loops | **async iterators** (`for await`), start from any page |
| Caching | — | pluggable **in-memory / Redis** cache |
| Logging | — | leveled logger (`debug`/`info`/`warn`/`error`), env-driven |
| Magic strings | some | **none** — everything is an enum |
| Module format | CJS | **dual ESM + CJS**, single-file, fully typed |

---

## Install

```bash
bun add yasuo.js
# or
npm install yasuo.js
```

yasuo targets Node 18+ / Bun / Deno and ships a single-file dual **ESM + CJS** build with complete type declarations.

## Quick start

```ts
import { Yasuo, Region, RegionGroup } from 'yasuo.js'

// The key can be passed directly or read from the RIOT_API_KEY env var.
const yasuo = new Yasuo({ key: process.env.RIOT_API_KEY })

// Game-scoped namespaces mirror Riot's own product split. Each method returns a
// query; run it with .execute() and use the entity directly:
const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()
const entries  = await yasuo.lol.league.byPuuid(puuid, Region.KR).execute()
const match    = await yasuo.lol.match.get('KR_1234567890', RegionGroup.ASIA).execute()

const tftMatch = await yasuo.tft.match.get('KR_1234567890', RegionGroup.ASIA).execute()
const account  = await yasuo.riot.account.byRiotId('Faker', 'KR1', RegionGroup.ASIA).execute()
```

## Core concepts

### Namespaces

The client is organised by product, matching Riot's routing model:

- `yasuo.lol.*` — Summoner, League, Champion Mastery, Champion, Match, Spectator, Status, Clash, Challenges
- `yasuo.tft.*` — Summoner, League, Match, Spectator
- `yasuo.riot.account` — the shared Account API (game name / tag line → PUUID)
- `yasuo.dataDragon` — Riot's static data CDN (no key, no rate limits)

### Query builders + the result model

Every method returns a **query builder** — nothing hits the network until you call the terminal `.execute()`. It resolves to the **entity (or collection) directly**, and that entity carries its own error and HTTP context. A request **never throws for an API-level failure**: on failure the DTO fields are absent, `.error` holds the original rich `ApiError` and `.http.ok` is `false`; on success `.error` is `null`.

```ts
const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()

summoner.summonerLevel   // typed DTO field, right on the entity
summoner.error           // ApiError | null   (the original failure)
summoner.http.ok         // boolean
summoner.http.status     // 200
summoner.http.rateLimits.app  // [{ limit, intervalSeconds, count }]
summoner.http.headers    // raw, lower-cased response headers

// Idiomatic: branch on `.error`.
if (summoner.error) return console.error(summoner.error.status, summoner.error.body)
console.log(summoner.summonerLevel)

// Prefer exceptions? Opt in per call:
const strict = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute({ throw: true })

// Want exactly what Riot returned? Pass { raw: true } — typed `unknown` by
// default, or supply the shape you expect as a type argument:
const raw = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute({ raw: true })
const dto = await yasuo.lol.summoner
  .byPuuid(puuid, Region.KR)
  .execute<{ puuid: string; summonerLevel: number }>({ raw: true }) // typed, no cast
```

Scalar endpoints (e.g. a mastery score) can't hang metadata off a primitive, so they resolve a small `ValueResult<T>` — read the number from `.value`, with the same `.error`/`.http`:

```ts
const score = await yasuo.lol.mastery.score(puuid, Region.KR).execute()
console.log(score.value)   // number | null
```

### Lazy relations — the key idea

`byPuuid(...)` returns a **lazy reference** that is itself a query (`.execute()` fetches the summoner). Calling a *relation* returns another query that fetches **only** that related resource — the summoner request is skipped entirely:

```ts
// One request (the match list) — the summoner is never fetched:
const ids = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).matchIds({ count: 20 }).execute()

// Running the ref itself fetches the summoner:
const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()
```

Relations know how to route themselves. A summoner on `Region.KR` traverses to their match history on `RegionGroup.ASIA` automatically — you never re-specify the routing:

```ts
const account = await yasuo.riot.account.byRiotId('Hide on bush', 'KR1', RegionGroup.ASIA).execute()
const ref = account.summoner(Region.KR)

const masteries = await ref.topChampionMasteries(5).execute()
const live      = await ref.activeGame().execute()   // CurrentGameEntity | null
const match     = await yasuo.lol.match.get(ids[0], RegionGroup.ASIA).execute()
const timeline  = await match.timeline().execute()   // ids reused, region derived
```

### No magic strings

Regions, queues, tiers, divisions, match types, challenge levels, HTTP details — all enums:

```ts
import { Region, RegionGroup, RankedQueue, Tier, Division, MatchType } from 'yasuo.js'

// Async iterators throw on failure, which is idiomatic for `for await`:
for await (const entry of yasuo.lol.league.streamEntries(
  RankedQueue.SOLO_5x5, Tier.DIAMOND, Division.I, Region.EUW, { startPage: 3 },
)) {
  console.log(entry.puuid, entry.leaguePoints)
}
```

## Rate limiting

Reactive retries are **always on**: a `429`/`503` honours `retry-after` with bounded backoff. Proactive pacing is **opt-in** (`rateLimit: true`) — enable it and the limiter reads Riot's `x-app-rate-limit` / `x-method-rate-limit` headers and paces requests *underneath* the advertised limits using sliding windows, per application host and per method, so you avoid `429`s before they happen.

```ts
const yasuo = new Yasuo({
  key,
  rateLimit: true,          // opt in to proactive pacing (off by default)
  retry: { maxAttempts: 3 } // reactive retry policy (on by default)
})
```

See [the rate-limiting guide](https://justadev-afk.github.io/yasuo.js/rate-limiting/).

## Caching

Opt-in response caching, served before the rate limiter is even consulted. In-memory by default; bring your own store — **Redis** or **Cloudflare KV** need no dependency (yasuo just wants a client that matches `RedisClientLike` / `KVNamespaceLike`), or implement the `CacheStore` interface for anything else:

```ts
import { Yasuo, RedisCache, KVCache } from 'yasuo.js'

const yasuo = new Yasuo({ key, cache: true })                        // in-memory, 60s TTL
const y2    = new Yasuo({ key, cache: { store: new RedisCache(redis), ttlMs: 30_000 } })
const y3    = new Yasuo({ key, cache: { store: new KVCache(env.RIOT_CACHE) } })  // Cloudflare Workers KV

// Or pass a raw client/namespace and yasuo wraps it (redis-like -> RedisCache, kv-like -> KVCache):
const y4    = new Yasuo({ key, cache: { store: redis } })
const y5    = new Yasuo({ key, cache: { store: env.RIOT_CACHE } })
```

See [the caching guide](https://justadev-afk.github.io/yasuo.js/caching/).

## Custom transport & middleware

Inject any `HttpClient` (a single `send(request)` method) — a proxy, an `undici` pool, a mock in tests — and stack **axios-style middleware**. Middleware runs in an onion: **global** middleware (`yasuo.use(...)` or the `middleware` config) wraps **per-service** middleware (`yasuo.lol.summoner.use(...)`), which wraps the transport. Each can inspect or rewrite the request and response, short-circuit, or retry.

```ts
import { Yasuo, type HttpMiddleware } from 'yasuo.js'

const timing: HttpMiddleware = async (request, next, { endpointId }) => {
  const started = performance.now()
  const response = await next(request)
  console.log(`${endpointId} → ${response.status} in ${(performance.now() - started).toFixed(0)}ms`)
  return response
}

const yasuo = new Yasuo({ key, httpClient: myClient, middleware: [timing] })

// Add more at runtime — global, or scoped to one service:
yasuo.use((request, next) => next({ ...request, headers: { ...request.headers, 'x-app': 'my-bot' } }))
yasuo.lol.match.use((request, next) => { console.debug('match', request.url); return next(request) })
```

See [the transport & middleware guide](https://justadev-afk.github.io/yasuo.js/http-and-middleware/).

## Logging

A leveled logger driven by config or the `YASUO_LOG_LEVEL` / `LOG_LEVEL` env var (`debug` · `info` · `warn` · `error` · `silent`):

```ts
import { Yasuo, LogLevel } from 'yasuo.js'

const yasuo = new Yasuo({ key, logLevel: LogLevel.DEBUG })  // or set YASUO_LOG_LEVEL=debug
```

See [the logging guide](https://justadev-afk.github.io/yasuo.js/logging/).

## Pagination & async iterators

Paginated endpoints return a `Paginator` you can iterate with `for await`, collect with `.toArray()`, peek with `.first()`, or walk page-by-page with `.pages()` — starting from any page/offset. Iterators throw on failure (they use `{ throw: true }` internally), which is the natural contract for `for await`:

```ts
for await (const id of yasuo.lol.match.streamIds(puuid, RegionGroup.ASIA, { start: 0, pageSize: 100 })) {
  // …every match in a player's history, paced by the rate limiter
}

// Or collect a bounded slice eagerly:
const firstFifty = await yasuo.lol.match.streamIds(puuid, RegionGroup.ASIA).toArray(50)
```

See [the pagination guide](https://justadev-afk.github.io/yasuo.js/pagination/).

## Error handling

A request never throws for an API error — inspect the entity's `.error`, a typed subclass of `ApiError` (itself a `YasuoError`) that carries the original HTTP `response`:

```ts
import { NotFoundError, RateLimitError, ForbiddenError } from 'yasuo.js'

const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()

if (summoner.error instanceof NotFoundError)       { /* 404 */ }
else if (summoner.error instanceof RateLimitError) { /* 429 — error.rateLimits.retryAfterSeconds */ }
else                                               { console.log(summoner.summonerLevel) }
```

Prefer exceptions? `.execute({ throw: true })` throws that same `ApiError` instead of attaching it. Misuse (a missing/invalid key) always throws, regardless.

See [the error-handling guide](https://justadev-afk.github.io/yasuo.js/errors/).

## API coverage

**51 endpoints** across every current Riot product:

- **LoL** (33): Summoner · League (+ league-exp) · Champion Mastery · Champion Rotation · Match-V5 · Spectator · Status · Clash · Challenges
- **TFT** (14): Summoner · League (+ rated ladder) · Match · Spectator
- **Riot** (4): Account (by PUUID / by Riot ID) · Active Shard · Active Region
- **Data Dragon**: versions, champions, runes, static reference data

See [the endpoint map](https://justadev-afk.github.io/yasuo.js/endpoints/) for the full list.

## Documentation

Full docs live at **<https://justadev-afk.github.io/yasuo.js/>**:

- [Getting started](https://justadev-afk.github.io/yasuo.js/getting-started/)
- [Architecture & contribution rules](https://justadev-afk.github.io/yasuo.js/architecture/)
- [Entities & lazy relations](https://justadev-afk.github.io/yasuo.js/entities-and-relations/)
- [Rate limiting](https://justadev-afk.github.io/yasuo.js/rate-limiting/)
- [Caching](https://justadev-afk.github.io/yasuo.js/caching/)
- [Logging](https://justadev-afk.github.io/yasuo.js/logging/)
- [Transport & middleware](https://justadev-afk.github.io/yasuo.js/http-and-middleware/)
- [Pagination](https://justadev-afk.github.io/yasuo.js/pagination/)
- [Errors](https://justadev-afk.github.io/yasuo.js/errors/)
- [Endpoint coverage](https://justadev-afk.github.io/yasuo.js/endpoints/)
- [Migrating from twisted](https://justadev-afk.github.io/yasuo.js/migrating-from-twisted/)

## Migrating from twisted

yasuo is a spiritual successor, not a drop-in replacement — the ergonomics are better. The short version: constructor takes a config object, `LolApi`/`TftApi`/`RiotApi` become `yasuo.lol`/`yasuo.tft`/`yasuo.riot`, the `{ response, rateLimits }` envelope becomes the **entity itself** (carrying `.error`/`.http`) that you run with `.execute()`, and encrypted-summoner-id lookups give way to PUUIDs. Full mapping in [the migration guide](https://justadev-afk.github.io/yasuo.js/migrating-from-twisted/).

## Development

```bash
bun install
bun run typecheck     # tsc --noEmit
bun run lint          # biome check .
bun run test:unit     # unit tests (no network) — coverage-gated at 95%
bun run test:integration  # live tests (needs RIOT_API_KEY)
bun run build         # single-file ESM + CJS + d.ts
bun run docs:serve    # preview the MkDocs site locally
```

Unit tests run network-free (inject `MockHttpClient` or a fake `HttpClient`/`fetch`) and are **coverage-gated at 95% line/statement** coverage (currently ~97.5%) via `bunfig.toml`. Conventions for contributors (folder layout, one-declaration-per-file, enum rules) live in [the architecture guide](https://justadev-afk.github.io/yasuo.js/architecture/).

## License

[MIT](LICENSE) © justadev-afk
