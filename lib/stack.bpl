# Stack<T> built on Array<T>

export [Stack];

import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";

struct Stack<T> {
    inner: Array<T>,
    frame new(initial_capacity: int) ret Stack<T> {
        local s: Stack<T>;
        s.inner = Array<T>.new(initial_capacity);
        return s;
    }

    frame destroy(this: *Stack<T>) {
        this.inner.destroy();
    }

    frame push(this: *Stack<T>, value: T) {
        this.inner.push(value);
    }

    frame pop(this: *Stack<T>) ret Option<T> {
        local len: int = this.inner.len();
        if (len <= 0) {
            return Option<T>.None;
        }
        local idx: int = len - 1;
        local value: T = this.inner.get(idx);
        # Reduce length (no shrink of capacity)
        # Overwrite last element not necessary
        this.inner.length = idx;
        return Option<T>.Some(value);
    }

    frame size(this: *Stack<T>) ret int {
        return this.inner.len();
    }

    frame isEmpty(this: *Stack<T>) ret bool {
        return this.inner.len() == 0;
    }

    frame peek(this: *Stack<T>) ret Option<T> {
        local len: int = this.inner.len();
        if (len <= 0) {
            return Option<T>.None;
        }
        return Option<T>.Some(this.inner.get(len - 1));
    }

    frame clear(this: *Stack<T>) {
        this.inner.length = 0;
    }

    # Operator overloading: Push with << operator
    # Usage: stack << value
    frame __lshift__(this: *Stack<T>, value: T) ret *Stack<T> {
        this.push(value);
        return this;
    }
}
