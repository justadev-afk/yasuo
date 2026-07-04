import { RIOT_ENDPOINTS } from '../../endpoints/riot'
import { AccountRegionEntity } from '../../entities/riot/account-region.entity'
import { AccountEntity } from '../../entities/riot/account.entity'
import { ActiveShardEntity } from '../../entities/riot/active-shard.entity'
import type { Game } from '../../enums/game'
import type { AccountRegionGroup } from '../../enums/region'
import type { SingleQuery } from '../../query/single-query'
import { BaseNamespace } from '../base-namespace'

/**
 * ACCOUNT-V1 methods.
 */
export class RiotAccountNamespace extends BaseNamespace {
  /**
   * An account by PUUID.
   *
   * @param puuid - The player's PUUID.
   * @param regionGroup - Account routing value (`AMERICAS`, `ASIA` or `EUROPE`).
   */
  byPuuid(puuid: string, regionGroup: AccountRegionGroup): SingleQuery<AccountEntity> {
    return this.single(
      AccountEntity,
      regionGroup,
      RIOT_ENDPOINTS.accountByPuuid,
      this.groupContext(regionGroup),
      { pathParams: { puuid } },
    )
  }

  /**
   * An account by Riot ID.
   *
   * @param gameName - The in-game name (before the `#`).
   * @param tagLine - The tag line (after the `#`).
   * @param regionGroup - Account routing value (`AMERICAS`, `ASIA` or `EUROPE`).
   */
  byRiotId(
    gameName: string,
    tagLine: string,
    regionGroup: AccountRegionGroup,
  ): SingleQuery<AccountEntity> {
    return this.single(
      AccountEntity,
      regionGroup,
      RIOT_ENDPOINTS.accountByRiotId,
      this.groupContext(regionGroup),
      { pathParams: { gameName, tagLine } },
    )
  }

  /**
   * A player's active shard for a game.
   *
   * @param game - The game (`lol`, `tft`, …).
   * @param puuid - The player's PUUID.
   * @param regionGroup - Account routing value.
   */
  activeShard(
    game: Game,
    puuid: string,
    regionGroup: AccountRegionGroup,
  ): SingleQuery<ActiveShardEntity> {
    return this.single(
      ActiveShardEntity,
      regionGroup,
      RIOT_ENDPOINTS.accountActiveShard,
      this.groupContext(regionGroup),
      { pathParams: { game, puuid } },
    )
  }

  /**
   * A player's active region for a game.
   *
   * @param game - The game (`lol` or `tft`).
   * @param puuid - The player's PUUID.
   * @param regionGroup - Account routing value.
   */
  activeRegion(
    game: Game,
    puuid: string,
    regionGroup: AccountRegionGroup,
  ): SingleQuery<AccountRegionEntity> {
    return this.single(
      AccountRegionEntity,
      regionGroup,
      RIOT_ENDPOINTS.accountActiveRegion,
      this.groupContext(regionGroup),
      { pathParams: { game, puuid } },
    )
  }
}
