import { LOL_ENDPOINTS } from '../../endpoints/lol'
import { ClashPlayerEntity } from '../../entities/lol/clash-player.entity'
import { ClashTeamEntity } from '../../entities/lol/clash-team.entity'
import { ClashTournamentEntity } from '../../entities/lol/clash-tournament.entity'
import type { Region } from '../../enums/region'
import type { CollectionQuery } from '../../query/collection-query'
import type { SingleQuery } from '../../query/single-query'
import { BaseNamespace } from '../base-namespace'

/**
 * CLASH-V1 methods.
 */
export class LolClashNamespace extends BaseNamespace {
  /**
   * A player's active Clash registrations by PUUID.
   *
   * @param puuid - The player's PUUID.
   * @param region - The platform region.
   */
  playersByPuuid(puuid: string, region: Region): CollectionQuery<ClashPlayerEntity> {
    return this.many(
      ClashPlayerEntity,
      region,
      LOL_ENDPOINTS.clashPlayersByPuuid,
      this.regionContext(region),
      { pathParams: { puuid } },
    )
  }

  /**
   * A Clash team by id.
   *
   * @param teamId - The team id.
   * @param region - The platform region.
   */
  teamById(teamId: string, region: Region): SingleQuery<ClashTeamEntity> {
    return this.single(
      ClashTeamEntity,
      region,
      LOL_ENDPOINTS.clashTeamById,
      this.regionContext(region),
      { pathParams: { teamId } },
    )
  }

  /**
   * Active and upcoming Clash tournaments.
   *
   * @param region - The platform region.
   */
  tournaments(region: Region): CollectionQuery<ClashTournamentEntity> {
    return this.many(
      ClashTournamentEntity,
      region,
      LOL_ENDPOINTS.clashTournaments,
      this.regionContext(region),
    )
  }

  /**
   * The tournament a team is registered for.
   *
   * @param teamId - The team id.
   * @param region - The platform region.
   */
  tournamentByTeam(teamId: string, region: Region): SingleQuery<ClashTournamentEntity> {
    return this.single(
      ClashTournamentEntity,
      region,
      LOL_ENDPOINTS.clashTournamentByTeam,
      this.regionContext(region),
      { pathParams: { teamId } },
    )
  }

  /**
   * A Clash tournament by id.
   *
   * @param tournamentId - The tournament id.
   * @param region - The platform region.
   */
  tournamentById(
    tournamentId: number | string,
    region: Region,
  ): SingleQuery<ClashTournamentEntity> {
    return this.single(
      ClashTournamentEntity,
      region,
      LOL_ENDPOINTS.clashTournamentById,
      this.regionContext(region),
      { pathParams: { tournamentId } },
    )
  }
}
