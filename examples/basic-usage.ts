/**
 * Compile-checked usage examples for yasuo.
 *
 * Not meant to run — it exists so `bun run typecheck` proves every pattern in
 * the README and docs compiles against the public API. If an example breaks,
 * the docs are wrong — fix both.
 */
import {
  ApiError,
  Division,
  type HttpMiddleware,
  KVCache,
  type KVNamespaceLike,
  LogLevel,
  MatchType,
  NotFoundError,
  RankedQueue,
  RedisCache,
  type RedisClientLike,
  Region,
  RegionGroup,
  Tier,
  Yasuo,
} from '../src/index'

// --- Construction ------------------------------------------------------------

// Proactive rate limiting is OFF by default (reactive 429/503 retries stay on).
const fromString = new Yasuo('RGAPI-xxxxxxxx')
const yasuo = new Yasuo({
  key: process.env.RIOT_API_KEY,
  rateLimit: true, // opt in to proactive pacing
  retry: { maxAttempts: 3 },
  cache: true,
  logLevel: LogLevel.INFO,
  concurrency: 20,
})
void fromString

// --- The result IS the entity: .error + .http live on it ---------------------

async function resultShape(): Promise<void> {
  const summoner = await yasuo.lol.summoner.byPuuid('puuid', Region.KR).execute()

  if (summoner.error) {
    // `error` is the original ApiError (status + body + rateLimits + response).
    console.error(summoner.error.status, summoner.error.body)
    return
  }
  // DTO fields are right on the entity; HTTP context is grouped under `.http`.
  console.log(summoner.summonerLevel, summoner.http.status, summoner.http.rateLimits.app)

  // Opt into throwing on failure:
  const strict = await yasuo.lol.summoner.byPuuid('puuid', Region.KR).execute({ throw: true })
  console.log(strict.summonerLevel)

  // Or get exactly what Riot returned, typed `unknown`:
  const raw = await yasuo.lol.summoner.byPuuid('puuid', Region.KR).execute({ raw: true })
  console.log(raw)

  // ...or supply the shape you expect as a type argument — no cast needed:
  const typed = await yasuo.lol.summoner
    .byPuuid('puuid', Region.KR)
    .execute<{ puuid: string; summonerLevel: number }>({ raw: true })
  console.log(typed.summonerLevel)
}

// --- Account → summoner → relations (single requests) ------------------------

async function walkAccount(): Promise<void> {
  const account = await yasuo.riot.account
    .byRiotId('Hide on bush', 'KR1', RegionGroup.ASIA)
    .execute()
  if (account.error) {
    return
  }

  // Lazy ref — no request until a terminal .execute() runs a relation.
  const ref = account.summoner(Region.KR)

  const matches = await ref.matches({ count: 20, type: MatchType.RANKED }).execute()
  const masteries = await ref.topChampionMasteries(5).execute()
  const live = await ref.activeGame().execute() // CurrentGameEntity | null
  console.log(matches.length, masteries.length, live?.gameId ?? 'not in game')

  // Scalars are boxed: read `.value`.
  const score = await ref.masteryScore().execute()
  console.log(score.value ?? 0)

  // Match → timeline (ids reused, routing derived automatically).
  const ids = await ref.matchIds({ count: 1 }).execute()
  const first = ids[0]
  if (first) {
    const match = await yasuo.lol.match.get(first, RegionGroup.ASIA).execute()
    if (!match.error) {
      const timeline = await match.timeline().execute()
      console.log(match.info.gameDuration, timeline.info?.frames.length)
    }
  }
}

// --- League + async-iterator pagination --------------------------------------

async function streamLadder(): Promise<void> {
  // Iterators throw on failure (idiomatic for `for await`).
  for await (const entry of yasuo.lol.league.streamEntries(
    RankedQueue.SOLO_5x5,
    Tier.DIAMOND,
    Division.I,
    Region.EUW,
    { startPage: 3, maxItems: 250 },
  )) {
    console.log(entry.puuid, entry.leaguePoints)
  }

  const someIds = await yasuo.lol.match
    .streamIds('puuid', RegionGroup.ASIA, { start: 0, pageSize: 100 })
    .toArray(50)
  console.log(someIds.length)
}

// --- TFT ---------------------------------------------------------------------

async function tft(): Promise<void> {
  const summoner = await yasuo.tft.summoner.byPuuid('puuid', Region.KR).execute()
  const match = await yasuo.tft.match.get('KR_123', RegionGroup.ASIA).execute()
  console.log(summoner.puuid, match.metadata?.match_id)
}

// --- Data Dragon (no key, no rate limit — returns raw payloads) --------------

async function staticData(): Promise<void> {
  const versions = await yasuo.dataDragon.versions()
  const champions = await yasuo.dataDragon.champions()
  console.log(versions[0], Object.keys(champions.data).length)
}

// --- Caching with a custom Redis-compatible client ---------------------------

function withRedis(redis: RedisClientLike): Yasuo {
  return new Yasuo({ key: 'RGAPI-x', cache: { store: new RedisCache(redis), ttlMs: 30_000 } })
}

// --- Caching on Cloudflare Workers with a KV namespace binding ----------------

function withCloudflareKV(kv: KVNamespaceLike): Yasuo {
  // Explicit wrapper, or pass the raw binding as `store` and let yasuo wrap it.
  const explicit = new Yasuo({ key: 'RGAPI-x', cache: { store: new KVCache(kv), ttlMs: 300_000 } })
  const raw = new Yasuo({ key: 'RGAPI-x', cache: { store: kv } }) // auto-wrapped in KVCache
  void raw
  return explicit
}

// --- Custom HTTP client + stackable middleware (axios-style) ------------------

function withMiddleware(): Yasuo {
  const timing: HttpMiddleware = async (request, next, { endpointId }) => {
    const started = Date.now()
    const response = await next(request)
    console.log(`${endpointId} ${response.status} in ${Date.now() - started}ms`)
    return response
  }
  const client = new Yasuo({ key: 'RGAPI-x', middleware: [timing] })
  // Global middleware wraps per-service middleware, and both stack in order.
  client.use((request, next) =>
    next({ ...request, headers: { ...request.headers, 'x-app': 'bot' } }),
  )
  client.lol.match.use((request, next) => {
    console.debug('match request', request.url)
    return next(request)
  })
  return client
}

// --- Typed error handling ----------------------------------------------------

async function safeLookup(): Promise<void> {
  const summoner = await yasuo.lol.summoner.byPuuid('puuid', Region.KR).execute()
  if (summoner.error instanceof NotFoundError) {
    console.warn('no such summoner')
  } else if (summoner.error instanceof ApiError) {
    const { status, url, rateLimits } = summoner.error
    console.error('riot error', status, url, rateLimits.retryAfterSeconds)
  } else {
    console.log(summoner.summonerLevel)
  }
}

export {
  resultShape,
  safeLookup,
  staticData,
  streamLadder,
  tft,
  walkAccount,
  withCloudflareKV,
  withMiddleware,
  withRedis,
}
