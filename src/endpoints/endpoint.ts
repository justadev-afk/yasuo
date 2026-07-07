import type { Game } from '../enums/game'
import type { HttpMethod } from '../enums/http'

/**
 * Default base-URL template. `{routing}` is the platform region or region group
 * (lower-cased) and `{game}` is the {@link Game} path segment. Override it in
 * the client config to route requests through a rate-limiting proxy.
 */
export const DEFAULT_BASE_URL = 'https://{routing}.api.riotgames.com/{game}'

/** Scalar values accepted in a query string. */
export type QueryValue = string | number | boolean | null | undefined

/** Query parameters; array values expand into repeated keys. */
export type QueryParams = Record<string, QueryValue | QueryValue[]>

/** Path parameters substituted into an endpoint's `:placeholder` segments. */
export type PathParams = Record<string, string | number>

/**
 * A single Riot API endpoint.
 *
 * The `id` doubles as the endpoint's method-scope rate-limit key, so it must be
 * unique and stable. `path` uses `:name` placeholders for path parameters.
 */
export interface Endpoint {
  /** Unique, stable identifier used as the method rate-limit key. */
  readonly id: string
  /** Game path segment (`lol`, `tft`, `val`, `lor`, `riot`) — also the API-key selector. */
  readonly game: Game
  /** Path template after the game segment, e.g. `summoner/v4/summoners/by-puuid/:puuid`. */
  readonly path: string
  /**
   * HTTP method. Defaults to `GET` when omitted — the vast majority of Riot
   * endpoints. `POST`/`PUT` endpoints (e.g. Tournament-V5) set this explicitly
   * and carry a JSON body via the request options; only `GET` responses are
   * cached.
   */
  readonly method?: HttpMethod
}

/** Serialise query params, skipping nullish values and expanding arrays. */
export function buildQueryString(query: QueryParams | undefined): string {
  if (!query) {
    return ''
  }
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) {
      continue
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined) {
          search.append(key, String(item))
        }
      }
    } else {
      search.append(key, String(value))
    }
  }
  return search.toString()
}

/** The fully-resolved location of a request, plus its rate-limit host key. */
export interface ResolvedRequest {
  /** Absolute request URL, query string included. */
  readonly url: string
  /** Lower-cased routing host, used as the application rate-limit key. */
  readonly host: string
}

/**
 * Substitute path/query params into an endpoint and produce the final URL.
 *
 * @param baseUrl - Base-URL template (see {@link DEFAULT_BASE_URL}).
 * @param routing - Platform region or region group value (e.g. `KR`, `ASIA`).
 * @param endpoint - The endpoint to resolve.
 * @param pathParams - Values for the endpoint's `:placeholder` segments.
 * @param query - Optional query parameters.
 * @throws {Error} If a required path parameter is missing.
 */
export function resolveRequest(
  baseUrl: string,
  routing: string,
  endpoint: Endpoint,
  pathParams?: PathParams,
  query?: QueryParams,
): ResolvedRequest {
  const host = routing.toLowerCase()
  const path = endpoint.path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) {
        return segment
      }
      const name = segment.slice(1)
      const value = pathParams?.[name]
      if (value === undefined) {
        throw new Error(`Missing path parameter "${name}" for endpoint "${endpoint.id}"`)
      }
      return encodeURIComponent(String(value))
    })
    .join('/')

  const base = baseUrl.replace('{routing}', host).replace('{game}', endpoint.game)
  const queryString = buildQueryString(query)
  const url = `${base}/${path}${queryString ? `?${queryString}` : ''}`
  return { url, host }
}
