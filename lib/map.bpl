# Map<K,V> hash map implementation O(1)

export [Map];
export [MapIterator];
export [Pair];
export [MapNode];

import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [Iterable], [Iterator] from "std/iter_specs.bpl";
import [Destructible] from "std/core_specs.bpl";
import [String] from "std/string.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

# Default Hasher
frame _mapDefaultHash<T>(val: *T) ret u64 {
    # int/uint/long/ulong (32/64 bit)
    if (typeof<T>() == typeof<int>()) {
        return cast<u64>(*cast<*int>(val));
    }
    if (typeof<T>() == typeof<uint>()) {
        return cast<u64>(*cast<*uint>(val));
    }
    if (typeof<T>() == typeof<long>()) {
        return cast<u64>(*cast<*long>(val));
    }
    if (typeof<T>() == typeof<ulong>()) {
        return *cast<*ulong>(val);
    }
    if (typeof<T>() == typeof<i64>()) {
        return cast<u64>(*cast<*i64>(val));
    }
    if (typeof<T>() == typeof<u64>()) {
        return *cast<*u64>(val);
    }
    if (typeof<T>() == typeof<char>()) {
        return cast<u64>(*cast<*char>(val));
    }
    # string primitive (char*)
    if (typeof<T>() == typeof<string>()) {
        local s: string = *cast<*string>(val);
        if (s == nullptr) {
            return 0;
        }
        # FNV offset basis
        local h: u64 = 14695981039346656037;
        local p: *char = cast<*char>(s);
        loop {
            local c: char = *p;
            if (c == 0) {
                break;
            }
            h = h ^ cast<u64>(c);
            h = h * 1099511628211; # FNV prime
            p = cast<*char>(cast<u64>(p) + 1);
        }
        return h;
    }
    # String struct
    if (typeof<T>() == typeof<String>()) {
        local s: *String = cast<*String>(val);
        return s.hash();
    }
    # Fallback: Treat as bytes? Or address?
    # For now, return 0 to warn user implicitly by performance drop, or address if pointer
    return 0;
}

# Default Equaler
frame _mapDefaultEq<T>(a: *T, b: *T) ret bool {
    # Primitives
    if (typeof<T>() == typeof<int>()) {
        return *cast<*int>(a) == *cast<*int>(b);
    }
    if (typeof<T>() == typeof<uint>()) {
        return *cast<*uint>(a) == *cast<*uint>(b);
    }
    if (typeof<T>() == typeof<long>()) {
        return *cast<*long>(a) == *cast<*long>(b);
    }
    if (typeof<T>() == typeof<ulong>()) {
        return *cast<*ulong>(a) == *cast<*ulong>(b);
    }
    if (typeof<T>() == typeof<i64>()) {
        return *cast<*i64>(a) == *cast<*i64>(b);
    }
    if (typeof<T>() == typeof<u64>()) {
        return *cast<*u64>(a) == *cast<*u64>(b);
    }
    if (typeof<T>() == typeof<char>()) {
        return *cast<*char>(a) == *cast<*char>(b);
    }
    # string primitive
    if (typeof<T>() == typeof<string>()) {
        local s1: string = *cast<*string>(a);
        local s2: string = *cast<*string>(b);
        if (s1 == s2) {
            return true;
        }
        if ((s1 == nullptr) || (s2 == nullptr)) {
            return false;
        }
        local p1: *char = cast<*char>(s1);
        local p2: *char = cast<*char>(s2);
        loop {
            if (*p1 != *p2) {
                return false;
            }
            if (*p1 == 0) {
                return true;
            }
            p1 = cast<*char>(cast<u64>(p1) + 1);
            p2 = cast<*char>(cast<u64>(p2) + 1);
        }
        return true;
    }
    # String struct
    if (typeof<T>() == typeof<String>()) {
        local sa: *String = cast<*String>(a);
        local sb: *String = cast<*String>(b);
        # Call __eq__ by dereferencing b? __eq__ takes value.
        # sa.__eq__(*sb)
        return sa.__eq__(*sb);
    }
    return false;
}

struct Pair<K, V> {
    key: K,
    value: V,
}

struct MapNode<K, V> {
    key: K,
    value: V,
    next: *MapNode<K, V>,
}

struct MapIterator<K, V>: Iterator<Pair<K, V>> {
    map: *Map<K, V>,
    bucketIndex: int,
    currentNode: *MapNode<K, V>,

    frame next(this: *MapIterator<K, V>) ret Option<Pair<K, V>> {
        loop {
            if (this.currentNode != nullptr) {
                local p: Pair<K, V>;
                p.key = this.currentNode.key;
                p.value = this.currentNode.value;
                this.currentNode = this.currentNode.next;
                return Option<Pair<K, V>>.Some(p);
            }
            this.bucketIndex = this.bucketIndex + 1;
            if (this.bucketIndex >= this.map.buckets.len()) {
                return Option<Pair<K, V>>.None;
            }
            this.currentNode = this.map.buckets.get(this.bucketIndex);
        }
        return Option<Pair<K, V>>.None;
    }
}

struct Map<K, V>: Iterable<Pair<K, V>>, Destructible, Equatable<Map<K, V>> {
    buckets: Array<*MapNode<K, V>>,
    count: int,
    hasher: Func<u64>(*K),
    equaler: Func<bool>(*K, *K),

    frame new() ret Map<K, V> {
        return Map<K, V>.new(16, _mapDefaultHash<K>, _mapDefaultEq<K>);
    }

    frame new(initial_capacity: int) ret Map<K, V> {
        return Map<K, V>.new(initial_capacity, _mapDefaultHash<K>, _mapDefaultEq<K>);
    }

    frame new(initial_capacity: int, hasher: Func<u64>(*K), equaler: Func<bool>(*K, *K)) ret Map<K, V> {
        local m: Map<K, V>;
        m.count = 0;
        local cap: int = initial_capacity;
        if (cap < 16) {
            cap = 16;
        }
        m.buckets = Array<*MapNode<K, V>>.new(cap);
        local i: int = 0;
        loop (i < cap) {
            m.buckets.push(nullptr);
            i = i + 1;
        }
        m.hasher = hasher;
        m.equaler = equaler;
        return m;
    }

    frame _getBucketIndex(this: *Map<K, V>, key: K) ret int {
        # Pass pointer to key to hasher
        local hFunc: Func<u64>(*K) = this.hasher;
        local h: u64 = hFunc(&key);

        local len: u64 = cast<u64>(this.buckets.len());
        local idx: u64 = h % len;
        return cast<int>(idx);
    }

    frame set(this: *Map<K, V>, key: K, value: V) {
        local idx: int = this._getBucketIndex(key);
        local head: *MapNode<K, V> = this.buckets.get(idx);
        local current: *MapNode<K, V> = head;
        local eqFunc: Func<bool>(*K, *K) = this.equaler;

        loop (current != nullptr) {
            if (eqFunc(&current.key, &key)) {
                current.value = value;
                return;
            }
            current = current.next;
        }

        local node: *MapNode<K, V> = cast<*MapNode<K, V>>(malloc(sizeof<MapNode<K, V>>()));
        node.key = key;
        node.value = value;
        node.next = head;

        this.buckets.set(idx, node);
        this.count = this.count + 1;
    }

    frame get(this: *Map<K, V>, key: K) ret Option<V> {
        local idx: int = this._getBucketIndex(key);
        local current: *MapNode<K, V> = this.buckets.get(idx);
        local eqFunc: Func<bool>(*K, *K) = this.equaler;

        loop (current != nullptr) {
            if (eqFunc(&current.key, &key)) {
                return Option<V>.Some(current.value);
            }
            current = current.next;
        }
        return Option<V>.None;
    }

    frame has(this: *Map<K, V>, key: K) ret bool {
        local idx: int = this._getBucketIndex(key);
        local current: *MapNode<K, V> = this.buckets.get(idx);
        local eqFunc: Func<bool>(*K, *K) = this.equaler;

        loop (current != nullptr) {
            if (eqFunc(&current.key, &key)) {
                return true;
            }
            current = current.next;
        }
        return false;
    }

    frame remove(this: *Map<K, V>, key: K) ret bool {
        local idx: int = this._getBucketIndex(key);
        local head: *MapNode<K, V> = this.buckets.get(idx);
        local current: *MapNode<K, V> = head;
        local prev: *MapNode<K, V> = nullptr;
        local eqFunc: Func<bool>(*K, *K) = this.equaler;

        loop (current != nullptr) {
            if (eqFunc(&current.key, &key)) {
                if (prev == nullptr) {
                    this.buckets.set(idx, current.next);
                } else {
                    prev.next = current.next;
                }
                free(cast<*void>(current));
                this.count = this.count - 1;
                return true;
            }
            prev = current;
            current = current.next;
        }
        return false;
    }

    frame iterator(this: *Map<K, V>) ret MapIterator<K, V> {
        local it: MapIterator<K, V>;
        it.map = this;
        it.bucketIndex = 0;
        it.currentNode = nullptr;

        if (this.buckets.len() > 0) {
            it.currentNode = this.buckets.get(0);
        }
        return it;
    }

    frame size(this: *Map<K, V>) ret int {
        return this.count;
    }

    frame clear(this: *Map<K, V>) {
        local i: int = 0;
        loop (i < this.buckets.len()) {
            local curr: *MapNode<K, V> = this.buckets.get(i);
            loop (curr != nullptr) {
                local next: *MapNode<K, V> = curr.next;
                free(cast<*void>(curr));
                curr = next;
            }
            this.buckets.set(i, nullptr);
            i = i + 1;
        }
        this.count = 0;
    }

    frame __eq__(this: *Map<K, V>, other: *Map<K, V>) ret bool {
        if (this.count != other.count) {
            return false;
        }
        local it: MapIterator<K, V> = this.iterator();
        loop {
            local opt: Option<Pair<K, V>> = it.next();
            if (opt.isNone()) {
                break;
            }
            local p: Pair<K, V> = opt.unwrap();

            if (!other.has(p.key)) {
                return false;
            }
            local v2: Option<V> = other.get(p.key);
            if (v2.isNone()) {
                return false;
            }
            if (p.value != v2.unwrap()) {
                return false;
            }
        }
        return true;
    }

    frame __ne__(this: *Map<K, V>, other: *Map<K, V>) ret bool {
        return !this.__eq__(other);
    }

    frame destroy(this: *Map<K, V>) {
        this.clear();
        this.buckets.destroy();
    }
}
