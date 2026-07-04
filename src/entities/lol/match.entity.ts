import type { MatchDTO, MatchParticipantDTO, MatchTeamDTO } from '../../dto/lol/match.dto'
import { type Region, type RegionGroup, regionFromPlatformId } from '../../enums/region'
import type { SingleQuery } from '../../query/single-query'
import { Entity } from '../entity'
import type { MatchTimelineEntity } from './match-timeline.entity'
import type { SummonerRef } from './summoner-ref'

export interface MatchEntity extends MatchDTO {}

/**
 * A full match with lazy relations to its timeline and participants' summoners.
 *
 * @example
 * ```ts
 * const { data: match } = await yasuo.lol.match.get('KR_1234', RegionGroup.ASIA).execute()
 * const { data: timeline } = await match.timeline().execute()  // no ids re-passed
 * const summoners = match.summoners()                      // SummonerRef[], region derived
 * ```
 */
export class MatchEntity extends Entity<MatchDTO> {
  private get regionGroup(): RegionGroup {
    return this.context.regionGroup as RegionGroup
  }

  /** The match id (`metadata.matchId`). */
  get id(): string {
    return this.metadata.matchId
  }

  /** The timeline for this match (call `.execute()` to fetch). */
  timeline(): SingleQuery<MatchTimelineEntity> {
    return this.context.client.lol.match.timeline(this.id, this.regionGroup)
  }

  /** The winning team, or `null` if it cannot be determined. */
  winningTeam(): MatchTeamDTO | null {
    return this.info.teams.find((team) => team.win) ?? null
  }

  /**
   * Look up a participant by PUUID.
   *
   * @param puuid - The participant's PUUID.
   */
  participant(puuid: string): MatchParticipantDTO | undefined {
    return this.info.participants.find((participant) => participant.puuid === puuid)
  }

  /**
   * Lazy {@link SummonerRef}s for every participant, deriving the platform region
   * from `info.platformId`. Call `.execute()` on the ones you need.
   *
   * @throws {Error} If `info.platformId` is not a recognised region.
   */
  summoners(): SummonerRef[] {
    const region = this.platformRegion()
    if (region === null) {
      throw new Error(
        `Unrecognised platformId "${this.info.platformId}" — cannot resolve summoners`,
      )
    }
    return this.info.participants.map((participant) =>
      this.context.client.lol.summoner.byPuuid(participant.puuid, region),
    )
  }

  /** The {@link Region} this match was played on, from `info.platformId`. */
  platformRegion(): Region | null {
    return regionFromPlatformId(this.info.platformId)
  }
}
