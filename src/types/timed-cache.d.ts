declare module 'timed-cache' {
  interface TimedCacheOptions {
    defaultTtl?: number;
  }

  class TimedCache<K, V> {
    constructor(options?: TimedCacheOptions);
    get(key: K): V | undefined;
    set(key: K, value: V, ttl?: number): void;
    put(key: K, value: V, ttl?: number): void;
    delete(key: K): boolean;
    clear(): void;
    has(key: K): boolean;
    size(): number;
  }

  export = TimedCache;
}
