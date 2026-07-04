# Error handling

`.execute()` resolves the **entity directly**, never a wrapper — and it **never
throws for an API failure**. On a non-2xx response (or a network error) the
entity's DTO fields are absent and `.error` holds a typed error class; on success
`.error` is `null` and the entity is your payload. You branch on `.error`, or call
`.execute({ throw: true })` when you would rather throw. Either way the error is
one of the classes below — no thrown strings, no bare `Error`s.

```ts
import { NotFoundError, RateLimitError } from 'yasuo'

const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()

if (summoner.error instanceof NotFoundError)  { /* the PUUID does not exist */ }
if (summoner.error instanceof RateLimitError) { /* summoner.error.rateLimits.retryAfterSeconds */ }
// no error → `summoner`'s DTO fields are populated
```

## The hierarchy

Every error yasuo produces descends from **`YasuoError`**. Every *HTTP* failure
descends from **`ApiError`**, which is itself a `YasuoError`. The specific
status codes get their own subclasses:

```
YasuoError                     // base for every error yasuo produces
├── ApiKeyMissingError         // no key configured — a misuse, thrown before any request
└── ApiError                   // base for every non-2xx Riot response (and network failures)
    ├── UnauthorizedError      // 401
    ├── ForbiddenError         // 403
    ├── NotFoundError          // 404
    ├── RateLimitError         // 429
    └── ServiceUnavailableError// 502 / 503 / 504
```

An `ApiError` (or a subclass) is what lands on the entity's `.error`; it is only
ever *thrown* if you opt in with `.execute({ throw: true })`. `ApiKeyMissingError`
is the one exception — a programmer mistake that always throws (see below).

`instanceof` is reliable in every build target. `YasuoError` restores its
prototype chain in the constructor, so the checks work after transpilation to
ES5, in CommonJS, and across bundle boundaries — not just in native ESM.

## `ApiKeyMissingError`

Raised at request time when **no API key is configured** — neither passed to the
constructor nor present as `RIOT_API_KEY` in the environment. This is a misuse,
not an API error, so it is the one case that breaks the no-throw
contract: because no HTTP call is ever made, `.execute()` **throws** it (the
promise rejects) rather than returning it on `.error`. It extends `YasuoError`
directly, **not** `ApiError`: there is no status, url, or rate-limit data to
attach.

```ts
import { ApiKeyMissingError } from 'yasuo'

const yasuo = new Yasuo({})              // no key, and RIOT_API_KEY unset

try {
  await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute()
} catch (err) {
  if (err instanceof ApiKeyMissingError) {
    // Fix your configuration: `new Yasuo({ key })` or set RIOT_API_KEY.
  }
}
```

## HTTP errors

For a non-2xx response, yasuo builds the most specific subclass for the status
code and puts it on the entity's `.error` once retries are exhausted:

| Status        | Class                     | Meaning                                                             |
| ------------- | ------------------------- | ------------------------------------------------------------------- |
| `401`         | `UnauthorizedError`       | The API key is missing, invalid, or expired.                        |
| `403`         | `ForbiddenError`          | The key lacks access to this endpoint (or is blacklisted/expired).  |
| `404`         | `NotFoundError`           | The requested resource does not exist.                              |
| `429`         | `RateLimitError`          | Rate limited — inspect `rateLimits.retryAfterSeconds`.              |
| `502`·`503`·`504` | `ServiceUnavailableError` | Riot-side outage — check the API status page.                   |
| anything else | `ApiError`                | Any other non-2xx status, surfaced as the base class.               |

A transport/network failure (DNS, TLS, a connection reset, a timeout) never
reaches Riot, so there is no status to key on: it comes back as a plain
`ApiError` with `status: 0` and `response: null`, its `.body` set to the
underlying cause. It still lands on `.error` like any other failure.

## What every `ApiError` carries

The full context of the failed request travels *with* the error, so everything
you need to diagnose it is on the entity's `.error`:

```ts
import { ApiError } from 'yasuo'

const match = await yasuo.lol.match.get('KR_404', RegionGroup.ASIA).execute()

if (match.error instanceof ApiError) {
  match.error.status                       // 404 — the HTTP status code (0 for a transport failure)
  match.error.url                          // final request URL, query string included
  match.error.method                       // rate-limit method id of the endpoint that failed
  match.error.rateLimits.app               // [{ limit, intervalSeconds, count }]
  match.error.rateLimits.retryAfterSeconds // number | null — set on 429s
  match.error.body                         // parsed Riot error body, e.g. { status: { message, status_code } }
  match.error.headers                      // raw, lower-cased response headers
  match.error.response                     // the original HttpResponse, or null for a transport failure
}
```

| Property      | Type                              | Notes                                                          |
| ------------- | --------------------------------- | -------------------------------------------------------------- |
| `.status`     | `number`                          | HTTP status code returned by Riot (`0` for a transport failure).|
| `.url`        | `string`                          | Final request URL, query string included.                      |
| `.method`     | `string`                          | Rate-limit method key of the endpoint (for diagnostics).       |
| `.rateLimits` | `RateLimits`                      | Parsed rate-limit headers; `retryAfterSeconds` on a `429`.     |
| `.body`       | `unknown`                         | Parsed response body (the thrown cause for a transport failure).|
| `.headers`    | `Readonly<Record<string, string>>`| Raw, lower-cased response headers (`{}` for a transport failure).|
| `.response`   | `HttpResponse \| null`            | The original HTTP response; `null` for a transport failure.    |

## Branching patterns

Pick the altitude that matches how much you care, then read `.error` off the
result:

```ts
import { ApiError, NotFoundError, RateLimitError, ForbiddenError } from 'yasuo'

const ids = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).matchIds({ count: 20 }).execute()

if (ids.error instanceof NotFoundError) {
  return []                                     // no such summoner — treat as empty
}
if (ids.error instanceof RateLimitError) {
  const wait = ids.error.rateLimits.retryAfterSeconds ?? 1
  await sleep(wait * 1000)                       // back off before trying again
  return []
}
if (ids.error instanceof ForbiddenError) {
  throw new Error('Your key cannot access this endpoint — check its scopes.')
}
if (ids.error instanceof ApiError) {
  console.error(`Riot ${ids.error.status} on ${ids.error.url}`)  // any other HTTP/transport failure
  return []
}
return ids                                       // `ids.error` is null here — the collection is populated
```

- **Check `instanceof ApiError`** to handle *any* HTTP or transport failure
  uniformly (status, url, body are all available).
- **Check a specific subclass** (`NotFoundError`, `RateLimitError`, …) when a
  status deserves distinct handling.
- **Check `.error !== null`** — or the `.http.ok` flag — when all you need to
  know is whether the request worked.

### `.execute({ throw: true })`: throw instead of branch

When you would rather use exceptions — say, under one catch-all at the top of a
request handler — pass `{ throw: true }` to `.execute()`. It returns the entity on
success and **throws the underlying `ApiError`** on failure, so a `try`/`catch`
sees exactly the typed classes above. This is the only way an `ApiError` is
thrown. Catching `YasuoError` traps *anything* from yasuo — including
`ApiKeyMissingError` — while letting unrelated errors propagate:

```ts
import { YasuoError } from 'yasuo'

try {
  const summoner = await yasuo.lol.summoner.byPuuid(puuid, Region.KR).execute({ throw: true })
  console.log(summoner.summonerLevel)
} catch (err) {
  if (err instanceof YasuoError) { /* it came from yasuo */ }
  else throw err                  /* something else — don't swallow it */
}
```

### Streams throw during iteration

Async iterators (`streamMatches`, `streamMatchIds`, `streamEntries`, and the
`.pages()`/`.toArray()`/`.first()` helpers) fetch with `{ throw: true }`
internally, so — unlike `.execute()` — they **throw** on failure mid-iteration.
Wrap a `for await` in `try`/`catch`:

```ts
try {
  for await (const match of yasuo.lol.summoner.byPuuid(puuid, Region.KR).streamMatches({ maxItems: 40 })) {
    console.log(match.info.gameDuration)
  }
} catch (err) {
  if (err instanceof RateLimitError) { /* retries were exhausted mid-stream */ }
}
```

## Retries happen before the error surfaces

`429` and `503`/`502`/`504` are **retried automatically** according to the retry
policy (with `retry-after` honoured, then bounded exponential backoff). The
`RateLimitError` or `ServiceUnavailableError` you find on `.error` (or that
`.execute({ throw: true })` throws) appears **only once retries are exhausted** (or disabled) —
so by the time you see it, yasuo has already waited and tried again on your
behalf. Tune this with the `retry` option; see [rate-limiting.md](rate-limiting.md).

## Some endpoints report `null` instead of an error

Where a `404` is an expected, non-exceptional outcome, the namespace converts it
to an empty result rather than a failure: `.execute()` resolves to `null`, and
nothing is thrown — even with `{ throw: true }`. The clearest case is a player's
live game — not being in a match is normal, not an error:

```ts
const live = await yasuo.lol.spectator.active(puuid, Region.KR).execute()

if (live?.error) {
  // A real failure (403, 429, 503, …) — handle or rethrow.
} else if (live === null) {
  // The player is not currently in a game (Riot answered 404).
} else {
  console.log(live.gameId)
}
```

Only `404` is absorbed this way — every other status (`403`, `429`, `503`, …)
still surfaces its usual `ApiError` subclass on the entity's `.error`.
