# Champion Mastery — `yasuo.lol.mastery`

The CHAMPION-MASTERY-V4 endpoints: a player's per-champion mastery entries and
their total mastery score. Every method uses **platform** routing — pass a
`Region` (`Region.KR`, `Region.EUW`, `Region.NA`, …).

Every method returns a query — run it with `.execute()`. The result is the
entity (or `Collection`/`ValueResult`), carrying `.error` and `.http`; see
[Entities & relations](../entities-and-relations.md) and [Errors](../errors.md).

> The examples assume `const yasuo = new Yasuo({ key })` and a `puuid` string
> already exist.

## Methods

### `byPuuid(puuid, region)`

All champion-mastery entries for a player.

- **Params** — `puuid: string` — the player's PUUID;
  `region: Region` — the platform region.
- **Returns** — `CollectionQuery<ChampionMasteryEntity>` → a
  `Collection<ChampionMasteryEntity>` — iterate, index and `.length` it
  directly.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const all = await yasuo.lol.mastery.byPuuid(puuid, Region.KR).execute()
if (all.error) return
console.log(all.length)
for (const entry of all) {
  console.log(entry.championId, entry.championLevel, entry.championPoints)
}
```

### `byChampion(puuid, championId, region)`

A player's mastery of a single champion.

- **Params** — `puuid: string` — the player's PUUID;
  `championId: number` — the champion id;
  `region: Region` — the platform region.
- **Returns** — `SingleQuery<ChampionMasteryEntity>` → a
  `ChampionMasteryEntity` exposing `championId`, `championLevel`,
  `championPoints`, `championPointsSinceLastLevel`,
  `championPointsUntilNextLevel`, `lastPlayTime`, `tokensEarned`,
  `championSeasonMilestone`, and optional `milestoneGrades`/`chestGranted`,
  plus the helper methods below.
- **Routing** — `Region`.

```ts
const mastery = await yasuo.lol.mastery.byChampion(puuid, 157, Region.KR).execute()
if (mastery.error) return
console.log(mastery.championLevel, mastery.championPoints)

// Lazy relation to the champion's static Data Dragon data (or null):
const champion = await mastery.champion()
```

### `top(puuid, region, count?)`

A player's highest champion masteries.

- **Params** — `puuid: string` — the player's PUUID;
  `region: Region` — the platform region;
  `count?: number` — how many top entries to return (Riot defaults to 3).
- **Returns** — `CollectionQuery<ChampionMasteryEntity>` → a
  `Collection<ChampionMasteryEntity>`.
- **Routing** — `Region`.

```ts
const top = await yasuo.lol.mastery.top(puuid, Region.KR, 5).execute()
if (top.error) return
for (const entry of top) {
  console.log(entry.championId, entry.championPoints)
}
```

### `score(puuid, region)`

A player's total champion-mastery score (a bare `number`).

- **Params** — `puuid: string` — the player's PUUID;
  `region: Region` — the platform region.
- **Returns** — `SingleQuery<ValueResult<number>>` → a `ValueResult<number>`.
  A primitive can't carry HTTP context, so read the score from `.value`
  (`number | null` — `null` on failure).
- **Routing** — `Region`.

```ts
const score = await yasuo.lol.mastery.score(puuid, Region.KR).execute()
if (score.error) return
console.log(score.value, score.http.status) // number | null
```

Prefer to throw on failure? The scalar result is the same, only the error path
differs:

```ts
try {
  const score = await yasuo.lol.mastery.score(puuid, Region.KR).execute({ throw: true })
  console.log(score.value)
} catch (error) {
  // ApiError
}
```

## `ChampionMasteryEntity` relations & helpers

Beyond the DTO fields, a `ChampionMasteryEntity` adds:

- **`summoner()`** — `SummonerRef`; a lazy reference to the summoner this
  mastery belongs to. Call `.execute()` to fetch it, or chain a relation off it.
- **`champion()`** — `Promise<DDragonChampionSummaryDTO | null>`; the champion's
  static Data Dragon summary, or `null` if the id is absent from the latest
  patch. (This one is a plain `await`, not a query — Data Dragon returns DTOs
  directly.)
