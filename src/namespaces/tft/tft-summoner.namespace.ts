import { TFT_ENDPOINTS } from '../../endpoints/tft'
import { TftSummonerRef } from '../../entities/tft/tft-summoner-ref'
import { TftSummonerEntity } from '../../entities/tft/tft-summoner.entity'
import type { Region } from '../../enums/region'
import type { SingleQuery } from '../../query/single-query'
import { BaseNamespace } from '../base-namespace'

/**
 * TFT-SUMMONER-V1 methods.
 */
export class TftSummonerNamespace extends BaseNamespace {
  /**
   * Look up a TFT summoner by PUUID.
   *
   * Returns a lazy, chainable {@link TftSummonerRef}: call `.execute()` to fetch the
   * summoner, or a relation to fetch only that related resource.
   *
   * @param puuid - The player's PUUID.
   * @param region - The platform region.
   */
  byPuuid(puuid: string, region: Region): TftSummonerRef {
    const context = this.regionContext(region)
    const query = this.single(TftSummonerEntity, region, TFT_ENDPOINTS.summonerByPuuid, context, {
      pathParams: { puuid },
    })
    return new TftSummonerRef(this.client, puuid, region, (exec) => query.execute(exec))
  }

  /**
   * Look up a TFT summoner by encrypted summoner id.
   *
   * @param summonerId - The encrypted summoner id.
   * @param region - The platform region.
   * @deprecated Prefer {@link byPuuid}.
   */
  byId(summonerId: string, region: Region): SingleQuery<TftSummonerEntity> {
    return this.single(
      TftSummonerEntity,
      region,
      TFT_ENDPOINTS.summonerById,
      this.regionContext(region),
      { pathParams: { summonerId } },
    )
  }
}
