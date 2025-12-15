# Map<K,V> simple associative array using Array<Pair<K,V>>

export [Map];

import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";

struct Pair<K, V> {
    key: K,
    value: V,
}

struct Map<K, V> {
    items: Array<Pair<K, V>>,
    frame new(initial_capacity: i32) ret Map<K, V> {
        local m: Map<K, V>;
        m.items = Array<Pair<K, V>>.new(initial_capacity);
        return m;
    }

    frame destroy(this: *Map<K, V>) {
        this.items.destroy();
    }

    frame size(this: *Map<K, V>) ret i32 {
        return this.items.len();
    }

    frame set(this: *Map<K, V>, key: K, value: V) {
        # Find if key exists
        local i: i32 = 0;
        local n: i32 = this.items.len();
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
        local i: i32 = 0;
        local n: i32 = this.items.len();
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
        local i: i32 = 0;
        local n: i32 = this.items.len();
        loop (i < n) {
            local p: Pair<K, V> = this.items.get(i);
            if (p.key == key) {
                return Option<V>.some(p.value);
            }
            i = i + 1;
        }
        return Option<V>.none();
    }

    frame remove(this: *Map<K, V>, key: K) ret bool {
        local i: i32 = 0;
        local n: i32 = this.items.len();
        loop (i < n) {
            local p: Pair<K, V> = this.items.get(i);
            if (p.key == key) {
                # Shift left from i+1
                local j: i32 = i + 1;
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
}
