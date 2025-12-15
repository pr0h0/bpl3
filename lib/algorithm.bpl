# Algorithms on Array<int>

export [Algorithm];

import [Array] from "std/array.bpl";

struct Algorithm {
    frame reverseInt(arr: *Array<int>) {
        local n: i32 = arr.len();
        local i: i32 = 0;
        loop (i < (n / 2)) {
            local j: i32 = n - 1 - i;
            local a: int = arr.get(i);
            local b: int = arr.get(j);
            arr.set(i, b);
            arr.set(j, a);
            i = i + 1;
        }
    }

    frame sortIntAsc(arr: *Array<int>) {
        local n: i32 = arr.len();
        local i: i32 = 0;
        loop (i < n) {
            local j: i32 = 0;
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

    frame binarySearchInt(arr: *Array<int>, target: int) ret int {
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
}
