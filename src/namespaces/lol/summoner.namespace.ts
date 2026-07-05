import { LOL_ENDPOINTS } from '../../endpoints/lol'
import { SummonerEntity } from '../../entities/lol/summoner.entity'
import { SummonerRef } from '../../entities/lol/summoner-ref'
import type { Region } from '../../enums/region'
import type { SingleQuery } from '../../query/single-query'
import { BaseNamespace } from '../base-namespace'

/**
 * SUMMONER-V4 methods.
 */
export class LolSummonerNamespace extends BaseNamespace {
  /**
   * Look up a summoner by PUUID.
   *
   * Returns a lazy, chainable {@link SummonerRef}: call `.execute()` to fetch the
   * summoner, or a relation (e.g. `.matches().execute()`) to fetch **only** that
   * related resource — the summoner request is skipped entirely.
   *
   * @param puuid - The player's encrypted PUUID.
   * @param region - The platform region.
   * @example
   * ```ts
   * // One request:
   * const matches = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).matches({ count: 5 }).execute()
   * ```
   */
  byPuuid(puuid: string, region: Region): SummonerRef {
    const context = this.regionContext(region)
    const query = this.single(SummonerEntity, region, LOL_ENDPOINTS.summonerByPuuid, context, {
      pathParams: { puuid },
    })
    return new SummonerRef(this.client, puuid, region, (exec) => query.execute(exec))
  }

  /**
   * Look up a summoner by encrypted summoner id.
   *
   * @param summonerId - The encrypted summoner id.
   * @param region - The platform region.
   * @deprecated Riot is phasing out encrypted summoner ids — prefer {@link byPuuid}.
   */
  byId(summonerId: string, region: Region): SingleQuery<SummonerEntity> {
    return this.single(
      SummonerEntity,
      region,
      LOL_ENDPOINTS.summonerById,
      this.regionContext(region),
      { pathParams: { summonerId } },
    )
  }

  /**
   * Look up a summoner by encrypted account id.
   *
   * @param accountId - The encrypted account id.
   * @param region - The platform region.
   * @deprecated Account ids are no longer returned by Riot — prefer {@link byPuuid}.
   */
  byAccountId(accountId: string, region: Region): SingleQuery<SummonerEntity> {
    return this.single(
      SummonerEntity,
      region,
      LOL_ENDPOINTS.summonerByAccount,
      this.regionContext(region),
      { pathParams: { accountId } },
    )
  }
}
