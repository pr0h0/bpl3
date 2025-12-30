# Map<K,V> simple associative array using Array<Pair<K,V>>

export [Map];
export [MapIterator];

import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [Iterable], [Iterator] from "std/iter_specs.bpl";
import [Destructible] from "std/core_specs.bpl";

struct Pair<K, V> {
    key: K,
    value: V,
}
export [Pair];

struct MapIterator<K, V>: Iterator<Pair<K, V>> {
    map: *Map<K, V>,
    index: int,
    frame next(this: *MapIterator<K, V>) ret Option<Pair<K, V>> {
        if (this.index >= this.map.items.len()) {
            return Option<Pair<K, V>>.None;
        }
        local p: Pair<K, V> = this.map.items.get(this.index);
        this.index = this.index + 1;
        return Option<Pair<K, V>>.Some(p);
    }
}

struct Map<K, V>: Iterable<Pair<K, V>>, Destructible {
    items: Array<Pair<K, V>>,
    frame new(initial_capacity: int) ret Map<K, V> {
        local m: Map<K, V>;
        m.items = Array<Pair<K, V>>.new(initial_capacity);
        return m;
    }

    frame iterator(this: *Map<K, V>) ret MapIterator<K, V> {
        local it: MapIterator<K, V>;
        it.map = this;
        it.index = 0;
        return it;
    }

    frame destroy(this: *Map<K, V>) {
        this.items.destroy();
    }

    frame size(this: *Map<K, V>) ret int {
        return this.items.len();
    }

    frame set(this: *Map<K, V>, key: K, value: V) {
        # Find if key exists
        local i: int = 0;
        local n: int = this.items.len();
        loop (i < n) {
            local p: Pair<K, V> = this.items.get(i);
            if (p.key == key) {
                p.value = value;
                this.items.set(i, p);
                return;
            }
            i = i + 1;
        }
        # Add new pair
        local np: Pair<K, V>;
        np.key = key;
        np.value = value;
        this.items.push(np);
    }

    frame has(this: *Map<K, V>, key: K) ret bool {
        local i: int = 0;
        local n: int = this.items.len();
        loop (i < n) {
            local p: Pair<K, V> = this.items.get(i);
            if (p.key == key) {
                return true;
            }
            i = i + 1;
        }
        return false;
    }

    frame get(this: *Map<K, V>, key: K) ret Option<V> {
        local i: int = 0;
        local n: int = this.items.len();
        loop (i < n) {
            local p: Pair<K, V> = this.items.get(i);
            if (p.key == key) {
                return Option<V>.Some(p.value);
            }
            i = i + 1;
        }
        return Option<V>.None;
    }

    frame remove(this: *Map<K, V>, key: K) ret bool {
        local i: int = 0;
        local n: int = this.items.len();
        loop (i < n) {
            local p: Pair<K, V> = this.items.get(i);
            if (p.key == key) {
                # Shift left from i+1
                local j: int = i + 1;
                loop (j < n) {
                    local pj: Pair<K, V> = this.items.get(j);
                    this.items.set(j - 1, pj);
                    j = j + 1;
                }
                this.items.length = n - 1;
                return true;
            }
            i = i + 1;
        }
        return false;
    }

    frame clear(this: *Map<K, V>) {
        this.items.length = 0;
    }

    frame getKey(this: *Map<K, V>, index: int) ret K {
        local p: Pair<K, V> = this.items.get(index);
        return p.key;
    }

    frame getValue(this: *Map<K, V>, index: int) ret V {
        local p: Pair<K, V> = this.items.get(index);
        return p.value;
    }

    # Operator overloading: Equality comparison
    # Two maps are equal if they have the same size and all key-value pairs match
    frame __eq__(this: *Map<K, V>, other: Map<K, V>) ret bool {
        if (this.size() != other.size()) {
            return false;
        }
        # Check if all key-value pairs in this map exist in other
        local i: int = 0;
        local n: int = this.size();
        loop (i < n) {
            local thisKey: K = this.getKey(i);
            local thisValue: V = this.getValue(i);
            local otherVal: Option<V> = other.get(thisKey);

            # Key doesn't exist in other map
            if (otherVal.isNone()) {
                return false;
            }
            # Values don't match
            local val: V = otherVal.unwrap();
            if (val != thisValue) {
                return false;
            }
            i = i + 1;
        }

        return true;
    }

    # Operator overloading: Inequality comparison
    frame __ne__(this: *Map<K, V>, other: Map<K, V>) ret bool {
        return !this.__eq__(other);
    }
}
