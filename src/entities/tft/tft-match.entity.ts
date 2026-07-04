import type { TftMatchDTO, TftParticipantDTO } from '../../dto/tft/match.dto'
import { type Region, regionFromPlatformId } from '../../enums/region'
import { Entity } from '../entity'
import type { TftSummonerRef } from './tft-summoner-ref'

export interface TftMatchEntity extends TftMatchDTO {}

/**
 * A TFT match with lazy relations to its participants' summoners.
 *
 * The platform region is derived from the match id prefix (e.g. `KR_123` → KR).
 */
export class TftMatchEntity extends Entity<TftMatchDTO> {
  /** The match id (`metadata.match_id`). */
  get id(): string {
    return this.metadata.match_id
  }

  /** The {@link Region} the match was played on, from the match id prefix. */
  platformRegion(): Region | null {
    const [prefix] = this.id.split('_')
    return prefix ? regionFromPlatformId(prefix) : null
  }

  /**
   * Look up a participant by PUUID.
   *
   * @param puuid - The participant's PUUID.
   */
  participant(puuid: string): TftParticipantDTO | undefined {
    return this.info.participants.find((participant) => participant.puuid === puuid)
  }

  /** The winner's participant record (placement 1), or `null`. */
  winner(): TftParticipantDTO | null {
    return this.info.participants.find((participant) => participant.placement === 1) ?? null
  }

  /**
   * Lazy {@link TftSummonerRef}s for every participant. Call `.execute()` on the
   * ones you need.
   *
   * @throws {Error} If the region cannot be derived from the match id.
   */
  summoners(): TftSummonerRef[] {
    const region = this.platformRegion()
    if (region === null) {
      throw new Error(`Cannot derive region from TFT match id "${this.id}"`)
    }
    return this.info.participants.map((participant) =>
      this.context.client.tft.summoner.byPuuid(participant.puuid, region),
    )
  }
}
