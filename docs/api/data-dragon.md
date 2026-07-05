# Data Dragon — `yasuo.dataDragon`

Data Dragon is Riot's **static game data and asset CDN** (champions, runes,
versions, queues, maps…). It is served from a public CDN, so this namespace is
special:

!!! important "Data Dragon is not a query builder"

    Unlike every other namespace, `yasuo.dataDragon.*` methods return
    **`Promise`s of the DTO directly** — you just `await` them. There is:

    - **no `.execute()`** — the method already returns a Promise;
    - **no `.error` / `.http`** — you get the parsed payload, not an
      entity/result wrapper;
    - **no rate limiting** and **no API key required** ([rate limiting](../rate-limiting.md) does not apply here).

    Because there is no error-carrying result, a failed request **throws**. Wrap
    calls in `try` / `catch` if you need to handle CDN failures.

```ts
import { Yasuo } from 'yasuo.js'

const yasuo = new Yasuo({ key: process.env.RIOT_API_KEY! })

// Just await it — no .execute(), no .error:
const versions = await yasuo.dataDragon.versions()
console.log(versions[0]) // latest patch, e.g. "14.13.1"
```

Methods that build a versioned CDN URL (`champions`, `champion`, `championById`,
`runesReforged`) resolve against the **latest** version automatically and accept
an optional `language` locale that defaults to `en_US`.

## `versions()`

All available Data Dragon versions, newest first (the result is memoised).

- **Returns** — `Promise<string[]>` — version strings; `versions[0]` is the latest patch.

```ts
const versions = await yasuo.dataDragon.versions()
console.log(versions.length, versions[0])
```

## `languages()`

All available locales.

- **Returns** — `Promise<string[]>` — locale codes such as `en_US`, `ko_KR`, `es_ES`.

```ts
const languages = await yasuo.dataDragon.languages()
console.log(languages.includes('en_US'))
```

## `realm(server)`

The realm descriptor for a server.

- **Params** — `server: string` — the realm/server code (e.g. `na`, `euw`, `kr`).
- **Returns** — `Promise<DDragonRealmDTO>` — key fields: `v` (data version), `cdn` (asset base URL), `dd` (Data Dragon version), `l` (default language), `n` (per-section versions, `Record<string, string>`), `profileiconmax`.

```ts
const realm = await yasuo.dataDragon.realm('na')
console.log(realm.v, realm.cdn, realm.l)
```

## `champions(language?)`

The full champion list for the latest patch.

- **Params** — `language: string` — locale, defaults to `en_US`.
- **Returns** — `Promise<DDragonChampionListDTO>` — key fields: `version`, `type`, `format`, and `data` (`Record<string, DDragonChampionSummaryDTO>`, keyed by champion id). Each summary carries `id`, `key` (numeric id as a string), `name`, `title`, `blurb`, `tags`, `partype`, `info`, `image`, `stats`.

```ts
const champions = await yasuo.dataDragon.champions()
const aatrox = champions.data.Aatrox
console.log(champions.version, aatrox.name, aatrox.tags)
```

## `champion(name, language?)`

Detailed data for a single champion by its Data Dragon id.

- **Params** — `name: string` — the champion's Data Dragon id (e.g. `Aatrox`); `language: string` — locale, defaults to `en_US`.
- **Returns** — `Promise<DDragonChampionDetailDTO>` — extends the summary with `lore`, `allytips`, `enemytips`, `spells` (`DDragonSpellDTO[]` — Q/W/E/R), `passive` (`name`, `description`, `image`), and `skins`. Throws if the id is not found.

```ts
const aatrox = await yasuo.dataDragon.champion('Aatrox')
console.log(aatrox.lore)
console.log(aatrox.spells.map((spell) => spell.name))
```

## `championById(championId, language?)`

Look up a champion summary by its **numeric** champion id (matched against the
`key` field of the latest champion list).

- **Params** — `championId: number` — the numeric champion id (e.g. `266` for Aatrox); `language: string` — locale, defaults to `en_US`.
- **Returns** — `Promise<DDragonChampionSummaryDTO | null>` — the summary, or `null` if the id is not present in the latest patch.

```ts
const champion = await yasuo.dataDragon.championById(266)
if (champion === null) return

console.log(champion.id, champion.name) // "Aatrox" "Aatrox"
```

## `runesReforged(language?)`

The reforged rune paths for the latest patch.

- **Params** — `language: string` — locale, defaults to `en_US`.
- **Returns** — `Promise<DDragonRunesReforgedDTO[]>` — one entry per path (Precision, Domination, …), each with `id`, `key`, `icon`, `name`, and `slots` (each slot has a `runes: DDragonRuneDTO[]` array — `id`, `key`, `name`, `shortDesc`, `longDesc`).

```ts
const paths = await yasuo.dataDragon.runesReforged()
for (const path of paths) {
  console.log(path.name, path.slots[0].runes.map((rune) => rune.name))
}
```

## `queues()`

The static queues reference list.

- **Returns** — `Promise<DDragonQueueDTO[]>` — each with `queueId`, `map`, `description` (`string | null`), `notes` (`string | null`).

```ts
const queues = await yasuo.dataDragon.queues()
const soloDuo = queues.find((queue) => queue.queueId === 420)
console.log(soloDuo?.description)
```

## `maps()`

The static maps reference list.

- **Returns** — `Promise<DDragonMapDTO[]>` — each with `mapId`, `mapName`, `notes`.

```ts
const maps = await yasuo.dataDragon.maps()
console.log(maps.map((map) => map.mapName))
```

## `gameModes()`

The static game-modes reference list.

- **Returns** — `Promise<DDragonGameModeDTO[]>` — each with `gameMode`, `description`.

```ts
const gameModes = await yasuo.dataDragon.gameModes()
console.log(gameModes.map((mode) => mode.gameMode))
```

## `gameTypes()`

The static game-types reference list.

- **Returns** — `Promise<DDragonGameTypeDTO[]>` — each with `gametype`, `description`.

```ts
const gameTypes = await yasuo.dataDragon.gameTypes()
console.log(gameTypes.map((type) => type.gametype))
```

## `seasons()`

The static seasons reference list.

- **Returns** — `Promise<DDragonSeasonDTO[]>` — each with `id`, `season`.

```ts
const seasons = await yasuo.dataDragon.seasons()
console.log(seasons.map((season) => season.season))
```

## Handling failures

Because Data Dragon returns plain payloads (no `.error`), a failed CDN request
throws. Handle it with `try` / `catch`:

```ts
try {
  const aatrox = await yasuo.dataDragon.champion('NotARealChampion')
  console.log(aatrox.name)
} catch (error) {
  console.error('Data Dragon lookup failed:', error)
}
```
