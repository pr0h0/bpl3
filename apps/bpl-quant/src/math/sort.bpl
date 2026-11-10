# Sorting and selection on raw buffers.
#
# Introsort (quicksort with median-of-three, falling back to heapsort past a
# depth limit, insertion sort for short runs) for doubles, plus an argsort
# that orders an index buffer by key, and quickselect for order statistics.

import malloc, free, memcpy from "std/c.bpl";

export [Sort];

struct Sort {
    frame insertion(a: *float, lo: int, hi: int) {
        loop (local i: int = lo + 1; i <= hi; i = i + 1) {
            local v: float = a[i];
            local j: int = i - 1;
            loop ((j >= lo) && (a[j] > v)) {
                a[j + 1] = a[j];
                j = j - 1;
            }
            a[j + 1] = v;
        }
    }

    frame swap(a: *float, i: int, j: int) {
        local t: float = a[i];
        a[i] = a[j];
        a[j] = t;
    }

    frame siftDown(a: *float, base: int, start: int, n: int) {
        local root: int = start;
        loop {
            local child: int = (2 * root) + 1;
            if (child >= n) {
                return;
            }
            if (((child + 1) < n) && (a[base + child] < a[base + child + 1])) {
                child = child + 1;
            }
            if (a[base + root] < a[base + child]) {
                Sort.swap(a, base + root, base + child);
                root = child;
            } else {
                return;
            }
        }
    }

    frame heapsort(a: *float, lo: int, hi: int) {
        local n: int = (hi - lo) + 1;
        local start: int = (n / 2) - 1;
        loop (start >= 0) {
            Sort.siftDown(a, lo, start, n);
            start = start - 1;
        }
        local end: int = n - 1;
        loop (end > 0) {
            Sort.swap(a, lo, lo + end);
            Sort.siftDown(a, lo, 0, end);
            end = end - 1;
        }
    }

    frame medianOfThree(a: *float, lo: int, hi: int) ret float {
        local mid: int = lo + ((hi - lo) / 2);
        if (a[mid] < a[lo]) {
            Sort.swap(a, mid, lo);
        }
        if (a[hi] < a[lo]) {
            Sort.swap(a, hi, lo);
        }
        if (a[hi] < a[mid]) {
            Sort.swap(a, hi, mid);
        }
        return a[mid];
    }

    frame introsortLoop(a: *float, lo0: int, hi0: int, depth0: int) {
        local lo: int = lo0;
        local hi: int = hi0;
        local depth: int = depth0;
        loop ((hi - lo) > 16) {
            if (depth == 0) {
                Sort.heapsort(a, lo, hi);
                return;
            }
            depth = depth - 1;
            local pivot: float = Sort.medianOfThree(a, lo, hi);
            local i: int = lo;
            local j: int = hi;
            loop (i <= j) {
                loop (a[i] < pivot) {
                    i = i + 1;
                }
                loop (a[j] > pivot) {
                    j = j - 1;
                }
                if (i <= j) {
                    Sort.swap(a, i, j);
                    i = i + 1;
                    j = j - 1;
                }
            }
            # Recurse into the smaller side, iterate over the larger.
            if ((j - lo) < (hi - i)) {
                Sort.introsortLoop(a, lo, j, depth);
                lo = i;
            } else {
                Sort.introsortLoop(a, i, hi, depth);
                hi = j;
            }
        }
        Sort.insertion(a, lo, hi);
    }

    frame floats(a: *float, n: int) {
        if (n < 2) {
            return;
        }
        local depth: int = 0;
        local m: int = n;
        loop (m > 0) {
            depth = depth + 2;
            m = m >> 1;
        }
        Sort.introsortLoop(a, 0, n - 1, depth);
    }

    frame isSorted(a: *float, n: int) ret bool {
        loop (local i: int = 1; i < n; i = i + 1) {
            if (a[i] < a[i - 1]) {
                return false;
            }
        }
        return true;
    }

    frame copySorted(a: *float, n: int) ret *float {
        local out: *float = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        if (n > 0) {
            memcpy(cast<*void>(out), cast<*void>(a), cast<long>(n) * sizeof(float));
        }
        Sort.floats(out, n);
        return out;
    }

    # Stable merge-sort of indices by key[index] (ascending).
    frame argsort(keys: *float, idx: *int, n: int) {
        loop (local i: int = 0; i < n; i = i + 1) {
            idx[i] = i;
        }
        if (n < 2) {
            return;
        }
        local tmp: *int = cast<*int>(malloc(cast<long>(n) * sizeof(int)));
        local width: int = 1;
        loop (width < n) {
            local left: int = 0;
            loop (left < n) {
                local mid: int = left + width;
                if (mid > n) {
                    mid = n;
                }
                local right: int = left + (2 * width);
                if (right > n) {
                    right = n;
                }
                local i: int = left;
                local j: int = mid;
                local k: int = left;
                loop ((i < mid) && (j < right)) {
                    if (keys[idx[j]] < keys[idx[i]]) {
                        tmp[k] = idx[j];
                        j = j + 1;
                    } else {
                        tmp[k] = idx[i];
                        i = i + 1;
                    }
                    k = k + 1;
                }
                loop (i < mid) {
                    tmp[k] = idx[i];
                    i = i + 1;
                    k = k + 1;
                }
                loop (j < right) {
                    tmp[k] = idx[j];
                    j = j + 1;
                    k = k + 1;
                }
                left = left + (2 * width);
            }
            memcpy(cast<*void>(idx), cast<*void>(tmp), cast<long>(n) * sizeof(int));
            width = width * 2;
        }
        free(cast<*void>(tmp));
    }

    # k-th smallest (0-based); reorders a.
    frame select(a: *float, n: int, k: int) ret float {
        local lo: int = 0;
        local hi: int = n - 1;
        loop (lo < hi) {
            local pivot: float = Sort.medianOfThree(a, lo, hi);
            local i: int = lo;
            local j: int = hi;
            loop (i <= j) {
                loop (a[i] < pivot) {
                    i = i + 1;
                }
                loop (a[j] > pivot) {
                    j = j - 1;
                }
                if (i <= j) {
                    Sort.swap(a, i, j);
                    i = i + 1;
                    j = j - 1;
                }
            }
            if (k <= j) {
                hi = j;
            } else if (k >= i) {
                lo = i;
            } else {
                return a[k];
            }
        }
        return a[k];
    }

    frame longs(a: *long, n: int) {
        # Shell sort with Ciura gaps: good enough for id lists.
        local gaps: int[8] = [701, 301, 132, 57, 23, 10, 4, 1];
        loop (local g: int = 0; g < 8; g = g + 1) {
            local gap: int = gaps[g];
            loop (local i: int = gap; i < n; i = i + 1) {
                local v: long = a[i];
                local j: int = i;
                loop ((j >= gap) && (a[j - gap] > v)) {
                    a[j] = a[j - gap];
                    j = j - gap;
                }
                a[j] = v;
            }
        }
    }

    frame ints(a: *int, n: int) {
        local gaps: int[8] = [701, 301, 132, 57, 23, 10, 4, 1];
        loop (local g: int = 0; g < 8; g = g + 1) {
            local gap: int = gaps[g];
            loop (local i: int = gap; i < n; i = i + 1) {
                local v: int = a[i];
                local j: int = i;
                loop ((j >= gap) && (a[j - gap] > v)) {
                    a[j] = a[j - gap];
                    j = j - gap;
                }
                a[j] = v;
            }
        }
    }

    # Binary search: first index with a[i] >= x in a sorted buffer.
    frame lowerBound(a: *float, n: int, x: float) ret int {
        local lo: int = 0;
        local hi: int = n;
        loop (lo < hi) {
            local mid: int = (lo + hi) >> 1;
            if (a[mid] < x) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    frame upperBound(a: *float, n: int, x: float) ret int {
        local lo: int = 0;
        local hi: int = n;
        loop (lo < hi) {
            local mid: int = (lo + hi) >> 1;
            if (a[mid] <= x) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }
}
