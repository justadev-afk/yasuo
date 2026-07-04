import { LOL_ENDPOINTS } from '../../endpoints/lol'
import { ChampionRotationEntity } from '../../entities/lol/champion-rotation.entity'
import type { Region } from '../../enums/region'
import type { SingleQuery } from '../../query/single-query'
import { BaseNamespace } from '../base-namespace'

/**
 * CHAMPION-V3 methods.
 */
export class LolChampionNamespace extends BaseNamespace {
  /**
   * The current free champion rotation.
   *
   * @param region - The platform region.
   */
  rotation(region: Region): SingleQuery<ChampionRotationEntity> {
    return this.single(
      ChampionRotationEntity,
      region,
      LOL_ENDPOINTS.championRotation,
      this.regionContext(region),
    )
  }
}
