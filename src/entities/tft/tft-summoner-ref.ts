import type { Yasuo } from '../../client/yasuo'
import type { Paginator } from '../../core/pagination/paginator'
import type { TftMatchIdsQuery, TftMatchStreamOptions } from '../../dto/tft/query.dto'
import { type Region, regionToAccountRegionGroup, regionToRegionGroup } from '../../enums/region'
import type { CollectionQuery } from '../../query/collection-query'
import type { QueryRunner } from '../../query/execute-options'
import { SingleQuery } from '../../query/single-query'
import type { CurrentGameEntity } from '../lol/current-game.entity'
import type { AccountEntity } from '../riot/account.entity'
import type { TftLeagueEntryEntity } from './tft-league-entry.entity'
import type { TftMatchEntity } from './tft-match.entity'
import type { TftSummonerEntity } from './tft-summoner.entity'

/**
 * A lazy, chainable reference to a TFT summoner identified by PUUID.
 *
 * Like {@link SummonerRef} it is a {@link SingleQuery}: call `.execute()` to fetch
 * the summoner, or a relation (also run with `.execute()`) to fetch only that
 * related resource.
 */
export class TftSummonerRef extends SingleQuery<TftSummonerEntity> {
  constructor(
    private readonly client: Yasuo,
    private readonly puuid: string,
    private readonly region: Region,
    runner: QueryRunner<TftSummonerEntity>,
  ) {
    super(runner)
  }

  /** The underlying Riot account. */
  account(): SingleQuery<AccountEntity> {
    return this.client.riot.account.byPuuid(this.puuid, regionToAccountRegionGroup(this.region))
  }

  /** TFT ranked league entries. */
  leagueEntries(): CollectionQuery<TftLeagueEntryEntity> {
    return this.client.tft.league.byPuuid(this.puuid, this.region)
  }

  /**
   * Ids of recent TFT matches.
   *
   * @param query - Optional filters (count, time range…).
   */
  matchIds(query?: TftMatchIdsQuery): CollectionQuery<string> {
    return this.client.tft.match.idsByPuuid(this.puuid, regionToRegionGroup(this.region), query)
  }

  /**
   * Recent TFT matches, fetched in full.
   *
   * @param query - Optional filters (count, time range…).
   */
  matches(query?: TftMatchIdsQuery): CollectionQuery<TftMatchEntity> {
    return this.client.tft.match.byPuuid(this.puuid, regionToRegionGroup(this.region), query)
  }

  /**
   * Stream full TFT match entities page by page.
   *
   * @param options - Paging options (start offset, page size, max items…).
   */
  streamMatches(options?: TftMatchStreamOptions): Paginator<TftMatchEntity> {
    return this.client.tft.match.streamMatches(
      this.puuid,
      regionToRegionGroup(this.region),
      options,
    )
  }

  /** The live TFT game, or `null` if not currently in one. */
  activeGame(): SingleQuery<CurrentGameEntity | null> {
    return this.client.tft.spectator.active(this.puuid, this.region)
  }
}
