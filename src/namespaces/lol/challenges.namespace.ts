import type {
  AllChallengePercentilesDTO,
  ChallengeApexPlayerDTO,
} from '../../dto/lol/challenges.dto'
import { LOL_ENDPOINTS } from '../../endpoints/lol'
import { ChallengeConfigEntity } from '../../entities/lol/challenge-config.entity'
import { ChallengePercentilesEntity } from '../../entities/lol/challenge-percentiles.entity'
import { PlayerChallengesEntity } from '../../entities/lol/player-challenges.entity'
import type { ValueResult } from '../../entities/value-result'
import { CacheNamespace } from '../../enums/cache-namespace'
import type { ChallengeLevel } from '../../enums/challenge'
import type { Region } from '../../enums/region'
import type { CollectionQuery } from '../../query/collection-query'
import type { SingleQuery } from '../../query/single-query'
import { BaseNamespace } from '../base-namespace'

/**
 * LOL-CHALLENGES-V1 methods.
 */
export class LolChallengesNamespace extends BaseNamespace {
  protected readonly cacheNamespace = CacheNamespace.LolChallenges

  /**
   * The configuration of every challenge.
   *
   * @param region - The platform region.
   */
  config(region: Region): CollectionQuery<ChallengeConfigEntity> {
    return this.many(
      ChallengeConfigEntity,
      region,
      LOL_ENDPOINTS.challengesConfig,
      this.regionContext(region),
    )
  }

  /**
   * The configuration of a single challenge.
   *
   * @param challengeId - The challenge id.
   * @param region - The platform region.
   */
  configById(challengeId: number, region: Region): SingleQuery<ChallengeConfigEntity> {
    return this.single(
      ChallengeConfigEntity,
      region,
      LOL_ENDPOINTS.challengeConfigById,
      this.regionContext(region),
      { pathParams: { challengeId } },
    )
  }

  /**
   * The leaderboard (apex players) for a challenge at a given level.
   *
   * @param challengeId - The challenge id.
   * @param level - The level (`MASTER`, `GRANDMASTER` or `CHALLENGER`).
   * @param region - The platform region.
   * @param limit - Optional maximum number of entries.
   */
  leaderboards(
    challengeId: number,
    level: ChallengeLevel,
    region: Region,
    limit?: number,
  ): CollectionQuery<ChallengeApexPlayerDTO> {
    return this.scalarMany<ChallengeApexPlayerDTO>(region, LOL_ENDPOINTS.challengeLeaderboards, {
      pathParams: { challengeId, level },
      query: { limit },
    })
  }

  /**
   * The percentile distributions of every challenge, keyed by challenge id then
   * tier. The raw payload is boxed in a {@link ValueResult} — read it from
   * `.value`.
   *
   * @param region - The platform region.
   */
  percentiles(region: Region): SingleQuery<ValueResult<AllChallengePercentilesDTO>> {
    return this.scalar<AllChallengePercentilesDTO>(region, LOL_ENDPOINTS.challengesPercentiles)
  }

  /**
   * The percentile distribution of a single challenge, keyed by tier.
   *
   * @param challengeId - The challenge id.
   * @param region - The platform region.
   */
  percentilesById(challengeId: number, region: Region): SingleQuery<ChallengePercentilesEntity> {
    return this.single(
      ChallengePercentilesEntity,
      region,
      LOL_ENDPOINTS.challengePercentilesById,
      this.regionContext(region),
      { pathParams: { challengeId } },
    )
  }

  /**
   * A player's challenge progress.
   *
   * @param puuid - The player's PUUID.
   * @param region - The platform region.
   */
  player(puuid: string, region: Region): SingleQuery<PlayerChallengesEntity> {
    return this.single(
      PlayerChallengesEntity,
      region,
      LOL_ENDPOINTS.challengesPlayer,
      this.regionContext(region),
      { pathParams: { puuid } },
    )
  }
}
