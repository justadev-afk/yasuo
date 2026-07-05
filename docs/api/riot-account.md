# Riot Account — `yasuo.riot.account`

The `riot.account` namespace wraps Riot's **ACCOUNT-V1** endpoints: look up a Riot
account by PUUID or by Riot ID (`gameName#tagLine`), and resolve a player's
active shard / active region for a game. Account-V1 is a **regional** API, so
every method routes by a region group — specifically the account subset
`AccountRegionGroup` (`RegionGroup.AMERICAS`, `RegionGroup.ASIA`,
`RegionGroup.EUROPE`; `SEA` is not a valid account routing value).

Every method returns a query — run it with `.execute()`. The result is the
entity itself, carrying `.error` (`ApiError | null`) and `.http`
(`{ status, headers, rateLimits, ok, url }`); API failures don't throw (the DTO
fields are absent and `.error` is set) unless you pass `.execute({ throw: true })`.
See [Entities & relations](../entities-and-relations.md) and
[Errors](../errors.md).

```ts
import { Yasuo, RegionGroup, Region, Game } from 'yasuo.js'

const yasuo = new Yasuo({ key: process.env.RIOT_API_KEY! })
// Assume a `puuid` string already exists where used below.
```

## `byPuuid(puuid, regionGroup)`

Fetch an account by its encrypted PUUID.

- **Params** — `puuid: string` — the player's PUUID; `regionGroup: AccountRegionGroup` — account routing (`AMERICAS`, `ASIA` or `EUROPE`).
- **Returns** — `SingleQuery<AccountEntity>` → an `AccountEntity` with `puuid`, and the optional `gameName` / `tagLine` (both may be absent for some accounts).
- **Routing** — `RegionGroup` (account subset).

```ts
const account = await yasuo.riot.account.byPuuid(puuid, RegionGroup.ASIA).execute()
if (account.error) return

console.log(account.gameName, account.tagLine, account.http.status)
```

## `byRiotId(gameName, tagLine, regionGroup)`

Fetch an account by its Riot ID — the in-game name and tag line either side of
the `#` (e.g. `Hide on bush#KR1`).

- **Params** — `gameName: string` — the name before the `#`; `tagLine: string` — the tag after the `#`; `regionGroup: AccountRegionGroup` — account routing.
- **Returns** — `SingleQuery<AccountEntity>` → an `AccountEntity` with `puuid`, `gameName`, `tagLine`.
- **Routing** — `RegionGroup` (account subset).

```ts
const account = await yasuo.riot.account.byRiotId('Hide on bush', 'KR1', RegionGroup.ASIA).execute()
if (account.error) return

console.log(account.puuid)
```

### Walking the account → summoner → matches

`AccountEntity` exposes lazy relations. `account.summoner(region)` returns a
`SummonerRef` (see [`lol-summoner.md`](lol-summoner.md)) — it is chainable, so a
relation call off it runs **only** that related request. The summoner itself is
never fetched here; the walk below issues a single request (the match list):

```ts
const account = await yasuo.riot.account.byRiotId('Hide on bush', 'KR1', RegionGroup.ASIA).execute()
if (account.error) return

// account -> summoner (KR) -> 5 most recent matches; only the match request runs.
const matches = await account.summoner(Region.KR).matches({ count: 5 }).execute()
if (matches.error) return

for (const match of matches) {
  console.log(match.metadata.matchId)
}
```

`AccountEntity` also offers `tftSummoner(region)` (a `TftSummonerRef`) and the
routing-free convenience relations `account.activeRegion(game)` and
`account.activeShard(game)`, which reuse the account's own PUUID and region
group.

## `activeShard(game, puuid, regionGroup)`

A player's active shard for a game (ACCOUNT-V1 `active-shards`).

- **Params** — `game: Game` — the game (`Game.LOL`, `Game.TFT`, …); `puuid: string` — the player's PUUID; `regionGroup: AccountRegionGroup` — account routing.
- **Returns** — `SingleQuery<ActiveShardEntity>` → an `ActiveShardEntity` with `puuid`, `game`, `activeShard`.
- **Routing** — `RegionGroup` (account subset).

```ts
const shard = await yasuo.riot.account.activeShard(Game.LOL, puuid, RegionGroup.AMERICAS).execute()
if (shard.error) return

console.log(shard.game, shard.activeShard)
```

## `activeRegion(game, puuid, regionGroup)`

A player's active region for a game (ACCOUNT-V1 `region`).

- **Params** — `game: Game` — the game (`Game.LOL` or `Game.TFT`); `puuid: string` — the player's PUUID; `regionGroup: AccountRegionGroup` — account routing.
- **Returns** — `SingleQuery<AccountRegionEntity>` → an `AccountRegionEntity` with `puuid`, `game`, `region` (a platform id string like `kr` / `euw1`), plus the helper `toRegion(): Region | null` that maps that string onto a `Region` enum member.
- **Routing** — `RegionGroup` (account subset).

```ts
// Opt into throwing instead of the error-carrying result.
const active = await yasuo.riot.account
  .activeRegion(Game.LOL, puuid, RegionGroup.EUROPE)
  .execute({ throw: true })

const region = active.toRegion() // Region | null
console.log(active.region, region)
```
