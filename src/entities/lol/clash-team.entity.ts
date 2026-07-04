import type { ClashTeamDTO } from '../../dto/lol/clash.dto'
import type { Region } from '../../enums/region'
import type { SingleQuery } from '../../query/single-query'
import { Entity } from '../entity'
import type { ClashTournamentEntity } from './clash-tournament.entity'
import type { SummonerRef } from './summoner-ref'

export interface ClashTeamEntity extends ClashTeamDTO {}

/** A Clash team with lazy relations to its tournament and captain. */
export class ClashTeamEntity extends Entity<ClashTeamDTO> {
  private get region(): Region {
    return this.context.region as Region
  }

  /** The tournament this team is registered for. */
  tournament(): SingleQuery<ClashTournamentEntity> {
    return this.context.client.lol.clash.tournamentById(this.tournamentId, this.region)
  }

  /** Resolve the team captain's summoner (chainable). */
  captainSummoner(): SummonerRef {
    return this.context.client.lol.summoner.byPuuid(this.captain, this.region)
  }
}
