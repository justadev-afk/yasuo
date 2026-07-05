# Entities & lazy relations

Every method on the client returns a **query builder**, not a resource. Call `.execute()` and you get the **entity directly** (or a `Collection` of them) — there is no wrapper. The entity is a thin, typed thing whose DTO fields sit directly on it, that carries its own error on `.error` and the response metadata — rate limits, status, headers — on `.http`, and that puts every related resource one method call away. This is yasuo's replacement for twisted's `{ response, rateLimits }` envelope — nothing to unpack, nothing to thread through.

```ts
import { Yasuo, Region, RegionGroup } from 'yasuo.js'

const yasuo = new Yasuo({ key: process.env.RIOT_API_KEY })
```

## What an entity is

An entity carries three things at once: its DTO fields, its outcome, and its HTTP context.

**1. The entity exposes the DTO's fields directly.** The raw Riot payload is copied onto the instance, so once `.execute()` resolves you read wire fields straight off the entity — fully typed, no further hop:

```ts
const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()
if (summoner.error) return  // on failure the DTO fields are absent and `.error` is set

summoner.puuid            // string  — DTO field, right on the entity
summoner.summonerLevel    // number  — same
summoner.revisionDate     // number  — same
```

**2. The entity carries the metadata.** The HTTP context travels *with* the entity, on its `.http` property. Read the status, headers or rate-limit budget straight off it:

```ts
const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()

summoner.http.status      // 200
summoner.http.headers     // Readonly<Record<string, string>> — raw, lower-cased
summoner.http.rateLimits  // full RateLimits object
summoner.http.ok          // boolean — true when `error` is null
summoner.error            // ApiError | null
```

Every entity descends from `Entity<TData>` (`src/entities/entity.ts`), which supplies `.error` and `.http`; `ResponseInfo` and `RateLimits` are plain read-only shapes (`src/dto/common.dto.ts`):

```ts
abstract class Entity<TData extends object> {
  // …plus every DTO field of TData, copied onto the instance
  readonly error: ApiError | null                    // original error on failure, null on success
  readonly http: ResponseInfo                         // HTTP context of the response
}

interface ResponseInfo {
  readonly status: number                            // HTTP status (0 if it never reached Riot)
  readonly headers: Readonly<Record<string, string>> // raw headers, lower-cased
  readonly rateLimits: RateLimits                    // always present
  readonly url: string                               // final request URL, query string included
  readonly ok: boolean                               // true when `error` is null
}

interface RateLimits {
  readonly type: RateLimitType | null      // which limiter enforced a 429, else null
  readonly retryAfterSeconds: number | null // from `retry-after`, else null
  readonly app: readonly RateLimitWindow[]  // from `x-app-rate-limit`
  readonly method: readonly RateLimitWindow[] // from `x-method-rate-limit`
  readonly edgeTraceId: string | null       // from `x-riot-edge-trace-id`
}

interface RateLimitWindow {
  readonly limit: number            // requests allowed per window
  readonly intervalSeconds: number  // window length, in seconds
  readonly count?: number           // requests already used, when Riot reports it
}
```

The rate-limit budget therefore travels *with* the entity — no side channel, no second return value:

```ts
console.log(summoner.http.rateLimits.app)  // [{ limit: 100, intervalSeconds: 120, count: 3 }, …]
```

**Failures don't throw.** `.execute()` resolves the entity even for a `404`/`403`/`429`/`5xx` or a network error — its DTO fields are absent and `.error` holds the original `ApiError`. Branch on `.error`, or call `.execute({ throw: true })` to throw the `ApiError` instead (`.execute({ raw: true })` hands back the untouched Riot payload as `unknown`). (The one exception: a missing or empty key throws `ApiKeyMissingError` synchronously — a programmer error, not an API error.) See [errors](errors.md) for the hierarchy.

## Collections

List endpoints return a `CollectionQuery<T>`; its `.execute()` resolves a `Collection<T>` directly. `Collection<T>` **extends `Array<T>`**, so everything you already do with an array works — indexing, `for..of`, spread, `.length`, `.map`, `.filter` — and it carries the same `.error`/`.http` as any entity:

```ts
const entries = await yasuo.lol.league.byPuuid(puuid, Region.KR).execute()
if (entries.error) return            // on failure the collection is empty and `.error` is set

entries.length                       // array behaviour
entries[0].leaguePoints              // indexing
const [solo, ...rest] = entries      // spread / destructuring
const points = entries.map((e) => e.leaguePoints) // map / filter / etc.
```

The metadata rides on the collection itself, on `.http`:

```ts
const entries = await yasuo.lol.league.byPuuid(puuid, Region.KR).execute()

entries[0].leaguePoints              // the entries
entries.http.rateLimits.method       // metadata on the collection
entries.http.status                  // 200
```

> **One caveat:** `Collection` methods that build a *new* array (`map`, `filter`, `slice`) return a plain `Array`, not a `Collection` — so the derived array has no `.http`/`.error`. Read those off the original `Collection` before you transform it.

## Lazy references — the key idea

`yasuo.lol.summoner.byPuuid(puuid, region)` does **not** fetch anything. It returns a `SummonerRef` — a lazy, chainable handle that **is a `SingleQuery<SummonerEntity>`** (`extends SingleQuery`). Call `.execute()` and it fetches the summoner; call a *relation* and you get a fresh query builder for that related resource instead. That single fact powers the whole ergonomic:

```ts
// Executing the ref fetches the summoner:
const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()

// Calling a RELATION fetches ONLY the related resource — the summoner is never requested.
// This is ONE request (the match list), not two:
const ids = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).matchIds({ count: 20 }).execute()
```

> `await ref` no longer works — the old thenable/`PromiseLike` behaviour is gone. Always finish a chain with `.execute()` (or, for streams, iterate the paginator).

**Why it's a single request:** the ref already holds the `puuid` and the `region` you passed in. A relation like `matchIds()` doesn't need the summoner entity to do its job — it has the PUUID directly — so it delegates straight to the right namespace (`yasuo.lol.match.idsByPuuid(...)`) and returns *its* query builder, deriving the routing along the way. When you `.execute()` that builder, only the match-list request runs; the summoner request is skipped entirely because it was never needed.

### Every relation on `SummonerRef`

All of these are lazy: each returns a query builder that triggers exactly one request for *its* resource when you `.execute()` it (or, for `streamMatchIds` / `streamMatches`, a `Paginator` that fetches pages on demand as you iterate).

| Method | Returns | What it fetches |
| --- | --- | --- |
| `account()` | `SingleQuery<AccountEntity>` | the underlying Riot account (game name + tag line) |
| `leagueEntries()` | `CollectionQuery<LeagueEntryEntity>` | ranked entries in every queue |
| `championMasteries()` | `CollectionQuery<ChampionMasteryEntity>` | mastery, one entry per champion played |
| `topChampionMasteries(count?)` | `CollectionQuery<ChampionMasteryEntity>` | the highest `count` masteries |
| `championMastery(championId)` | `SingleQuery<ChampionMasteryEntity>` | mastery of a single champion |
| `masteryScore()` | `SingleQuery<ValueResult<number>>` | total champion mastery score (read `.value`) |
| `matchIds(query?)` | `CollectionQuery<string>` | ids of recent matches (filterable) |
| `matches(query?)` | `CollectionQuery<MatchEntity>` | recent matches, fetched in full |
| `streamMatchIds(options?)` | `Paginator<string>` | match ids, streamed page by page |
| `streamMatches(options?)` | `Paginator<MatchEntity>` | full match entities, streamed page by page |
| `activeGame()` | `SingleQuery<CurrentGameEntity \| null>` | the live game, or `null` (a `404`) if not in one |
| `clashPlayers()` | `CollectionQuery<ClashPlayerEntity>` | active Clash registrations |
| `challenges()` | `SingleQuery<PlayerChallengesEntity>` | challenge progress |

A materialised `SummonerEntity` mirrors the same relations, so you can execute the summoner first and still traverse — each relation is still one request (the summoner is already in hand):

```ts
const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()
if (summoner.error) return

const ranked  = await summoner.leagueEntries().execute()
const history = await summoner.matches({ count: 5 }).execute()
```

## Chaining across entities

Relations compose across entity types, and they **derive their own routing** — you never re-specify a region once you've named it. The client knows that platform regions and regional routing values map onto each other, so a traversal picks the right one automatically.

```ts
// Account → Summoner → matches. `.summoner(Region.KR)` returns a SummonerRef,
// so `.matches(...).execute()` runs a single request (the match list):
const account = await yasuo.riot.account.byRiotId('Hide on bush', 'KR1', RegionGroup.ASIA).execute()
if (account.error) return

const matches = await account.summoner(Region.KR).matches({ count: 5 }).execute()
```

Three routing derivations do the heavy lifting:

- **`Region.KR` → `RegionGroup.ASIA` for match history.** `matchIds()` / `matches()` on a `KR` summoner traverse to the regional Match-V5 host automatically — you passed `Region.KR` once and never re-specify `RegionGroup.ASIA`.
- **`Region` → account routing for `account()`.** The ref maps the platform region to the account API's routing group for you.
- **`platformId` → `Region` for `match.summoners()`.** A match doesn't carry a region argument — it reads `info.platformId` off its own payload and resolves the platform region from it.

`MatchEntity` shows the same pattern from the match side:

```ts
const match = await yasuo.lol.match.get(matches[0].id, RegionGroup.ASIA).execute()
if (match.error) return

match.id                       // getter → metadata.matchId
match.winningTeam()            // MatchTeamDTO | null — computed locally, no request
const timeline = await match.timeline().execute()  // ids reused, region-group from context
const summoners = match.summoners()                // SummonerRef[], Region from info.platformId
```

The account entity itself is the entry point into both games:

```ts
import { Game } from 'yasuo.js'

const account = await yasuo.riot.account.byRiotId('Faker', 'KR1', RegionGroup.ASIA).execute()
if (account.error) return

account.summoner(Region.KR)                             // SummonerRef    (LoL, chainable)
account.tftSummoner(Region.KR)                          // TftSummonerRef (TFT, chainable)
const region = await account.activeRegion(Game.LOL).execute()  // AccountRegionEntity
const shard  = await account.activeShard(Game.LOL).execute()   // ActiveShardEntity
```

## How it works under the hood

Entities use the **interface + class declaration-merging** pattern to expose DTO fields with full types but no boilerplate:

```ts
// The empty interface merges the DTO's fields into the entity's type…
export interface SummonerEntity extends SummonerDTO {}

// …and the class supplies the behaviour. The constructor does `Object.assign(this, data)`,
// so the merged fields actually exist at runtime.
export class SummonerEntity extends Entity<SummonerDTO> {
  // relation methods only — the DTO fields come from the merge above
}
```

`Entity<TData>` (the abstract base) copies the payload onto the instance and holds a protected `EntityContext` — the client reference plus the originating `region` / `regionGroup` that every lazy relation reads to route its follow-up request. This is why entities need no arguments to traverse: the context remembers where they came from. The response metadata (rate limits, status, headers) is attached too, on the public `.http`, alongside the `.error` — so a single value carries the payload, its outcome, and its HTTP context.

This pattern is the reason `noUnsafeDeclarationMerging` and `noEmptyInterface` are disabled in `biome.json`. The full binding rule — one declaration per file, DTOs mirror the wire, entities own the ergonomics — lives in [architecture.md](architecture.md).
