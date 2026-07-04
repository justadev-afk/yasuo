import { describe, expect, spyOn, test } from 'bun:test'
import {
  LogLevel,
  createConsoleLogger,
  parseLogLevel,
  resolveLogLevel,
} from '../../src/core/logger'

describe('parseLogLevel', () => {
  test('maps every alias to a level', () => {
    expect(parseLogLevel('debug')).toBe(LogLevel.DEBUG)
    expect(parseLogLevel('TRACE')).toBe(LogLevel.DEBUG)
    expect(parseLogLevel('log')).toBe(LogLevel.INFO)
    expect(parseLogLevel('warning')).toBe(LogLevel.WARN)
    expect(parseLogLevel(' error ')).toBe(LogLevel.ERROR)
    expect(parseLogLevel('off')).toBe(LogLevel.SILENT)
  })

  test('returns undefined for unknown or missing values', () => {
    expect(parseLogLevel('loud')).toBeUndefined()
    expect(parseLogLevel(undefined)).toBeUndefined()
  })
})

describe('resolveLogLevel', () => {
  test('an explicit level wins', () => {
    expect(resolveLogLevel(LogLevel.WARN)).toBe(LogLevel.WARN)
  })

  test('falls back to SILENT when nothing is set', () => {
    expect(resolveLogLevel()).toBe(LogLevel.SILENT)
    expect(resolveLogLevel(undefined, LogLevel.INFO)).toBe(LogLevel.INFO)
  })
})

describe('createConsoleLogger', () => {
  test('emits at or above the configured level, prefixed with [yasuo]', () => {
    const debug = spyOn(console, 'debug').mockImplementation(() => {})
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const logger = createConsoleLogger(LogLevel.ERROR)
      logger.debug('d')
      logger.error('boom')
      expect(debug).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledTimes(1)
      expect(error.mock.calls[0]?.[0]).toBe('[yasuo] boom')
    } finally {
      debug.mockRestore()
      error.mockRestore()
    }
  })

  test('SILENT emits nothing', () => {
    const info = spyOn(console, 'info').mockImplementation(() => {})
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const logger = createConsoleLogger(LogLevel.SILENT)
      logger.info('i')
      logger.warn('w')
      expect(info).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      info.mockRestore()
      warn.mockRestore()
    }
  })

  test('DEBUG emits every level', () => {
    const debug = spyOn(console, 'debug').mockImplementation(() => {})
    const info = spyOn(console, 'info').mockImplementation(() => {})
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const logger = createConsoleLogger(LogLevel.DEBUG)
      logger.debug('d')
      logger.info('i')
      logger.warn('w')
      logger.error('e')
      expect(debug).toHaveBeenCalledTimes(1)
      expect(info).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(error).toHaveBeenCalledTimes(1)
    } finally {
      debug.mockRestore()
      info.mockRestore()
      warn.mockRestore()
      error.mockRestore()
    }
  })
})
