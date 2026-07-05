import { LOL_ENDPOINTS } from '../../endpoints/lol'
import { PlatformStatusEntity } from '../../entities/lol/platform-status.entity'
import { CacheNamespace } from '../../enums/cache-namespace'
import type { Region } from '../../enums/region'
import type { SingleQuery } from '../../query/single-query'
import { BaseNamespace } from '../base-namespace'

/**
 * LOL-STATUS-V4 methods.
 */
export class LolStatusNamespace extends BaseNamespace {
  protected readonly cacheNamespace = CacheNamespace.LolStatus

  /**
   * The platform status for a region (maintenances and incidents).
   *
   * @param region - The platform region.
   */
  get(region: Region): SingleQuery<PlatformStatusEntity> {
    return this.single(
      PlatformStatusEntity,
      region,
      LOL_ENDPOINTS.status,
      this.regionContext(region),
    )
  }
}
