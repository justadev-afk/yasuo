import type { CurrentGameInfoDTO } from '../../dto/lol/spectator.dto'
import { LOL_ENDPOINTS } from '../../endpoints/lol'
import { CurrentGameEntity } from '../../entities/lol/current-game.entity'
import { FeaturedGamesEntity } from '../../entities/lol/featured-games.entity'
import { CacheNamespace } from '../../enums/cache-namespace'
import type { Region } from '../../enums/region'
import { ApiError, NotFoundError } from '../../errors'
import { SingleQuery } from '../../query/single-query'
import { BaseNamespace, metaFromError } from '../base-namespace'

/**
 * SPECTATOR-V5 methods.
 */
export class LolSpectatorNamespace extends BaseNamespace {
  protected readonly cacheNamespace = CacheNamespace.LolSpectator

  /**
   * The player's live game, or `null` if they are not currently in one.
   *
   * A `404` (not in a game) is treated as an expected empty result, not an
   * error — `.execute()` resolves to `null` and nothing is thrown, even with
   * `{ throw: true }`. Any other failure comes back as a {@link CurrentGameEntity}
   * carrying `.error`.
   *
   * @param puuid - The player's PUUID.
   * @param region - The platform region.
   */
  active(puuid: string, region: Region): SingleQuery<CurrentGameEntity | null> {
    const context = this.regionContext(region)
    return new SingleQuery<CurrentGameEntity | null>(async (exec) => {
      try {
        const fetched = await this.request<CurrentGameInfoDTO>(
          region,
          LOL_ENDPOINTS.spectatorActive,
          { pathParams: { puuid }, signal: exec.signal },
        )
        return exec.raw ? fetched.data : new CurrentGameEntity(fetched.data, fetched.meta, context)
      } catch (error) {
        // A 404 means "not in a game" — an expected empty result, not an error.
        if (error instanceof NotFoundError) {
          return null
        }
        if (!(error instanceof ApiError)) {
          throw error
        }
        if (exec.throw) {
          throw error
        }
        return exec.raw
          ? error.body
          : new CurrentGameEntity({} as CurrentGameInfoDTO, metaFromError(error), context, error)
      }
    })
  }

  /**
   * A sample of featured games currently in progress.
   *
   * @param region - The platform region.
   */
  featured(region: Region): SingleQuery<FeaturedGamesEntity> {
    return this.single(
      FeaturedGamesEntity,
      region,
      LOL_ENDPOINTS.spectatorFeatured,
      this.regionContext(region),
    )
  }
}
