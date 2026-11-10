# Set<T> built on Map<T, bool>

export [Set];
export [SetIterator];

import [Map], [MapIterator], [Pair] from "std/map.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [Iterable], [Iterator] from "std/iter_specs.bpl";
import [Destructible] from "std/core_specs.bpl";

struct SetIterator<T>: Iterator<T> {
    iter: MapIterator<T, bool>,

    frame next(this: *SetIterator<T>) ret Option<T> {
        local res: Option<Pair<T, bool>> = this.iter.next();
        if (res.isSome()) {
            local p: Pair<T, bool> = res.unwrap();
            return Option<T>.Some(p.key);
        }
        return Option<T>.None;
    }
}

struct Set<T>: Iterable<T>, Destructible {
    inner: Map<T, bool>,

    frame new() ret Set<T> {
        local s: Set<T>;
        s.inner = Map<T, bool>.new();
        return s;
    }

    frame new(initial_capacity: int) ret Set<T> {
        local s: Set<T>;
        s.inner = Map<T, bool>.new(initial_capacity);
        return s;
    }

    frame new(initial_capacity: int, hasher: Func<u64>(*T), equaler: Func<bool>(*T, *T)) ret Set<T> {
        local s: Set<T>;
        s.inner = Map<T, bool>.new(initial_capacity, hasher, equaler);
        return s;
    }

    frame iterator(this: *Set<T>) ret SetIterator<T> {
        local it: SetIterator<T>;
        it.iter = this.inner.iterator();
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

    # Whether the set has no elements.
    frame isEmpty(this: *Set<T>) ret bool {
        return this.inner.size() == 0;
    }

    # Whether every element of this set is also in `other`. The empty set is
    # a subset of every set.
    frame isSubsetOf(this: *Set<T>, other: *Set<T>) ret bool {
        if (this.size() > other.size()) {
            return false;
        }
        local it: SetIterator<T> = this.iterator();
        loop {
            local opt: Option<T> = it.next();
            if (opt.isNone()) {
                break;
            }
            if (!other.has(opt.unwrap())) {
                return false;
            }
        }
        return true;
    }

    # A new array of the elements, in the set's iteration order; the caller
    # destroys it. Elements are copied shallowly, as stored.
    frame toArray(this: *Set<T>) ret Array<T> {
        local result: Array<T> = Array<T>.new(this.size());
        local it: SetIterator<T> = this.iterator();
        loop {
            local opt: Option<T> = it.next();
            if (opt.isNone()) {
                break;
            }
            result.push(opt.unwrap());
        }
        return result;
    }

    # Builds a set from the elements of an array.
    frame fromArray(values: *Array<T>) ret Set<T> {
        local result: Set<T> = Set<T>.new(values.length);
        loop (local i: int = 0; i < values.length; i = i + 1) {
            result.add(values.data[i]);
        }
        return result;
    }

    # Adds every element of `other`.
    frame addAll(this: *Set<T>, other: *Set<T>) {
        local it: SetIterator<T> = other.iterator();
        loop {
            local opt: Option<T> = it.next();
            if (opt.isNone()) {
                return;
            }
            this.add(opt.unwrap());
        }
    }

    # Adds `value`; returns true when it was not already present.
    frame insert(this: *Set<T>, value: T) ret bool {
        if (this.inner.has(value)) {
            return false;
        }
        this.inner.set(value, true);
        return true;
    }

    frame isSupersetOf(this: *Set<T>, other: *Set<T>) ret bool {
        return other.isSubsetOf(this);
    }

    # True when the sets share no element.
    frame isDisjoint(this: *Set<T>, other: *Set<T>) ret bool {
        local it: SetIterator<T> = this.iterator();
        loop {
            local opt: Option<T> = it.next();
            if (opt.isNone()) {
                return true;
            }
            if (other.has(opt.unwrap())) {
                return false;
            }
        }
        return true;
    }

    # Elements in exactly one of the two sets (a new set).
    frame symmetricDifference(this: *Set<T>, other: *Set<T>) ret Set<T> {
        local left: Set<T> = this.difference(other);
        local right: Set<T> = other.difference(this);
        left.addAll(&right);
        right.destroy();
        return left;
    }

    # Keeps the elements for which `keep` is true; returns how many were removed.
    frame retain(this: *Set<T>, keep: Lambda<bool>(T)) ret int {
        local elements: Array<T> = this.toArray();
        local removed: int = 0;
        loop (local i: int = 0; i < elements.length; i = i + 1) {
            if (!keep(elements.data[i])) {
                this.inner.remove(elements.data[i]);
                removed = removed + 1;
            }
        }
        elements.destroy();
        return removed;
    }

    # Calls `visit` for each element in iteration order.
    frame forEach(this: *Set<T>, visit: Lambda<void>(T)) {
        local it: SetIterator<T> = this.iterator();
        loop {
            local opt: Option<T> = it.next();
            if (opt.isNone()) {
                return;
            }
            visit(opt.unwrap());
        }
    }

    # Returns a new set containing elements from both sets (union)
    frame union(this: *Set<T>, other: *Set<T>) ret Set<T> {
        local result: Set<T> = Set<T>.new(this.size() + other.size(), this.inner.hasher, this.inner.equaler);
        local resultPtr: *Set<T> = &result;
        local completed: bool = false;
        local completedPtr: *bool = &completed;
        defer {
            if (!*completedPtr) {
                resultPtr.destroy();
            }
        }

        # Add all elements from this set
        local it: SetIterator<T> = this.iterator();
        loop {
            local opt: Option<T> = it.next();
            if (opt.isNone()) {
                break;
            }
            result.add(opt.unwrap());
        }

        # Add all elements from other set
        it = other.iterator();
        loop {
            local opt: Option<T> = it.next();
            if (opt.isNone()) {
                break;
            }
            result.add(opt.unwrap());
        }

        completed = true;
        return result;
    }

    # Returns a new set containing elements in this but not in other (difference)
    frame difference(this: *Set<T>, other: *Set<T>) ret Set<T> {
        local result: Set<T> = Set<T>.new(this.size(), this.inner.hasher, this.inner.equaler);
        local resultPtr: *Set<T> = &result;
        local completed: bool = false;
        local completedPtr: *bool = &completed;
        defer {
            if (!*completedPtr) {
                resultPtr.destroy();
            }
        }

        local it: SetIterator<T> = this.iterator();
        loop {
            local opt: Option<T> = it.next();
            if (opt.isNone()) {
                break;
            }
            local key: T = opt.unwrap();
            if (!other.has(key)) {
                result.add(key);
            }
        }

        completed = true;
        return result;
    }

    # Returns a new set containing elements in both sets (intersection)
    frame intersection(this: *Set<T>, other: *Set<T>) ret Set<T> {
        local result: Set<T> = Set<T>.new(this.size(), this.inner.hasher, this.inner.equaler);
        local resultPtr: *Set<T> = &result;
        local completed: bool = false;
        local completedPtr: *bool = &completed;
        defer {
            if (!*completedPtr) {
                resultPtr.destroy();
            }
        }

        local it: SetIterator<T> = this.iterator();
        loop {
            local opt: Option<T> = it.next();
            if (opt.isNone()) {
                break;
            }
            local key: T = opt.unwrap();
            if (other.has(key)) {
                result.add(key);
            }
        }

        completed = true;
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
        local it: SetIterator<T> = this.iterator();
        loop {
            local opt: Option<T> = it.next();
            if (opt.isNone()) {
                break;
            }
            local key: T = opt.unwrap();
            if (!other.has(key)) {
                return false;
            }
        }

        return true;
    }

    # Operator overloading: Inequality comparison
    frame __ne__(this: *Set<T>, other: Set<T>) ret bool {
        return !this.__eq__(other);
    }
}
