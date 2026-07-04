import type { Yasuo } from '../../client/yasuo'
import type { Paginator } from '../../core/pagination/paginator'
import type { MatchIdsQuery, MatchStreamOptions } from '../../dto/lol/query.dto'
import { type Region, regionToAccountRegionGroup, regionToRegionGroup } from '../../enums/region'
import type { CollectionQuery } from '../../query/collection-query'
import type { QueryRunner } from '../../query/execute-options'
import { SingleQuery } from '../../query/single-query'
import type { AccountEntity } from '../riot/account.entity'
import type { ValueResult } from '../value-result'
import type { ChampionMasteryEntity } from './champion-mastery.entity'
import type { ClashPlayerEntity } from './clash-player.entity'
import type { CurrentGameEntity } from './current-game.entity'
import type { LeagueEntryEntity } from './league-entry.entity'
import type { MatchEntity } from './match.entity'
import type { PlayerChallengesEntity } from './player-challenges.entity'
import type { SummonerEntity } from './summoner.entity'

/**
 * A lazy, chainable reference to a summoner identified by PUUID.
 *
 * Returned by `yasuo.lol.summoner.byPuuid(...)`. It is a {@link SingleQuery}, so
 * `.execute()` performs the summoner request and resolves the
 * {@link SummonerEntity} directly. But its relation methods (`matches`,
 * `leagueEntries`, `championMasteries`, …) already know the PUUID, so they build
 * a query for **only** the related resource — the summoner itself is never
 * requested.
 *
 * @example
 * ```ts
 * // One request (the match list), NOT two:
 * const matches = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).matches({ count: 5 }).execute()
 *
 * // Calling .execute() does fetch the summoner:
 * const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()
 * ```
 */
export class SummonerRef extends SingleQuery<SummonerEntity> {
  constructor(
    private readonly client: Yasuo,
    private readonly puuid: string,
    private readonly region: Region,
    runner: QueryRunner<SummonerEntity>,
  ) {
    super(runner)
  }

  /** The underlying Riot account. */
  account(): SingleQuery<AccountEntity> {
    return this.client.riot.account.byPuuid(this.puuid, regionToAccountRegionGroup(this.region))
  }

  /** Ranked league entries in every queue. */
  leagueEntries(): CollectionQuery<LeagueEntryEntity> {
    return this.client.lol.league.byPuuid(this.puuid, this.region)
  }

  /** Champion mastery, one entry per champion played. */
  championMasteries(): CollectionQuery<ChampionMasteryEntity> {
    return this.client.lol.mastery.byPuuid(this.puuid, this.region)
  }

  /**
   * Highest champion masteries.
   *
   * @param count - How many top entries to return.
   */
  topChampionMasteries(count?: number): CollectionQuery<ChampionMasteryEntity> {
    return this.client.lol.mastery.top(this.puuid, this.region, count)
  }

  /**
   * Mastery of a single champion.
   *
   * @param championId - The champion id.
   */
  championMastery(championId: number): SingleQuery<ChampionMasteryEntity> {
    return this.client.lol.mastery.byChampion(this.puuid, championId, this.region)
  }

  /** Total champion mastery score. */
  masteryScore(): SingleQuery<ValueResult<number>> {
    return this.client.lol.mastery.score(this.puuid, this.region)
  }

  /**
   * Ids of recent matches.
   *
   * @param query - Optional filters (count, queue, type, time range…).
   */
  matchIds(query?: MatchIdsQuery): CollectionQuery<string> {
    return this.client.lol.match.idsByPuuid(this.puuid, regionToRegionGroup(this.region), query)
  }

  /**
   * Recent matches, fetched in full.
   *
   * @param query - Optional filters (count, queue, type, time range…).
   */
  matches(query?: MatchIdsQuery): CollectionQuery<MatchEntity> {
    return this.client.lol.match.byPuuid(this.puuid, regionToRegionGroup(this.region), query)
  }

  /**
   * Stream match ids page by page.
   *
   * @param options - Paging options (start offset, page size, max items…).
   */
  streamMatchIds(options?: MatchStreamOptions): Paginator<string> {
    return this.client.lol.match.streamIds(this.puuid, regionToRegionGroup(this.region), options)
  }

  /**
   * Stream full match entities page by page.
   *
   * @param options - Paging options (start offset, page size, max items…).
   */
  streamMatches(options?: MatchStreamOptions): Paginator<MatchEntity> {
    return this.client.lol.match.streamMatches(
      this.puuid,
      regionToRegionGroup(this.region),
      options,
    )
  }

  /** The live game, or `null` if not currently in one. */
  activeGame(): SingleQuery<CurrentGameEntity | null> {
    return this.client.lol.spectator.active(this.puuid, this.region)
  }

  /** Active Clash registrations. */
  clashPlayers(): CollectionQuery<ClashPlayerEntity> {
    return this.client.lol.clash.playersByPuuid(this.puuid, this.region)
  }

  /** Challenge progress. */
  challenges(): SingleQuery<PlayerChallengesEntity> {
    return this.client.lol.challenges.player(this.puuid, this.region)
  }
}
