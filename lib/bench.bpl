# Micro-benchmarks with automatic iteration calibration.
#
# `Bench.measure(body)` runs `body` repeatedly, doubling the iteration count
# until a batch takes at least `minimumMs` (100 ms by default), and reports
# the time per call from the monotonic clock. Feed results through
# `Bench.consume` so the optimizer cannot delete the measured work.

export [Bench];
export [BenchResult];

import [Time] from "std/time.bpl";

extern printf(fmt: string, ...) ret int;

global BENCH_SINK: long = 0;

struct BenchResult {
    iterations: long,
    totalUs: long,
    nsPerOp: float,
    frame opsPerSecond(this: *BenchResult) ret float {
        if (this.nsPerOp <= 0.0) {
            return 0.0;
        }
        return 1000000000.0 / this.nsPerOp;
    }
}

struct Bench {
    # Folds a value into a global so the computation that produced it stays.
    frame consume(value: long) {
        BENCH_SINK = BENCH_SINK ^ value;
    }

    # Runs `body` exactly `iterations` times.
    frame runFixed(iterations: long, body: Lambda<void>()) ret BenchResult {
        local start: long = Time.monotonicUs();
        loop (local i: long = 0; i < iterations; i = i + 1) {
            body();
        }
        local elapsed: long = Time.monotonicUs() - start;
        local perOp: float = 0.0;
        if (iterations > cast<long>(0)) {
            perOp = (cast<float>(elapsed) * 1000.0) / cast<float>(iterations);
        }
        return BenchResult { iterations: iterations, totalUs: elapsed, nsPerOp: perOp };
    }

    # Calibrates until one batch takes at least `minimumMs` milliseconds
    # (or a billion iterations), then returns that batch.
    frame measureFor(minimumMs: long, body: Lambda<void>()) ret BenchResult {
        local iterations: long = 1;
        loop {
            local result: BenchResult = Bench.runFixed(iterations, body);
            if ((result.totalUs >= (minimumMs * 1000)) || (iterations >= cast<long>(1000000000))) {
                return result;
            }
            iterations = iterations * 2;
        }
        return Bench.runFixed(1, body);
    }

    frame measure(body: Lambda<void>()) ret BenchResult {
        return Bench.measureFor(100, body);
    }

    # Measures `body` and prints "name: N ns/op (M iterations)".
    frame report(name: string, body: Lambda<void>()) ret BenchResult {
        local result: BenchResult = Bench.measure(body);
        printf("%s: %.1f ns/op (%ld iterations)\n", name, result.nsPerOp, result.iterations);
        return result;
    }
}
