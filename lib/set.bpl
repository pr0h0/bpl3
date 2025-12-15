# Set<T> built on Map<T, bool>

export [Set];

import [Map] from "std/map.bpl";

struct Set<T> {
    inner: Map<T, bool>,
    frame new(initial_capacity: i32) ret Set<T> {
        local s: Set<T>;
        s.inner = Map<T, bool>.new(initial_capacity);
        return s;
    }

    frame destroy(this: *Set<T>) {
        this.inner.destroy();
    }

    frame add(this: *Set<T>, value: T) {
        this.inner.set(value, true);
    }

    frame has(this: *Set<T>, value: T) ret bool {
        return this.inner.has(value);
    }

    frame remove(this: *Set<T>, value: T) ret bool {
        return this.inner.remove(value);
    }

    frame size(this: *Set<T>) ret i32 {
        return this.inner.size();
    }
}
