# yasuo

**A modern, zero-dependency TypeScript client for the Riot Games API** — League of Legends, Teamfight Tactics and the Riot Account API.

!!! warning "🚧 Under construction — not ready for use yet"
    yasuo is being actively designed and its public API is still changing between
    commits. It is **not** published to npm and should **not** be used in any
    project yet. A first release will be announced when the surface is stable.

yasuo is the evolution of [twisted](https://github.com/justadev-afk/twisted). It keeps
everything that made twisted pleasant — a single client, typed responses,
rate-limit info attached to every result — and rebuilds it around a Supabase-style
**query builder**, lazy relation-aware chaining, a pluggable cache, a leveled
logger and async iterators, all with **no runtime dependencies**.

```ts
import { Yasuo, Region, RegionGroup } from 'yasuo.js'

const yasuo = new Yasuo(process.env.RIOT_API_KEY)

// Every call is a query you run with .execute(). The result IS the entity —
// it carries its own `.error` and `.http`, and never throws for an API failure:
const account = await yasuo.riot.account
  .byRiotId('Hide on bush', 'KR1', RegionGroup.ASIA)
  .execute()

// Walk relations off the entity — this fetches ONLY the match list, not the summoner:
const matches = await account.summoner(Region.KR).matchIds({ count: 5 }).execute()
```

## What makes it different

- **Query builders + `.execute()`.** Methods build a query; the terminal
  `.execute()` runs it and resolves the [entity/collection](entities-and-relations.md)
  **directly**, carrying its own `.error` and `.http` (`{ status, headers, rateLimits, ok }`).
- **Never throws for API errors.** On failure the DTO fields are absent and
  `.error` holds the original rich `ApiError`; on success `.error` is `null`.
  Opt into throwing with `.execute({ throw: true })`, or get the raw Riot payload
  with `.execute({ raw: true })`. See [errors](errors.md).
- **Lazy relations.** `byPuuid(...)` returns a reference whose relations run
  **only** their own request — see [entities & relations](entities-and-relations.md).
- **Reactive rate limiting on by default, proactive pacing opt-in** — see
  [rate limiting](rate-limiting.md).
- **Pluggable transport + stackable middleware** — see [transport & middleware](http-and-middleware.md).
- **Async iterators** for pagination (`for await`) — see [pagination](pagination.md).
- **Pluggable caching** (in-memory / Redis) — see [caching](caching.md).
- **No magic strings** — every Riot constant is an enum.
- **Dual ESM + CJS**, single-file, fully typed, **zero runtime dependencies**.

## Where to next

<div class="grid cards" markdown>

- :material-rocket-launch: **[Getting started](getting-started.md)** — install, construct a client, make your first call.
- :material-sitemap: **[Entities & lazy relations](entities-and-relations.md)** — the chaining model.
- :material-speedometer: **[Rate limiting](rate-limiting.md)** — reactive vs proactive pacing.
- :material-alert-circle: **[Errors](errors.md)** — the `.error`/`.http` model and `.execute({ throw })`.
- :material-format-list-numbered: **[Pagination](pagination.md)** — async iterators.
- :material-swap-horizontal: **[Migrating from twisted](migrating-from-twisted.md)** — the mapping.

</div>

## Install

```bash
bun add yasuo.js
# or
npm install yasuo.js
```

yasuo targets Node 18+ / Bun / Deno and ships a single-file dual **ESM + CJS**
build with complete type declarations.
