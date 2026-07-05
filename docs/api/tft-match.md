# TFT Match — `yasuo.tft.match`

Wraps Riot's **TFT-MATCH-V1** endpoints: a player's match ids, a full match by
id, a player's recent matches hydrated in full, and a lazy stream over an entire
match history. Every method routes by `RegionGroup` (regional / continental).

Every method returns a query — run it with `.execute()`. The result is the
entity itself, carrying `.error` and `.http`; see
[Entities & relations](../entities-and-relations.md) and [Errors](../errors.md).
The `streamMatches` method is the one exception: it returns a `Paginator` you
iterate directly (see [Pagination](../pagination.md)).

> Examples assume `const yasuo = new Yasuo({ key })` and that a `puuid` string
> already exists.

A `TftMatchEntity` exposes the wire payload's `metadata` (`match_id`,
`data_version`, `participants` — a list of PUUIDs) and `info` (`game_datetime`,
`game_length`, `game_version`, `tft_set_number`, `queue_id`, and `participants`
— the full per-player records). It adds helpers: an `id` getter
(`metadata.match_id`), `platformRegion()`, `participant(puuid)`, `winner()`
(placement 1, or `null`), and `summoners()` (lazy
[`TftSummonerRef`](tft-summoner.md)s for every participant).

### `idsByPuuid(puuid, regionGroup, query?)`

A page of TFT match ids for a player.

- **Params** — `puuid: string` — the player's PUUID. `regionGroup: RegionGroup` —
  the regional routing value. `query?: TftMatchIdsQuery` — optional filters:
  `count` (0–100, default 20), `start` (offset, default 0), `startTime`,
  `endTime` (epoch seconds).
- **Returns** — `CollectionQuery<string>` → a `Collection<string>` of match ids;
  iterate/index/`.length` it directly.
- **Routing** — `RegionGroup`.

```ts
import { RegionGroup } from 'yasuo.js'

const ids = await yasuo.tft.match
  .idsByPuuid(puuid, RegionGroup.ASIA, { count: 10 })
  .execute()
if (ids.error) return
for (const id of ids) console.log(id) // 'KR_1234…'
```

### `get(matchId, regionGroup)`

A full TFT match by id.

- **Params** — `matchId: string` — the match id. `regionGroup: RegionGroup` — the
  regional routing value.
- **Returns** — `SingleQuery<TftMatchEntity>` → a `TftMatchEntity`.
- **Routing** — `RegionGroup`.

```ts
import { RegionGroup } from 'yasuo.js'

const match = await yasuo.tft.match.get('KR_1234567890', RegionGroup.ASIA).execute()
if (match.error) return
console.log(match.id, match.info.tft_set_number, match.info.queue_id)

const top = match.winner()
if (top) console.log('winner placement 1:', top.puuid, top.last_round)
```

### `byPuuid(puuid, regionGroup, query?)`

A player's recent TFT matches, fetched in full (one request per match id).

- **Params** — `puuid: string` — the player's PUUID. `regionGroup: RegionGroup` —
  the regional routing value. `query?: TftMatchIdsQuery` — the same filters as
  [`idsByPuuid`](#idsbypuuidpuuid-regiongroup-query).
- **Returns** — `CollectionQuery<TftMatchEntity>` → a `Collection<TftMatchEntity>`.
  If any underlying request fails, the collection comes back empty with `.error`
  set.
- **Routing** — `RegionGroup`.

```ts
import { RegionGroup } from 'yasuo.js'

const matches = await yasuo.tft.match
  .byPuuid(puuid, RegionGroup.AMERICAS, { count: 5 })
  .execute()
if (matches.error) return
for (const match of matches) {
  console.log(match.id, match.info.game_datetime, match.participant(puuid)?.placement)
}
```

### `streamMatches(puuid, regionGroup, options?)`

Stream a player's entire TFT match history as full match entities — a
`Paginator`, not a query. It fetches ids a page at a time, hydrating every match
(one request per match), pacing each page through the rate limiter. Because
hydration is heavy, lean on `maxItems`.

- **Params** — `puuid: string` — the player's PUUID. `regionGroup: RegionGroup` —
  the regional routing value. `options?: TftMatchStreamOptions` — `start`
  (item offset, default 0), `pageSize` (ids per request, 1–100, default 100),
  `maxItems` (hard cap), `startTime`, `endTime` (epoch seconds).
- **Returns** — `Paginator<TftMatchEntity>` — `for await` over it, or use
  `.toArray(limit?)`, `.first()`, `.pages()`.
- **Routing** — `RegionGroup`.

> Unlike a query's `.execute()`, a `Paginator` fetches each page with
> `{ throw: true }` internally, so a failed request **throws mid-iteration** —
> wrap the loop in `try/catch` when you need to handle that. See
> [Pagination](../pagination.md).

```ts
import { RegionGroup } from 'yasuo.js'

// Most recent 20 matches, paced automatically:
for await (const match of yasuo.tft.match.streamMatches(puuid, RegionGroup.EUROPE, {
  maxItems: 20,
})) {
  console.log(match.id, match.info.tft_set_number)
}

// Or collect eagerly, capped:
const recent = await yasuo.tft.match
  .streamMatches(puuid, RegionGroup.EUROPE, { maxItems: 10 })
  .toArray()
```
