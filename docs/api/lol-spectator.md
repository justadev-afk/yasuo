# Spectator — `yasuo.lol.spectator`

The SPECTATOR-V5 endpoints: a player's live game and a sample of featured games.
Both methods use **platform** routing — pass a `Region` (`Region.KR`,
`Region.EUW`, `Region.NA`, …).

Every method returns a query — run it with `.execute()`. The result is the
entity itself, carrying `.error` and `.http`; see
[Entities & relations](../entities-and-relations.md) and [Errors](../errors.md).

> The examples assume `const yasuo = new Yasuo({ key })` and a `puuid` string
> already exist.

## Methods

### `active(puuid, region)`

The player's live game, or `null` if they are not currently in one.

A `404` ("not in a game") is treated as an expected empty result, **not** an
error: `.execute()` resolves to `null` and nothing is thrown — even with
`{ throw: true }`. Any *other* failure comes back as a `CurrentGameEntity`
carrying `.error`. So check `null` first, then `.error`.

- **Params** — `puuid: string` — the player's PUUID;
  `region: Region` — the platform region.
- **Returns** — `SingleQuery<CurrentGameEntity | null>` → `null` when not in
  game, otherwise a `CurrentGameEntity` exposing `gameId`, `gameMode`,
  `gameType`, `gameLength`, `mapId`, `platformId`, `bannedChampions`,
  `participants`, `observers` and optional `gameQueueConfigId`, plus the helper
  methods below.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const game = await yasuo.lol.spectator.active(puuid, Region.KR).execute()
if (game === null) {
  // Player is not currently in a game.
  return
}
if (game.error) return // some other failure — DTO fields are absent
console.log(game.gameMode, game.participants.length, game.http.status)

// Lazy summoner refs for the identified (non-anonymised) participants:
const [firstPlayer] = game.summoners()
const summoner = await firstPlayer.execute()
```

### `featured(region)`

A sample of featured games currently in progress on a platform.

- **Params** — `region: Region` — the platform region.
- **Returns** — `SingleQuery<FeaturedGamesEntity>` → a `FeaturedGamesEntity`
  exposing `gameList` (an array of the same live-game shape as `active`) and an
  optional `clientRefreshInterval` (suggested seconds between refreshes).
- **Routing** — `Region`.

```ts
const featured = await yasuo.lol.spectator.featured(Region.EUW).execute()
if (featured.error) return
for (const game of featured.gameList) {
  console.log(game.gameId, game.gameMode, game.participants.length)
}
```

Need the untouched Riot payload instead? Ask for it raw:

```ts
const raw = await yasuo.lol.spectator.featured(Region.EUW).execute({ raw: true })
// raw: unknown — the exact SPECTATOR-V5 response body
```
