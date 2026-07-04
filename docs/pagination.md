# Pagination & async iterators

Some Riot endpoints are unbounded. A player's match history and a ranked ladder
are both far too large to return in one response, so Riot paginates them — the
match list by an **item offset** (`start` + `count`), the ranked ladder by a
**page number**. Walking either one by hand means a `while` loop, a cursor you
increment yourself, and manual pacing so you don't trip the rate limiter.

yasuo hides all of that behind a single type: **`Paginator<T>`**. It is a lazy
[`AsyncIterable`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/asyncIterator) —
you `for await` over it and it fetches pages **on demand**, one at a time, each
fetch flowing through the [rate limiter](rate-limiting.md). Nothing is requested
until you start iterating, and when you stop, it stops. Because the starting
cursor is configurable, you can begin from **any offset or page** and resume
later from exactly where you left off.

```ts
import { Yasuo, RegionGroup } from 'yasuo'

const yasuo = new Yasuo({ key: process.env.RIOT_API_KEY })

// Every match in a player's history, paced automatically:
for await (const id of yasuo.lol.match.streamIds(puuid, RegionGroup.ASIA)) {
  console.log(id) // 'KR_1234…'
}
```

## The four ways to consume a Paginator

Every `stream*` method returns a `Paginator<T>` **directly** — a paginator is not
a query builder, so there is no `.execute()` to call and no single result to
await; you iterate the paginator itself. You can drain it four ways.

> **Iteration throws on failure.** Where a single/collection query's `.execute()`
> resolves the entity/collection directly and never throws for an API error (it
> sets `.error` instead), a `Paginator` follows async-iterator convention: every
> page is fetched with `{ throw: true }` internally, so a failed request (`404`,
> `429`, `5xx`, a transport error) **throws mid-iteration**. Wrap a `for await`,
> `.toArray()`, `.first()` or `.pages()` loop in `try/catch` when you need to
> handle those — the thrown value is the same rich [`ApiError`](errors.md) the
> query builders attach as the result's `.error`.

### Item by item — `for await`

The paginator *is* an async iterable, so iterate it directly. Pages are fetched
transparently as you cross their boundaries:

```ts
for await (const entry of yasuo.lol.league.streamEntries(
  RankedQueue.SOLO_5x5, Tier.DIAMOND, Division.I, Region.EUW,
)) {
  console.log(entry.puuid, entry.leaguePoints)
}
```

### Collect eagerly — `toArray(limit?)`

Pull everything (or up to `limit` items) into a plain array. The optional
`limit` stops the fetching early — pages past the limit are never requested:

```ts
const first50 = await yasuo.lol.match
  .streamIds(puuid, RegionGroup.ASIA)
  .toArray(50)
```

### Peek at the first — `first()`

Fetch just the first item, or `null` if the sequence is empty. Only one page is
ever requested:

```ts
const mostRecent = await yasuo.lol.match
  .streamIds(puuid, RegionGroup.ASIA)
  .first() // string | null
```

### Page by page — `pages()`

`pages()` yields whole `Page<T>` objects instead of individual items. Each page
exposes its `items`, the response `meta` for the request that produced it (rate
limits, status, url — see [entities](entities-and-relations.md)), and the
`cursor` it was fetched with:

```ts
for await (const page of yasuo.lol.match.streamMatches(puuid, RegionGroup.ASIA).pages()) {
  console.log(`cursor ${page.cursor}: ${page.items.length} matches`)
  console.log(page.meta.rateLimits.app) // budget for this page's request
  await persist(page.items)             // process a whole batch at once
}
```

```ts
interface Page<T> {
  readonly items: readonly T[] // the items on this page
  readonly meta: ResponseMeta  // rate limits / status / url for this fetch
  readonly cursor: number      // the offset or page number it was fetched with
}
```

## Streaming a match history

`yasuo.lol.match` exposes two streams, both **regionally** routed
(`RegionGroup`):

- `streamIds(puuid, regionGroup, options?)` → `Paginator<string>` — match ids.
- `streamMatches(puuid, regionGroup, options?)` → `Paginator<MatchEntity>` — the
  **full** match entities. Each page fetches its ids, then hydrates every match
  (one request per match), so this is heavier — lean on `maxItems`.

Both take the same `MatchStreamOptions`:

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `start` | `number` | `0` | Item **offset** to begin at — start from anywhere. |
| `pageSize` | `number` | `100` | Match ids fetched per request (1–100). |
| `maxItems` | `number` | — | Hard cap on the total items yielded. |
| `startTime` | `number` | — | Epoch seconds; only matches after this time. |
| `endTime` | `number` | — | Epoch seconds; only matches before this time. |
| `queue` | `number` | — | Filter by queue id. Cannot be combined with `type`. |
| `type` | `MatchType` | — | Match category. Cannot be combined with `queue`. |

```ts
import { RegionGroup, MatchType } from 'yasuo'

// Ranked matches only, 100 per request, but stop after 500:
for await (const match of yasuo.lol.match.streamMatches(puuid, RegionGroup.ASIA, {
  pageSize: 100,
  maxItems: 500,
  type: MatchType.RANKED,
})) {
  console.log(match.info.gameCreation, match.metadata.matchId)
}

// Start from the 300th match — every page after that offset:
const older = yasuo.lol.match.streamIds(puuid, RegionGroup.ASIA, { start: 300 })
```

## Streaming a ranked ladder

`yasuo.lol.league.streamEntries(queue, tier, division, region, options?)` walks
a whole tier/division, page by page (Riot pages the ladder, not offsets), and
returns a `Paginator<LeagueEntryEntity>`:

```ts
import { RankedQueue, Tier, Division, Region } from 'yasuo'

for await (const entry of yasuo.lol.league.streamEntries(
  RankedQueue.SOLO_5x5, Tier.DIAMOND, Division.I, Region.EUW,
)) {
  console.log(entry.puuid, entry.wins, entry.losses)
}
```

`LeagueStreamOptions` is page-based:

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `startPage` | `number` | `1` | Page to begin at (**1-indexed**) — lets you resume. |
| `maxItems` | `number` | — | Hard cap on the total entries yielded. |

```ts
// Resume from page 7, and only take 200 more entries:
const rest = yasuo.lol.league.streamEntries(
  RankedQueue.SOLO_5x5, Tier.DIAMOND, Division.I, Region.EUW,
  { startPage: 7, maxItems: 200 },
)
```

## Via lazy relations

If you already hold a summoner reference, the same streams hang off it — the
region group is derived for you, so a summoner on `Region.KR` streams from
`RegionGroup.ASIA` without you re-specifying it:

```ts
const summoner = yasuo.lol.summoner.byPuuid(puuid, Region.KR)

for await (const id of summoner.streamMatchIds({ maxItems: 1000 })) {
  console.log(id)
}

for await (const match of summoner.streamMatches({ type: MatchType.RANKED })) {
  console.log(match.metadata.matchId)
}
```

`streamMatchIds` / `streamMatches` take the exact same `MatchStreamOptions` as
their `yasuo.lol.match` counterparts.

## Practical patterns

**Cap the total with `maxItems`.** The surest way to bound work — the paginator
stops fetching the moment the cap is reached, mid-page if need be:

```ts
const recent = await yasuo.lol.match
  .streamMatches(puuid, RegionGroup.ASIA, { maxItems: 20 })
  .toArray()
```

**Resume from a saved offset or page.** Persist the last `cursor` you saw, then
hand it back as `start` (matches) or `startPage` (ladder) next run:

```ts
let last = await loadCursor() // e.g. 400
for await (const page of yasuo.lol.match.streamIds(puuid, RegionGroup.ASIA, {
  start: last,
}).pages()) {
  await handle(page.items)
  last = page.cursor + page.items.length
  await saveCursor(last)
}
```

**Process in batches with `pages()`.** When your sink is batch-oriented (a bulk
insert, a queue publish), iterate `pages()` and hand off `page.items` whole
rather than one item at a time.

**Early-exit by breaking the loop.** Because fetching is lazy, `break` costs
nothing — no further pages are requested:

```ts
for await (const match of yasuo.lol.match.streamMatches(puuid, RegionGroup.ASIA)) {
  if (match.info.gameCreation < cutoff) break // stop; no wasted fetches
  await index(match)
}
```
