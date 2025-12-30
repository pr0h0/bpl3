# Set<T> built on Map<T, bool>

export [Set];
export [SetIterator];

import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import [Iterable], [Iterator] from "std/iter_specs.bpl";
import [Destructible] from "std/core_specs.bpl";

struct SetIterator<T>: Iterator<T> {
    set: *Set<T>,
    index: int,
    frame next(this: *SetIterator<T>) ret Option<T> {
        if (this.index >= this.set.size()) {
            return Option<T>.None;
        }
        local val: T = this.set.inner.getKey(this.index);
        this.index = this.index + 1;
        return Option<T>.Some(val);
    }
}

struct Set<T>: Iterable<T>, Destructible {
    inner: Map<T, bool>,
    frame new(initial_capacity: int) ret Set<T> {
        local s: Set<T>;
        s.inner = Map<T, bool>.new(initial_capacity);
        return s;
    }

    frame iterator(this: *Set<T>) ret SetIterator<T> {
        local it: SetIterator<T>;
        it.set = this;
        it.index = 0;
        return it;
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

    frame size(this: *Set<T>) ret int {
        return this.inner.size();
    }

    frame clear(this: *Set<T>) {
        this.inner.clear();
    }

    # Returns a new set containing elements from both sets (union)
    frame union(this: *Set<T>, other: *Set<T>) ret Set<T> {
        local result: Set<T> = Set<T>.new(this.size() + other.size());

        # Add all elements from this set
        local i: int = 0;
        local n: int = this.inner.size();
        loop (i < n) {
            local key: T = this.inner.getKey(i);
            result.add(key);
            i = i + 1;
        }

        # Add all elements from other set
        i = 0;
        local m: int = other.inner.size();
        loop (i < m) {
            local key: T = other.inner.getKey(i);
            result.add(key);
            i = i + 1;
        }

        return result;
    }

    # Returns a new set containing elements in this but not in other (difference)
    frame difference(this: *Set<T>, other: *Set<T>) ret Set<T> {
        local result: Set<T> = Set<T>.new(this.size());

        local i: int = 0;
        local n: int = this.inner.size();
        loop (i < n) {
            local key: T = this.inner.getKey(i);
            if (!other.has(key)) {
                result.add(key);
            }
            i = i + 1;
        }

        return result;
    }

    # Returns a new set containing elements in both sets (intersection)
    frame intersection(this: *Set<T>, other: *Set<T>) ret Set<T> {
        local result: Set<T> = Set<T>.new(this.size());

        local i: int = 0;
        local n: int = this.inner.size();
        loop (i < n) {
            local key: T = this.inner.getKey(i);
            if (other.has(key)) {
                result.add(key);
            }
            i = i + 1;
        }

        return result;
    }

    # Operator overloading: Union with | operator
    frame __or__(this: *Set<T>, other: Set<T>) ret Set<T> {
        return this.union(&other);
    }

    # Operator overloading: Difference with - operator
    frame __sub__(this: *Set<T>, other: Set<T>) ret Set<T> {
        return this.difference(&other);
    }

    # Operator overloading: Intersection with & operator  
    frame __and__(this: *Set<T>, other: Set<T>) ret Set<T> {
        return this.intersection(&other);
    }

    # Operator overloading: Equality comparison
    frame __eq__(this: *Set<T>, other: Set<T>) ret bool {
        if (this.size() != other.size()) {
            return false;
        }
        # Check if all elements in this are in other
        local i: int = 0;
        local n: int = this.inner.size();
        loop (i < n) {
            local key: T = this.inner.getKey(i);
            if (!other.has(key)) {
                return false;
            }
            i = i + 1;
        }

        return true;
    }

    # Operator overloading: Inequality comparison
    frame __ne__(this: *Set<T>, other: Set<T>) ret bool {
        return !this.__eq__(other);
    }
}
