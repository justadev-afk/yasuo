import type { CurrentGameInfoDTO } from '../../dto/lol/spectator.dto'
import { TFT_ENDPOINTS } from '../../endpoints/tft'
import { CurrentGameEntity } from '../../entities/lol/current-game.entity'
import { FeaturedGamesEntity } from '../../entities/lol/featured-games.entity'
import type { Region } from '../../enums/region'
import { ApiError, NotFoundError } from '../../errors'
import { SingleQuery } from '../../query/single-query'
import { BaseNamespace, metaFromError } from '../base-namespace'

/**
 * SPECTATOR-TFT-V5 methods. Shares the spectator payload shape with LoL.
 */
export class TftSpectatorNamespace extends BaseNamespace {
  /**
   * A player's active (live) TFT game, or `null` if they are not in one.
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
          TFT_ENDPOINTS.spectatorActive,
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
   * The list of featured TFT games.
   *
   * @param region - The platform region.
   * @remarks Development API keys often receive `403` from this endpoint.
   */
  featured(region: Region): SingleQuery<FeaturedGamesEntity> {
    return this.single(
      FeaturedGamesEntity,
      region,
      TFT_ENDPOINTS.spectatorFeatured,
      this.regionContext(region),
    )
  }
}
