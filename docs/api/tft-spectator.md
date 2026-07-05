# TFT Spectator — `yasuo.tft.spectator`

Wraps Riot's **SPECTATOR-TFT-V5** endpoints: a player's active (live) TFT game
and the featured-games list. It shares the spectator payload shape with LoL, so
it returns the same `CurrentGameEntity` / `FeaturedGamesEntity`. Both methods
route by `Region` (platform).

Every method returns a query — run it with `.execute()`. The result is the
entity itself, carrying `.error` and `.http`; see
[Entities & relations](../entities-and-relations.md) and [Errors](../errors.md).

> Examples assume `const yasuo = new Yasuo({ key })` and that a `puuid` string
> already exists.

### `active(puuid, region)`

A player's active (live) TFT game, or `null` if they are not in one.

- **Params** — `puuid: string` — the player's PUUID. `region: Region` — the
  platform region.
- **Returns** — `SingleQuery<CurrentGameEntity | null>`. A `404` ("not in a
  game") resolves to `null` — an expected empty result, not an error. On success
  you get a `CurrentGameEntity` with `gameId`, `gameMode`, `gameLength`,
  `platformId`, `participants` and `bannedChampions`, plus a `platformRegion()`
  helper and lazy `summoners()` relations.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const game = await yasuo.tft.spectator.active(puuid, Region.KR).execute()
if (game === null) {
  console.log('player is not in a game')
} else if (game.error) {
  console.error(game.error.status)
} else {
  console.log(game.gameId, game.gameMode, game.participants.length)
}
```

### `featured(region)`

The list of featured TFT games.

- **Params** — `region: Region` — the platform region.
- **Returns** — `SingleQuery<FeaturedGamesEntity>` → a `FeaturedGamesEntity` with
  `gameList` (an array of live games) and an optional `clientRefreshInterval`
  (suggested seconds between refreshes).
- **Routing** — `Region`.
- **Note** — development API keys often receive `403` from this endpoint.

```ts
import { Region } from 'yasuo.js'

// Throw on failure instead of attaching `.error`:
const featured = await yasuo.tft.spectator
  .featured(Region.EUW)
  .execute({ throw: true })
for (const game of featured.gameList) {
  console.log(game.gameId, game.participants.length)
}
```
