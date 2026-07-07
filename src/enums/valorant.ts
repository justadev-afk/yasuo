/**
 * VALORANT platform routing values ("shards").
 *
 * VALORANT does not use the LoL {@link Region}/{@link RegionGroup} split — every
 * VAL service (content, match, ranked, status) is addressed by one of these
 * shard hosts. The enum values are the exact host segments Riot expects
 * (`na.api.riotgames.com/val/...`).
 *
 * @see {@link https://developer.riotgames.com/apis#val-status-v1}
 */
export enum Shard {
  /** Asia-Pacific. */
  AP = 'ap',
  /** Brazil. */
  BR = 'br',
  /** Esports (leaderboards/content for competitive events). */
  ESPORTS = 'esports',
  /** Europe. */
  EU = 'eu',
  /** Republic of Korea. */
  KR = 'kr',
  /** Latin America. */
  LATAM = 'latam',
  /** North America. */
  NA = 'na',
}

/**
 * VALORANT match queues, used by the `recent-matches/by-queue` endpoints.
 *
 * Values are the queue identifiers Riot returns in `matchInfo.queueId`. Riot may
 * add queues over time; pass a raw string if a needed queue is not listed here.
 */
export enum ValQueue {
  COMPETITIVE = 'competitive',
  UNRATED = 'unrated',
  SWIFTPLAY = 'swiftplay',
  SPIKE_RUSH = 'spikerush',
  DEATHMATCH = 'deathmatch',
  /** Escalation. */
  ESCALATION = 'ggteam',
  /** Team Deathmatch. */
  TEAM_DEATHMATCH = 'hurm',
  /** Replication. */
  REPLICATION = 'onefa',
  SNOWBALL = 'snowball',
  NEWMAP = 'newmap',
  PREMIER = 'premier',
}

/**
 * Console platform filter for the VAL-CONSOLE-MATCH-V1 endpoints.
 *
 * Passed as the required `platformType` query parameter.
 */
export enum ValPlatformType {
  PLAYSTATION = 'playstation',
  XBOX = 'xbox',
}
