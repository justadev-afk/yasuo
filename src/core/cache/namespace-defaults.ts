import { CacheNamespace } from '../../enums/cache-namespace'

/**
 * Built-in per-namespace default cache TTLs, in milliseconds, tuned to how
 * volatile each resource is. These apply when the cache is enabled and no
 * explicit `ttlMs` (global or per-namespace) is configured.
 *
 * - Live/current state (spectator) is seconds-fresh.
 * - Ladders and platform status refresh on the order of a minute or two.
 * - Profiles and mastery move slowly (minutes).
 * - Immutable data (finished matches, timelines) and the weekly rotation can be
 *   cached for an hour; account id ↔ PUUID mappings change only on a rename.
 */
export const DEFAULT_NAMESPACE_TTL_MS: Record<CacheNamespace, number> = {
  [CacheNamespace.RiotAccount]: 3_600_000, // 1h — riot id ↔ puuid, only changes on rename
  [CacheNamespace.LolSummoner]: 300_000, // 5m — profile (level, icon)
  [CacheNamespace.LolLeague]: 60_000, // 1m — ranked LP, volatile
  [CacheNamespace.LolMastery]: 300_000, // 5m — champion mastery points
  [CacheNamespace.LolChampion]: 3_600_000, // 1h — weekly champion rotation
  [CacheNamespace.LolMatch]: 3_600_000, // 1h — finished matches are immutable
  [CacheNamespace.LolSpectator]: 10_000, // 10s — live games
  [CacheNamespace.LolStatus]: 120_000, // 2m — platform incidents
  [CacheNamespace.LolClash]: 300_000, // 5m — tournament schedule / registration
  [CacheNamespace.LolChallenges]: 600_000, // 10m — challenge progress + static config
  [CacheNamespace.TftSummoner]: 300_000, // 5m
  [CacheNamespace.TftLeague]: 60_000, // 1m
  [CacheNamespace.TftMatch]: 3_600_000, // 1h — immutable
  [CacheNamespace.TftSpectator]: 10_000, // 10s — live games
}
