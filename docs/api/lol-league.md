# League — `yasuo.lol.league`

Ranked ladders and apex leagues, backed by Riot's `LEAGUE-V4` and
`league-exp-v4` endpoints: a player's ranked entries, a page of any
tier/division, the Challenger/Grandmaster/Master leagues, and a league by id.
Every method routes by `Region` (platform).

Every method returns a query — run it with `.execute()`. The result is the
entity/collection itself, carrying `.error` and `.http`; see
[Entities & relations](../entities-and-relations.md) and [Errors](../errors.md).
The one exception is [`streamEntries`](#streamentriesqueue-tier-division-region-options),
which returns a `Paginator` you iterate directly — see [Pagination](../pagination.md).

Assume `const yasuo = new Yasuo({ key })` and a `puuid` string already exist.

## `byPuuid(puuid, region)`

All ranked entries for a player, keyed off their PUUID (one entry per ranked
queue they've placed in).

- **Params** — `puuid: string` — the player's PUUID. `region: Region` — the
  platform region.
- **Returns** — `CollectionQuery<LeagueEntryEntity>` → a `Collection<LeagueEntryEntity>`;
  each entry exposes `queueType`, `tier`, `rank`, `leaguePoints`, `wins`,
  `losses`, `hotStreak`, `veteran`, `freshBlood`, `inactive` (plus optional
  `miniSeries` during promos), and a lazy `summoner()` relation.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const entries = await yasuo.lol.league.byPuuid(puuid, Region.EUW).execute()
if (entries.error) return

for (const entry of entries) {
  console.log(entry.queueType, entry.tier, entry.rank, entry.leaguePoints)
}
console.log(entries.length, entries.http.status)
```

`LeagueEntryEntity` carries a lazy relation back to its summoner — calling it
runs only that summoner request, in the same region, without re-passing it:

```ts
const [solo] = await yasuo.lol.league.byPuuid(puuid, Region.EUW).execute()
const summoner = await solo.summoner().execute() // SummonerRef, same region
```

## `bySummonerId(summonerId, region)`

Ranked entries for a player by encrypted summoner id.

!!! warning "Deprecated"
    Riot is retiring summoner ids — prefer [`byPuuid`](#bypuuidpuuid-region).

- **Params** — `summonerId: string` — the encrypted summoner id.
  `region: Region` — the platform region.
- **Returns** — `CollectionQuery<LeagueEntryEntity>` → a `Collection<LeagueEntryEntity>`
  (same fields as [`byPuuid`](#bypuuidpuuid-region)).
- **Routing** — `Region`.

```ts
const entries = await yasuo.lol.league.bySummonerId(summonerId, Region.EUW).execute()
if (entries.error) return
console.log(entries.length)
```

## `entries(queue, tier, division, region, page?)`

One page of the ranked ladder for a given queue, tier and division.

- **Params** — `queue: RankedQueue` — the ranked queue (e.g. `RankedQueue.SOLO_5x5`).
  `tier: Tier` — the tier (e.g. `Tier.DIAMOND`). `division: Division` — the
  division within the tier (e.g. `Division.I`). `region: Region` — the platform
  region. `page?: number` — 1-indexed page number, default `1`.
- **Returns** — `CollectionQuery<LeagueEntryEntity>` → a `Collection<LeagueEntryEntity>`.
- **Routing** — `Region`.

```ts
import { RankedQueue, Tier, Division, Region } from 'yasuo.js'

const page1 = await yasuo.lol.league
  .entries(RankedQueue.SOLO_5x5, Tier.DIAMOND, Division.I, Region.EUW)
  .execute()
if (page1.error) return
console.log(`${page1.length} Diamond I players on page 1`)
```

## `expEntries(queue, tier, division, region, page?)`

One page of experimental ranked entries via `league-exp-v4`. Same shape as
[`entries`](#entriesqueue-tier-division-region-page), but this variant also
covers the apex tiers (`MASTER`, `GRANDMASTER`, `CHALLENGER`).

- **Params** — `queue: RankedQueue`, `tier: Tier`, `division: Division`,
  `region: Region`, `page?: number` (1-indexed, default `1`).
- **Returns** — `CollectionQuery<LeagueEntryEntity>` → a `Collection<LeagueEntryEntity>`.
- **Routing** — `Region`.

```ts
import { RankedQueue, Tier, Division, Region } from 'yasuo.js'

const apex = await yasuo.lol.league
  .expEntries(RankedQueue.SOLO_5x5, Tier.CHALLENGER, Division.I, Region.KR)
  .execute()
if (apex.error) return
console.log(apex.length)
```

## `streamEntries(queue, tier, division, region, options?)`

Stream **every** entry for a queue/tier/division, paging the ladder
automatically. Unlike the methods above, this returns a `Paginator` — not a
query — so there is **no `.execute()`**: you iterate it directly and it fetches
pages on demand, each through the [rate limiter](../rate-limiting.md).

- **Params** — `queue: RankedQueue`, `tier: Tier`, `division: Division`,
  `region: Region`, `options?: LeagueStreamOptions` — `{ startPage?: number }`
  (1-indexed page to begin at, default `1`) and `{ maxItems?: number }` (a hard
  cap on total entries yielded).
- **Returns** — `Paginator<LeagueEntryEntity>` — async-iterable over the entries.
- **Routing** — `Region`.

!!! warning "Iteration throws on failure"
    A `Paginator` follows async-iterator convention: each page is fetched with
    `{ throw: true }` internally, so a failed request (`404`, `429`, `5xx`, a
    transport error) **throws mid-iteration** instead of setting `.error`. Wrap
    the loop in `try/catch` — the thrown value is the same [`ApiError`](../errors.md).

```ts
import { RankedQueue, Tier, Division, Region } from 'yasuo.js'

// Every Diamond I player, paced for you:
try {
  for await (const entry of yasuo.lol.league.streamEntries(
    RankedQueue.SOLO_5x5, Tier.DIAMOND, Division.I, Region.EUW,
    { startPage: 1, maxItems: 500 },
  )) {
    console.log(entry.puuid, entry.leaguePoints)
  }
} catch (err) {
  console.error('ladder stream failed', err)
}
```

See [Pagination & async iterators](../pagination.md) for `toArray()`, `first()`
and `pages()`, resuming from a saved page, and batching patterns.

## `challenger(queue, region)`

The Challenger league for a queue.

- **Params** — `queue: RankedQueue` — the ranked queue. `region: Region` — the
  platform region.
- **Returns** — `SingleQuery<LeagueListEntity>` → a `LeagueListEntity` with
  `tier`, `entries` (`LeagueItemDTO[]` — each with `puuid`, `rank`,
  `leaguePoints`, `wins`, `losses`, …), and optional `leagueId`, `name`,
  `queue`. It adds a `puuids()` helper returning every player's PUUID.
- **Routing** — `Region`.

```ts
import { RankedQueue, Region } from 'yasuo.js'

const league = await yasuo.lol.league.challenger(RankedQueue.SOLO_5x5, Region.KR).execute()
if (league.error) return
console.log(league.name, league.entries.length)
console.log(league.puuids().slice(0, 5)) // top-of-array PUUIDs
```

## `grandmaster(queue, region)`

The Grandmaster league for a queue. Identical shape to
[`challenger`](#challengerqueue-region).

- **Params** — `queue: RankedQueue`, `region: Region`.
- **Returns** — `SingleQuery<LeagueListEntity>` → a `LeagueListEntity`
  (`tier`, `entries`, `puuids()`).
- **Routing** — `Region`.

```ts
import { RankedQueue, Region } from 'yasuo.js'

const gm = await yasuo.lol.league.grandmaster(RankedQueue.SOLO_5x5, Region.EUW).execute()
if (gm.error) return
console.log(gm.entries.length)
```

## `master(queue, region)`

The Master league for a queue. Identical shape to
[`challenger`](#challengerqueue-region).

- **Params** — `queue: RankedQueue`, `region: Region`.
- **Returns** — `SingleQuery<LeagueListEntity>` → a `LeagueListEntity`
  (`tier`, `entries`, `puuids()`).
- **Routing** — `Region`.

```ts
import { RankedQueue, Region } from 'yasuo.js'

// Opt into throwing instead of inspecting `.error`:
const master = await yasuo.lol.league
  .master(RankedQueue.SOLO_5x5, Region.NA)
  .execute({ throw: true })
console.log(master.entries.length)
```

## `byId(leagueId, region)`

A single league by its id (any tier — the same shape apex leagues return).

- **Params** — `leagueId: string` — the league id (e.g. the `leagueId` off an
  entry). `region: Region` — the platform region.
- **Returns** — `SingleQuery<LeagueListEntity>` → a `LeagueListEntity`
  (`tier`, `entries`, optional `leagueId`/`name`/`queue`, `puuids()`).
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const league = await yasuo.lol.league.byId(leagueId, Region.EUW).execute()
if (league.error) return
console.log(league.tier, league.name, league.entries.length)
```
