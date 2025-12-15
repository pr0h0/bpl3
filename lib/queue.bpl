# Queue<T> built on Array<T>

export [Queue];

import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";

struct Queue<T> {
    inner: Array<T>,
    frame new(initial_capacity: i32) ret Queue<T> {
        local q: Queue<T>;
        q.inner = Array<T>.new(initial_capacity);
        return q;
    }

    frame destroy(this: *Queue<T>) {
        this.inner.destroy();
    }

    frame enqueue(this: *Queue<T>, value: T) {
        this.inner.push(value);
    }

    frame dequeue(this: *Queue<T>) ret Option<T> {
        local len: i32 = this.inner.len();
        if (len <= 0) {
            return Option<T>.none();
        }
        local first: T = this.inner.get(0);
        # Shift all elements to the left by one
        local i: i32 = 1;
        loop (i < len) {
            local v: T = this.inner.get(i);
            this.inner.set(i - 1, v);
            i = i + 1;
        }
        this.inner.length = len - 1;
        return Option<T>.some(first);
    }

    frame size(this: *Queue<T>) ret i32 {
        return this.inner.len();
    }
}
