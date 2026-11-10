# Open-addressing hash maps with linear probing for hot paths.
#
# LongMap maps nonnegative-or-any long keys to long values. Deletion uses
# backward-shift so no tombstones accumulate. StrIndex interns strings to
# dense integer ids (the order engine uses it for symbols and accounts).

import malloc, free, memset, strcmp from "std/c.bpl";
import [Text] from "./text.bpl";

export [LongMap];
export [StrIndex];

struct LongMap {
    keys: *long,
    values: *long,
    used: *bool,
    cap: int,
    count: int,

    frame new(capacity: int) ret LongMap {
        local c: int = 16;
        loop (c < (capacity * 2)) {
            c = c * 2;
        }
        local m: LongMap;
        m.cap = c;
        m.count = 0;
        m.keys = cast<*long>(malloc(cast<long>(c) * sizeof(long)));
        m.values = cast<*long>(malloc(cast<long>(c) * sizeof(long)));
        m.used = cast<*bool>(malloc(cast<long>(c)));
        memset(cast<*void>(m.used), 0, cast<long>(c));
        return m;
    }

    frame destroy(this: *LongMap) {
        if (this.keys != nullptr) {
            free(cast<*void>(this.keys));
            free(cast<*void>(this.values));
            free(cast<*void>(this.used));
            this.keys = nullptr;
            this.values = nullptr;
            this.used = nullptr;
        }
        this.count = 0;
        this.cap = 0;
    }

    frame slot(this: *LongMap, key: long) ret int {
        local h: u64 = cast<u64>(key);
        h = (h ^ (h >> cast<u64>(33))) * 0xFF51AFD7ED558CCD;
        h = (h ^ (h >> cast<u64>(33))) * 0xC4CEB9FE1A85EC53;
        h = h ^ (h >> cast<u64>(33));
        return cast<int>(h & cast<u64>(this.cap - 1));
    }

    frame grow(this: *LongMap) {
        local old_keys: *long = this.keys;
        local old_values: *long = this.values;
        local old_used: *bool = this.used;
        local old_cap: int = this.cap;
        this.cap = old_cap * 2;
        this.keys = cast<*long>(malloc(cast<long>(this.cap) * sizeof(long)));
        this.values = cast<*long>(malloc(cast<long>(this.cap) * sizeof(long)));
        this.used = cast<*bool>(malloc(cast<long>(this.cap)));
        memset(cast<*void>(this.used), 0, cast<long>(this.cap));
        this.count = 0;
        loop (local i: int = 0; i < old_cap; i = i + 1) {
            if (old_used[i]) {
                this.put(old_keys[i], old_values[i]);
            }
        }
        free(cast<*void>(old_keys));
        free(cast<*void>(old_values));
        free(cast<*void>(old_used));
    }

    frame put(this: *LongMap, key: long, value: long) {
        if (((this.count + 1) * 4) > (this.cap * 3)) {
            this.grow();
        }
        local i: int = this.slot(key);
        loop {
            if (!this.used[i]) {
                this.used[i] = true;
                this.keys[i] = key;
                this.values[i] = value;
                this.count = this.count + 1;
                return;
            }
            if (this.keys[i] == key) {
                this.values[i] = value;
                return;
            }
            i = (i + 1) & (this.cap - 1);
        }
    }

    frame find(this: *LongMap, key: long) ret int {
        local i: int = this.slot(key);
        loop {
            if (!this.used[i]) {
                return -1;
            }
            if (this.keys[i] == key) {
                return i;
            }
            i = (i + 1) & (this.cap - 1);
        }
        return -1;
    }

    frame has(this: *LongMap, key: long) ret bool {
        return this.find(key) >= 0;
    }

    frame getOr(this: *LongMap, key: long, fallback: long) ret long {
        local i: int = this.find(key);
        if (i < 0) {
            return fallback;
        }
        return this.values[i];
    }

    # Backward-shift deletion keeps probe sequences intact without tombstones.
    frame remove(this: *LongMap, key: long) ret bool {
        local i: int = this.find(key);
        if (i < 0) {
            return false;
        }
        local mask: int = this.cap - 1;
        local j: int = i;
        loop {
            j = (j + 1) & mask;
            if (!this.used[j]) {
                break;
            }
            local home: int = this.slot(this.keys[j]);
            # Move j back to i if its home is cyclically outside (i, j].
            local between: bool = false;
            if (i <= j) {
                between = (home > i) && (home <= j);
            } else {
                between = (home > i) || (home <= j);
            }
            if (!between) {
                this.keys[i] = this.keys[j];
                this.values[i] = this.values[j];
                i = j;
            }
        }
        this.used[i] = false;
        this.count = this.count - 1;
        return true;
    }

    frame clear(this: *LongMap) {
        memset(cast<*void>(this.used), 0, cast<long>(this.cap));
        this.count = 0;
    }
}

struct StrIndex {
    names: *string,
    count: int,
    cap: int,
    table: *int,
    table_cap: int,

    frame new(capacity: int) ret StrIndex {
        local s: StrIndex;
        s.cap = capacity < 8 ? 8 : capacity;
        s.names = cast<*string>(malloc(cast<long>(s.cap) * sizeof(string)));
        s.count = 0;
        s.table_cap = 16;
        loop (s.table_cap < (s.cap * 2)) {
            s.table_cap = s.table_cap * 2;
        }
        s.table = cast<*int>(malloc(cast<long>(s.table_cap) * sizeof(int)));
        loop (local i: int = 0; i < s.table_cap; i = i + 1) {
            s.table[i] = -1;
        }
        return s;
    }

    frame destroy(this: *StrIndex) {
        loop (local i: int = 0; i < this.count; i = i + 1) {
            Text.release(this.names[i]);
        }
        if (this.names != nullptr) {
            free(cast<*void>(this.names));
            free(cast<*void>(this.table));
            this.names = nullptr;
            this.table = nullptr;
        }
        this.count = 0;
    }

    frame bucket(this: *StrIndex, name: string) ret int {
        return cast<int>(Text.fnv1a(name) & cast<u64>(this.table_cap - 1));
    }

    frame find(this: *StrIndex, name: string) ret int {
        local i: int = this.bucket(name);
        loop {
            local id: int = this.table[i];
            if (id < 0) {
                return -1;
            }
            if (strcmp(this.names[id], name) == 0) {
                return id;
            }
            i = (i + 1) & (this.table_cap - 1);
        }
        return -1;
    }

    frame rehash(this: *StrIndex) {
        free(cast<*void>(this.table));
        this.table_cap = this.table_cap * 2;
        this.table = cast<*int>(malloc(cast<long>(this.table_cap) * sizeof(int)));
        loop (local i: int = 0; i < this.table_cap; i = i + 1) {
            this.table[i] = -1;
        }
        loop (local id: int = 0; id < this.count; id = id + 1) {
            local b: int = this.bucket(this.names[id]);
            loop (this.table[b] >= 0) {
                b = (b + 1) & (this.table_cap - 1);
            }
            this.table[b] = id;
        }
    }

    # Returns the id for name, adding a copy of it if new.
    frame intern(this: *StrIndex, name: string) ret int {
        local existing: int = this.find(name);
        if (existing >= 0) {
            return existing;
        }
        if (this.count == this.cap) {
            local next: *string = cast<*string>(malloc(cast<long>(this.cap * 2) * sizeof(string)));
            loop (local i: int = 0; i < this.count; i = i + 1) {
                next[i] = this.names[i];
            }
            free(cast<*void>(this.names));
            this.names = next;
            this.cap = this.cap * 2;
        }
        local id: int = this.count;
        this.names[id] = Text.copy(name);
        this.count = this.count + 1;
        if ((this.count * 2) > this.table_cap) {
            this.rehash();
        } else {
            local b: int = this.bucket(name);
            loop (this.table[b] >= 0) {
                b = (b + 1) & (this.table_cap - 1);
            }
            this.table[b] = id;
        }
        return id;
    }

    frame name(this: *StrIndex, id: int) ret string {
        if ((id < 0) || (id >= this.count)) {
            return nullptr;
        }
        return this.names[id];
    }
}
