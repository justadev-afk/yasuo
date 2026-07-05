import { type Page, Paginator } from '../../core/pagination/paginator'
import type { MatchIdsQuery, MatchStreamOptions } from '../../dto/lol/query.dto'
import type { QueryParams } from '../../endpoints/endpoint'
import { LOL_ENDPOINTS } from '../../endpoints/lol'
import { Collection } from '../../entities/collection'
import { MatchEntity } from '../../entities/lol/match.entity'
import { MatchTimelineEntity } from '../../entities/lol/match-timeline.entity'
import { CacheNamespace } from '../../enums/cache-namespace'
import type { RegionGroup } from '../../enums/region'
import { CollectionQuery } from '../../query/collection-query'
import { forwardExec } from '../../query/execute-options'
import type { SingleQuery } from '../../query/single-query'
import { BaseNamespace } from '../base-namespace'

const DEFAULT_PAGE_SIZE = 100

/**
 * MATCH-V5 methods. All use **regional** routing ({@link RegionGroup}).
 */
export class LolMatchNamespace extends BaseNamespace {
  protected readonly cacheNamespace = CacheNamespace.LolMatch

  /**
   * A player's recent matches, fetched in full (one request per match).
   *
   * @param puuid - The player's PUUID.
   * @param regionGroup - The regional routing value.
   * @param query - Optional filters (count, queue, type, time range…).
   */
  byPuuid(
    puuid: string,
    regionGroup: RegionGroup,
    query?: MatchIdsQuery,
  ): CollectionQuery<MatchEntity> {
    return new CollectionQuery<MatchEntity>(async (exec) => {
      const forward = forwardExec(exec)
      const ids = await this.idsByPuuid(puuid, regionGroup, query).execute(forward)
      if (exec.raw) {
        if (ids.error) {
          return ids.error.body
        }
        return Promise.all(
          [...ids].map((id) => this.get(id, regionGroup).execute({ ...forward, raw: true })),
        )
      }
      if (ids.error) {
        if (exec.throw) {
          throw ids.error
        }
        return Collection.create<MatchEntity>([], ids.http, ids.error)
      }
      const matches = await Promise.all(
        [...ids].map((id) =>
          this.get(id, regionGroup).execute(exec.throw ? { ...forward, throw: true } : forward),
        ),
      )
      const failed = matches.find((match) => match.error)
      if (failed?.error) {
        return Collection.create<MatchEntity>([], failed.http, failed.error)
      }
      return Collection.create(matches, matches.at(-1)?.http ?? ids.http)
    })
  }

  /**
   * A full match by id.
   *
   * @param matchId - The match id, e.g. `KR_1234567890`.
   * @param regionGroup - The regional routing value.
   */
  get(matchId: string, regionGroup: RegionGroup): SingleQuery<MatchEntity> {
    return this.single(
      MatchEntity,
      regionGroup,
      LOL_ENDPOINTS.matchById,
      this.groupContext(regionGroup),
      {
        pathParams: { matchId },
      },
    )
  }

  /**
   * A page of match ids for a player.
   *
   * @param puuid - The player's PUUID.
   * @param regionGroup - The regional routing value.
   * @param query - Optional filters (count, queue, type, time range…).
   */
  idsByPuuid(
    puuid: string,
    regionGroup: RegionGroup,
    query?: MatchIdsQuery,
  ): CollectionQuery<string> {
    return this.scalarMany<string>(regionGroup, LOL_ENDPOINTS.matchIdsByPuuid, {
      pathParams: { puuid },
      query: query as QueryParams | undefined,
    })
  }

  /**
   * Stream a player's entire match-id history as an async iterator.
   *
   * @param puuid - The player's PUUID.
   * @param regionGroup - The regional routing value.
   * @param options - Paging options (start offset, page size, max items…).
   */
  streamIds(
    puuid: string,
    regionGroup: RegionGroup,
    options: MatchStreamOptions = {},
  ): Paginator<string> {
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
    return new Paginator<string>({
      startCursor: options.start ?? 0,
      maxItems: options.maxItems,
      fetchPage: async (cursor): Promise<Page<string>> => {
        const fetched = await this.request<string[]>(regionGroup, LOL_ENDPOINTS.matchIdsByPuuid, {
          pathParams: { puuid },
          query: this.pageQuery(cursor, pageSize, options),
        })
        return { items: fetched.data, meta: fetched.meta, cursor }
      },
      nextCursor: (cursor, page) => (page.items.length < pageSize ? null : cursor + pageSize),
    })
  }

  /**
   * Stream a player's entire match history as full match entities.
   *
   * @param puuid - The player's PUUID.
   * @param regionGroup - The regional routing value.
   * @param options - Paging options (start offset, page size, max items…).
   */
  streamMatches(
    puuid: string,
    regionGroup: RegionGroup,
    options: MatchStreamOptions = {},
  ): Paginator<MatchEntity> {
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
    return new Paginator<MatchEntity>({
      startCursor: options.start ?? 0,
      maxItems: options.maxItems,
      fetchPage: async (cursor): Promise<Page<MatchEntity>> => {
        const fetched = await this.request<string[]>(regionGroup, LOL_ENDPOINTS.matchIdsByPuuid, {
          pathParams: { puuid },
          query: this.pageQuery(cursor, pageSize, options),
        })
        const items = await Promise.all(
          fetched.data.map((id) => this.get(id, regionGroup).execute({ throw: true })),
        )
        return { items, meta: fetched.meta, cursor }
      },
      nextCursor: (cursor, page) => (page.items.length < pageSize ? null : cursor + pageSize),
    })
  }

  /**
   * A match timeline by id.
   *
   * @param matchId - The match id.
   * @param regionGroup - The regional routing value.
   */
  timeline(matchId: string, regionGroup: RegionGroup): SingleQuery<MatchTimelineEntity> {
    return this.single(
      MatchTimelineEntity,
      regionGroup,
      LOL_ENDPOINTS.matchTimeline,
      this.groupContext(regionGroup),
      { pathParams: { matchId } },
    )
  }

  private pageQuery(cursor: number, pageSize: number, options: MatchStreamOptions): QueryParams {
    return {
      start: cursor,
      count: pageSize,
      startTime: options.startTime,
      endTime: options.endTime,
      queue: options.queue,
      type: options.type,
    }
  }
}
