# bpl-cache

An in-memory cache for rendered pages, API responses and computed values.
Entries are evicted least-recently-used first so the cache stays within both
an entry count and a byte budget, and each entry can expire after a
time-to-live.

```bpl
import [Cache] from "bpl-cache";
import [String] from "std/string.bpl";
import printf from "std/c.bpl";

frame renderPage(_path: string) ret String {
    return String.new("<h1>expensive page</h1>");
}

frame main() ret int {
    local pages: Cache = Cache.new(1000, 8388608);
    local html: string = pages.getOrCompute("page:/about", 30000, renderPage);
    printf("%s (%ld bytes cached)\n", html, pages.byteSize());
    pages.delete("page:/about");
    pages.destroy();
    return 0;
}
```

## API

- `Cache.new(maxEntries, maxBytes)`: limits of 1 to 1000000 entries and at
  least one byte. Only value bytes count toward the budget; keys and
  bookkeeping are extra.
- `set(key, value)`, `setFor(key, value, ttlMs)` and
  `setBytes(key, data, size, ttlMs)` copy the key and value. A TTL of 0 never
  expires; `set` uses `setDefaultTtl(ms)` (0 by default). Replacing a key
  keeps one entry. A value larger than the whole budget is not stored and the
  call returns false (any previous value for the key is removed).
- `get(key)` returns `Option<string>` and marks the entry most recently used.
  The string is **borrowed**: it stays valid only until that entry is
  replaced, deleted or evicted, and any later `set` may evict it. Use
  `getCopy(key)` for an owned `String`, and `getBytes(key, &size)` for binary
  values.
- `getOrCompute(key, ttlMs, compute)` returns the cached value or calls
  `compute(key)` (a `Lambda<String>(string)`), caches the result and returns
  it, borrowed like `get`.
- `has(key)` checks presence without counting a hit or refreshing recency;
  `ttl(key)` returns the remaining milliseconds (`0` = no expiry, `-1` =
  absent).
- `delete(key)`, `deletePrefix(prefix)` (for example `"user:42:"`), `prune()`
  (drop expired entries now; lookups also drop them lazily), `clear()`,
  `keys()` (most to least recent, borrowed), `size()`, `byteSize()`.
- `stats` counts `hits`, `misses`, `evictions` and `expirations`.
- `setClock(clock)` replaces the millisecond clock (`std/time.bpl` monotonic
  time by default) with any `Lambda<long>()`, which makes expiry testable.

Operations are O(1) on average (hash index plus a linked LRU list), except
`deletePrefix`, `prune` and `keys`, which walk all entries.

The cache is plain process memory: it is not shared between `listenWorkers`
processes, not persisted, and not synchronized for threads. Cache only data
every user may see, or put the user or tenant id in the key.
