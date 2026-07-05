# API reference

Every Riot product is a namespace on the client, and every namespace method
returns a **query** you run with `.execute()`. The result is the entity itself,
carrying its own `.error` and `.http` — see [Entities & relations](../entities-and-relations.md)
and [Errors](../errors.md) for the shared model, then jump to a namespace below
for its per-endpoint calls and responses.

```ts
import { Yasuo, Region, RegionGroup } from 'yasuo.js'

const yasuo = new Yasuo({ key: process.env.RIOT_API_KEY })
```

## League of Legends — `yasuo.lol.*`

<div class="grid cards" markdown>

- :material-account: **[Summoner](lol-summoner.md)** — `byPuuid` (lazy ref), `byId`, `byAccountId`.
- :material-trophy: **[League](lol-league.md)** — ranked entries, apex tiers, ladder streaming.
- :material-star-four-points: **[Champion Mastery](lol-champion-mastery.md)** — masteries, top-N, score.
- :material-refresh: **[Champion Rotation](lol-champion.md)** — the free-to-play rotation.
- :material-sword-cross: **[Match](lol-match.md)** — matches, timelines, id/match streaming.
- :material-eye: **[Spectator](lol-spectator.md)** — live game, featured games.
- :material-server-network: **[Status](lol-status.md)** — platform status.
- :material-account-group: **[Clash](lol-clash.md)** — players, teams, tournaments.
- :material-medal: **[Challenges](lol-challenges.md)** — config, percentiles, leaderboards, player.

</div>

## Teamfight Tactics — `yasuo.tft.*`

<div class="grid cards" markdown>

- :material-account: **[Summoner](tft-summoner.md)** — `byPuuid` (lazy ref), `byId`.
- :material-trophy: **[League](tft-league.md)** — entries, apex tiers, rated ladder.
- :material-sword-cross: **[Match](tft-match.md)** — matches, ids, streaming.
- :material-eye: **[Spectator](tft-spectator.md)** — live game, featured games.

</div>

## Riot & static data

<div class="grid cards" markdown>

- :material-identifier: **[Account](riot-account.md)** — `yasuo.riot.account`: PUUID ↔ Riot ID, active shard/region.
- :material-database: **[Data Dragon](data-dragon.md)** — `yasuo.dataDragon`: static CDN data (no key, no rate limits, awaited DTOs).

</div>

For the flat, one-line-per-endpoint list across all products, see
[Endpoint coverage](../endpoints.md).
