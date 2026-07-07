import type { HttpMethod } from '../../enums/http'

/** A normalised outbound HTTP request. */
export interface HttpRequest {
  readonly url: string
  readonly method: HttpMethod
  readonly headers: Readonly<Record<string, string>>
  readonly signal?: AbortSignal
  /**
   * JSON request body for `POST`/`PUT` endpoints. Serialised with
   * `JSON.stringify` by the default transport; `undefined` for `GET` requests.
   */
  readonly body?: unknown
}

/** A normalised HTTP response with headers lower-cased and the body parsed. */
export interface HttpResponse {
  readonly status: number
  readonly ok: boolean
  readonly headers: Readonly<Record<string, string>>
  readonly body: unknown
}

/**
 * Transport abstraction. The default implementation uses the platform's native
 * `fetch`, but any conforming client (e.g. one backed by `undici` or a mock in
 * tests) can be injected via the Yasuo config.
 */
export interface HttpClient {
  send(request: HttpRequest): Promise<HttpResponse>
}

/** Copy a `Headers` instance into a plain, lower-cased record. */
function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value
  })
  return record
}

/**
 * Parse a response body as JSON, gracefully falling back to plain text (some
 * endpoints, like third-party codes, reply with a bare string) and to
 * `undefined` for empty bodies.
 */
async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) {
    return undefined
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Default {@link HttpClient} backed by `fetch`.
 *
 * A custom `fetch` implementation may be supplied for environments without a
 * global `fetch`, or to route traffic through a proxy.
 */
export class FetchHttpClient implements HttpClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async send(request: HttpRequest): Promise<HttpResponse> {
    const response = await this.fetchImpl(request.url, {
      method: request.method,
      headers: request.headers as Record<string, string>,
      signal: request.signal,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    })
    return {
      status: response.status,
      ok: response.ok,
      headers: headersToRecord(response.headers),
      body: await parseBody(response),
    }
  }
}
