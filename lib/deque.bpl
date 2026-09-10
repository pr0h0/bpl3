# Growable double-ended queue. Elements are shallow copies; callers own their resources.
export [Deque];
export [DequeIterator];

import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [Iterable], [Iterator] from "std/iter_specs.bpl";
import [Destructible] from "std/core_specs.bpl";

struct DequeIterator<T>: Iterator<T> {
    deque: *Deque<T>,
    index: int,
    frame next(this: *DequeIterator<T>) ret Option<T> {
        if (this.index >= this.deque.count) {
            return Option<T>.None;
        }
        local value: Option<T> = this.deque.get(this.index);
        this.index = this.index + 1;
        return value;
    }
}

struct Deque<T>: Iterable<T>, Destructible {
    inner: Array<T>,
    head: int,
    count: int,

    frame new() ret Deque<T> {
        return Deque<T>.new(8);
    }

    frame new(initialCapacity: int) ret Deque<T> {
        if (initialCapacity < 0) {
            initialCapacity = 0;
        }
        local deque: Deque<T>;
        deque.inner = Array<T>.new(initialCapacity);
        if ((initialCapacity > 0) && (deque.inner.data == nullptr)) {
            throw "Deque allocation failed";
        }
        deque.inner.length = initialCapacity;
        deque.head = 0;
        deque.count = 0;
        return deque;
    }

    frame size(this: *Deque<T>) ret int {
        return this.count;
    }

    frame capacity(this: *Deque<T>) ret int {
        return this.inner.capacity;
    }

    frame isEmpty(this: *Deque<T>) ret bool {
        return this.count == 0;
    }

    # Avoid head + offset overflow, even for large buffers.
    frame physicalIndex(this: *Deque<T>, offset: int) ret int {
        local untilEnd: int = this.inner.capacity - this.head;
        if (offset >= untilEnd) {
            return offset - untilEnd;
        }
        return this.head + offset;
    }

    frame reserve(this: *Deque<T>, minimum: int) {
        if (minimum <= this.inner.capacity) {
            return;
        }
        local next: int = this.inner.capacity;
        if (next < 4) {
            next = 4;
        }
        loop (next < minimum) {
            if (next > 1073741823) {
                next = minimum;
            } else {
                next = next * 2;
            }
        }
        local replacement: Array<T> = Array<T>.new(next);
        if (replacement.data == nullptr) {
            throw "Deque allocation failed";
        }
        replacement.length = next;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            replacement.set(i, this.inner.get(this.physicalIndex(i)));
        }
        this.inner.destroy();
        this.inner = replacement;
        this.head = 0;
    }

    frame ensureRoom(this: *Deque<T>) {
        if (this.count == 2147483647) {
            throw "Deque capacity exceeded";
        }
        this.reserve(this.count + 1);
    }

    frame pushBack(this: *Deque<T>, value: T) {
        this.ensureRoom();
        this.inner.set(this.physicalIndex(this.count), value);
        this.count = this.count + 1;
    }

    frame pushFront(this: *Deque<T>, value: T) {
        this.ensureRoom();
        if (this.head == 0) {
            this.head = this.inner.capacity;
        }
        this.head = this.head - 1;
        this.inner.set(this.head, value);
        this.count = this.count + 1;
    }

    frame popFront(this: *Deque<T>) ret Option<T> {
        if (this.count == 0) {
            return Option<T>.None;
        }
        local value: T = this.inner.get(this.head);
        this.head = this.physicalIndex(1);
        this.count = this.count - 1;
        return Option<T>.Some(value);
    }

    frame popBack(this: *Deque<T>) ret Option<T> {
        if (this.count == 0) {
            return Option<T>.None;
        }
        this.count = this.count - 1;
        return Option<T>.Some(this.inner.get(this.physicalIndex(this.count)));
    }

    frame get(this: *Deque<T>, index: int) ret Option<T> {
        if ((index < 0) || (index >= this.count)) {
            return Option<T>.None;
        }
        return Option<T>.Some(this.inner.get(this.physicalIndex(index)));
    }

    frame set(this: *Deque<T>, index: int, value: T) ret bool {
        if ((index < 0) || (index >= this.count)) {
            return false;
        }
        this.inner.set(this.physicalIndex(index), value);
        return true;
    }

    frame peekFront(this: *Deque<T>) ret Option<T> {
        return this.get(0);
    }

    frame peekBack(this: *Deque<T>) ret Option<T> {
        return this.get(this.count - 1);
    }

    frame clear(this: *Deque<T>) {
        this.head = 0;
        this.count = 0;
    }

    frame destroy(this: *Deque<T>) {
        this.inner.destroy();
        this.clear();
    }

    frame clone(this: *Deque<T>) ret Deque<T> {
        local copy: Deque<T> = Deque<T>.new(this.count);
        loop (local i: int = 0; i < this.count; i = i + 1) {
            copy.pushBack(this.inner.get(this.physicalIndex(i)));
        }
        return copy;
    }

    frame iterator(this: *Deque<T>) ret DequeIterator<T> {
        return DequeIterator<T> { deque: this, index: 0 };
    }
}
