# Getting started

This guide takes you from zero to your first live Riot Games API call with **yasuo** — installing the client, wiring up your key, and resolving a real player. It should take about five minutes.

## 1. Get a Riot API key

Every request needs an API key. Sign in at the [Riot Developer Portal](https://developer.riotgames.com/) with your Riot account and copy the key from your dashboard — it looks like `RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.

> **Development keys expire every 24 hours.** You'll need to regenerate yours from the portal each day. For anything long-lived, register a product to get a permanent Personal or Production key.

Keep the key out of source control — read it from an environment variable (see below).

## 2. Install

```bash
bun add yasuo
# or
npm install yasuo
```

yasuo targets **Node 18+** / Bun / Deno and ships a single-file dual **ESM + CJS** build with complete type declarations. It has zero runtime dependencies.

## 3. Create a client

The key can be passed as a bare string, inside a config object, or left out entirely to fall back to the `RIOT_API_KEY` environment variable:

```ts
import { Yasuo } from 'yasuo'

const yasuo = new Yasuo('RGAPI-...')            // bare key string
const yasuo = new Yasuo({ key: 'RGAPI-...' })   // config object
const yasuo = new Yasuo()                        // reads process.env.RIOT_API_KEY
```

Put the key in a `.env` file so it never lands in your code:

```bash
# .env
RIOT_API_KEY=RGAPI-...
```

Bun automatically loads `.env`, so `new Yasuo()` just works. On Node, load it yourself (for example with `node --env-file=.env`).

### Configuration options

Every field on `YasuoConfig` is optional and comes with a production-safe default:

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `key` | `string` | `RIOT_API_KEY` env var | Your Riot API key. |
| `baseUrl` | `string` | Riot's host | URL template with `{routing}`/`{game}` placeholders; override to route through a proxy. |
| `rateLimit` | `boolean \| RateLimiterOptions` | `false` | Proactive limiter, **off by default**; pass `true` to enable it (reactive retries stay on regardless). |
| `retry` | `boolean \| RetryOptions` | `true` | Reactive retry policy for `429`/`503` (3 attempts, `retry-after`-aware). |
| `concurrency` | `number` | `Infinity` | Cap on concurrent in-flight requests. |
| `httpClient` | `HttpClient` | `fetch`-based | Custom transport. |
| `cache` | `boolean \| CacheOptions` | off | Response cache; `true` enables an in-memory store (60s TTL). |
| `logger` | `Logger` | console logger | Custom logger implementation. |
| `logLevel` | `LogLevel` | `SILENT` | Minimum log level; overridden by `YASUO_LOG_LEVEL`/`LOG_LEVEL`. |

```ts
import { Yasuo, LogLevel } from 'yasuo'

const yasuo = new Yasuo({
  key: process.env.RIOT_API_KEY,
  cache: true,
  logLevel: LogLevel.INFO,
})
```

## 4. Your first request

Let's resolve a player by their Riot ID (the `gameName#tagLine` shown in-game), then fetch their League of Legends summoner profile.

```ts
import { Yasuo, Region, RegionGroup } from 'yasuo'

const yasuo = new Yasuo()

// Every method returns a query builder; nothing hits the network until `.execute()`.
// The account API routes on a RegionGroup and resolves the Riot ID.
const account = await yasuo.riot.account
  .byRiotId('Hide on bush', 'KR1', RegionGroup.ASIA)
  .execute()

if (account.error) throw account.error  // API failures don't throw — you branch on `.error` yourself
console.log(account.puuid)              // the stable, cross-game player id

// The summoner API is platform-scoped, so it routes on a Region.
const summoner = await yasuo.lol.summoner.byPuuid(account.puuid, Region.KR).execute()

console.log(summoner.summonerLevel)       // typed DTO field, right on the entity
console.log(summoner.http.rateLimits.app) // rate-limit budget rides on the entity's `.http`
```

Every method returns a **query builder** — `SingleQuery` or `CollectionQuery` — and nothing hits the network until you call `.execute()`. That resolves the **entity directly** — there is no wrapper to unpack. Its DTO fields sit right on it (so `summoner.summonerLevel` just works), the original error is on `.error`, and the response metadata rides alongside on `.http` — `.http.rateLimits` for your remaining budget, plus `.http.status`, `.http.headers` and the `.http.ok` flag. A failed request never throws: the DTO fields are absent and `.error` holds the error, so you branch on `.error` (or call `.execute({ throw: true })` when you'd rather throw, or `.execute({ raw: true })` for the untouched Riot payload). See [errors](errors.md) for the full picture.

## 5. Routing: platform vs. regional

Riot splits its APIs across two routing schemes, and yasuo mirrors that with two enums:

- **`Region`** — *platform* routing values (`Region.KR`, `Region.EUW`, `Region.NA`…). Used by the per-shard APIs: Summoner, League, Champion Mastery, Champion, Spectator, Status and Clash.
- **`RegionGroup`** — *regional* routing values that aggregate several platforms: `AMERICAS`, `ASIA`, `EUROPE` and `SEA`. Used by the cross-region APIs: Account, Match-V5 and TFT Match. (Note: the Account API accepts only `AMERICAS`, `ASIA` and `EUROPE`.)

So `byRiotId` takes a `RegionGroup` while `byPuuid` takes a `Region` — the example above uses both.

You rarely have to think about this once you start chaining. **Lazy relations derive their own routing:** a summoner fetched on `Region.KR` traverses to their match history on `RegionGroup.ASIA` automatically, and executing a relation runs *only* that request:

```ts
// `account` is the entity from step 4. `.summoner(Region.KR)` returns a chainable
// ref, and `.matchIds()` builds a query for ONLY the match list — the summoner
// itself is never fetched. One request when you `.execute()`:
const ids = await account.summoner(Region.KR).matchIds({ count: 5 }).execute()

console.log(ids[0])                   // 'KR_1234…' — `ids` IS the Collection, indexed like an array
console.log(ids.http.rateLimits.app)  // metadata rides on the collection's `.http`
```

## Next steps

- [Entities & lazy relations](entities-and-relations.md) — how responses, entities and chainable refs fit together.
- [Rate limiting](rate-limiting.md) — the proactive limiter and reactive retries.
- [Caching](caching.md) — opt-in response caching and custom stores.
- [Logging](logging.md) — the leveled logger and env-driven config.
- [Pagination](pagination.md) — async iterators for paginated endpoints.
- [Errors](errors.md) — the typed `ApiError` hierarchy.
- [Endpoint coverage](endpoints.md) — the full map of supported endpoints.
