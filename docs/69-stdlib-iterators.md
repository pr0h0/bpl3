# Lazy Iterators

`std/iter.bpl` provides `Iter<T>`, a lazy and chainable sequence. It wraps any
`Iterator<T>` from `std/iter_specs.bpl`, an `Array<T>`, a `Range` or a step
function. Adapters return a new `Iter` and run only when a consumer (or `next`)
pulls values.

<!-- bpl-doc: run=iter-chain -->

```bpl
import [Iter], iterRange from "std/iter.bpl";
import [Array] from "std/array.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local evens: Iter<int> = iterRange(0, 20)
        .map<int>(|x: int| ret int {
            return x * x;
        })
        .filter(|x: int| ret bool {
            return (x % 2) == 0;
        })
        .take(4);
    local values: Array<int> = evens.collect();
    printf("%d %d %d %d\n", values.get(0), values.get(1), values.get(2), values.get(3)); # 0 4 16 36
    values.destroy();
    evens.destroy();
    return 0;
}
```

## Ownership

An adapter consumes its receiver: keep using only the newest iterator of a
chain. Each chain has one internal arena holding its state and closure
contexts, so calling `destroy` once on the final iterator releases the whole
chain. `zip`, `chain` and `flatMap` adopt the arenas of their other iterators.
Consumers such as `collect` do not destroy. Iterators made from an `Array`,
a pointer or a string borrow their source, which must stay unchanged and alive
while it is iterated. User callbacks that capture variables keep their own
capture storage, as everywhere in BPL.

## Sources

| Function                                         | Yields                                   |
| ------------------------------------------------ | ---------------------------------------- |
| `Iter<T>.fromArray(&array)` / `iterArray<T>(&a)` | Array elements, borrowed                 |
| `Iter<T>.fromIterator<I>(iterator)`              | Values of any `I: Iterator<T>`           |
| `Iter<T>.fromPointer(data, count)`               | `count` values starting at `data`        |
| `Iter<T>.fromFn(step)`                           | `step()` until it returns `None`         |
| `Iter<T>.empty()`, `once(v)`                     | Nothing, or `v` once                     |
| `Iter<T>.repeat(v)`, `repeatN(v, n)`             | `v` forever, or `n` times                |
| `Iter<T>.successors(first, next)`                | `first`, `next(first)`, ... until `None` |
| `iterRange(a, b)`, `iterRangeStep(a, b, s)`      | Integers in `[a, b)`, optionally stepped |
| `iterRangeOf(range)`, `iterCounter(start)`       | A `Range`, or an endless counter         |
| `iterChars(text)`                                | The bytes of a null-terminated string    |

## Adapters

`map<U>`, `filter`, `filterMap<U>`, `take`, `skip`, `takeWhile`, `skipWhile`,
`stepBy`, `zip<U>` (yields `Zipped<T, U>` with `first`/`second`), `chain`,
`inspect`, `flatMap<U>`, `scan<S>`, `dedupBy`, `fuse` and `peekable()` (a
`Peekable<T>` with `peek`, `next` and `nextIf`).

`iterEnumerate<T>(it)` yields `Enumerated<T>` (`index`, `value`) and
`iterChunks<T>(it, size)` yields arrays of up to `size` values that the caller
destroys. They are free functions because a method returning
`Iter<Enumerated<T>>` currently makes the compiler instantiate nested types
without end (BUG-602). Iterators carry these structs instead of tuples because
BPL does not support pointers to tuple types.

## Consumers

`collect`, `collectInto(&array)`, `sortedBy(compare)`, `count`, `fold<U>`,
`reduce`, `forEach`, `any`, `all`, `find`, `position`, `last`, `nth`,
`minBy`, `maxBy`, `partition` (returns `(Array<T>, Array<T>)`) and
`advanceBy`. For numeric iterators, `sumInt`, `sumLong`, `sumFloat`, `minInt`
and `maxInt` take a pointer to the iterator. `sumInt` accumulates in `long`.
