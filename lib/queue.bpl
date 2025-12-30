# Queue<T> optimized with circular buffer

export [Queue];
export [QueueIterator];

import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [Iterable], [Iterator] from "std/iter_specs.bpl";
import [Destructible] from "std/core_specs.bpl";

struct QueueIterator<T>: Iterator<T> {
    queue: *Queue<T>,
    index: int,
    frame next(this: *QueueIterator<T>) ret Option<T> {
        if (this.index >= this.queue.count) {
            return Option<T>.None;
        }
        local idx: int = (this.queue.head + this.index) % this.queue.inner.capacity;
        local val: T = this.queue.inner.get(idx);
        this.index = this.index + 1;
        return Option<T>.Some(val);
    }
}

struct Queue<T>: Iterable<T>, Destructible {
    inner: Array<T>,
    head: int,
    tail: int,
    count: int,
    frame new(initial_capacity: int) ret Queue<T> {
        local q: Queue<T>;
        q.inner = Array<T>.new(initial_capacity);
        # Hack: set length to capacity so we can use set() on any index
        q.inner.length = initial_capacity;
        q.head = 0;
        q.tail = 0;
        q.count = 0;
        return q;
    }

    frame iterator(this: *Queue<T>) ret QueueIterator<T> {
        local it: QueueIterator<T>;
        it.queue = this;
        it.index = 0;
        return it;
    }

    frame destroy(this: *Queue<T>) {
        this.inner.destroy();
    }

    frame enqueue(this: *Queue<T>, value: T) {
        if (this.count == this.inner.capacity) {
            this.resize();
        }
        this.inner.set(this.tail, value);
        this.tail = (this.tail + 1) % this.inner.capacity;
        this.count = this.count + 1;
    }

    frame dequeue(this: *Queue<T>) ret Option<T> {
        if (this.count == 0) {
            return Option<T>.None;
        }
        local value: T = this.inner.get(this.head);
        this.head = (this.head + 1) % this.inner.capacity;
        this.count = this.count - 1;
        return Option<T>.Some(value);
    }

    frame resize(this: *Queue<T>) {
        local new_cap: int = this.inner.capacity * 2;
        if (new_cap == 0) {
            new_cap = 4;
        }
        local new_arr: Array<T> = Array<T>.new(new_cap);
        new_arr.length = new_cap; # Allow access to all slots

        local i: int = 0;
        loop (i < this.count) {
            local idx: int = (this.head + i) % this.inner.capacity;
            new_arr.set(i, this.inner.get(idx));
            i = i + 1;
        }

        this.inner.destroy();
        this.inner = new_arr;
        this.head = 0;
        this.tail = this.count;
    }

    frame size(this: *Queue<T>) ret int {
        return this.count;
    }

    frame isEmpty(this: *Queue<T>) ret bool {
        return this.count == 0;
    }

    frame peek(this: *Queue<T>) ret Option<T> {
        if (this.count == 0) {
            return Option<T>.None;
        }
        return Option<T>.Some(this.inner.get(this.head));
    }

    frame clear(this: *Queue<T>) {
        this.head = 0;
        this.tail = 0;
        this.count = 0;
    }

    # Operator overloading: Enqueue with << operator
    # Usage: queue << value
    frame __lshift__(this: *Queue<T>, value: T) ret *Queue<T> {
        this.enqueue(value);
        return this;
    }
}
