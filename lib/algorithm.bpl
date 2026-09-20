# Algorithms on Arrays

export [Algorithm];

import [Array] from "std/array.bpl";
import [Rand] from "std/rand.bpl";

struct Algorithm {
    # ============ Integer Array Operations ============

    frame reverse(arr: *Array<int>) {
        local n: int = arr.len();
        local i: int = 0;
        loop (i < (n / 2)) {
            local j: int = n - 1 - i;
            local a: int = arr.get(i);
            local b: int = arr.get(j);
            arr.set(i, b);
            arr.set(j, a);
            i = i + 1;
        }
    }

    # Sorting here used to be a bubble sort, which costs n^2 comparisons even
    # on an array that is already in order: sorting 100000 sorted elements
    # meant ten billion comparisons. Heapsort is O(n log n) whatever the
    # input, sorts in place, and never recurses.
    frame sortAsc(arr: *Array<int>) {
        Algorithm._heapSortIntRange(arr, 0, arr.len() - 1, true);
    }

    frame sortDesc(arr: *Array<int>) {
        Algorithm._heapSortIntRange(arr, 0, arr.len() - 1, false);
    }

    # Restores the heap rooted at `root` within [low, high]. `ascending`
    # selects a max-heap, which leaves the range ascending, or a min-heap,
    # which leaves it descending.
    frame _siftDownIntRange(arr: *Array<int>, low: int, high: int, root: int, ascending: bool) {
        loop (true) {
            # Worked out in long: 2 * (root - low) leaves the int range for an
            # array of more than 2^30 elements.
            local childIndex: long = (cast<long>(root - low) * cast<long>(2)) + cast<long>(1) + cast<long>(low);
            if (childIndex > cast<long>(high)) {
                return;
            }
            local child: int = cast<int>(childIndex);
            if ((child + 1) <= high) {
                if (ascending) {
                    if (arr.get(child + 1) > arr.get(child)) { child = child + 1; }
                } else {
                    if (arr.get(child + 1) < arr.get(child)) { child = child + 1; }
                }
            }
            local rootValue: int = arr.get(root);
            local childValue: int = arr.get(child);
            local ordered: bool = rootValue >= childValue;
            if (!ascending) {
                ordered = rootValue <= childValue;
            }
            if (ordered) {
                return;
            }
            arr.set(root, childValue);
            arr.set(child, rootValue);
            root = child;
        }
    }

    frame _heapSortIntRange(arr: *Array<int>, low: int, high: int, ascending: bool) {
        if (high <= low) {
            return;
        }
        # Heapify from the last parent downwards.
        local start: int = low + (((high - low) - 1) / 2);
        loop (start >= low) {
            Algorithm._siftDownIntRange(arr, low, high, start, ascending);
            start = start - 1;
        }
        local end: int = high;
        loop (end > low) {
            local top: int = arr.get(low);
            arr.set(low, arr.get(end));
            arr.set(end, top);
            end = end - 1;
            Algorithm._siftDownIntRange(arr, low, end, low, ascending);
        }
    }

    frame _insertionSortIntRange(arr: *Array<int>, low: int, high: int) {
        loop (local i: int = low + 1; i <= high; i = i + 1) {
            local value: int = arr.get(i);
            local j: int = i - 1;
            loop ((j >= low) && (arr.get(j) > value)) {
                arr.set(j + 1, arr.get(j));
                j = j - 1;
            }
            arr.set(j + 1, value);
        }
    }

    # Quick sort implementation for integers (ascending)
    #
    # Taking the last element as the pivot made already-sorted input the worst
    # case: every partition peeled off one element, so sorting 100000 ordered
    # elements recursed 100000 deep and overflowed the stack. This is an
    # introsort instead. The pivot is the median of the first, middle and last
    # elements, so ordered input splits evenly; recursion always goes into the
    # smaller side and loops on the larger, which bounds the stack at about
    # log2(n) frames; and if the partitions turn out badly anyway the range is
    # finished with heapsort, which bounds the comparisons at O(n log n).
    frame quickSort(arr: *Array<int>) {
        local n: int = arr.len();
        if (n < 2) {
            return;
        }
        local limit: int = 0;
        local remaining: int = n;
        loop (remaining > 1) {
            limit = limit + 2;
            remaining = remaining / 2;
        }
        Algorithm._introSortInt(arr, 0, n - 1, limit);
    }

    frame _introSortInt(arr: *Array<int>, low: int, high: int, depthLimit: int) {
        loop (low < high) {
            if ((high - low) < 12) {
                Algorithm._insertionSortIntRange(arr, low, high);
                return;
            }
            if (depthLimit <= 0) {
                Algorithm._heapSortIntRange(arr, low, high, true);
                return;
            }
            depthLimit = depthLimit - 1;
            local pivotIdx: int = Algorithm._partitionInt(arr, low, high);
            if ((pivotIdx - low) < (high - pivotIdx)) {
                Algorithm._introSortInt(arr, low, pivotIdx - 1, depthLimit);
                low = pivotIdx + 1;
            } else {
                Algorithm._introSortInt(arr, pivotIdx + 1, high, depthLimit);
                high = pivotIdx - 1;
            }
        }
    }

    # Orders the first, middle and last elements and leaves their median at
    # `high`, where the partition below expects the pivot.
    frame _medianToHighInt(arr: *Array<int>, low: int, high: int) {
        local mid: int = low + ((high - low) / 2);
        if (arr.get(mid) < arr.get(low)) {
            local a: int = arr.get(mid);
            arr.set(mid, arr.get(low));
            arr.set(low, a);
        }
        if (arr.get(high) < arr.get(low)) {
            local b: int = arr.get(high);
            arr.set(high, arr.get(low));
            arr.set(low, b);
        }
        if (arr.get(high) < arr.get(mid)) {
            local c: int = arr.get(high);
            arr.set(high, arr.get(mid));
            arr.set(mid, c);
        }
        # arr[low] <= arr[mid] <= arr[high]; move the median into place.
        local median: int = arr.get(mid);
        arr.set(mid, arr.get(high));
        arr.set(high, median);
    }

    frame _partitionInt(arr: *Array<int>, low: int, high: int) ret int {
        Algorithm._medianToHighInt(arr, low, high);
        local pivot: int = arr.get(high);
        local i: int = low - 1;
        local j: int = low;
        loop (j < high) {
            if (arr.get(j) <= pivot) {
                i = i + 1;
                local temp: int = arr.get(i);
                arr.set(i, arr.get(j));
                arr.set(j, temp);
            }
            j = j + 1;
        }
        local temp: int = arr.get(i + 1);
        arr.set(i + 1, arr.get(high));
        arr.set(high, temp);
        return i + 1;
    }

    frame binarySearch(arr: *Array<int>, target: int) ret int {
        local left: int = 0;
        local right: int = arr.len() - 1;
        loop (left <= right) {
            # left + right overflows once the array passes 2^30 elements.
            local mid: int = left + ((right - left) / 2);
            local v: int = arr.get(mid);
            if (v == target) {
                return mid;
            }
            if (v < target) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        return -1;
    }

    frame min(arr: *Array<int>) ret int {
        if (arr.len() == 0) 
            return 0;
        local minVal: int = arr.get(0);
        local i: int = 1;
        loop (i < arr.len()) {
            local v: int = arr.get(i);
            if (v < minVal) 
                minVal = v;
            i = i + 1;
        }
        return minVal;
    }

    frame max(arr: *Array<int>) ret int {
        if (arr.len() == 0) 
            return 0;
        local maxVal: int = arr.get(0);
        local i: int = 1;
        loop (i < arr.len()) {
            local v: int = arr.get(i);
            if (v > maxVal) 
                maxVal = v;
            i = i + 1;
        }
        return maxVal;
    }

    frame sum(arr: *Array<int>) ret long {
        local sum: long = 0;
        local i: int = 0;
        loop (i < arr.len()) {
            sum = sum + cast<long>(arr.get(i));
            i = i + 1;
        }
        return sum;
    }

    frame average(arr: *Array<int>) ret float {
        if (arr.len() == 0) 
            return 0.0;
        local sum: long = Algorithm.sum(arr);
        return cast<float>(sum) / cast<float>(arr.len());
    }

    frame fill(arr: *Array<int>, value: int) {
        local i: int = 0;
        loop (i < arr.len()) {
            arr.set(i, value);
            i = i + 1;
        }
    }

    frame count(arr: *Array<int>, value: int) ret int {
        local count: int = 0;
        local i: int = 0;
        loop (i < arr.len()) {
            if (arr.get(i) == value) 
                count = count + 1;
            i = i + 1;
        }
        return count;
    }

    frame shuffle(arr: *Array<int>, rng: *Rand) {
        local n: int = arr.len();
        local i: int = n - 1;
        loop (i > 0) {
            local j: int = rng.range(0, i + 1);
            local temp: int = arr.get(i);
            arr.set(i, arr.get(j));
            arr.set(j, temp);
            i = i - 1;
        }
    }

    frame isSorted(arr: *Array<int>) ret bool {
        if (arr.len() <= 1) 
            return true;
        local i: int = 0;
        loop (i < (arr.len() - 1)) {
            if (arr.get(i) > arr.get(i + 1)) 
                return false;
            i = i + 1;
        }
        return true;
    }

    frame unique(arr: *Array<int>) ret Array<int> {
        local result: Array<int> = Array<int>.new(arr.len());
        local i: int = 0;
        loop (i < arr.len()) {
            local val: int = arr.get(i);
            if (!result.contains(val)) {
                result.push(val);
            }
            i = i + 1;
        }
        return result;
    }

    # ============ Float Array Operations ============

    frame min(arr: *Array<float>) ret float {
        if (arr.len() == 0) 
            return 0.0;
        local minVal: float = arr.get(0);
        local i: int = 1;
        loop (i < arr.len()) {
            local v: float = arr.get(i);
            if (v < minVal) 
                minVal = v;
            i = i + 1;
        }
        return minVal;
    }

    frame max(arr: *Array<float>) ret float {
        if (arr.len() == 0) 
            return 0.0;
        local maxVal: float = arr.get(0);
        local i: int = 1;
        loop (i < arr.len()) {
            local v: float = arr.get(i);
            if (v > maxVal) 
                maxVal = v;
            i = i + 1;
        }
        return maxVal;
    }

    frame sum(arr: *Array<float>) ret float {
        local sum: float = 0.0;
        local i: int = 0;
        loop (i < arr.len()) {
            sum = sum + arr.get(i);
            i = i + 1;
        }
        return sum;
    }

    frame average(arr: *Array<float>) ret float {
        if (arr.len() == 0) 
            return 0.0;
        local sum: float = Algorithm.sum(arr);
        return sum / cast<float>(arr.len());
    }

    # Heapsort, for the same reason as the integer form above.
    frame sortAsc(arr: *Array<float>) {
        local high: int = arr.len() - 1;
        if (high <= 0) {
            return;
        }
        local start: int = (high - 1) / 2;
        loop (start >= 0) {
            Algorithm._siftDownFloat(arr, start, high);
            start = start - 1;
        }
        local end: int = high;
        loop (end > 0) {
            local top: float = arr.get(0);
            arr.set(0, arr.get(end));
            arr.set(end, top);
            end = end - 1;
            Algorithm._siftDownFloat(arr, 0, end);
        }
    }

    frame _siftDownFloat(arr: *Array<float>, root: int, high: int) {
        loop (true) {
            local childIndex: long = (cast<long>(root) * cast<long>(2)) + cast<long>(1);
            if (childIndex > cast<long>(high)) {
                return;
            }
            local child: int = cast<int>(childIndex);
            if ((child + 1) <= high) {
                if (arr.get(child + 1) > arr.get(child)) { child = child + 1; }
            }
            local rootValue: float = arr.get(root);
            local childValue: float = arr.get(child);
            if (rootValue >= childValue) {
                return;
            }
            arr.set(root, childValue);
            arr.set(child, rootValue);
            root = child;
        }
    }

    # ============ Range Generation ============

    frame range(start: int, end: int) ret Array<int> {
        local result: Array<int> = Array<int>.new(end - start);
        local i: int = start;
        loop (i < end) {
            result.push(i);
            i = i + 1;
        }
        return result;
    }

    frame rangeStep(start: int, end: int, step: int) ret Array<int> {
        # A step of zero produces nothing, which is what Range.len() answers
        # for the same case. The size below divided by it and killed the
        # program with a division by zero before either branch was reached.
        if (step == 0) {
            return Array<int>.new(0);
        }
        # The distance between the endpoints can exceed int, and the count is
        # only ever a bound on the capacity, so it is worked out in long.
        local span: long = cast<long>(end) - cast<long>(start);
        local size: long = (span / cast<long>(step)) + cast<long>(1);
        if (size < cast<long>(0)) { size = cast<long>(0); }
        if (size > cast<long>(2147483646)) { size = cast<long>(2147483646); }
        local result: Array<int> = Array<int>.new(cast<int>(size));
        local i: int = start;
        if (step > 0) {
            loop (i < end) {
                result.push(i);
                i = i + step;
            }
        } else if (step < 0) {
            loop (i > end) {
                result.push(i);
                i = i + step;
            }
        }
        return result;
    }

    # ============ Copy and Clone ============

    frame copy(src: *Array<int>, dest: *Array<int>) {
        local i: int = 0;
        loop (i < src.len()) {
            if (i < dest.len()) {
                dest.set(i, src.get(i));
            } else {
                dest.push(src.get(i));
            }
            i = i + 1;
        }
    }

    # ============ Merge ============

    frame merge(a: *Array<int>, b: *Array<int>) ret Array<int> {
        local result: Array<int> = Array<int>.new(a.len() + b.len());
        local i: int = 0;
        loop (i < a.len()) {
            result.push(a.get(i));
            i = i + 1;
        }
        i = 0;
        loop (i < b.len()) {
            result.push(b.get(i));
            i = i + 1;
        }
        return result;
    }

    # ============ Comparison ============

    frame equals(a: *Array<int>, b: *Array<int>) ret bool {
        if (a.len() != b.len()) 
            return false;
        local i: int = 0;
        loop (i < a.len()) {
            if (a.get(i) != b.get(i)) 
                return false;
            i = i + 1;
        }
        return true;
    }
}
