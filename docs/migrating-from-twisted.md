# Migrating from twisted

yasuo is the evolution of [twisted](https://github.com/justadev-afk/twisted). It keeps
everything that made twisted pleasant — a single client, fully typed responses,
rate-limit info on every response — and rebuilds the surface around lazy,
chainable, relation-aware **query builders**, an opt-in proactive rate limiter, a
pluggable cache, a leveled logger and async iterators, all with **zero runtime
dependencies**.

> **This is a spiritual successor, not a drop-in replacement.** The method names,
> the construction, the response shape and the routing types all changed on
> purpose — the ergonomics are the whole point. Every namespace method now returns
> a query builder you run with a terminal `.execute()`, which resolves the
> **entity itself** — non-throwing, carrying its own `.error` and `.http`. This
> guide maps every twisted concept to its yasuo equivalent so you can port a
> codebase mechanically.

## Why the churn is worth it

| | twisted | **yasuo** |
| --- | --- | --- |
| Runtime dependencies | a few | **zero** |
| Rate limiting | reactive (retry on 429) | **reactive by default, proactive opt-in** (retries 429/503; pass `rateLimit: true` to also pace *under* Riot's limits) |
| Response shape | `{ response, rateLimits }` envelope | query builder + `.execute()` → **the entity itself**, carrying `.error` + `.http` — **non-throwing**; opt into throwing with `.execute({ throw: true })` |
| Chaining | manual (fetch summoner → fetch matches) | `summoner.byPuuid(...).matchIds().execute()` — **only the final request runs** |
| Pagination | manual page loops | **async iterators** (`for await`), start from any page |
| Caching | — | pluggable **in-memory / Redis** cache |
| Logging | `debug: { logTime, logUrls }` | leveled logger (`debug`/`info`/`warn`/`error`), env-driven |
| Magic strings | some | **none** — everything is an enum |
| Module format | CJS | **dual ESM + CJS**, single-file, fully typed |

## 1. Construction: three clients become one

twisted gave you a class per product; yasuo gives you a single client whose
game-scoped namespaces mirror Riot's own product split.

```ts
// BEFORE — twisted
import { LolApi, TftApi, RiotApi } from 'twisted'

const lol  = new LolApi({ key: process.env.RIOT_API_KEY, rateLimitRetry: true })
const tft  = new TftApi(process.env.RIOT_API_KEY)
const riot = new RiotApi(process.env.RIOT_API_KEY)
```

```ts
// AFTER — yasuo
import { Yasuo } from 'yasuo.js'

const yasuo = new Yasuo({ key: process.env.RIOT_API_KEY })
// yasuo.lol   — everything LolApi did
// yasuo.tft   — everything TftApi did
// yasuo.riot  — everything RiotApi did
// yasuo.dataDragon — the static-data CDN
```

Like twisted, the key can be omitted to read `RIOT_API_KEY` from the environment,
or passed as a bare string (`new Yasuo(process.env.RIOT_API_KEY)`). Retries are on
by default — there is no `rateLimitRetry` flag to set.

## 2. Regions: `Constants` becomes two enums

twisted exposed routing values through `Constants.Regions` /
`Constants.RegionGroups`. yasuo promotes those to top-level enums with the
community-facing short codes as keys.

```ts
// BEFORE
import { Constants } from 'twisted'
Constants.Regions.KOREA          // platform region
Constants.RegionGroups.EUROPE    // regional routing value
```

```ts
// AFTER
import { Region, RegionGroup } from 'yasuo.js'
Region.KR                        // platform region
RegionGroup.EUROPE               // regional routing value
```

Common mappings:

| twisted | yasuo |
| --- | --- |
| `Constants.Regions.KOREA` | `Region.KR` |
| `Constants.Regions.EU_WEST` | `Region.EUW` |
| `Constants.Regions.EU_EAST` | `Region.EUNE` |
| `Constants.Regions.AMERICA_NORTH` | `Region.NA` |
| `Constants.Regions.BRAZIL` | `Region.BR` |
| `Constants.Regions.JAPAN` | `Region.JP` |
| `Constants.Regions.OCEANIA` | `Region.OCE` |
| `Constants.RegionGroups.AMERICAS` | `RegionGroup.AMERICAS` |
| `Constants.RegionGroups.ASIA` | `RegionGroup.ASIA` |
| `Constants.RegionGroups.EUROPE` | `RegionGroup.EUROPE` |
| `Constants.RegionGroups.SEA` | `RegionGroup.SEA` |

The underlying wire values are identical (`Region.KR === 'KR'`,
`Region.EUW === 'EUW1'`), so nothing changes at the HTTP layer — only the names.

## 3. Response shape: `.execute()` and the entity itself

twisted resolved every call to an `{ response, rateLimits }` envelope you had to
destructure. In yasuo a namespace method returns a **query builder** — nothing
hits the network until you call the terminal `.execute()`, which resolves the
**entity itself**. There is no wrapper object: the DTO fields live directly on
the entity, and it carries its own `.error` (`ApiError | null`) and `.http`
(`{ status, headers, rateLimits, ok, url }`) right alongside them.

```ts
// BEFORE — twisted
const { response, rateLimits } = await lol.Summoner.getByPUUID(puuid, Constants.Regions.KOREA)
console.log(response.summonerLevel)
console.log(rateLimits.AppRateLimit)
```

```ts
// AFTER — yasuo
const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()
if (summoner.error) return                // no throw — `error` is the original ApiError
console.log(summoner.summonerLevel)       // DTO field, right on the entity
console.log(summoner.http.rateLimits.app) // [{ limit, intervalSeconds, count }]
console.log(summoner.http.status)         // 200
```

`.execute()` **never throws for an API-level failure** (404/403/429/5xx/network):
the DTO fields are absent, `summoner.error` holds the original `ApiError` and
`summoner.http.ok` is `false`. If you would rather throw, pass
`.execute({ throw: true })` — it returns the entity on success or throws the
`ApiError`:

```ts
const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute({ throw: true })
```

Need the untouched Riot payload? `.execute({ raw: true })` returns exactly what
the API sent, bypassing entity mapping (on failure it is the error body Riot
returned). It is typed `unknown` by default, or pass the shape you expect as a
type argument — `.execute<{ puuid: string; summonerLevel: number }>({ raw: true })`
— an unchecked assertion, so it's on you to keep it accurate.

(Misuse still throws eagerly: a missing or empty key throws `ApiKeyMissingError`,
because that is a programmer error, not an API error.)

List endpoints resolve to a `Collection` **directly** — an array you can
`map`/`filter`/spread, carrying the same `.error`/`.http`. Scalar endpoints
(e.g. `mastery.score`) resolve a `ValueResult` — read the value from `.value`.

## 4. Method mapping

Every yasuo cell returns a query builder — append `.execute()` to run it. The
Notes column shows what `.execute()` resolves to.

| twisted | yasuo | Notes |
| --- | --- | --- |
| `lol.Summoner.getByPUUID(puuid, region)` | `yasuo.lol.summoner.byPuuid(puuid, region).execute()` | lazy `SummonerRef extends SingleQuery`; → `SummonerEntity` |
| `lol.Summoner.getByName(name, region)` | — | **removed by Riot**; see gotchas |
| `lol.Summoner.getBySummonerId(id, region)` | `yasuo.lol.summoner.byId(id, region).execute()` | deprecated by Riot; prefer PUUID |
| `lol.League.byPUUID(puuid, region)` | `yasuo.lol.league.byPuuid(puuid, region).execute()` | → `Collection<LeagueEntryEntity>` |
| `lol.League.get(summonerId, region)` | `yasuo.lol.league.bySummonerId(id, region).execute()` | deprecated by Riot; prefer PUUID |
| `lol.MatchV5.list(puuid, group, { count })` | `yasuo.lol.match.idsByPuuid(puuid, group, { count }).execute()` | → `Collection<string>` |
| `lol.MatchV5.get(matchId, group)` | `yasuo.lol.match.get(matchId, group).execute()` | → `MatchEntity` |
| `lol.MatchV5.timeline(matchId, group)` | `yasuo.lol.match.timeline(matchId, group).execute()` | → `MatchTimelineEntity` |
| `tft.Match.get(matchId, group)` | `yasuo.tft.match.get(matchId, group).execute()` | → `TftMatchEntity` |
| `riot.Account.getByRiotId(name, tag, group)` | `yasuo.riot.account.byRiotId(name, tag, group).execute()` | → `AccountEntity` |
| `riot.Account.getByPUUID(puuid, group)` | `yasuo.riot.account.byPuuid(puuid, group).execute()` | → `AccountEntity` |
| `riot.Account.getActiveRegion(puuid, game, group)` | `yasuo.riot.account.activeRegion(game, puuid, group).execute()` | note the argument order |

Notice the shift to **PUUID-first**. Riot has deprecated encrypted-summoner-id and
account-id lookups; yasuo keeps `byId` / `bySummonerId` for legacy data but marks
them `@deprecated`, and every relation routes by PUUID.

## 5. Superpowers you get for free

### Lazy relations — chain in a single request

`byPuuid(...)` returns a chainable query builder (a `SummonerRef`). Calling
`.execute()` on it fetches the summoner; calling a *relation* returns its **own**
builder that, when executed, fetches **only** that resource — the summoner call is
skipped, and the routing is derived for you.

```ts
// BEFORE — twisted: two round-trips, manual region math
const { response: summoner } = await lol.Summoner.getByPUUID(puuid, Constants.Regions.KOREA)
const { response: ids } = await lol.MatchV5.list(puuid, Constants.RegionGroups.ASIA, { count: 20 })
```

```ts
// AFTER — yasuo: ONE request; Region.KR → RegionGroup.ASIA is automatic
const ids = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).matchIds({ count: 20 }).execute()
```

### Async-iterator pagination

```ts
// Every match in a player's history, paced by the rate limiter — no page loop:
for await (const id of yasuo.lol.match.streamIds(puuid, RegionGroup.ASIA, { pageSize: 100 })) {
  // …
}
```

### Opt-in cache

```ts
import { Yasuo, RedisCache } from 'yasuo.js'

const yasuo = new Yasuo({ key, cache: true })                      // in-memory, per-namespace TTLs
const y2    = new Yasuo({ key, cache: { store: new RedisCache(redis), ttlMs: 30_000 } })
```

### Leveled logger

```ts
import { Yasuo, LogLevel } from 'yasuo.js'

const yasuo = new Yasuo({ key, logLevel: LogLevel.DEBUG })  // or env YASUO_LOG_LEVEL=debug
```

This replaces twisted's `debug: { logTime, logUrls, logRatelimits }` toggles.

### Zero dependencies

Nothing else lands in your `node_modules`. yasuo targets Node 18+ / Bun / Deno and
ships a single-file dual **ESM + CJS** build with complete type declarations.

## 6. Gotchas

- **Summoner-by-name is gone.** Riot removed the endpoint, so twisted's
  `Summoner.getByName` has no equivalent. Resolve a Riot ID to a PUUID first, then
  chain:

  ```ts
  const account  = await yasuo.riot.account.byRiotId('Hide on bush', 'KR1', RegionGroup.ASIA).execute()
  const summoner = await account.summoner(Region.KR).execute()
  ```

- **`Region` vs `RegionGroup` are not interchangeable.** Platform APIs (Summoner,
  League, Mastery, Spectator, Status, Clash) take a `Region`; cross-region APIs
  (Match-V5, TFT Match, Account) take a `RegionGroup`. The types enforce it — just
  as twisted's `Regions` / `RegionGroups` generics did — so a wrong routing value
  is a compile error, not a 404.

- **Rate limiting is reactive by default; proactive is opt-in.** Like twisted,
  yasuo reacts to a `429`/`503` and retries with backoff out of the box. On top of
  that it can read Riot's rate-limit headers and pace requests *underneath* the
  advertised limits — but that proactive pacing is **off unless you ask for it**:
  `new Yasuo({ key, rateLimit: true })` (or pass an options object to tune it).

- **Errors surface on `.error`, not by throwing.** `.execute()` doesn't throw for
  API failures — twisted's `RateLimitError` / `GenericError` become a `YasuoError`
  hierarchy that lands on the result's `.error`:

  ```ts
  import { NotFoundError, RateLimitError } from 'yasuo.js'

  const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()
  if (summoner.error instanceof NotFoundError) { /* 404 */ }
  else if (summoner.error instanceof RateLimitError) { /* summoner.error.rateLimits.retryAfterSeconds */ }
  else { /* success — summoner.summonerLevel, summoner.http.status */ }

  // Prefer exceptions? Opt in with { throw: true }:
  const strict = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute({ throw: true })
  ```

## See also

- [Getting started](getting-started.md)
- [Entities & lazy relations](entities-and-relations.md)
- [Rate limiting](rate-limiting.md)
- [Pagination](pagination.md)
- [Errors](errors.md)
