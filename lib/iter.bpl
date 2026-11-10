# Lazy, chainable iterators.
#
# `Iter<T>` wraps any `Iterator<T>` (see std/iter_specs.bpl), an `Array<T>`,
# a `Range`, or a step function, and offers adapters (`map`, `filter`,
# `take`, `zip`, ...) and consumers (`collect`, `fold`, `count`, ...).
# Adapters are lazy: nothing runs until a consumer or `next` pulls values.
#
# Ownership: an adapter consumes its receiver. The returned iterator shares
# the receiver's internal state, so keep using only the newest iterator of a
# chain and call `destroy` on it once, which releases the state of the whole
# chain (zip/chain/flatMap also adopt the state of their other iterators).
# Consumers do not destroy. Iterators built from an `Array` or a string
# borrow it: do not modify or free the source while iterating.

export [Iter];
export [Peekable];
export [Enumerated];
export [Zipped];
export iterEnumerate;
export iterChunks;
export iterRange;
export iterRangeStep;
export iterRangeOf;
export iterCounter;
export iterChars;
export iterArray;
export sumInt;
export sumLong;
export sumFloat;
export minInt;
export maxInt;

import [Option] from "std/option.bpl";
import [Array] from "std/array.bpl";
import [Range] from "std/range.bpl";
import [Iterator] from "std/iter_specs.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

# Every heap block owned by one iterator chain.
struct IterArena {
    blocks: **void,
    length: int,
    capacity: int,
}

frame _iterArenaNew() ret *IterArena {
    local arena: *IterArena = cast<*IterArena>(malloc(sizeof<IterArena>()));
    if (arena == nullptr) {
        throw "Iterator allocation failed";
    }
    arena.blocks = nullptr;
    arena.length = 0;
    arena.capacity = 0;
    return arena;
}

frame _iterArenaOwn(arena: *IterArena, block: *void) {
    if (block == nullptr) {
        return;
    }
    if (arena.length == arena.capacity) {
        local grown: int = (arena.capacity * 2) + 4;
        local blocks: **void = cast<**void>(malloc(cast<long>(grown) * sizeof<*void>()));
        if (blocks == nullptr) {
            free(block);
            throw "Iterator allocation failed";
        }
        loop (local i: int = 0; i < arena.length; i = i + 1) {
            blocks[i] = arena.blocks[i];
        }
        if (arena.blocks != nullptr) {
            free(cast<*void>(arena.blocks));
        }
        arena.blocks = blocks;
        arena.capacity = grown;
    }
    arena.blocks[arena.length] = block;
    arena.length = arena.length + 1;
}

# Allocates `bytes` owned by the arena.
frame _iterArenaAlloc(arena: *IterArena, bytes: long) ret *void {
    local block: *void = malloc(bytes);
    if (block == nullptr) {
        throw "Iterator allocation failed";
    }
    _iterArenaOwn(arena, block);
    return block;
}

# Moves every block of `other` (and `other` itself) into `arena`.
frame _iterArenaAdopt(arena: *IterArena, other: *IterArena) {
    if ((other == nullptr) || (other == arena)) {
        return;
    }
    loop (local i: int = 0; i < other.length; i = i + 1) {
        _iterArenaOwn(arena, other.blocks[i]);
    }
    other.length = 0;
    if (other.blocks != nullptr) {
        free(cast<*void>(other.blocks));
        other.blocks = nullptr;
    }
    other.capacity = 0;
    _iterArenaOwn(arena, cast<*void>(other));
}

frame _iterArenaFree(arena: *IterArena) {
    if (arena == nullptr) {
        return;
    }
    # Blocks may include adopted arenas, which are already empty.
    loop (local i: int = arena.length - 1; i >= 0; i = i - 1) {
        free(arena.blocks[i]);
    }
    if (arena.blocks != nullptr) {
        free(cast<*void>(arena.blocks));
    }
    free(cast<*void>(arena));
}

# The heap context of a closure this module created (null without captures).
# A closure is the pair { function, context }; the holder has no hidden
# fields, so its second word is the context.
struct IterClosureHolder<T> {
    step: Lambda<Option<T>>(),
}

frame _iterClosureContext<T>(step: Lambda<Option<T>>()) ret *void {
    local holder: IterClosureHolder<T> = IterClosureHolder<T> { step: step };
    local words: **void = cast<**void>(&holder);
    return words[1];
}

# Builds the next link of a chain and gives the closure to `arena`.
frame _iterLink<V>(arena: *IterArena, step: Lambda<Option<V>>()) ret Iter<V> {
    _iterArenaOwn(arena, _iterClosureContext<V>(step));
    return Iter<V> { step: step, arena: arena };
}

# A value and its zero-based position, yielded by `Iter.enumerate`.
# (Iterators carry structs rather than tuples: BPL has no pointers to tuple
# types, and arrays of iterator values need them.)
struct Enumerated<T> {
    index: int,
    value: T,
}

# One value from each side, yielded by `Iter.zip`.
struct Zipped<A, B> {
    first: A,
    second: B,
}

struct IterIndex {
    index: int,
}

struct IterFlag {
    done: bool,
}

/#
    Iter<T>
    A lazy sequence of `T` values.
#/
struct Iter<T> {
    step: Lambda<Option<T>>(),
    arena: *IterArena,
    # Wraps a step function that returns `Some(value)` until it is exhausted.
    frame fromFn(step: Lambda<Option<T>>()) ret Iter<T> {
        return Iter<T> { step: step, arena: _iterArenaNew() };
    }

    # Wraps any iterator by value; the copy is owned by the Iter.
    frame fromIterator<I: Iterator<T>>(source: I) ret Iter<T> {
        local arena: *IterArena = _iterArenaNew();
        local state: *I = cast<*I>(_iterArenaAlloc(arena, sizeof<I>()));
        *state = source;
        return _iterLink<T>(arena, || ret Option<T> {
            return state.next();
        });
    }

    # Iterates the elements of `array` in order (borrowed, not copied).
    frame fromArray(array: *Array<T>) ret Iter<T> {
        local arena: *IterArena = _iterArenaNew();
        local cursor: *IterIndex = cast<*IterIndex>(_iterArenaAlloc(arena, sizeof<IterIndex>()));
        cursor.index = 0;
        return _iterLink<T>(arena, || ret Option<T> {
            if (cursor.index >= array.length) {
                return Option<T>.None;
            }
            local value: T = array.data[cursor.index];
            cursor.index = cursor.index + 1;
            return Option<T>.Some(value);
        });
    }

    # Iterates `count` elements starting at `data` (borrowed).
    frame fromPointer(data: *T, count: int) ret Iter<T> {
        local arena: *IterArena = _iterArenaNew();
        local cursor: *IterIndex = cast<*IterIndex>(_iterArenaAlloc(arena, sizeof<IterIndex>()));
        cursor.index = 0;
        return _iterLink<T>(arena, || ret Option<T> {
            if (cursor.index >= count) {
                return Option<T>.None;
            }
            local value: T = data[cursor.index];
            cursor.index = cursor.index + 1;
            return Option<T>.Some(value);
        });
    }

    # An iterator that yields nothing.
    frame empty() ret Iter<T> {
        return Iter<T>.fromFn(|| ret Option<T> {
            return Option<T>.None;
        });
    }

    # Yields `value` once.
    frame once(value: T) ret Iter<T> {
        local arena: *IterArena = _iterArenaNew();
        local flag: *IterFlag = cast<*IterFlag>(_iterArenaAlloc(arena, sizeof<IterFlag>()));
        flag.done = false;
        return _iterLink<T>(arena, || ret Option<T> {
            if (flag.done) {
                return Option<T>.None;
            }
            flag.done = true;
            return Option<T>.Some(value);
        });
    }

    # Yields `value` forever. Combine with `take`.
    frame repeat(value: T) ret Iter<T> {
        local arena: *IterArena = _iterArenaNew();
        return _iterLink<T>(arena, || ret Option<T> {
            return Option<T>.Some(value);
        });
    }

    # Yields `value` `count` times.
    frame repeatN(value: T, count: int) ret Iter<T> {
        local base: Iter<T> = Iter<T>.repeat(value);
        return base.take(count);
    }

    # Yields `first`, then `next(previous)` until it returns None.
    frame successors(first: T, next: Lambda<Option<T>>(T)) ret Iter<T> {
        local arena: *IterArena = _iterArenaNew();
        local current: *Option<T> = cast<*Option<T>>(_iterArenaAlloc(arena, sizeof<Option<T>>()));
        *current = Option<T>.Some(first);
        return _iterLink<T>(arena, || ret Option<T> {
            local value: Option<T> = *current;
            if (value.isSome()) {
                *current = next(value.unwrap());
            }
            return value;
        });
    }

    # Pulls the next value.
    frame next(this: *Iter<T>) ret Option<T> {
        # A lambda field is called through a local (see BUG-600).
        local step: Lambda<Option<T>>() = this.step;
        return step();
    }

    # Releases the state of the whole chain. Idempotent.
    frame destroy(this: *Iter<T>) {
        _iterArenaFree(this.arena);
        this.arena = nullptr;
    }

    # ---------------------------------------------------------------- adapters

    # Transforms each value.
    frame map<U>(this: *Iter<T>, transform: Lambda<U>(T)) ret Iter<U> {
        local source: Iter<T> = *this;
        return _iterLink<U>(this.arena, || ret Option<U> {
            local inner: Iter<T> = source;
            local value: Option<T> = inner.next();
            if (value.isNone()) {
                return Option<U>.None;
            }
            return Option<U>.Some(transform(value.unwrap()));
        });
    }

    # Keeps the values for which `predicate` is true.
    frame filter(this: *Iter<T>, predicate: Lambda<bool>(T)) ret Iter<T> {
        local source: Iter<T> = *this;
        return _iterLink<T>(this.arena, || ret Option<T> {
            local inner: Iter<T> = source;
            loop {
                local value: Option<T> = inner.next();
                if (value.isNone()) {
                    return value;
                }
                if (predicate(value.unwrap())) {
                    return value;
                }
            }
            return Option<T>.None;
        });
    }

    # Maps and filters in one step: None results are dropped.
    frame filterMap<U>(this: *Iter<T>, transform: Lambda<Option<U>>(T)) ret Iter<U> {
        local source: Iter<T> = *this;
        return _iterLink<U>(this.arena, || ret Option<U> {
            local inner: Iter<T> = source;
            loop {
                local value: Option<T> = inner.next();
                if (value.isNone()) {
                    return Option<U>.None;
                }
                local mapped: Option<U> = transform(value.unwrap());
                if (mapped.isSome()) {
                    return mapped;
                }
            }
            return Option<U>.None;
        });
    }

    # Yields at most `count` values.
    frame take(this: *Iter<T>, count: int) ret Iter<T> {
        local source: Iter<T> = *this;
        local taken: *IterIndex = cast<*IterIndex>(_iterArenaAlloc(this.arena, sizeof<IterIndex>()));
        taken.index = 0;
        return _iterLink<T>(this.arena, || ret Option<T> {
            if (taken.index >= count) {
                return Option<T>.None;
            }
            taken.index = taken.index + 1;
            local inner: Iter<T> = source;
            return inner.next();
        });
    }

    # Skips the first `count` values.
    frame skip(this: *Iter<T>, count: int) ret Iter<T> {
        local source: Iter<T> = *this;
        local flag: *IterFlag = cast<*IterFlag>(_iterArenaAlloc(this.arena, sizeof<IterFlag>()));
        flag.done = false;
        return _iterLink<T>(this.arena, || ret Option<T> {
            local inner: Iter<T> = source;
            if (!flag.done) {
                flag.done = true;
                loop (local i: int = 0; i < count; i = i + 1) {
                    if (inner.next().isNone()) {
                        return Option<T>.None;
                    }
                }
            }
            return inner.next();
        });
    }

    # Yields values while `predicate` holds, then stops for good.
    frame takeWhile(this: *Iter<T>, predicate: Lambda<bool>(T)) ret Iter<T> {
        local source: Iter<T> = *this;
        local flag: *IterFlag = cast<*IterFlag>(_iterArenaAlloc(this.arena, sizeof<IterFlag>()));
        flag.done = false;
        return _iterLink<T>(this.arena, || ret Option<T> {
            if (flag.done) {
                return Option<T>.None;
            }
            local inner: Iter<T> = source;
            local value: Option<T> = inner.next();
            if (value.isNone() || !predicate(value.unwrap())) {
                flag.done = true;
                return Option<T>.None;
            }
            return value;
        });
    }

    # Drops values while `predicate` holds, then yields everything else.
    frame skipWhile(this: *Iter<T>, predicate: Lambda<bool>(T)) ret Iter<T> {
        local source: Iter<T> = *this;
        local flag: *IterFlag = cast<*IterFlag>(_iterArenaAlloc(this.arena, sizeof<IterFlag>()));
        flag.done = false;
        return _iterLink<T>(this.arena, || ret Option<T> {
            local inner: Iter<T> = source;
            if (flag.done) {
                return inner.next();
            }
            loop {
                local value: Option<T> = inner.next();
                if (value.isNone()) {
                    return value;
                }
                if (!predicate(value.unwrap())) {
                    flag.done = true;
                    return value;
                }
            }
            return Option<T>.None;
        });
    }

    # Yields the first value and then every `step`-th one.
    frame stepBy(this: *Iter<T>, step: int) ret Iter<T> {
        if (step < 1) {
            throw "Iterator step must be positive";
        }
        local source: Iter<T> = *this;
        local flag: *IterFlag = cast<*IterFlag>(_iterArenaAlloc(this.arena, sizeof<IterFlag>()));
        flag.done = false;
        return _iterLink<T>(this.arena, || ret Option<T> {
            local inner: Iter<T> = source;
            if (flag.done) {
                loop (local i: int = 1; i < step; i = i + 1) {
                    if (inner.next().isNone()) {
                        return Option<T>.None;
                    }
                }
            }
            flag.done = true;
            return inner.next();
        });
    }

    # Pairs values from both iterators; stops when either ends. Adopts `other`.
    frame zip<U>(this: *Iter<T>, other: Iter<U>) ret Iter<Zipped<T, U>> {
        local source: Iter<T> = *this;
        _iterArenaAdopt(this.arena, other.arena);
        return _iterLink<Zipped<T, U>>(this.arena, || ret Option<Zipped<T, U>> {
            local left: Iter<T> = source;
            local right: Iter<U> = other;
            local a: Option<T> = left.next();
            if (a.isNone()) {
                return Option<Zipped<T, U>>.None;
            }
            local b: Option<U> = right.next();
            if (b.isNone()) {
                return Option<Zipped<T, U>>.None;
            }
            return Option<Zipped<T, U>>.Some(Zipped<T, U> { first: a.unwrap(), second: b.unwrap() });
        });
    }

    # Yields this iterator's values, then `other`'s. Adopts `other`.
    frame chain(this: *Iter<T>, other: Iter<T>) ret Iter<T> {
        local source: Iter<T> = *this;
        _iterArenaAdopt(this.arena, other.arena);
        local flag: *IterFlag = cast<*IterFlag>(_iterArenaAlloc(this.arena, sizeof<IterFlag>()));
        flag.done = false;
        return _iterLink<T>(this.arena, || ret Option<T> {
            if (!flag.done) {
                local first: Iter<T> = source;
                local value: Option<T> = first.next();
                if (value.isSome()) {
                    return value;
                }
                flag.done = true;
            }
            local second: Iter<T> = other;
            return second.next();
        });
    }

    # Calls `action` on each value as it passes through.
    frame inspect(this: *Iter<T>, action: Lambda<void>(T)) ret Iter<T> {
        local source: Iter<T> = *this;
        return _iterLink<T>(this.arena, || ret Option<T> {
            local inner: Iter<T> = source;
            local value: Option<T> = inner.next();
            if (value.isSome()) {
                action(value.unwrap());
            }
            return value;
        });
    }

    # Maps each value to an iterator and yields their values in turn. Each
    # inner iterator is destroyed once it is exhausted.
    frame flatMap<U>(this: *Iter<T>, expand: Lambda<Iter<U>>(T)) ret Iter<U> {
        local source: Iter<T> = *this;
        local current: *Option<Iter<U>> = cast<*Option<Iter<U>>>(_iterArenaAlloc(this.arena, sizeof<Option<Iter<U>>>()));
        *current = Option<Iter<U>>.None;
        return _iterLink<U>(this.arena, || ret Option<U> {
            loop {
                local active: Option<Iter<U>> = *current;
                if (active.isSome()) {
                    local inner: Iter<U> = active.unwrap();
                    local value: Option<U> = inner.next();
                    if (value.isSome()) {
                        return value;
                    }
                    inner.destroy();
                    *current = Option<Iter<U>>.None;
                }
                local outer: Iter<T> = source;
                local seed: Option<T> = outer.next();
                if (seed.isNone()) {
                    return Option<U>.None;
                }
                *current = Option<Iter<U>>.Some(expand(seed.unwrap()));
            }
            return Option<U>.None;
        });
    }

    # Running accumulation: yields each intermediate state.
    frame scan<S>(this: *Iter<T>, initial: S, combine: Lambda<S>(S, T)) ret Iter<S> {
        local source: Iter<T> = *this;
        local state: *S = cast<*S>(_iterArenaAlloc(this.arena, sizeof<S>()));
        *state = initial;
        return _iterLink<S>(this.arena, || ret Option<S> {
            local inner: Iter<T> = source;
            local value: Option<T> = inner.next();
            if (value.isNone()) {
                return Option<S>.None;
            }
            *state = combine(*state, value.unwrap());
            return Option<S>.Some(*state);
        });
    }

    # Drops consecutive values that `same` reports equal to the previous one.
    frame dedupBy(this: *Iter<T>, same: Lambda<bool>(T, T)) ret Iter<T> {
        local source: Iter<T> = *this;
        local previous: *Option<T> = cast<*Option<T>>(_iterArenaAlloc(this.arena, sizeof<Option<T>>()));
        *previous = Option<T>.None;
        return _iterLink<T>(this.arena, || ret Option<T> {
            local inner: Iter<T> = source;
            loop {
                local value: Option<T> = inner.next();
                if (value.isNone()) {
                    return value;
                }
                local last: Option<T> = *previous;
                if (last.isNone() || !same(last.unwrap(), value.unwrap())) {
                    *previous = value;
                    return value;
                }
            }
            return Option<T>.None;
        });
    }

    # Ends permanently after the first None, even if the source resumes.
    frame fuse(this: *Iter<T>) ret Iter<T> {
        local source: Iter<T> = *this;
        local flag: *IterFlag = cast<*IterFlag>(_iterArenaAlloc(this.arena, sizeof<IterFlag>()));
        flag.done = false;
        return _iterLink<T>(this.arena, || ret Option<T> {
            if (flag.done) {
                return Option<T>.None;
            }
            local inner: Iter<T> = source;
            local value: Option<T> = inner.next();
            if (value.isNone()) {
                flag.done = true;
            }
            return value;
        });
    }

    # ---------------------------------------------------------------- consumers

    # Collects the remaining values into a new array (owned by the caller).
    frame collect(this: *Iter<T>) ret Array<T> {
        local out: Array<T> = Array<T>.new(8);
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                break;
            }
            out.push(value.unwrap());
        }
        return out;
    }

    # Appends the remaining values to `target`.
    frame collectInto(this: *Iter<T>, target: *Array<T>) {
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                return;
            }
            target.push(value.unwrap());
        }
    }

    # Collects and sorts with `compare` (stable).
    frame sortedBy(this: *Iter<T>, compare: Lambda<int>(T, T)) ret Array<T> {
        local out: Array<T> = this.collect();
        out.sortBy(compare);
        return out;
    }

    # Counts the remaining values.
    frame count(this: *Iter<T>) ret int {
        local total: int = 0;
        loop (this.next().isSome()) {
            total = total + 1;
        }
        return total;
    }

    frame fold<U>(this: *Iter<T>, initial: U, combine: Lambda<U>(U, T)) ret U {
        local accumulator: U = initial;
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                return accumulator;
            }
            accumulator = combine(accumulator, value.unwrap());
        }
        return accumulator;
    }

    # Folds with the first value as the seed; None when empty.
    frame reduce(this: *Iter<T>, combine: Lambda<T>(T, T)) ret Option<T> {
        local first: Option<T> = this.next();
        if (first.isNone()) {
            return first;
        }
        local accumulator: T = first.unwrap();
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                return Option<T>.Some(accumulator);
            }
            accumulator = combine(accumulator, value.unwrap());
        }
        return Option<T>.Some(accumulator);
    }

    frame forEach(this: *Iter<T>, action: Lambda<void>(T)) {
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                return;
            }
            action(value.unwrap());
        }
    }

    # True when any value satisfies `predicate` (stops at the first).
    frame any(this: *Iter<T>, predicate: Lambda<bool>(T)) ret bool {
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                return false;
            }
            if (predicate(value.unwrap())) {
                return true;
            }
        }
        return false;
    }

    # True when every value satisfies `predicate` (stops at the first miss).
    frame all(this: *Iter<T>, predicate: Lambda<bool>(T)) ret bool {
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                return true;
            }
            if (!predicate(value.unwrap())) {
                return false;
            }
        }
        return true;
    }

    frame find(this: *Iter<T>, predicate: Lambda<bool>(T)) ret Option<T> {
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                return value;
            }
            if (predicate(value.unwrap())) {
                return value;
            }
        }
        return Option<T>.None;
    }

    # The position of the first value satisfying `predicate`.
    frame position(this: *Iter<T>, predicate: Lambda<bool>(T)) ret Option<int> {
        local index: int = 0;
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                return Option<int>.None;
            }
            if (predicate(value.unwrap())) {
                return Option<int>.Some(index);
            }
            index = index + 1;
        }
        return Option<int>.None;
    }

    frame last(this: *Iter<T>) ret Option<T> {
        local result: Option<T> = Option<T>.None;
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                return result;
            }
            result = value;
        }
        return result;
    }

    # The value at zero-based `index`, consuming the values before it.
    frame nth(this: *Iter<T>, index: int) ret Option<T> {
        if (index < 0) {
            return Option<T>.None;
        }
        loop (local i: int = 0; i < index; i = i + 1) {
            if (this.next().isNone()) {
                return Option<T>.None;
            }
        }
        return this.next();
    }

    # The smallest value under `compare` (the first of equal minima).
    frame minBy(this: *Iter<T>, compare: Lambda<int>(T, T)) ret Option<T> {
        local best: Option<T> = this.next();
        if (best.isNone()) {
            return best;
        }
        local current: T = best.unwrap();
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                return Option<T>.Some(current);
            }
            if (compare(value.unwrap(), current) < 0) {
                current = value.unwrap();
            }
        }
        return Option<T>.Some(current);
    }

    # The largest value under `compare` (the last of equal maxima).
    frame maxBy(this: *Iter<T>, compare: Lambda<int>(T, T)) ret Option<T> {
        local best: Option<T> = this.next();
        if (best.isNone()) {
            return best;
        }
        local current: T = best.unwrap();
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                return Option<T>.Some(current);
            }
            if (compare(value.unwrap(), current) >= 0) {
                current = value.unwrap();
            }
        }
        return Option<T>.Some(current);
    }

    # Splits the values into (matching, not matching) arrays.
    frame partition(this: *Iter<T>, predicate: Lambda<bool>(T)) ret (Array<T>, Array<T>) {
        local yes: Array<T> = Array<T>.new(8);
        local no: Array<T> = Array<T>.new(8);
        loop {
            local value: Option<T> = this.next();
            if (value.isNone()) {
                break;
            }
            if (predicate(value.unwrap())) {
                yes.push(value.unwrap());
            } else {
                no.push(value.unwrap());
            }
        }
        return (yes, no);
    }

    # Advances by `count` values; returns how many were actually skipped.
    frame advanceBy(this: *Iter<T>, count: int) ret int {
        local skipped: int = 0;
        loop (skipped < count) {
            if (this.next().isNone()) {
                return skipped;
            }
            skipped = skipped + 1;
        }
        return skipped;
    }

    # Wraps the iterator with one value of lookahead.
    frame peekable(this: *Iter<T>) ret Peekable<T> {
        return Peekable<T>.new(*this);
    }
}

/#
    Peekable<T>
    An iterator with one value of lookahead. It owns the wrapped iterator.
#/
struct Peekable<T> {
    inner: Iter<T>,
    peeked: Option<T>,
    hasPeeked: bool,
    frame new(inner: Iter<T>) ret Peekable<T> {
        local result: Peekable<T>;
        result.inner = inner;
        result.peeked = Option<T>.None;
        result.hasPeeked = false;
        return result;
    }

    # The next value without consuming it.
    frame peek(this: *Peekable<T>) ret Option<T> {
        if (!this.hasPeeked) {
            this.peeked = this.inner.next();
            this.hasPeeked = true;
        }
        return this.peeked;
    }

    frame next(this: *Peekable<T>) ret Option<T> {
        if (this.hasPeeked) {
            this.hasPeeked = false;
            return this.peeked;
        }
        return this.inner.next();
    }

    # Consumes and returns the next value only when it satisfies `predicate`.
    frame nextIf(this: *Peekable<T>, predicate: Lambda<bool>(T)) ret Option<T> {
        local value: Option<T> = this.peek();
        if (value.isSome() && predicate(value.unwrap())) {
            this.hasPeeked = false;
            return value;
        }
        return Option<T>.None;
    }

    frame destroy(this: *Peekable<T>) {
        this.inner.destroy();
    }
}

# `enumerate` and `chunks` are free functions rather than Iter methods:
# a method returning Iter<Enumerated<T>> makes the compiler instantiate
# Iter<Enumerated<Enumerated<T>>> and so on without end (BUG-602).

# Pairs each value with its zero-based position.
frame iterEnumerate<T>(source: Iter<T>) ret Iter<Enumerated<T>> {
    local cursor: *IterIndex = cast<*IterIndex>(_iterArenaAlloc(source.arena, sizeof<IterIndex>()));
    cursor.index = 0;
    return _iterLink<Enumerated<T>>(source.arena, || ret Option<Enumerated<T>> {
        local inner: Iter<T> = source;
        local value: Option<T> = inner.next();
        if (value.isNone()) {
            return Option<Enumerated<T>>.None;
        }
        local position: int = cursor.index;
        cursor.index = position + 1;
        return Option<Enumerated<T>>.Some(Enumerated<T> { index: position, value: value.unwrap() });
    });
}

# Groups consecutive values into arrays of `size` (the last may be
# shorter). The caller owns and destroys each yielded array.
frame iterChunks<T>(source: Iter<T>, size: int) ret Iter<Array<T>> {
    if (size < 1) {
        throw "Iterator chunk size must be positive";
    }
    return _iterLink<Array<T>>(source.arena, || ret Option<Array<T>> {
        local inner: Iter<T> = source;
        local chunk: Array<T> = Array<T>.new(size);
        loop (chunk.length < size) {
            local value: Option<T> = inner.next();
            if (value.isNone()) {
                break;
            }
            chunk.push(value.unwrap());
        }
        if (chunk.length == 0) {
            chunk.destroy();
            return Option<Array<T>>.None;
        }
        return Option<Array<T>>.Some(chunk);
    });
}

# Integers from `start` (inclusive) to `end` (exclusive).
frame iterRange(start: int, end: int) ret Iter<int> {
    return iterRangeOf(Range.between(start, end));
}

# Integers from `start` towards `end` (exclusive) by `step` (may be negative).
frame iterRangeStep(start: int, end: int, step: int) ret Iter<int> {
    if (step == 0) {
        throw "Iterator step must not be zero";
    }
    return iterRangeOf(Range.new(start, end, step));
}

# The elements of a Range.
frame iterRangeOf(range: Range) ret Iter<int> {
    local arena: *IterArena = _iterArenaNew();
    local cursor: *IterIndex = cast<*IterIndex>(_iterArenaAlloc(arena, sizeof<IterIndex>()));
    cursor.index = 0;
    local length: int = range.len();
    return _iterLink<int>(arena, || ret Option<int> {
        if (cursor.index >= length) {
            return Option<int>.None;
        }
        local value: int = cast<int>(cast<long>(range.start) + (cast<long>(cursor.index) * range.step));
        cursor.index = cursor.index + 1;
        return Option<int>.Some(value);
    });
}

# start, start + 1, ... without end (wraps at the int limit). Use `take`.
frame iterCounter(start: int) ret Iter<int> {
    local arena: *IterArena = _iterArenaNew();
    local cursor: *IterIndex = cast<*IterIndex>(_iterArenaAlloc(arena, sizeof<IterIndex>()));
    cursor.index = start;
    return _iterLink<int>(arena, || ret Option<int> {
        local value: int = cursor.index;
        cursor.index = value + 1;
        return Option<int>.Some(value);
    });
}

# The bytes of a null-terminated string (borrowed).
frame iterChars(text: string) ret Iter<char> {
    local arena: *IterArena = _iterArenaNew();
    local cursor: *IterIndex = cast<*IterIndex>(_iterArenaAlloc(arena, sizeof<IterIndex>()));
    cursor.index = 0;
    return _iterLink<char>(arena, || ret Option<char> {
        if (text == nullptr) {
            return Option<char>.None;
        }
        local byte: char = text[cursor.index];
        if (byte == cast<char>(0)) {
            return Option<char>.None;
        }
        cursor.index = cursor.index + 1;
        return Option<char>.Some(byte);
    });
}

# Shorthand for Iter<T>.fromArray.
frame iterArray<T>(array: *Array<T>) ret Iter<T> {
    return Iter<T>.fromArray(array);
}

frame sumInt(values: *Iter<int>) ret long {
    local total: long = 0;
    loop {
        local value: Option<int> = values.next();
        if (value.isNone()) {
            return total;
        }
        total = total + cast<long>(value.unwrap());
    }
    return total;
}

frame sumLong(values: *Iter<long>) ret long {
    local total: long = 0;
    loop {
        local value: Option<long> = values.next();
        if (value.isNone()) {
            return total;
        }
        total = total + value.unwrap();
    }
    return total;
}

frame sumFloat(values: *Iter<float>) ret float {
    local total: float = 0.0;
    loop {
        local value: Option<float> = values.next();
        if (value.isNone()) {
            return total;
        }
        total = total + value.unwrap();
    }
    return total;
}

frame minInt(values: *Iter<int>) ret Option<int> {
    return values.minBy(|a: int, b: int| ret int {
        if (a < b) {
            return -1;
        }
        if (a > b) {
            return 1;
        }
        return 0;
    });
}

frame maxInt(values: *Iter<int>) ret Option<int> {
    return values.maxBy(|a: int, b: int| ret int {
        if (a < b) {
            return -1;
        }
        if (a > b) {
            return 1;
        }
        return 0;
    });
}
