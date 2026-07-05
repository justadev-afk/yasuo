import { LOL_ENDPOINTS } from '../../endpoints/lol'
import { ChampionMasteryEntity } from '../../entities/lol/champion-mastery.entity'
import type { ValueResult } from '../../entities/value-result'
import { CacheNamespace } from '../../enums/cache-namespace'
import type { Region } from '../../enums/region'
import type { CollectionQuery } from '../../query/collection-query'
import type { SingleQuery } from '../../query/single-query'
import { BaseNamespace } from '../base-namespace'

/**
 * CHAMPION-MASTERY-V4 methods.
 */
export class LolMasteryNamespace extends BaseNamespace {
  protected readonly cacheNamespace = CacheNamespace.LolMastery

  /**
   * A player's mastery of a single champion.
   *
   * @param puuid - The player's PUUID.
   * @param championId - The champion id.
   * @param region - The platform region.
   */
  byChampion(
    puuid: string,
    championId: number,
    region: Region,
  ): SingleQuery<ChampionMasteryEntity> {
    return this.single(
      ChampionMasteryEntity,
      region,
      LOL_ENDPOINTS.masteryByPuuidChampion,
      this.regionContext(region),
      { pathParams: { puuid, championId } },
    )
  }

  /**
   * All champion mastery entries for a player.
   *
   * @param puuid - The player's PUUID.
   * @param region - The platform region.
   */
  byPuuid(puuid: string, region: Region): CollectionQuery<ChampionMasteryEntity> {
    return this.many(
      ChampionMasteryEntity,
      region,
      LOL_ENDPOINTS.masteryByPuuid,
      this.regionContext(region),
      { pathParams: { puuid } },
    )
  }

  /**
   * A player's total champion mastery score. The scalar `number` is boxed in a
   * {@link ValueResult} — read it from `.value`.
   *
   * @param puuid - The player's PUUID.
   * @param region - The platform region.
   */
  score(puuid: string, region: Region): SingleQuery<ValueResult<number>> {
    return this.scalar<number>(region, LOL_ENDPOINTS.masteryScore, { pathParams: { puuid } })
  }

  /**
   * A player's highest champion masteries.
   *
   * @param puuid - The player's PUUID.
   * @param region - The platform region.
   * @param count - How many top entries to return (Riot defaults to 3).
   */
  top(puuid: string, region: Region, count?: number): CollectionQuery<ChampionMasteryEntity> {
    return this.many(
      ChampionMasteryEntity,
      region,
      LOL_ENDPOINTS.masteryTop,
      this.regionContext(region),
      { pathParams: { puuid }, query: { count } },
    )
  }
}
