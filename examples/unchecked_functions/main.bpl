import printf from "std/c.bpl";

# A hot loop compiled without bounds, null and stack-depth checks.
@[unchecked]
frame weightedSum(values: *int, weights: int[8], n: int) ret int {
    local total: int = 0;
    loop (local i: int = 0; i < n; i = i + 1) {
        total = total + (values[i] * weights[i & 7]);
    }
    return total;
}

struct Histogram {
    buckets: int[4],

    @[unchecked]
    frame add(this: *Histogram, value: int) {
        this.buckets[value & 3] = this.buckets[value & 3] + 1;
    }
}

@[unchecked]
frame largest<T>(values: *T, n: int) ret T {
    local best: T = values[0];
    loop (local i: int = 1; i < n; i = i + 1) {
        if (values[i] > best) {
            best = values[i];
        }
    }
    return best;
}

# Checked code still reports a bad index.
frame checkedAt(values: int[4], index: int) ret int {
    return values[index];
}

frame main() ret int {
    local values: int[6] = [3, 1, 4, 1, 5, 9];
    local weights: int[8] = [1, 2, 3, 4, 5, 6, 7, 8];
    printf("weighted %d\n", weightedSum(&values[0], weights, 6));

    local histogram: Histogram = Histogram { buckets: [0, 0, 0, 0] };
    loop (local i: int = 0; i < 6; i = i + 1) {
        histogram.add(values[i]);
    }
    printf("buckets %d %d %d %d\n", histogram.buckets[0], histogram.buckets[1], histogram.buckets[2], histogram.buckets[3]);

    local doubles: double[3] = [2.5, 7.25, 1.0];
    printf("largest %d %.2f\n", largest<int>(&values[0], 6), largest<double>(&doubles[0], 3));

    local small: int[4] = [1, 2, 3, 4];
    try {
        printf("%d\n", checkedAt(small, 9));
    } catch {
        printf("checked index caught\n");
    }
    return 0;
}
