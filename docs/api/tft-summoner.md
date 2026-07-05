# TFT Summoner — `yasuo.tft.summoner`

Wraps Riot's **TFT-SUMMONER-V1** endpoints: look up a Teamfight Tactics summoner
profile by PUUID or (deprecated) encrypted summoner id. Every method routes by
`Region` (platform).

Every method returns a query — run it with `.execute()`. The result is the
entity itself, carrying `.error` and `.http`; see
[Entities & relations](../entities-and-relations.md) and [Errors](../errors.md).

> Examples assume `const yasuo = new Yasuo({ key })` and that a `puuid` string
> already exists.

A `TftSummonerEntity` mirrors the LoL summoner payload — its most useful fields
are `puuid`, `profileIconId`, `summonerLevel` and `revisionDate` (epoch ms). The
legacy `id` (encrypted summoner id) is deprecated and usually absent.

### `byPuuid(puuid, region)`

Look up a TFT summoner by PUUID.

- **Params** — `puuid: string` — the player's PUUID. `region: Region` — the
  platform region.
- **Returns** — a lazy [`TftSummonerRef`](../entities-and-relations.md) (which
  `extends SingleQuery<TftSummonerEntity>`). Call `.execute()` to fetch the
  summoner, or call one of its **relation** methods (below) to run *only* that
  related request — the summoner itself is never fetched.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const summoner = await yasuo.tft.summoner.byPuuid(puuid, Region.KR).execute()
if (summoner.error) return
console.log(summoner.summonerLevel, summoner.profileIconId, summoner.http.status)
```

#### Relations on the ref

Each relation is itself a query (or a `Paginator`) that runs on its own — the
summoner is not fetched first:

- **`account()`** → `SingleQuery<AccountEntity>` — the underlying Riot account
  (gameName / tagLine).
- **`leagueEntries()`** → `CollectionQuery<TftLeagueEntryEntity>` — this player's
  TFT ranked entries (see [TFT League](tft-league.md)).
- **`matchIds(query?)`** → `CollectionQuery<string>` — ids of recent TFT matches.
- **`matches(query?)`** → `CollectionQuery<TftMatchEntity>` — recent matches
  fetched in full (see [TFT Match](tft-match.md)).
- **`streamMatches(options?)`** → `Paginator<TftMatchEntity>` — the whole match
  history, paged lazily (see [Pagination](../pagination.md)).
- **`activeGame()`** → `SingleQuery<CurrentGameEntity | null>` — the live TFT
  game, or `null` when the player is not in one.

`matchIds` / `matches` / `streamMatches` accept the same `TftMatchIdsQuery` /
`TftMatchStreamOptions` filters (`count`, `start`, `startTime`, `endTime`) as the
[TFT Match](tft-match.md) namespace; the region group is derived from `region`
for you.

```ts
import { Region } from 'yasuo.js'

// Runs ONE request — the league endpoint — not the summoner lookup:
const ref = yasuo.tft.summoner.byPuuid(puuid, Region.EUW)

const entries = await ref.leagueEntries().execute()
for (const entry of entries) {
  console.log(entry.queueType, entry.tier, entry.rank, entry.leaguePoints)
}

// A relation that resolves to null when the player is offline:
const live = await ref.activeGame().execute()
if (live === null) {
  console.log('not currently in a TFT game')
} else if (!live.error) {
  console.log(live.gameId, live.participants.length)
}
```

### `byId(summonerId, region)`

Look up a TFT summoner by encrypted summoner id.

- **Params** — `summonerId: string` — the encrypted summoner id. `region: Region`
  — the platform region.
- **Returns** — `SingleQuery<TftSummonerEntity>` → a `TftSummonerEntity` with
  `puuid`, `profileIconId`, `summonerLevel`, `revisionDate`.
- **Routing** — `Region`.
- **Deprecated** — Riot rarely returns the encrypted `id` anymore; prefer
  [`byPuuid`](#bypuuidpuuid-region).

```ts
import { Region } from 'yasuo.js'

// Throw on failure instead of attaching `.error`:
const summoner = await yasuo.tft.summoner
  .byId(summonerId, Region.NA)
  .execute({ throw: true })
console.log(summoner.puuid, summoner.summonerLevel)
```
