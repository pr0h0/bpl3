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
        local idx: int = cast<int>((cast<long>(this.queue.head) + cast<long>(this.index)) % cast<long>(this.queue.inner.capacity));
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
        if (initial_capacity < 0) {
            initial_capacity = 0;
        }
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
        this.clear();
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
        # Compute growth before narrowing, and reject an exhausted capacity
        # before allocating or changing the current queue.
        local grown: long = cast<long>(this.inner.capacity) * cast<long>(2);
        if (grown == cast<long>(0)) { grown = cast<long>(4); }
        if (grown > cast<long>(2147483647)) { grown = cast<long>(2147483647); }
        if (grown <= cast<long>(this.inner.capacity)) {
            throw "Queue capacity exceeded";
        }
        local new_cap: int = cast<int>(grown);
        local new_arr: Array<T> = Array<T>.new(new_cap);
        new_arr.length = new_cap; # Allow access to all slots

        local i: int = 0;
        loop (i < this.count) {
            local idx: int = cast<int>((cast<long>(this.head) + cast<long>(i)) % cast<long>(this.inner.capacity));
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
