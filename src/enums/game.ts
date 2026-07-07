/**
 * Riot game identifiers, as used in the API URL path segment (`/lol`, `/tft`,
 * `/val`, `/lor`, `/riot`).
 *
 * The value doubles as the per-product **API-key selector**: each request is
 * signed with the key configured for its endpoint's game (see
 * {@link YasuoConfig.keys}). `RIOT` is the shared Account API — it is a valid
 * URL segment, but **not** a valid `by-game` value for account active
 * shard/region lookups (use `LOL`, `TFT`, `VAL` or `LOR` there).
 */
export enum Game {
  /** League of Legends. */
  LOL = 'lol',
  /** Teamfight Tactics. */
  TFT = 'tft',
  /** VALORANT. */
  VAL = 'val',
  /** Legends of Runeterra. */
  LOR = 'lor',
  /** Shared Riot services (e.g. Account-V1). */
  RIOT = 'riot',
}
