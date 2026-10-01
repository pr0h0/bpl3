# Standard Library: Algorithms

The `Algorithm` struct provides common algorithms for working with arrays.

## Import

```bpl
import [Algorithm] from "std/algorithm.bpl";
import [Array] from "std/array.bpl";
```

## Preconditions and cost

`sortAsc`, `sortDesc` and the float `sortAsc` are heapsorts: O(n log n)
comparisons whatever the input, sorted in place, no recursion. `quickSort` is
an introsort, so it is O(n log n) as well: it picks the median of the first,
middle and last elements as its pivot, recurses into the smaller partition and
loops on the larger so the stack stays at about log2(n) frames, and finishes a
range with heapsort if the partitions turn out badly anyway. None of the sorts
is stable, which is unobservable for the numeric arrays they take.
`binarySearch` requires ascending order. Empty min/max/average calls return
zero. `rangeStep` with a step of zero produces an empty array, matching
`Range.len()`.
`unique` allocates a new Array and uses linear containment checks, so its worst
case is quadratic. `merge` concatenates; it does not merge sorted runs.
Destroy arrays returned by `unique`, `range`, `rangeStep`, and `merge`.
Shuffle inherits the current bias and edge cases of `Rand.range`.

## Integer Array Operations

| Function                                                        | Description                                       |
| --------------------------------------------------------------- | ------------------------------------------------- |
| `Algorithm.sortAsc(arr: *Array<int>)`                           | Sort ascending (heapsort)                         |
| `Algorithm.sortDesc(arr: *Array<int>)`                          | Sort descending (heapsort)                        |
| `Algorithm.quickSort(arr: *Array<int>)`                         | Introsort (ascending)                             |
| `Algorithm.reverse(arr: *Array<int>)`                           | Reverse array in place                            |
| `Algorithm.binarySearch(arr: *Array<int>, target: int) ret int` | Binary search (returns index or -1)               |
| `Algorithm.min(arr: *Array<int>) ret int`                       | Find minimum value                                |
| `Algorithm.max(arr: *Array<int>) ret int`                       | Find maximum value                                |
| `Algorithm.sum(arr: *Array<int>) ret long`                      | Sum of all elements                               |
| `Algorithm.average(arr: *Array<int>) ret float`                 | Average of elements                               |
| `Algorithm.fill(arr: *Array<int>, value: int)`                  | Fill array with value                             |
| `Algorithm.count(arr: *Array<int>, value: int) ret int`         | Count occurrences                                 |
| `Algorithm.shuffle(arr: *Array<int>, rng: *Rand)`               | Fisher-Yates shuffle                              |
| `Algorithm.isSorted(arr: *Array<int>) ret bool`                 | Check if sorted ascending                         |
| `Algorithm.unique(arr: *Array<int>) ret Array<int>`             | Copy distinct values, preserving first-seen order |

## Float Array Operations

| Function                                          | Description         |
| ------------------------------------------------- | ------------------- |
| `Algorithm.sortAsc(arr: *Array<float>)`           | Sort ascending (heapsort) |
| `Algorithm.min(arr: *Array<float>) ret float`     | Find minimum value  |
| `Algorithm.max(arr: *Array<float>) ret float`     | Find maximum value  |
| `Algorithm.sum(arr: *Array<float>) ret float`     | Sum of all elements |
| `Algorithm.average(arr: *Array<float>) ret float` | Average of elements |

## Range Generation

| Function                                                              | Description           |
| --------------------------------------------------------------------- | --------------------- |
| `Algorithm.range(start: int, end: int) ret Array<int>`                | Generate [start, end) |
| `Algorithm.rangeStep(start: int, end: int, step: int) ret Array<int>` | Generate with step    |

## Array Utilities

| Function                                                         | Description        |
| ---------------------------------------------------------------- | ------------------ |
| `Algorithm.copy(src: *Array<int>, dest: *Array<int>)`            | Copy elements      |
| `Algorithm.merge(a: *Array<int>, b: *Array<int>) ret Array<int>` | Concatenate arrays |
| `Algorithm.equals(a: *Array<int>, b: *Array<int>) ret bool`      | Check equality     |

## Example

```bpl
import [Algorithm] from "std/algorithm.bpl";
import [Array] from "std/array.bpl";
import [Rand] from "std/rand.bpl";

extern printf(fmt: string, ...);

frame main() {
    local arr: Array<int> = Array<int>.new(5);
    arr.push(30);
    arr.push(10);
    arr.push(20);

    # Sort ascending
    Algorithm.sortAsc(&arr);
    printf("Sorted: %d, %d, %d\n", arr.get(0), arr.get(1), arr.get(2));

    # Binary search
    local idx: int = Algorithm.binarySearch(&arr, 20);
    printf("Index of 20: %d\n", idx);

    # Statistics
    printf("Min: %d\n", Algorithm.min(&arr));
    printf("Max: %d\n", Algorithm.max(&arr));
    printf("Sum: %ld\n", Algorithm.sum(&arr));
    printf("Average: %f\n", Algorithm.average(&arr));

    # Range generation
    local range: Array<int> = Algorithm.range(0, 5);
    printf("Range: %d, %d, %d, %d, %d\n",
           range.get(0), range.get(1), range.get(2), range.get(3), range.get(4));

    arr.destroy();
    range.destroy();
}
```


## Range length limits

`Range` from `std/range.bpl` stores integer sequences without allocating their
contents. Its `len()` result is an `int`: counts up to 2,147,483,647 are supported.
Larger counts throw `"Range length exceeds int"` rather than wrapping negative
or appearing empty. `reverse()` uses that count and throws for the same oversized
ranges. Zero-step ranges continue to report zero length.
