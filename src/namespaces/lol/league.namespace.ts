import { type Page, Paginator } from '../../core/pagination/paginator'
import type { LeagueEntryDTO } from '../../dto/lol/league.dto'
import type { LeagueStreamOptions } from '../../dto/lol/query.dto'
import { LOL_ENDPOINTS } from '../../endpoints/lol'
import { LeagueEntryEntity } from '../../entities/lol/league-entry.entity'
import { LeagueListEntity } from '../../entities/lol/league-list.entity'
import type { Division, RankedQueue, Tier } from '../../enums/ranked'
import type { Region } from '../../enums/region'
import type { CollectionQuery } from '../../query/collection-query'
import type { SingleQuery } from '../../query/single-query'
import { BaseNamespace } from '../base-namespace'

const DEFAULT_START_PAGE = 1

/**
 * LEAGUE-V4 methods.
 */
export class LolLeagueNamespace extends BaseNamespace {
  /**
   * All ranked entries for a player by PUUID.
   *
   * @param puuid - The player's PUUID.
   * @param region - The platform region.
   */
  byPuuid(puuid: string, region: Region): CollectionQuery<LeagueEntryEntity> {
    return this.many(
      LeagueEntryEntity,
      region,
      LOL_ENDPOINTS.leagueEntriesByPuuid,
      this.regionContext(region),
      { pathParams: { puuid } },
    )
  }

  /**
   * Ranked entries for a player by encrypted summoner id.
   *
   * @param summonerId - The encrypted summoner id.
   * @param region - The platform region.
   * @deprecated Prefer {@link byPuuid}.
   */
  bySummonerId(summonerId: string, region: Region): CollectionQuery<LeagueEntryEntity> {
    return this.many(
      LeagueEntryEntity,
      region,
      LOL_ENDPOINTS.leagueEntriesBySummoner,
      this.regionContext(region),
      { pathParams: { summonerId } },
    )
  }

  /**
   * One page of ranked entries for a queue/tier/division.
   *
   * @param queue - Ranked queue.
   * @param tier - Ranked tier.
   * @param division - Division within the tier.
   * @param region - The platform region.
   * @param page - Page number (1-indexed). Default `1`.
   */
  entries(
    queue: RankedQueue,
    tier: Tier,
    division: Division,
    region: Region,
    page = DEFAULT_START_PAGE,
  ): CollectionQuery<LeagueEntryEntity> {
    return this.many(
      LeagueEntryEntity,
      region,
      LOL_ENDPOINTS.leagueEntries,
      this.regionContext(region),
      { pathParams: { queue, tier, division }, query: { page } },
    )
  }

  /**
   * One page of experimental ranked entries (`league-exp-v4`), which also covers
   * the apex tiers.
   *
   * @param queue - Ranked queue.
   * @param tier - Ranked tier.
   * @param division - Division within the tier.
   * @param region - The platform region.
   * @param page - Page number (1-indexed). Default `1`.
   */
  expEntries(
    queue: RankedQueue,
    tier: Tier,
    division: Division,
    region: Region,
    page = DEFAULT_START_PAGE,
  ): CollectionQuery<LeagueEntryEntity> {
    return this.many(
      LeagueEntryEntity,
      region,
      LOL_ENDPOINTS.leagueExpEntries,
      this.regionContext(region),
      { pathParams: { queue, tier, division }, query: { page } },
    )
  }

  /**
   * Stream every ranked entry for a queue/tier/division as an async iterator,
   * paging automatically. Start from any page.
   *
   * @param queue - Ranked queue.
   * @param tier - Ranked tier.
   * @param division - Division within the tier.
   * @param region - The platform region.
   * @param options - Paging options (start page, max items).
   */
  streamEntries(
    queue: RankedQueue,
    tier: Tier,
    division: Division,
    region: Region,
    options: LeagueStreamOptions = {},
  ): Paginator<LeagueEntryEntity> {
    const context = this.regionContext(region)
    return new Paginator<LeagueEntryEntity>({
      startCursor: options.startPage ?? DEFAULT_START_PAGE,
      maxItems: options.maxItems,
      fetchPage: async (page): Promise<Page<LeagueEntryEntity>> => {
        const fetched = await this.request<LeagueEntryDTO[]>(region, LOL_ENDPOINTS.leagueEntries, {
          pathParams: { queue, tier, division },
          query: { page },
        })
        const items = fetched.data.map((dto) => new LeagueEntryEntity(dto, fetched.meta, context))
        return { items, meta: fetched.meta, cursor: page }
      },
      nextCursor: (page, result) => (result.items.length === 0 ? null : page + 1),
    })
  }

  /**
   * The Challenger league for a queue.
   *
   * @param queue - Ranked queue.
   * @param region - The platform region.
   */
  challenger(queue: RankedQueue, region: Region): SingleQuery<LeagueListEntity> {
    return this.leagueList(LOL_ENDPOINTS.leagueChallenger, queue, region)
  }

  /**
   * The Grandmaster league for a queue.
   *
   * @param queue - Ranked queue.
   * @param region - The platform region.
   */
  grandmaster(queue: RankedQueue, region: Region): SingleQuery<LeagueListEntity> {
    return this.leagueList(LOL_ENDPOINTS.leagueGrandmaster, queue, region)
  }

  /**
   * The Master league for a queue.
   *
   * @param queue - Ranked queue.
   * @param region - The platform region.
   */
  master(queue: RankedQueue, region: Region): SingleQuery<LeagueListEntity> {
    return this.leagueList(LOL_ENDPOINTS.leagueMaster, queue, region)
  }

  /**
   * A league by its id.
   *
   * @param leagueId - The league id.
   * @param region - The platform region.
   */
  byId(leagueId: string, region: Region): SingleQuery<LeagueListEntity> {
    return this.single(
      LeagueListEntity,
      region,
      LOL_ENDPOINTS.leagueById,
      this.regionContext(region),
      { pathParams: { leagueId } },
    )
  }

  private leagueList(
    endpoint: (typeof LOL_ENDPOINTS)['leagueChallenger' | 'leagueGrandmaster' | 'leagueMaster'],
    queue: RankedQueue,
    region: Region,
  ): SingleQuery<LeagueListEntity> {
    return this.single(LeagueListEntity, region, endpoint, this.regionContext(region), {
      pathParams: { queue },
    })
  }
}
