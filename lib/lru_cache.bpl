# LruCache<K, V>: a bounded map that evicts the least recently used entry.
#
# Lookups and insertions are O(1) on average: a Map<K, int> indexes slots in
# preallocated arrays linked into a recency list. `get` counts as a use;
# `peek` does not. Keys use the same hashing and equality as Map<K, V>
# (strings by content). The cache does not destroy keys or values; use
# `putEvicting` to receive an evicted entry and release it.

export [LruCache];

import [Option] from "std/option.bpl";
import [Array] from "std/array.bpl";
import [Map] from "std/map.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

struct LruCache<K, V> {
    index: Map<K, int>,
    keys: *K,
    values: *V,
    prev: *int,
    next: *int,
    head: int,
    tail: int,
    freeHead: int,
    count: int,
    cap: int,
    frame new(capacity: int) ret LruCache<K, V> {
        if (capacity < 1) {
            throw "LruCache capacity must be positive";
        }
        local cache: LruCache<K, V>;
        cache.cap = capacity;
        cache.keys = cast<*K>(malloc(cast<long>(capacity) * sizeof<K>()));
        cache.values = cast<*V>(malloc(cast<long>(capacity) * sizeof<V>()));
        cache.prev = cast<*int>(malloc(cast<long>(capacity) * sizeof<int>()));
        cache.next = cast<*int>(malloc(cast<long>(capacity) * sizeof<int>()));
        if ((cache.keys == nullptr) || (cache.values == nullptr) || (cache.prev == nullptr) || (cache.next == nullptr)) {
            free(cast<*void>(cache.keys));
            free(cast<*void>(cache.values));
            free(cast<*void>(cache.prev));
            free(cast<*void>(cache.next));
            throw "LruCache allocation failed";
        }
        cache.index = Map<K, int>.new(capacity);
        cache._reset();
        return cache;
    }

    frame _reset(this: *LruCache<K, V>) {
        this.head = -1;
        this.tail = -1;
        this.count = 0;
        # Every slot starts on the free list, chained through `next`.
        loop (local i: int = 0; i < this.cap; i = i + 1) {
            this.next[i] = i + 1;
        }
        this.next[this.cap - 1] = -1;
        this.freeHead = 0;
    }

    frame destroy(this: *LruCache<K, V>) {
        if (this.keys != nullptr) {
            this.index.destroy();
            free(cast<*void>(this.keys));
            free(cast<*void>(this.values));
            free(cast<*void>(this.prev));
            free(cast<*void>(this.next));
            this.keys = nullptr;
            this.values = nullptr;
            this.prev = nullptr;
            this.next = nullptr;
        }
        this.count = 0;
    }

    frame len(this: *LruCache<K, V>) ret int {
        return this.count;
    }

    frame capacity(this: *LruCache<K, V>) ret int {
        return this.cap;
    }

    frame isEmpty(this: *LruCache<K, V>) ret bool {
        return this.count == 0;
    }

    frame _unlink(this: *LruCache<K, V>, slot: int) {
        local before: int = this.prev[slot];
        local after: int = this.next[slot];
        if (before >= 0) {
            this.next[before] = after;
        } else {
            this.head = after;
        }
        if (after >= 0) {
            this.prev[after] = before;
        } else {
            this.tail = before;
        }
    }

    frame _pushFront(this: *LruCache<K, V>, slot: int) {
        this.prev[slot] = -1;
        this.next[slot] = this.head;
        if (this.head >= 0) {
            this.prev[this.head] = slot;
        }
        this.head = slot;
        if (this.tail < 0) {
            this.tail = slot;
        }
    }

    frame _touch(this: *LruCache<K, V>, slot: int) {
        if (this.head != slot) {
            this._unlink(slot);
            this._pushFront(slot);
        }
    }

    frame has(this: *LruCache<K, V>, key: K) ret bool {
        return this.index.has(key);
    }

    # The value for `key`, marking it most recently used.
    frame get(this: *LruCache<K, V>, key: K) ret Option<V> {
        local found: Option<int> = this.index.get(key);
        if (found.isNone()) {
            return Option<V>.None;
        }
        local slot: int = found.unwrap();
        this._touch(slot);
        return Option<V>.Some(this.values[slot]);
    }

    # The value for `key` without changing its recency.
    frame peek(this: *LruCache<K, V>, key: K) ret Option<V> {
        local found: Option<int> = this.index.get(key);
        if (found.isNone()) {
            return Option<V>.None;
        }
        return Option<V>.Some(this.values[found.unwrap()]);
    }

    /#
        Inserts or replaces `key`, making it most recently used. When a new
        key does not fit, the least recently used entry is evicted; its key
        and value are stored through `evictedKey`/`evictedValue` (either may
        be null) and true is returned.
    #/
    frame putEvicting(this: *LruCache<K, V>, key: K, value: V, evictedKey: *K, evictedValue: *V) ret bool {
        local found: Option<int> = this.index.get(key);
        if (found.isSome()) {
            local existing: int = found.unwrap();
            this.values[existing] = value;
            this._touch(existing);
            return false;
        }
        local evicted: bool = false;
        local slot: int = this.freeHead;
        if (slot < 0) {
            slot = this.tail;
            this._unlink(slot);
            this.index.remove(this.keys[slot]);
            if (evictedKey != nullptr) {
                *evictedKey = this.keys[slot];
            }
            if (evictedValue != nullptr) {
                *evictedValue = this.values[slot];
            }
            this.count = this.count - 1;
            evicted = true;
        } else {
            this.freeHead = this.next[slot];
        }
        this.keys[slot] = key;
        this.values[slot] = value;
        this._pushFront(slot);
        this.index.set(key, slot);
        this.count = this.count + 1;
        return evicted;
    }

    # Inserts or replaces `key`; returns whether an entry was evicted.
    frame put(this: *LruCache<K, V>, key: K, value: V) ret bool {
        return this.putEvicting(key, value, nullptr, nullptr);
    }

    # Removes `key`; returns whether it was present.
    frame remove(this: *LruCache<K, V>, key: K) ret bool {
        local found: Option<int> = this.index.get(key);
        if (found.isNone()) {
            return false;
        }
        local slot: int = found.unwrap();
        this._unlink(slot);
        this.index.remove(key);
        this.next[slot] = this.freeHead;
        this.freeHead = slot;
        this.count = this.count - 1;
        return true;
    }

    # The least recently used key (the next eviction), if any.
    frame oldestKey(this: *LruCache<K, V>) ret Option<K> {
        if (this.tail < 0) {
            return Option<K>.None;
        }
        return Option<K>.Some(this.keys[this.tail]);
    }

    # Keys from most to least recently used.
    frame keysByRecency(this: *LruCache<K, V>) ret Array<K> {
        local out: Array<K> = Array<K>.new(this.count);
        local slot: int = this.head;
        loop (slot >= 0) {
            out.push(this.keys[slot]);
            slot = this.next[slot];
        }
        return out;
    }

    frame clear(this: *LruCache<K, V>) {
        this.index.clear();
        this._reset();
    }
}
