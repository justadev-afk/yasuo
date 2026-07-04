import type { MatchTimelineDTO } from '../../dto/lol/timeline.dto'
import type { RegionGroup } from '../../enums/region'
import type { SingleQuery } from '../../query/single-query'
import { Entity } from '../entity'
import type { MatchEntity } from './match.entity'

export interface MatchTimelineEntity extends MatchTimelineDTO {}

/** A match timeline with a lazy relation back to the full match. */
export class MatchTimelineEntity extends Entity<MatchTimelineDTO> {
  private get regionGroup(): RegionGroup {
    return this.context.regionGroup as RegionGroup
  }

  /** The match id this timeline belongs to. */
  get id(): string {
    return this.metadata.matchId
  }

  /** The full match this timeline belongs to (call `.execute()` to fetch). */
  match(): SingleQuery<MatchEntity> {
    return this.context.client.lol.match.get(this.id, this.regionGroup)
  }
}
