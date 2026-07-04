import type { Paginator } from '../../core/pagination/paginator'
import type { SummonerDTO } from '../../dto/lol/summoner.dto'
import type { TftMatchIdsQuery, TftMatchStreamOptions } from '../../dto/tft/query.dto'
import type { Region } from '../../enums/region'
import type { CollectionQuery } from '../../query/collection-query'
import type { SingleQuery } from '../../query/single-query'
import { Entity } from '../entity'
import type { CurrentGameEntity } from '../lol/current-game.entity'
import type { AccountEntity } from '../riot/account.entity'
import type { TftLeagueEntryEntity } from './tft-league-entry.entity'
import type { TftMatchEntity } from './tft-match.entity'
import { TftSummonerRef } from './tft-summoner-ref'

// A TFT summoner has the same payload shape as a LoL summoner.
export interface TftSummonerEntity extends SummonerDTO {}

/**
 * A Teamfight Tactics summoner with lazy relations into TFT ranked, match
 * history and live game. Relation methods mirror {@link TftSummonerRef}.
 */
export class TftSummonerEntity extends Entity<SummonerDTO> {
  private get region(): Region {
    return this.context.region as Region
  }

  private ref(): TftSummonerRef {
    return new TftSummonerRef(this.context.client, this.puuid, this.region, (exec) =>
      exec.throw && this.error ? Promise.reject(this.error) : Promise.resolve(this),
    )
  }

  /** Resolve the underlying Riot account. */
  account(): SingleQuery<AccountEntity> {
    return this.ref().account()
  }

  /** This summoner's TFT ranked league entries. */
  leagueEntries(): CollectionQuery<TftLeagueEntryEntity> {
    return this.ref().leagueEntries()
  }

  /**
   * Ids of this summoner's recent TFT matches.
   *
   * @param query - Optional filters (count, time range…).
   */
  matchIds(query?: TftMatchIdsQuery): CollectionQuery<string> {
    return this.ref().matchIds(query)
  }

  /**
   * This summoner's recent TFT matches, fetched in full.
   *
   * @param query - Optional filters (count, time range…).
   */
  matches(query?: TftMatchIdsQuery): CollectionQuery<TftMatchEntity> {
    return this.ref().matches(query)
  }

  /**
   * Stream this summoner's entire TFT match history as full match entities.
   *
   * @param options - Paging options (start offset, page size, max items…).
   */
  streamMatches(options?: TftMatchStreamOptions): Paginator<TftMatchEntity> {
    return this.ref().streamMatches(options)
  }

  /** This summoner's live TFT game, or `null` if they are not in one. */
  activeGame(): SingleQuery<CurrentGameEntity | null> {
    return this.ref().activeGame()
  }
}
