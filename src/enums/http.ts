/**
 * HTTP verbs used by the client. The Riot API is read-only for the endpoints
 * Yasuo covers, so in practice this is always {@link HttpMethod.GET}.
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

/**
 * The subset of HTTP status codes the client reacts to explicitly.
 *
 * Modelled as an enum so no status code is ever written as a magic number.
 */
export enum HttpStatus {
  OK = 200,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  UNSUPPORTED_MEDIA_TYPE = 415,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,
}

/**
 * HTTP header names read from or written to Riot requests/responses.
 *
 * Values are lower-cased because the {@link Headers} interface (and Riot's
 * responses over HTTP/2) expose header names in lower case.
 */
export enum HttpHeader {
  /** Request header carrying the Riot API key. */
  RIOT_TOKEN = 'x-riot-token',
  /** Request media type, set to `application/json` when a body is sent. */
  CONTENT_TYPE = 'content-type',
  /** The application rate limits currently applied to the key. */
  APP_RATE_LIMIT = 'x-app-rate-limit',
  /** The number of app-scoped requests made in the current windows. */
  APP_RATE_LIMIT_COUNT = 'x-app-rate-limit-count',
  /** The method rate limits currently applied to the key. */
  METHOD_RATE_LIMIT = 'x-method-rate-limit',
  /** The number of method-scoped requests made in the current windows. */
  METHOD_RATE_LIMIT_COUNT = 'x-method-rate-limit-count',
  /** Which limiter enforced a 429 (`application`, `method` or `service`). */
  RATE_LIMIT_TYPE = 'x-rate-limit-type',
  /** Seconds to wait before retrying after a 429/503. */
  RETRY_AFTER = 'retry-after',
  /** Riot edge trace id, useful when reporting issues to Riot. */
  EDGE_TRACE_ID = 'x-riot-edge-trace-id',
}
