# In-memory LRU cache with per-entry time-to-live and byte budget.

import [Array] from "std/array.bpl";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";
import [Time] from "std/time.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;
extern memcpy(dest: *void, src: *void, size: ulong) ret *void;

export [Cache];
export [CacheStats];
export [CacheClock];

type CacheClock = Lambda<long>();

frame cacheSystemClock() ret long {
    return Time.monotonicMs();
}

struct CacheEntry {
    # Owned; also the map key. nullptr marks a free slot.
    key: string,
    # Owned copy of the value with a trailing NUL (not counted in size).
    value: string,
    size: long,
    # Absolute expiry in clock milliseconds; 0 never expires.
    expires_at: long,
    # LRU links (slot indexes, -1 for none). head is most recent.
    newer: int,
    older: int,
}

struct CacheStats {
    hits: long,
    misses: long,
    evictions: long,
    expirations: long,
}

struct Cache {
    slots: Array<CacheEntry>,
    index: Map<string, int>,
    free_slots: Array<int>,
    head: int,
    tail: int,
    count: int,
    bytes: long,
    max_entries: int,
    max_bytes: long,
    default_ttl_ms: long,
    clock: CacheClock,
    stats: CacheStats,

    # `maxEntries` (1 to 1000000) and `maxBytes` (1 or more) bound the cache;
    # the least recently used entries are evicted to stay within both.
    frame new(maxEntries: int, maxBytes: long) ret Cache {
        if ((maxEntries < 1) || (maxEntries > 1000000) || (maxBytes < 1)) {
            throw "Cache limits must be 1 to 1000000 entries and at least 1 byte";
        }
        local cache: Cache;
        cache.slots = Array<CacheEntry>.new(0);
        cache.index = Map<string, int>.new();
        cache.free_slots = Array<int>.new(0);
        cache.head = -1;
        cache.tail = -1;
        cache.count = 0;
        cache.bytes = 0;
        cache.max_entries = maxEntries;
        cache.max_bytes = maxBytes;
        cache.default_ttl_ms = 0;
        cache.clock = cacheSystemClock;
        cache.stats.hits = 0;
        cache.stats.misses = 0;
        cache.stats.evictions = 0;
        cache.stats.expirations = 0;
        return cache;
    }
    # TTL for set() without an explicit ttl; 0 (the default) never expires.
    frame setDefaultTtl(this: *Cache, ttlMs: long) {
        if (ttlMs < 0) {
            throw "Cache TTL cannot be negative";
        }
        this.default_ttl_ms = ttlMs;
    }
    # Replaces the millisecond clock (monotonic by default), e.g. in tests.
    frame setClock(this: *Cache, clock: CacheClock) {
        this.clock = clock;
    }
    frame size(this: *Cache) ret int {
        return this.count;
    }
    frame byteSize(this: *Cache) ret long {
        return this.bytes;
    }

    frame unlink(this: *Cache, slot: int) {
        local entry: *CacheEntry = this.slots.getRef(slot);
        if (entry.newer >= 0) {
            this.slots.getRef(entry.newer).older = entry.older;
        } else {
            this.head = entry.older;
        }
        if (entry.older >= 0) {
            this.slots.getRef(entry.older).newer = entry.newer;
        } else {
            this.tail = entry.newer;
        }
        entry.newer = -1;
        entry.older = -1;
    }
    frame linkFront(this: *Cache, slot: int) {
        local entry: *CacheEntry = this.slots.getRef(slot);
        entry.newer = -1;
        entry.older = this.head;
        if (this.head >= 0) {
            this.slots.getRef(this.head).newer = slot;
        }
        this.head = slot;
        if (this.tail < 0) {
            this.tail = slot;
        }
    }
    frame release(this: *Cache, slot: int) {
        local entry: *CacheEntry = this.slots.getRef(slot);
        this.unlink(slot);
        this.index.remove(entry.key);
        free(entry.key);
        free(entry.value);
        this.bytes = this.bytes - entry.size;
        entry.key = nullptr;
        entry.value = nullptr;
        entry.size = 0;
        this.count = this.count - 1;
        this.free_slots.push(slot);
    }
    frame expired(this: *Cache, slot: int, now: long) ret bool {
        local entry: *CacheEntry = this.slots.getRef(slot);
        return (entry.expires_at != 0) && (now >= entry.expires_at);
    }
    # Live slot for `key`, dropping it first when expired; -1 when absent.
    frame find(this: *Cache, key: string) ret int {
        if (key == nullptr) {
            return -1;
        }
        local found: Option<int> = this.index.get(key);
        if (!found.isSome()) {
            return -1;
        }
        local slot: int = found.unwrap();
        if (this.expired(slot, this.clock())) {
            this.release(slot);
            this.stats.expirations = this.stats.expirations + 1;
            return -1;
        }
        return slot;
    }

    frame set(this: *Cache, key: string, value: string) ret bool {
        return this.setBytes(key, value, strlen(value), this.default_ttl_ms);
    }
    frame setFor(this: *Cache, key: string, value: string, ttlMs: long) ret bool {
        return this.setBytes(key, value, strlen(value), ttlMs);
    }
    # Copies `size` bytes. Returns false (and stores nothing) when the value
    # alone exceeds the byte budget. ttlMs 0 never expires.
    frame setBytes(this: *Cache, key: string, value: string, size: long, ttlMs: long) ret bool {
        if ((key == nullptr) || (value == nullptr) || (size < 0) || (ttlMs < 0)) {
            throw "Cache set requires a key, value, size and non-negative TTL";
        }
        local existing: Option<int> = this.index.get(key);
        if (existing.isSome()) {
            this.release(existing.unwrap());
        }
        if (size > this.max_bytes) {
            return false;
        }
        loop ((this.count >= this.max_entries) || ((this.bytes + size) > this.max_bytes)) {
            this.release(this.tail);
            this.stats.evictions = this.stats.evictions + 1;
        }
        local keyLength: long = strlen(key);
        local keyCopy: string = cast<string>(malloc(keyLength + 1));
        local valueCopy: string = cast<string>(malloc(size + 1));
        if ((keyCopy == nullptr) || (valueCopy == nullptr)) {
            free(keyCopy);
            free(valueCopy);
            throw "Cache allocation failed";
        }
        memcpy(keyCopy, key, cast<ulong>(keyLength + 1));
        memcpy(valueCopy, value, cast<ulong>(size));
        valueCopy[size] = 0;
        local entry: CacheEntry;
        entry.key = keyCopy;
        entry.value = valueCopy;
        entry.size = size;
        entry.expires_at = 0;
        if (ttlMs > 0) {
            entry.expires_at = this.clock() + ttlMs;
        }
        entry.newer = -1;
        entry.older = -1;
        local slot: int = 0;
        if (this.free_slots.len() > 0) {
            slot = this.free_slots.pop();
            this.slots.set(slot, entry);
        } else {
            slot = this.slots.len();
            this.slots.push(entry);
        }
        this.index.set(keyCopy, slot);
        this.linkFront(slot);
        this.count = this.count + 1;
        this.bytes = this.bytes + size;
        return true;
    }

    # Borrowed value, valid until the entry is replaced, evicted or removed
    # (any later set can evict it). Marks the entry most recently used.
    frame get(this: *Cache, key: string) ret Option<string> {
        local slot: int = this.find(key);
        if (slot < 0) {
            this.stats.misses = this.stats.misses + 1;
            return Option<string>.None;
        }
        this.stats.hits = this.stats.hits + 1;
        this.unlink(slot);
        this.linkFront(slot);
        return Option<string>.Some(this.slots.getRef(slot).value);
    }
    # Like get, returning the byte length through `size` (binary values).
    frame getBytes(this: *Cache, key: string, size: *long) ret string {
        local found: Option<string> = this.get(key);
        if (!found.isSome()) {
            size[0] = 0;
            return nullptr;
        }
        size[0] = this.slots.getRef(this.index.get(key).unwrap()).size;
        return found.unwrap();
    }
    # Owned copy, safe to keep across later cache calls.
    frame getCopy(this: *Cache, key: string) ret Option<String> {
        local found: Option<string> = this.get(key);
        if (!found.isSome()) {
            return Option<String>.None;
        }
        return Option<String>.Some(String.new(found.unwrap()));
    }
    # Presence check that neither counts as a hit nor refreshes recency.
    frame has(this: *Cache, key: string) ret bool {
        return this.find(key) >= 0;
    }
    # Remaining lifetime in ms: -1 when absent, 0 when it never expires.
    frame ttl(this: *Cache, key: string) ret long {
        local slot: int = this.find(key);
        if (slot < 0) {
            return -1;
        }
        local entry: *CacheEntry = this.slots.getRef(slot);
        if (entry.expires_at == 0) {
            return 0;
        }
        return entry.expires_at - this.clock();
    }
    # Returns the cached value, or calls `compute` on a miss and caches its
    # result for `ttlMs`. The result is borrowed like get().
    frame getOrCompute(this: *Cache, key: string, ttlMs: long, compute: Lambda<String>(string)) ret string {
        local found: Option<string> = this.get(key);
        if (found.isSome()) {
            return found.unwrap();
        }
        local computed: String = compute(key);
        local owner: *String = &computed;
        defer owner.destroy();
        if (!this.setBytes(key, computed.data, cast<long>(computed.length), ttlMs)) {
            throw "Computed cache value exceeds the byte budget";
        }
        return this.slots.getRef(this.index.get(key).unwrap()).value;
    }
    frame delete(this: *Cache, key: string) ret bool {
        local slot: int = this.find(key);
        if (slot < 0) {
            return false;
        }
        this.release(slot);
        return true;
    }
    # Removes every entry whose key starts with `prefix`; returns the count.
    frame deletePrefix(this: *Cache, prefix: string) ret int {
        local removed: int = 0;
        local length: long = strlen(prefix);
        local slot: int = this.head;
        loop (slot >= 0) {
            local entry: *CacheEntry = this.slots.getRef(slot);
            local next: int = entry.older;
            local matches: bool = true;
            loop (local i: long = 0; i < length; i = i + 1) {
                if (entry.key[i] != prefix[i]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                this.release(slot);
                removed = removed + 1;
            }
            slot = next;
        }
        return removed;
    }
    # Drops expired entries now (lookups also drop them lazily).
    frame prune(this: *Cache) ret int {
        local now: long = this.clock();
        local removed: int = 0;
        local slot: int = this.head;
        loop (slot >= 0) {
            local next: int = this.slots.getRef(slot).older;
            if (this.expired(slot, now)) {
                this.release(slot);
                this.stats.expirations = this.stats.expirations + 1;
                removed = removed + 1;
            }
            slot = next;
        }
        return removed;
    }
    # Keys from most to least recently used (borrowed).
    frame keys(this: *Cache) ret Array<string> {
        local result: Array<string> = Array<string>.new(this.count);
        local slot: int = this.head;
        loop (slot >= 0) {
            local entry: *CacheEntry = this.slots.getRef(slot);
            result.push(entry.key);
            slot = entry.older;
        }
        return result;
    }
    frame clear(this: *Cache) {
        loop (this.head >= 0) {
            this.release(this.head);
        }
    }
    frame destroy(this: *Cache) {
        this.clear();
        this.slots.destroy();
        this.index.destroy();
        this.free_slots.destroy();
    }
}
