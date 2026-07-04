import { type Page, Paginator } from '../../core/pagination/paginator'
import type { TftMatchIdsQuery, TftMatchStreamOptions } from '../../dto/tft/query.dto'
import type { QueryParams } from '../../endpoints/endpoint'
import { TFT_ENDPOINTS } from '../../endpoints/tft'
import { Collection } from '../../entities/collection'
import { TftMatchEntity } from '../../entities/tft/tft-match.entity'
import type { RegionGroup } from '../../enums/region'
import { CollectionQuery } from '../../query/collection-query'
import type { SingleQuery } from '../../query/single-query'
import { BaseNamespace } from '../base-namespace'

const DEFAULT_PAGE_SIZE = 100

/**
 * TFT-MATCH-V1 methods. All use **regional** routing ({@link RegionGroup}).
 */
export class TftMatchNamespace extends BaseNamespace {
  /**
   * A page of TFT match ids for a player.
   *
   * @param puuid - The player's PUUID.
   * @param regionGroup - The regional routing value.
   * @param query - Optional filters (count, time range…).
   */
  idsByPuuid(
    puuid: string,
    regionGroup: RegionGroup,
    query?: TftMatchIdsQuery,
  ): CollectionQuery<string> {
    return this.scalarMany<string>(regionGroup, TFT_ENDPOINTS.matchIdsByPuuid, {
      pathParams: { puuid },
      query: query as QueryParams | undefined,
    })
  }

  /**
   * A full TFT match by id.
   *
   * @param matchId - The match id.
   * @param regionGroup - The regional routing value.
   */
  get(matchId: string, regionGroup: RegionGroup): SingleQuery<TftMatchEntity> {
    return this.single(
      TftMatchEntity,
      regionGroup,
      TFT_ENDPOINTS.matchById,
      this.groupContext(regionGroup),
      { pathParams: { matchId } },
    )
  }

  /**
   * A player's recent TFT matches, fetched in full (one request per match).
   *
   * @param puuid - The player's PUUID.
   * @param regionGroup - The regional routing value.
   * @param query - Optional filters (count, time range…).
   */
  byPuuid(
    puuid: string,
    regionGroup: RegionGroup,
    query?: TftMatchIdsQuery,
  ): CollectionQuery<TftMatchEntity> {
    return new CollectionQuery<TftMatchEntity>(async (exec) => {
      const ids = await this.idsByPuuid(puuid, regionGroup, query).execute()
      if (exec.raw) {
        if (ids.error) {
          return ids.error.body
        }
        return Promise.all([...ids].map((id) => this.get(id, regionGroup).execute({ raw: true })))
      }
      if (ids.error) {
        if (exec.throw) {
          throw ids.error
        }
        return Collection.create<TftMatchEntity>([], ids.http, ids.error)
      }
      const matches = await Promise.all(
        [...ids].map((id) => this.get(id, regionGroup).execute(exec.throw ? { throw: true } : {})),
      )
      const failed = matches.find((match) => match.error)
      if (failed?.error) {
        return Collection.create<TftMatchEntity>([], failed.http, failed.error)
      }
      return Collection.create(matches, matches.at(-1)?.http ?? ids.http)
    })
  }

  /**
   * Stream a player's entire TFT match history as full match entities.
   *
   * @param puuid - The player's PUUID.
   * @param regionGroup - The regional routing value.
   * @param options - Paging options (start offset, page size, max items…).
   */
  streamMatches(
    puuid: string,
    regionGroup: RegionGroup,
    options: TftMatchStreamOptions = {},
  ): Paginator<TftMatchEntity> {
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
    return new Paginator<TftMatchEntity>({
      startCursor: options.start ?? 0,
      maxItems: options.maxItems,
      fetchPage: async (cursor): Promise<Page<TftMatchEntity>> => {
        const fetched = await this.request<string[]>(regionGroup, TFT_ENDPOINTS.matchIdsByPuuid, {
          pathParams: { puuid },
          query: {
            start: cursor,
            count: pageSize,
            startTime: options.startTime,
            endTime: options.endTime,
          },
        })
        const items = await Promise.all(
          fetched.data.map((id) => this.get(id, regionGroup).execute({ throw: true })),
        )
        return { items, meta: fetched.meta, cursor }
      },
      nextCursor: (cursor, page) => (page.items.length < pageSize ? null : cursor + pageSize),
    })
  }
}
