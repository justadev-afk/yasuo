# Match — `yasuo.lol.match`

The MATCH-V5 endpoints: full matches, timelines, and a player's match-id history.
Every method here uses **regional** routing — pass a `RegionGroup`
(`RegionGroup.ASIA`, `RegionGroup.AMERICAS`, `RegionGroup.EUROPE`), not a
platform `Region`.

Every method returns a query — run it with `.execute()`. The result is the
entity itself (or a `Collection`), carrying `.error` and `.http`; see
[Entities & relations](../entities-and-relations.md) and [Errors](../errors.md).
The two `stream*` methods instead return a lazy `Paginator` — see
[Pagination](../pagination.md).

> The examples assume `const yasuo = new Yasuo({ key })` and a `puuid` string
> already exist.

## Methods

### `get(matchId, regionGroup)`

A full match by id.

- **Params** — `matchId: string` — the match id, e.g. `KR_1234567890`;
  `regionGroup: RegionGroup` — the regional routing value.
- **Returns** — `SingleQuery<MatchEntity>` → a `MatchEntity` exposing
  `metadata` (`matchId`, `dataVersion`, `participants`) and `info`
  (`gameMode`, `gameDuration`, `queueId`, `platformId`, `participants`,
  `teams`, …), plus the helper methods below.
- **Routing** — `RegionGroup`.

```ts
import { RegionGroup } from 'yasuo.js'

const match = await yasuo.lol.match.get('KR_1234567890', RegionGroup.ASIA).execute()
if (match.error) return
console.log(match.metadata.matchId, match.info.gameMode, match.http.status)

const winner = match.winningTeam()      // MatchTeamDTO | null
const me = match.participant(puuid)     // MatchParticipantDTO | undefined
const region = match.platformRegion()   // Region | null
```

### `timeline(matchId, regionGroup)`

A match timeline (per-frame snapshots and events) by id.

- **Params** — `matchId: string` — the match id;
  `regionGroup: RegionGroup` — the regional routing value.
- **Returns** — `SingleQuery<MatchTimelineEntity>` → a `MatchTimelineEntity`
  exposing `metadata` (`matchId`, …) and `info` (`frameInterval`, `frames`,
  optional `participants`), plus an `id` getter and a lazy `match()` relation.
- **Routing** — `RegionGroup`.

```ts
const timeline = await yasuo.lol.match.timeline('KR_1234567890', RegionGroup.ASIA).execute()
if (timeline.error) return
console.log(timeline.info.frameInterval, timeline.info.frames.length)

// Jump to the full match without re-passing ids:
const match = await timeline.match().execute()
```

### `idsByPuuid(puuid, regionGroup, query?)`

A single page of match ids for a player.

- **Params** — `puuid: string` — the player's PUUID;
  `regionGroup: RegionGroup` — the regional routing value;
  `query?: MatchIdsQuery` — optional filters: `count` (0–100, default 20),
  `start` (offset, default 0), `queue` (queue id), `type` (a `MatchType`,
  mutually exclusive with `queue`), `startTime`/`endTime` (epoch seconds).
- **Returns** — `CollectionQuery<string>` → a `Collection<string>` — iterate,
  index and `.length` it directly.
- **Routing** — `RegionGroup`.

```ts
import { MatchType } from 'yasuo.js'

const ids = await yasuo.lol.match
  .idsByPuuid(puuid, RegionGroup.ASIA, { count: 20, type: MatchType.RANKED })
  .execute()
if (ids.error) return
for (const id of ids) console.log(id) // 'KR_1234…'
console.log(ids.length, ids.http.status)
```

### `byPuuid(puuid, regionGroup, query?)`

A player's recent matches, **fetched in full** — it first resolves the match ids
(as `idsByPuuid`), then issues one `get` request per id and gathers them into a
`Collection`. It honours the same `.execute()` options as any query: with
`{ throw: true }` the first failed request throws; with `{ raw: true }` you get
the array of raw Riot payloads.

- **Params** — `puuid: string` — the player's PUUID;
  `regionGroup: RegionGroup` — the regional routing value;
  `query?: MatchIdsQuery` — the same filters as `idsByPuuid` (keep `count`
  small: every id becomes its own request).
- **Returns** — `CollectionQuery<MatchEntity>` → a `Collection<MatchEntity>`.
- **Routing** — `RegionGroup`.

```ts
const matches = await yasuo.lol.match
  .byPuuid(puuid, RegionGroup.ASIA, { count: 5 })
  .execute()
if (matches.error) return
for (const match of matches) {
  console.log(match.metadata.matchId, match.winningTeam()?.teamId)
}
```

Prefer to fail loudly? Opt into throwing — any failed id or match request
rejects with its `ApiError`:

```ts
try {
  const matches = await yasuo.lol.match.byPuuid(puuid, RegionGroup.ASIA).execute({ throw: true })
  console.log(matches.length)
} catch (error) {
  // ApiError from whichever underlying request failed
}
```

### `streamIds(puuid, regionGroup, options?)`

Stream a player's **entire** match-id history as a lazy async iterator, paging
transparently and pacing each fetch through the rate limiter.

- **Params** — `puuid: string` — the player's PUUID;
  `regionGroup: RegionGroup` — the regional routing value;
  `options?: MatchStreamOptions` — `start` (offset, default 0), `pageSize`
  (ids per request, 1–100, default 100), `maxItems` (hard cap on total),
  plus the `startTime`/`endTime`/`queue`/`type` filters forwarded to each page.
- **Returns** — `Paginator<string>` — `for await` over it, or collect eagerly
  with `.toArray(limit?)`. See [Pagination](../pagination.md).
- **Routing** — `RegionGroup`.

```ts
// Iterate lazily — pages fetched on demand:
for await (const id of yasuo.lol.match.streamIds(puuid, RegionGroup.ASIA)) {
  console.log(id)
}

// Or collect the first 50 into an array:
const firstFifty = await yasuo.lol.match.streamIds(puuid, RegionGroup.ASIA).toArray(50)
```

### `streamMatches(puuid, regionGroup, options?)`

Like `streamIds`, but yields **full match entities** — each page fetches its ids,
then fetches every match on that page in full before yielding them.

- **Params** — identical to `streamIds`:
  `puuid: string`, `regionGroup: RegionGroup`, `options?: MatchStreamOptions`.
- **Returns** — `Paginator<MatchEntity>`. Each per-match fetch runs with
  `{ throw: true }` internally, so a failed match fetch rejects the iterator.
- **Routing** — `RegionGroup`.

```ts
for await (const match of yasuo.lol.match.streamMatches(puuid, RegionGroup.ASIA, {
  maxItems: 30,
})) {
  console.log(match.metadata.matchId, match.info.gameMode)
}
```

## `MatchEntity` relations & helpers

Beyond the DTO fields (`metadata`, `info`), a `MatchEntity` adds:

- **`id`** — the match id (`metadata.matchId`).
- **`timeline()`** — `SingleQuery<MatchTimelineEntity>`; the timeline for this
  match, with no ids re-passed.
- **`winningTeam()`** — `MatchTeamDTO | null`; the team whose `win` is `true`.
- **`participant(puuid)`** — `MatchParticipantDTO | undefined`; look up one
  participant by PUUID.
- **`platformRegion()`** — `Region | null`; the platform region derived from
  `info.platformId`.
- **`summoners()`** — `SummonerRef[]`; a lazy summoner reference per
  participant (throws if `info.platformId` is unrecognised). Call `.execute()`
  only on the ones you need.

```ts
const match = await yasuo.lol.match.get('KR_1234567890', RegionGroup.ASIA).execute()
if (match.error) return

// Relations run only the request you ask for:
const timeline = await match.timeline().execute()
const [firstPlayer] = match.summoners()
const summoner = await firstPlayer.execute()
```

`MatchTimelineEntity` mirrors this with an `id` getter and a `match()` relation
back to the full match.
