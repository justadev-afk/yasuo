import { type Clock, systemClock } from '../util'
import type { CachedResult, CacheStore } from './cache-store'

/** Options for an in-memory {@link MemoryCache}. */
export interface MemoryCacheOptions {
  /** Maximum number of entries before the oldest are evicted. Default `10000`. */
  maxEntries?: number
  /** Injectable clock, primarily for tests. */
  clock?: Clock
}

interface MemoryEntry {
  value: CachedResult
  expiresAt: number
}

/**
 * A zero-dependency in-memory {@link CacheStore} with per-entry TTL and a
 * simple insertion-order (FIFO) eviction bound. The default store when the
 * cache is enabled without a custom backend.
 */
export class MemoryCache implements CacheStore {
  private readonly store = new Map<string, MemoryEntry>()
  private readonly maxEntries: number
  private readonly clock: Clock

  constructor(options: MemoryCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 10_000
    this.clock = options.clock ?? systemClock
  }

  get(key: string): CachedResult | undefined {
    const entry = this.store.get(key)
    if (!entry) {
      return undefined
    }
    if (entry.expiresAt <= this.clock()) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: CachedResult, ttlMs: number): void {
    if (ttlMs <= 0) {
      return
    }
    // Refresh insertion order so recently-set keys survive eviction longest.
    this.store.delete(key)
    this.store.set(key, { value, expiresAt: this.clock() + ttlMs })
    if (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) {
        this.store.delete(oldest)
      }
    }
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  /** Current number of (possibly expired) entries. */
  get size(): number {
    return this.store.size
  }
}
