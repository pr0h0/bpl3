# PriorityQueue<T> - Binary Heap implementation (Min-Heap)

export [PriorityQueue];
export [PriorityQueueIterator];

import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [Iterable], [Iterator] from "std/iter_specs.bpl";
import [Destructible] from "std/core_specs.bpl";

struct PriorityQueueIterator<T>: Iterator<T> {
    pq: *PriorityQueue<T>,
    index: int,
    frame next(this: *PriorityQueueIterator<T>) ret Option<T> {
        if (this.index >= this.pq.items.len()) {
            return Option<T>.None;
        }
        local val: T = this.pq.items.get(this.index);
        this.index = this.index + 1;
        return Option<T>.Some(val);
    }
}

struct PriorityQueue<T>: Iterable<T>, Destructible {
    items: Array<T>,
    frame new(initial_capacity: int) ret PriorityQueue<T> {
        local pq: PriorityQueue<T>;
        pq.items = Array<T>.new(initial_capacity);
        return pq;
    }

    frame iterator(this: *PriorityQueue<T>) ret PriorityQueueIterator<T> {
        local it: PriorityQueueIterator<T>;
        it.pq = this;
        it.index = 0;
        return it;
    }

    frame destroy(this: *PriorityQueue<T>) {
        this.items.destroy();
    }

    frame push(this: *PriorityQueue<T>, value: T) {
        this.items.push(value);
        this.siftUp(this.items.len() - 1);
    }

    frame pop(this: *PriorityQueue<T>) ret Option<T> {
        if (this.items.len() == 0) {
            return Option<T>.None;
        }
        local result: T = this.items.get(0);
        local last: T = this.items.pop();

        if (this.items.len() > 0) {
            this.items.set(0, last);
            this.siftDown(0);
        }
        return Option<T>.Some(result);
    }

    frame peek(this: *PriorityQueue<T>) ret Option<T> {
        if (this.items.len() == 0) {
            return Option<T>.None;
        }
        return Option<T>.Some(this.items.get(0));
    }

    frame siftUp(this: *PriorityQueue<T>, index: int) {
        loop (index > 0) {
            local parent: int = (index - 1) / 2;
            if (this.items.get(index) < this.items.get(parent)) {
                # Min-heap
                local temp: T = this.items.get(index);
                this.items.set(index, this.items.get(parent));
                this.items.set(parent, temp);
                index = parent;
            } else {
                break;
            }
        }
    }

    frame siftDown(this: *PriorityQueue<T>, index: int) {
        local len: int = this.items.len();
        loop (true) {
            local left: int = (2 * index) + 1;
            local right: int = (2 * index) + 2;
            local smallest: int = index;

            if (left < len) {
                if (this.items.get(left) < this.items.get(smallest)) {
                    smallest = left;
                }
            }
            if (right < len) {
                if (this.items.get(right) < this.items.get(smallest)) {
                    smallest = right;
                }
            }
            if (smallest != index) {
                local temp: T = this.items.get(index);
                this.items.set(index, this.items.get(smallest));
                this.items.set(smallest, temp);
                index = smallest;
            } else {
                break;
            }
        }
    }

    frame len(this: *PriorityQueue<T>) ret int {
        return this.items.len();
    }

    frame isEmpty(this: *PriorityQueue<T>) ret bool {
        return this.items.len() == 0;
    }
}
