# Challenges — `yasuo.lol.challenges`

Riot's `LOL-CHALLENGES-V1` endpoints: the configuration and percentile
distribution of every challenge, a challenge's leaderboard of apex players, and
a single player's challenge progress. Every method routes by `Region`
(platform).

Every method returns a query — run it with `.execute()`. The result is the
entity/collection itself, carrying `.error` and `.http`; see
[Entities & relations](../entities-and-relations.md) and [Errors](../errors.md).
One method — [`percentiles`](#percentilesregion) — is a **scalar** endpoint: it
resolves a `ValueResult<T>`, so you read the payload from `.value`.

Assume `const yasuo = new Yasuo({ key })` and a `puuid` string already exist.

## `config(region)`

The configuration of every challenge.

- **Params** — `region: Region` — the platform region.
- **Returns** — `CollectionQuery<ChallengeConfigEntity>` → a
  `Collection<ChallengeConfigEntity>`; each config exposes `id`, `state`
  (`ENABLED` | `DISABLED` | `HIDDEN` | `ARCHIVED`), `leaderboard`,
  `localizedNames`, `thresholds` (points required per tier), plus optional
  `tracking`, `startTimestamp`, `endTimestamp`. It adds a `name(locale?)` helper
  (defaults to `en_US`) that reads the localised display name.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const configs = await yasuo.lol.challenges.config(Region.EUW).execute()
if (configs.error) return

for (const c of configs) {
  console.log(c.id, c.name(), c.state)
}
console.log(configs.length, configs.http.status)
```

## `percentiles(region)`

The percentile distributions of **every** challenge, keyed by challenge id then
tier. This is a scalar endpoint — the raw map is boxed in a `ValueResult`, so
read it from `.value`.

- **Params** — `region: Region` — the platform region.
- **Returns** — `SingleQuery<ValueResult<AllChallengePercentilesDTO>>` → a
  `ValueResult`; read `.value` (`AllChallengePercentilesDTO | null`, i.e.
  `Record<challengeId, Record<tier, number>>`). `null` when the request failed.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const result = await yasuo.lol.challenges.percentiles(Region.EUW).execute()
if (result.error || result.value === null) return

const byTier = result.value['1'] // percentiles for challenge id 1
console.log(byTier?.DIAMOND)
```

You can also pull the untyped Riot payload directly:

```ts
const raw = await yasuo.lol.challenges.percentiles(Region.EUW).execute({ raw: true })
// raw: unknown — the exact JSON Riot returned
```

## `configById(challengeId, region)`

The configuration of a single challenge.

- **Params** — `challengeId: number` — the challenge id. `region: Region` — the
  platform region.
- **Returns** — `SingleQuery<ChallengeConfigEntity>` → a `ChallengeConfigEntity`
  (same fields and `name(locale?)` helper as [`config`](#configregion)).
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const config = await yasuo.lol.challenges.configById(101_101, Region.EUW).execute()
if (config.error) return
console.log(config.name('en_US'), config.thresholds)
```

## `leaderboards(challengeId, level, region, limit?)`

The leaderboard (apex players) for a challenge at a given level.

- **Params** — `challengeId: number` — the challenge id. `level: ChallengeLevel`
  — the level, one of `ChallengeLevel.MASTER`, `ChallengeLevel.GRANDMASTER`,
  `ChallengeLevel.CHALLENGER`. `region: Region` — the platform region.
  `limit?: number` — optional cap on the number of entries returned.
- **Returns** — `CollectionQuery<ChallengeApexPlayerDTO>` → a
  `Collection<ChallengeApexPlayerDTO>`; each entry has `puuid`, `value`,
  `position`.
- **Routing** — `Region`.

```ts
import { Region, ChallengeLevel } from 'yasuo.js'

const board = await yasuo.lol.challenges
  .leaderboards(101_101, ChallengeLevel.CHALLENGER, Region.EUW, 10)
  .execute()
if (board.error) return

for (const player of board) {
  console.log(player.position, player.puuid, player.value)
}
```

## `percentilesById(challengeId, region)`

The percentile distribution of a single challenge, keyed by tier.

- **Params** — `challengeId: number` — the challenge id. `region: Region` — the
  platform region.
- **Returns** — `SingleQuery<ChallengePercentilesEntity>` → a
  `ChallengePercentilesEntity`. The entity is a `Record<tier, number>` — index
  it by tier name to read a percentile.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const pct = await yasuo.lol.challenges.percentilesById(101_101, Region.EUW).execute()
if (pct.error) return
console.log(pct.DIAMOND, pct.CHALLENGER)
```

## `player(puuid, region)`

A player's full challenge progress.

- **Params** — `puuid: string` — the player's PUUID. `region: Region` — the
  platform region.
- **Returns** — `SingleQuery<PlayerChallengesEntity>` → a
  `PlayerChallengesEntity` with `totalPoints` (a `ChallengePointsDTO`:
  `level`, `current`, `max`, optional `percentile`/`position`), `categoryPoints`
  (`Record<category, ChallengePointsDTO>`), `challenges` (`ChallengeInfoDTO[]` —
  each with `challengeId`, `level`, `value`, `percentile`, …), and `preferences`
  (title, banner, chosen challenge ids).
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const player = await yasuo.lol.challenges.player(puuid, Region.EUW).execute()
if (player.error) return

console.log(player.totalPoints.current, '/', player.totalPoints.max)
console.log(player.totalPoints.level, player.challenges.length, 'challenges')
```

You can opt into throwing instead of inspecting `.error`:

```ts
const player = await yasuo.lol.challenges
  .player(puuid, Region.EUW)
  .execute({ throw: true }) // throws the ApiError on failure
console.log(player.categoryPoints)
```
