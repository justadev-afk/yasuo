import type { ClashPlayerDTO } from '../../dto/lol/clash.dto'
import type { Region } from '../../enums/region'
import type { SingleQuery } from '../../query/single-query'
import { Entity } from '../entity'
import type { ClashTeamEntity } from './clash-team.entity'
import type { SummonerRef } from './summoner-ref'

export interface ClashPlayerEntity extends ClashPlayerDTO {}

/** A Clash registration with lazy relations to the player and their team. */
export class ClashPlayerEntity extends Entity<ClashPlayerDTO> {
  private get region(): Region {
    return this.context.region as Region
  }

  /** Resolve the summoner behind this registration (chainable). */
  summoner(): SummonerRef {
    return this.context.client.lol.summoner.byPuuid(this.puuid, this.region)
  }

  /** The team this registration belongs to, if a team is assigned. */
  team(): SingleQuery<ClashTeamEntity> | null {
    return this.teamId ? this.context.client.lol.clash.teamById(this.teamId, this.region) : null
  }
}
