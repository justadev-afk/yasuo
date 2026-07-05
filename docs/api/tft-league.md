# TFT League — `yasuo.tft.league`

Wraps Riot's **TFT-LEAGUE-V1** endpoints: a player's TFT ranked entries, the
apex leagues (Challenger / Grandmaster / Master), a tier/division page, a league
by id, and the Hyper Roll rated ladder. Every method routes by `Region`
(platform).

Every method returns a query — run it with `.execute()`. The result is the
entity itself, carrying `.error` and `.http`; see
[Entities & relations](../entities-and-relations.md) and [Errors](../errors.md).

> Examples assume `const yasuo = new Yasuo({ key })` and that a `puuid` string
> already exists.

Three entity shapes appear here:

- **`TftLeagueEntryEntity`** — one ranked entry: `queueType`, `wins`, `losses`,
  and (for standard ranked) `tier`, `rank`, `leaguePoints`, `hotStreak`,
  `veteran`, `puuid`. For Hyper Roll (`RANKED_TFT_TURBO`) most of those are
  absent and `ratedTier` / `ratedRating` are used instead. It carries a lazy
  `summoner()` relation → a [`TftSummonerRef`](tft-summoner.md) (throws if the
  entry has no `puuid`).
- **`TftLeagueListEntity`** — an apex league: `tier`, `entries`
  (each `TftLeagueItemDTO` with `puuid`, `rank`, `leaguePoints`, `wins`,
  `losses`), plus `leagueId`, `name`, `queue`. Helper `puuids()` → `string[]`.
- **`TftRatedLadderEntryEntity`** — one Hyper Roll ladder row: `puuid`,
  `ratedTier`, `ratedRating`, `wins`, `previousUpdateLadderPosition`, plus a
  `summoner()` relation.

### `byPuuid(puuid, region)`

A player's TFT ranked entries by PUUID.

- **Params** — `puuid: string` — the player's PUUID. `region: Region` — the
  platform region.
- **Returns** — `CollectionQuery<TftLeagueEntryEntity>` → a `Collection` you
  iterate/index/`.length` directly.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const entries = await yasuo.tft.league.byPuuid(puuid, Region.KR).execute()
if (entries.error) return
for (const entry of entries) {
  console.log(entry.queueType, entry.tier, entry.rank, entry.wins, entry.losses)
}
```

### `bySummonerId(summonerId, region)`

A player's TFT ranked entries by encrypted summoner id.

- **Params** — `summonerId: string` — the encrypted summoner id. `region: Region`
  — the platform region.
- **Returns** — `CollectionQuery<TftLeagueEntryEntity>` → a `Collection`.
- **Routing** — `Region`.
- **Deprecated** — prefer [`byPuuid`](#bypuuidpuuid-region).

```ts
import { Region } from 'yasuo.js'

const entries = await yasuo.tft.league.bySummonerId(summonerId, Region.EUW).execute()
console.log(entries.length)
```

### `entries(tier, division, region, page?)`

A page of TFT ranked entries for a given tier and division.

- **Params** — `tier: Tier` — ranked tier. `division: Division` — division within
  the tier. `region: Region` — the platform region. `page?: number` — 1-indexed
  page number, default `1`.
- **Returns** — `CollectionQuery<TftLeagueEntryEntity>` → a `Collection`.
- **Routing** — `Region`.

```ts
import { Tier, Division, Region } from 'yasuo.js'

const page1 = await yasuo.tft.league
  .entries(Tier.DIAMOND, Division.I, Region.NA)
  .execute()
for (const entry of page1) {
  console.log(entry.puuid, entry.leaguePoints)
}
```

### `challenger(region)`

The TFT Challenger league.

- **Params** — `region: Region` — the platform region.
- **Returns** — `SingleQuery<TftLeagueListEntity>` → a `TftLeagueListEntity` with
  `tier`, `entries`, and a `puuids()` helper.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const league = await yasuo.tft.league.challenger(Region.KR).execute()
if (league.error) return
console.log(league.tier, league.entries.length)
console.log(league.puuids().slice(0, 5))
```

### `grandmaster(region)`

The TFT Grandmaster league.

- **Params** — `region: Region` — the platform region.
- **Returns** — `SingleQuery<TftLeagueListEntity>` → a `TftLeagueListEntity`.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const league = await yasuo.tft.league.grandmaster(Region.EUW).execute()
console.log(league.entries.length)
```

### `master(region)`

The TFT Master league.

- **Params** — `region: Region` — the platform region.
- **Returns** — `SingleQuery<TftLeagueListEntity>` → a `TftLeagueListEntity`.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const league = await yasuo.tft.league.master(Region.NA).execute()
console.log(league.tier, league.entries.length)
```

### `byId(leagueId, region)`

A TFT league by its league id.

- **Params** — `leagueId: string` — the league id. `region: Region` — the
  platform region.
- **Returns** — `SingleQuery<TftLeagueListEntity>` → a `TftLeagueListEntity`.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

// Get the raw Riot payload instead of an entity:
const raw = await yasuo.tft.league.byId(leagueId, Region.KR).execute({ raw: true })
console.log(raw)
```

### `ratedLadder(region, queue?)`

The top of the Hyper Roll rated ladder.

- **Params** — `region: Region` — the platform region. `queue?: TftRatedLadderQueue`
  — the rated-ladder queue, default `TftRatedLadderQueue.HYPER_ROLL`.
- **Returns** — `CollectionQuery<TftRatedLadderEntryEntity>` → a `Collection`.
- **Routing** — `Region`.

```ts
import { Region, TftRatedLadderQueue } from 'yasuo.js'

const ladder = await yasuo.tft.league
  .ratedLadder(Region.EUW, TftRatedLadderQueue.HYPER_ROLL)
  .execute()
if (ladder.error) return
for (const row of ladder) {
  console.log(row.ratedTier, row.ratedRating, row.wins)
}
```
