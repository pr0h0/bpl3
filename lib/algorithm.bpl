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

    frame sortAsc(arr: *Array<int>) {
        local n: int = arr.len();
        local i: int = 0;
        loop (i < n) {
            local j: int = 0;
            loop (j < (n - 1)) {
                local a: int = arr.get(j);
                local b: int = arr.get(j + 1);
                if (a > b) {
                    arr.set(j, b);
                    arr.set(j + 1, a);
                }
                j = j + 1;
            }
            i = i + 1;
        }
    }

    frame sortDesc(arr: *Array<int>) {
        local n: int = arr.len();
        local i: int = 0;
        loop (i < n) {
            local j: int = 0;
            loop (j < (n - 1)) {
                local a: int = arr.get(j);
                local b: int = arr.get(j + 1);
                if (a < b) {
                    arr.set(j, b);
                    arr.set(j + 1, a);
                }
                j = j + 1;
            }
            i = i + 1;
        }
    }

    # Quick sort implementation for integers (ascending)
    frame quickSort(arr: *Array<int>) {
        Algorithm._quickSortIntHelper(arr, 0, arr.len() - 1);
    }

    frame _quickSortIntHelper(arr: *Array<int>, low: int, high: int) {
        if (low < high) {
            local pivotIdx: int = Algorithm._partitionInt(arr, low, high);
            Algorithm._quickSortIntHelper(arr, low, pivotIdx - 1);
            Algorithm._quickSortIntHelper(arr, pivotIdx + 1, high);
        }
    }

    frame _partitionInt(arr: *Array<int>, low: int, high: int) ret int {
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
            local mid: int = (left + right) / 2;
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

    frame sortAsc(arr: *Array<float>) {
        local n: int = arr.len();
        local i: int = 0;
        loop (i < n) {
            local j: int = 0;
            loop (j < (n - 1)) {
                local a: float = arr.get(j);
                local b: float = arr.get(j + 1);
                if (a > b) {
                    arr.set(j, b);
                    arr.set(j + 1, a);
                }
                j = j + 1;
            }
            i = i + 1;
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
        local size: int = ((end - start) / step) + 1;
        local result: Array<int> = Array<int>.new(size);
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
