# RingBuffer<T>: a fixed-capacity circular FIFO.
#
# Storage is allocated once. `push` refuses new values when the buffer is
# full; `pushOverwrite` drops the oldest value instead, which suits sliding
# windows and "last N" histories. Elements are not destroyed by the buffer.

export [RingBuffer];
export [RingBufferIterator];

import [Option] from "std/option.bpl";
import [Array] from "std/array.bpl";
import [Iterator] from "std/iter_specs.bpl";
import [IndexOutOfBoundsError] from "std/errors.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

struct RingBufferIterator<T>: Iterator<T> {
    buffer: *RingBuffer<T>,
    index: int,
    frame next(this: *RingBufferIterator<T>) ret Option<T> {
        if (this.index >= this.buffer.length) {
            return Option<T>.None;
        }
        local value: T = this.buffer.get(this.index);
        this.index = this.index + 1;
        return Option<T>.Some(value);
    }
}

struct RingBuffer<T> {
    data: *T,
    cap: int,
    head: int,
    length: int,
    # Allocates room for `capacity` (>= 1) values.
    frame new(capacity: int) ret RingBuffer<T> {
        if (capacity < 1) {
            throw "RingBuffer capacity must be positive";
        }
        local ring: RingBuffer<T>;
        ring.data = cast<*T>(malloc(cast<long>(capacity) * sizeof<T>()));
        if (ring.data == nullptr) {
            throw "RingBuffer allocation failed";
        }
        ring.cap = capacity;
        ring.head = 0;
        ring.length = 0;
        return ring;
    }

    frame destroy(this: *RingBuffer<T>) {
        if (this.data != nullptr) {
            free(cast<*void>(this.data));
            this.data = nullptr;
        }
        this.cap = 0;
        this.head = 0;
        this.length = 0;
    }

    frame len(this: *RingBuffer<T>) ret int {
        return this.length;
    }

    frame capacity(this: *RingBuffer<T>) ret int {
        return this.cap;
    }

    frame isEmpty(this: *RingBuffer<T>) ret bool {
        return this.length == 0;
    }

    frame isFull(this: *RingBuffer<T>) ret bool {
        return this.length == this.cap;
    }

    frame _slot(this: *RingBuffer<T>, index: int) ret int {
        return (this.head + index) % this.cap;
    }

    # Appends at the back; false (and no change) when full.
    frame push(this: *RingBuffer<T>, value: T) ret bool {
        if (this.length == this.cap) {
            return false;
        }
        this.data[this._slot(this.length)] = value;
        this.length = this.length + 1;
        return true;
    }

    # Appends at the back, dropping and returning the oldest value when full.
    frame pushOverwrite(this: *RingBuffer<T>, value: T) ret Option<T> {
        if (this.length < this.cap) {
            this.push(value);
            return Option<T>.None;
        }
        local dropped: T = this.data[this.head];
        this.data[this.head] = value;
        this.head = (this.head + 1) % this.cap;
        return Option<T>.Some(dropped);
    }

    # Prepends at the front; false when full.
    frame pushFront(this: *RingBuffer<T>, value: T) ret bool {
        if (this.length == this.cap) {
            return false;
        }
        this.head = ((this.head + this.cap) - 1) % this.cap;
        this.data[this.head] = value;
        this.length = this.length + 1;
        return true;
    }

    # Removes the oldest value.
    frame pop(this: *RingBuffer<T>) ret Option<T> {
        if (this.length == 0) {
            return Option<T>.None;
        }
        local value: T = this.data[this.head];
        this.head = (this.head + 1) % this.cap;
        this.length = this.length - 1;
        return Option<T>.Some(value);
    }

    # Removes the newest value.
    frame popBack(this: *RingBuffer<T>) ret Option<T> {
        if (this.length == 0) {
            return Option<T>.None;
        }
        this.length = this.length - 1;
        return Option<T>.Some(this.data[this._slot(this.length)]);
    }

    frame front(this: *RingBuffer<T>) ret Option<T> {
        if (this.length == 0) {
            return Option<T>.None;
        }
        return Option<T>.Some(this.data[this.head]);
    }

    frame back(this: *RingBuffer<T>) ret Option<T> {
        if (this.length == 0) {
            return Option<T>.None;
        }
        return Option<T>.Some(this.data[this._slot(this.length - 1)]);
    }

    # The value at `index` counted from the oldest (0); throws when outside.
    frame get(this: *RingBuffer<T>, index: int) ret T {
        if ((index < 0) || (index >= this.length)) {
            throw IndexOutOfBoundsError.new(index, this.length);
        }
        return this.data[this._slot(index)];
    }

    frame set(this: *RingBuffer<T>, index: int, value: T) {
        if ((index < 0) || (index >= this.length)) {
            throw IndexOutOfBoundsError.new(index, this.length);
        }
        this.data[this._slot(index)] = value;
    }

    frame clear(this: *RingBuffer<T>) {
        this.head = 0;
        this.length = 0;
    }

    # Copies the values, oldest first, into a new array.
    frame toArray(this: *RingBuffer<T>) ret Array<T> {
        local out: Array<T> = Array<T>.new(this.length);
        loop (local i: int = 0; i < this.length; i = i + 1) {
            out.push(this.data[this._slot(i)]);
        }
        return out;
    }

    frame iterator(this: *RingBuffer<T>) ret RingBufferIterator<T> {
        return RingBufferIterator<T> { buffer: this, index: 0 };
    }
}
