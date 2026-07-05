import { describe, expect, test } from 'bun:test'
import { EMPTY_RATE_LIMITS } from '../../src/core/rate-limit/rate-limit-headers'
import { HttpStatus } from '../../src/enums/http'
import {
  ApiError,
  apiErrorFromStatus,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  UnauthorizedError,
  YasuoError,
} from '../../src/errors'
import type { ApiErrorInit } from '../../src/errors/api-error'

function init(status: number): ApiErrorInit {
  return {
    status,
    url: 'https://kr.api.riotgames.com/lol/x',
    method: 'summoner.byPuuid',
    rateLimits: EMPTY_RATE_LIMITS,
    body: { status: { message: 'boom', status_code: status } },
    headers: {},
  }
}

describe('apiErrorFromStatus', () => {
  const cases: [number, new (init: ApiErrorInit) => ApiError][] = [
    [HttpStatus.UNAUTHORIZED, UnauthorizedError],
    [HttpStatus.FORBIDDEN, ForbiddenError],
    [HttpStatus.NOT_FOUND, NotFoundError],
    [HttpStatus.TOO_MANY_REQUESTS, RateLimitError],
    [HttpStatus.BAD_GATEWAY, ServiceUnavailableError],
    [HttpStatus.SERVICE_UNAVAILABLE, ServiceUnavailableError],
    [HttpStatus.GATEWAY_TIMEOUT, ServiceUnavailableError],
  ]

  for (const [status, ctor] of cases) {
    test(`maps ${status} to ${ctor.name}`, () => {
      const error = apiErrorFromStatus(init(status))
      expect(error).toBeInstanceOf(ctor)
      expect(error).toBeInstanceOf(ApiError)
      expect(error).toBeInstanceOf(YasuoError)
      expect(error.status).toBe(status)
      expect(error.method).toBe('summoner.byPuuid')
    })
  }

  test('falls back to the base ApiError for other statuses', () => {
    const error = apiErrorFromStatus(init(500))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.constructor).toBe(ApiError)
  })

  test('preserves url, body and rate limits', () => {
    const error = apiErrorFromStatus(init(HttpStatus.NOT_FOUND))
    expect(error.url).toContain('kr.api.riotgames.com')
    expect(error.rateLimits).toBe(EMPTY_RATE_LIMITS)
    expect(error.body).toMatchObject({ status: { message: 'boom' } })
  })

  test('errors carry a useful name and are throwable', () => {
    try {
      throw apiErrorFromStatus(init(HttpStatus.UNAUTHORIZED))
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedError)
      expect((error as UnauthorizedError).name).toBe('UnauthorizedError')
    }
  })
})
