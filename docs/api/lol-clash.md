# Clash — `yasuo.lol.clash`

The CLASH-V1 endpoints: a player's Clash registrations, teams, and tournaments.
Every method uses **platform** routing — pass a `Region` (`Region.KR`,
`Region.EUW`, `Region.NA`, …).

Every method returns a query — run it with `.execute()`. The result is the
entity (or `Collection`), carrying `.error` and `.http`; see
[Entities & relations](../entities-and-relations.md) and [Errors](../errors.md).

> The examples assume `const yasuo = new Yasuo({ key })` and a `puuid` string
> already exist.

## Methods

### `playersByPuuid(puuid, region)`

A player's active Clash registrations by PUUID (empty when they are not
registered).

- **Params** — `puuid: string` — the player's PUUID;
  `region: Region` — the platform region.
- **Returns** — `CollectionQuery<ClashPlayerEntity>` → a
  `Collection<ClashPlayerEntity>`; each entry exposes `puuid`, `position` (a
  `ClashPosition`), `role` (a `ClashRole`) and an optional `teamId`, plus the
  helper methods below.
- **Routing** — `Region`.

```ts
import { Region } from 'yasuo.js'

const players = await yasuo.lol.clash.playersByPuuid(puuid, Region.NA).execute()
if (players.error) return
for (const player of players) {
  console.log(player.teamId, player.position, player.role)
}
```

### `teamById(teamId, region)`

A Clash team by id.

- **Params** — `teamId: string` — the team id;
  `region: Region` — the platform region.
- **Returns** — `SingleQuery<ClashTeamEntity>` → a `ClashTeamEntity` exposing
  `id`, `tournamentId`, `name`, `abbreviation`, `iconId`, `tier`, `captain`
  (the captain's PUUID) and `players` (the roster), plus the helper methods
  below.
- **Routing** — `Region`.

```ts
const team = await yasuo.lol.clash.teamById('team-uuid', Region.NA).execute()
if (team.error) return
console.log(team.name, team.abbreviation, team.players.length)

// Lazy relations — each runs only the request you ask for:
const tournament = await team.tournament().execute()
const captain = await team.captainSummoner().execute()
```

### `tournaments(region)`

Active and upcoming Clash tournaments on a platform.

- **Params** — `region: Region` — the platform region.
- **Returns** — `CollectionQuery<ClashTournamentEntity>` → a
  `Collection<ClashTournamentEntity>`; each exposes `id`, `themeId`, `nameKey`,
  `nameKeySecondary` and `schedule` (its phases).
- **Routing** — `Region`.

```ts
const tournaments = await yasuo.lol.clash.tournaments(Region.NA).execute()
if (tournaments.error) return
for (const tournament of tournaments) {
  console.log(tournament.id, tournament.nameKey, tournament.schedule.length)
}
```

Need the untouched Riot payload? Ask for it raw:

```ts
const raw = await yasuo.lol.clash.tournaments(Region.NA).execute({ raw: true })
// raw: unknown — the exact CLASH-V1 response body
```

### `tournamentByTeam(teamId, region)`

The tournament a given team is registered for.

- **Params** — `teamId: string` — the team id;
  `region: Region` — the platform region.
- **Returns** — `SingleQuery<ClashTournamentEntity>` → a
  `ClashTournamentEntity` (same fields as `tournaments`).
- **Routing** — `Region`.

```ts
const tournament = await yasuo.lol.clash.tournamentByTeam('team-uuid', Region.NA).execute()
if (tournament.error) return
console.log(tournament.nameKey, tournament.schedule.length)
```

### `tournamentById(tournamentId, region)`

A Clash tournament by id.

- **Params** — `tournamentId: number | string` — the tournament id;
  `region: Region` — the platform region.
- **Returns** — `SingleQuery<ClashTournamentEntity>` → a
  `ClashTournamentEntity` (same fields as `tournaments`).
- **Routing** — `Region`.

```ts
const tournament = await yasuo.lol.clash.tournamentById(2001, Region.NA).execute()
if (tournament.error) return
console.log(tournament.themeId, tournament.schedule.length)
```

## `ClashPlayerEntity` & `ClashTeamEntity` relations

Beyond their DTO fields, the Clash entities add lazy relations:

- **`ClashPlayerEntity.summoner()`** — `SummonerRef`; the summoner behind the
  registration.
- **`ClashPlayerEntity.team()`** — `SingleQuery<ClashTeamEntity> | null`; the
  player's team, or `null` when no team is assigned yet.
- **`ClashTeamEntity.tournament()`** — `SingleQuery<ClashTournamentEntity>`; the
  tournament this team is registered for.
- **`ClashTeamEntity.captainSummoner()`** — `SummonerRef`; the team captain's
  summoner.

`ClashTournamentEntity` is data-only (no relation helpers).
