# Logging

yasuo ships a small **leveled logger**. It is **silent by default** — the client never writes to your console unless you opt in — and it plugs into `pino`, `winston`, or anything else through a four-method interface.

## Levels

`LogLevel` is an enum ordered from most to least verbose. A logger only emits messages **at or above** its configured level.

| Level | Value | Emits |
| --- | --- | --- |
| `LogLevel.DEBUG` | `10` | everything: every request URL, cache hits, plus all higher levels |
| `LogLevel.INFO` | `20` | informational messages, plus warnings and errors |
| `LogLevel.WARN` | `30` | reactive retries, plus errors |
| `LogLevel.ERROR` | `40` | final request failures only |
| `LogLevel.SILENT` | `100` | nothing — **the default** |

The built-in console logger prefixes every line with `[yasuo]` and routes to `console.debug`/`info`/`warn`/`error` respectively.

## Configuring it

There are three ways to turn logging on, in increasing order of control.

### 1. `logLevel` in the config

The simplest switch. Pass a `LogLevel` and yasuo builds a console logger filtered to that level.

```ts
import { Yasuo, LogLevel } from 'yasuo.js'

const yasuo = new Yasuo({
  key: process.env.RIOT_API_KEY,
  logLevel: LogLevel.DEBUG, // log every request + cache hit
})
```

### 2. The `YASUO_LOG_LEVEL` (or `LOG_LEVEL`) env var

Handy for flipping verbosity per-environment without touching code. Values are **case-insensitive level names** — `debug` · `info` · `warn` · `error` · `silent`:

```bash
YASUO_LOG_LEVEL=debug node app.js
# LOG_LEVEL is honoured too (YASUO_LOG_LEVEL wins when both are set)
LOG_LEVEL=warn node app.js
```

```ts
const yasuo = new Yasuo({ key: process.env.RIOT_API_KEY })
// picks up YASUO_LOG_LEVEL / LOG_LEVEL automatically; SILENT if neither is set
```

### 3. A fully custom `logger`

Supply your own `Logger` to route yasuo's output into your app's logging stack. An explicit `logger` **takes over completely** and ignores `logLevel` (your logger does its own filtering).

```ts
import { Yasuo, type Logger } from 'yasuo.js'

const logger: Logger = {
  debug: (message, ...args) => console.debug('[riot]', message, ...args),
  info: (message, ...args) => console.info('[riot]', message, ...args),
  warn: (message, ...args) => console.warn('[riot]', message, ...args),
  error: (message, ...args) => console.error('[riot]', message, ...args),
}

const yasuo = new Yasuo({ key: process.env.RIOT_API_KEY, logger })
```

## What gets logged, and when

Every network call flows through the request pipeline, which logs at these levels:

| Level | Message | When |
| --- | --- | --- |
| `debug` | `cache hit <url>` | a fresh cache entry is served (no network) |
| `debug` | `GET <url>` | each outgoing request, just before it is sent |
| `warn` | `retry <n>/<max> after <ms>ms (status <code>) <url>` | a `429`/`5xx` triggers a reactive retry |
| `error` | `request failed (<status>) <url>` | retries are exhausted and the request finally fails — the `ApiError` surfaces as the result's `.error` (or is thrown when you call `.execute({ throw: true })`) |

`info` is **not** used by the client itself — it exists so a custom `Logger` you share across your app still receives a complete four-level surface.

## Custom logger example — adapting `pino`

The `Logger` interface (`debug` / `info` / `warn` / `error`, each `(message: string, ...args: unknown[]) => void`) maps directly onto most logging libraries. A thin adapter is all it takes:

```ts
import pino from 'pino'
import { Yasuo, type Logger } from 'yasuo.js'

const log = pino({ name: 'riot-api', level: 'debug' })

const adapter: Logger = {
  debug: (message, ...args) => log.debug({ args }, message),
  info: (message, ...args) => log.info({ args }, message),
  warn: (message, ...args) => log.warn({ args }, message),
  error: (message, ...args) => log.error({ args }, message),
}

const yasuo = new Yasuo({ key: process.env.RIOT_API_KEY, logger: adapter })
```

The same shape works for `winston` (`log.debug(message, ...args)`), a bare `console`, or a no-op sink for tests.

## Precedence

When more than one source is configured, yasuo resolves the logger in this order:

1. An explicit **`logger`** — wins outright; `logLevel` and env vars are ignored.
2. **`logLevel`** in the config — builds a console logger at that level.
3. **`YASUO_LOG_LEVEL`**, then **`LOG_LEVEL`** — parsed as a level name.
4. **`LogLevel.SILENT`** — the default when nothing above is set.

So `logger` > `logLevel` > `YASUO_LOG_LEVEL` > `LOG_LEVEL` > silent.
