/**
 * Stable identifier for each cacheable API namespace, used as the key for
 * per-namespace cache configuration. Each value mirrors the public access path
 * (`yasuo.lol.match` → `lol.match`) so it reads the same in config as in code.
 *
 * Data Dragon is intentionally absent: it has its own in-process memoisation and
 * never flows through the response cache.
 */
export enum CacheNamespace {
  LolChallenges = 'lol.challenges',
  LolChampion = 'lol.champion',
  LolClash = 'lol.clash',
  LolLeague = 'lol.league',
  LolMastery = 'lol.mastery',
  LolMatch = 'lol.match',
  LolSpectator = 'lol.spectator',
  LolStatus = 'lol.status',
  LolSummoner = 'lol.summoner',
  RiotAccount = 'riot.account',
  TftLeague = 'tft.league',
  TftMatch = 'tft.match',
  TftSpectator = 'tft.spectator',
  TftSummoner = 'tft.summoner',
}

/**
 * String-literal form of every {@link CacheNamespace} value — the type used for
 * per-namespace keys in {@link CacheOptions.namespaces}, so callers can write a
 * plain string (`'lol.match'`) or the enum member interchangeably.
 */
export type CacheNamespaceKey = `${CacheNamespace}`
