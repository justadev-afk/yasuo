import { TFT_ENDPOINTS } from '../../endpoints/tft'
import { TftLeagueEntryEntity } from '../../entities/tft/tft-league-entry.entity'
import { TftLeagueListEntity } from '../../entities/tft/tft-league-list.entity'
import { TftRatedLadderEntryEntity } from '../../entities/tft/tft-rated-ladder-entry.entity'
import type { Division, Tier } from '../../enums/ranked'
import type { Region } from '../../enums/region'
import { TftRatedLadderQueue } from '../../enums/tft'
import type { CollectionQuery } from '../../query/collection-query'
import type { SingleQuery } from '../../query/single-query'
import { BaseNamespace } from '../base-namespace'

const DEFAULT_START_PAGE = 1

/**
 * TFT-LEAGUE-V1 methods.
 */
export class TftLeagueNamespace extends BaseNamespace {
  /**
   * A player's TFT ranked entries by PUUID.
   *
   * @param puuid - The player's PUUID.
   * @param region - The platform region.
   */
  byPuuid(puuid: string, region: Region): CollectionQuery<TftLeagueEntryEntity> {
    return this.many(
      TftLeagueEntryEntity,
      region,
      TFT_ENDPOINTS.leagueByPuuid,
      this.regionContext(region),
      { pathParams: { puuid } },
    )
  }

  /**
   * A player's TFT ranked entries by encrypted summoner id.
   *
   * @param summonerId - The encrypted summoner id.
   * @param region - The platform region.
   * @deprecated Prefer {@link byPuuid}.
   */
  bySummonerId(summonerId: string, region: Region): CollectionQuery<TftLeagueEntryEntity> {
    return this.many(
      TftLeagueEntryEntity,
      region,
      TFT_ENDPOINTS.leagueEntriesBySummoner,
      this.regionContext(region),
      { pathParams: { summonerId } },
    )
  }

  /**
   * A page of TFT ranked entries for a tier/division.
   *
   * @param tier - Ranked tier.
   * @param division - Division within the tier.
   * @param region - The platform region.
   * @param page - Page number (1-indexed). Default `1`.
   */
  entries(
    tier: Tier,
    division: Division,
    region: Region,
    page = DEFAULT_START_PAGE,
  ): CollectionQuery<TftLeagueEntryEntity> {
    return this.many(
      TftLeagueEntryEntity,
      region,
      TFT_ENDPOINTS.leagueEntries,
      this.regionContext(region),
      { pathParams: { tier, division }, query: { page } },
    )
  }

  /**
   * The TFT Challenger league.
   *
   * @param region - The platform region.
   */
  challenger(region: Region): SingleQuery<TftLeagueListEntity> {
    return this.leagueList(TFT_ENDPOINTS.leagueChallenger, region)
  }

  /**
   * The TFT Grandmaster league.
   *
   * @param region - The platform region.
   */
  grandmaster(region: Region): SingleQuery<TftLeagueListEntity> {
    return this.leagueList(TFT_ENDPOINTS.leagueGrandmaster, region)
  }

  /**
   * The TFT Master league.
   *
   * @param region - The platform region.
   */
  master(region: Region): SingleQuery<TftLeagueListEntity> {
    return this.leagueList(TFT_ENDPOINTS.leagueMaster, region)
  }

  /**
   * A TFT league by id.
   *
   * @param leagueId - The league id.
   * @param region - The platform region.
   */
  byId(leagueId: string, region: Region): SingleQuery<TftLeagueListEntity> {
    return this.single(
      TftLeagueListEntity,
      region,
      TFT_ENDPOINTS.leagueById,
      this.regionContext(region),
      { pathParams: { leagueId } },
    )
  }

  /**
   * The top of the Hyper Roll rated ladder.
   *
   * @param region - The platform region.
   * @param queue - Rated-ladder queue. Defaults to Hyper Roll.
   */
  ratedLadder(
    region: Region,
    queue: TftRatedLadderQueue = TftRatedLadderQueue.HYPER_ROLL,
  ): CollectionQuery<TftRatedLadderEntryEntity> {
    return this.many(
      TftRatedLadderEntryEntity,
      region,
      TFT_ENDPOINTS.leagueRatedLadder,
      this.regionContext(region),
      { pathParams: { queue } },
    )
  }

  private leagueList(
    endpoint: (typeof TFT_ENDPOINTS)['leagueChallenger' | 'leagueGrandmaster' | 'leagueMaster'],
    region: Region,
  ): SingleQuery<TftLeagueListEntity> {
    return this.single(TftLeagueListEntity, region, endpoint, this.regionContext(region))
  }
}
