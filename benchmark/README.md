# BPL Benchmarks

This directory contains benchmark programs to compare the performance of BPL against C, Go, Python, and JavaScript.

## Structure

Each benchmark is contained in its own subdirectory (e.g., `loop_to_million`).
Inside each directory, you will find:

- `loop.bpl`: The BPL implementation
- `loop.c`: The C implementation
- `loop.go`: The Go implementation
- `loop.py`: The Python implementation
- `loop.js`: The JavaScript implementation
- `run.sh`: A legacy per-benchmark script for the original benchmarks.

The recommended runner is `run_benchmark.ts`. It compiles available languages, validates output against BPL, runs warmups/repeated timings, and reports min/median/average wall-clock time.

## Benchmark Coverage

- `bit_twiddle`: tight 32-bit xorshift/bitmask loop. Shows integer bitwise codegen and register-heavy loops.
- `binary_tree`: pointer-heavy allocation, recursion, and tree traversal.
- `constant_numerator_division`: dynamic divisors with a constant numerator. Tracks checked integer division/modulo overhead when the `INT_MIN / -1` overflow guard is provably unreachable.
- `fibonacci_recursive`: recursive call overhead.
- `loop_to_million`: integer arithmetic loop with modulo.
- `mandelbrot`: floating-point nested loops.
- `matrix_multiplication`: raw pointer memory access and integer matrix multiplication.
- `noinline_calls`: explicit non-inlined function call overhead.
- `prime_sieve`: byte-addressed sieve over a 10M element working set.
- `vector_dot_product`: raw int64 vector initialization and dot-product throughput.

## Running Benchmarks

Run all benchmarks:

```bash
./benchmark/run_all.sh
```

Run selected benchmarks or languages:

```bash
./benchmark/run_all.sh fibonacci_recursive mandelbrot --runs 5
./benchmark/run_all.sh --language bpl,c,javascript --runs 3
./benchmark/run_all.sh bit_twiddle prime_sieve vector_dot_product --runs 3 --warmups 1
```

Write structured JSON results:

```bash
./benchmark/run_all.sh --json > benchmark/latest-results.json
```

Show BPL-vs-C median ratios without running the full language set:

```bash
./benchmark/run_all.sh --language bpl,c --runs 5
```

Fail the run when BPL is more than 5% slower than C on any benchmark:

```bash
./benchmark/run_all.sh --language bpl,c --runs 5 --max-bpl-slower 5
```

Measure compiler phase timings for the synthetic 5k compile fixture:

```bash
bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5
```

Write machine-readable phase results:

```bash
bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --json
```

Measure the same synthetic fixture with the existing executable-style top-level
function tree shaker enabled:

```bash
bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --tree-shake-top-level-functions
```

The phase JSON includes `lex`, `parse`, `typecheck`, `codegen`, and `full`
median/average timings plus `tokenSignature` and `irHash`, which makes local
performance changes easier to compare without accepting behavior drift.

Compare a candidate run against a saved phase baseline:

```bash
bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --compare /tmp/bpl3-baseline-phases.json --max-phase-regression 2 --max-full-regression 1
```

The compare mode validates `tokenCount`, `tokenSignature`, and `irHash` before
reporting median deltas for every phase. It exits non-zero when output
signatures drift, when any of `lex`, `parse`, `typecheck`, or `codegen`
regresses beyond `--max-phase-regression`, or when `full` regresses beyond
`--max-full-regression`.

The baseline file passed to `--compare` may be either a raw phase JSON result
from `--json` or the wrapped `{ result, comparison }` JSON emitted by a previous
comparison run. This lets you re-run a candidate against the last accepted
comparison output without manually extracting `.result`.

If a clean control run on the current machine is slower than the saved baseline,
keep the saved baseline for `tokenSignature` and `irHash` validation but gate
timings against a fresh same-environment control result:

```bash
bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --tree-shake-top-level-functions --json > /tmp/bpl3-control-phases.json
bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --tree-shake-top-level-functions --compare /tmp/bpl3-baseline-phases.json --timing-baseline /tmp/bpl3-control-phases.json --gate-phases codegen,full --max-phase-regression 2 --max-full-regression 1
```

`--timing-baseline` must have the same `tokenCount`, `tokenSignature`, and
`irHash` as `--compare`; otherwise the comparison fails before applying timing
thresholds. This prevents local CPU load or runner drift from hiding behavior
changes while still allowing phase gates to compare candidate timings against a
same-environment control.

When a candidate is phase-local but unrelated phases have also drifted, add a
separate clean-control result with `--noise-control`. The control must match the
saved behavior baseline signatures. Positive control drift is subtracted from
candidate timing deltas for threshold checks, while raw deltas and normalized
deltas are both reported:

```bash
bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --tree-shake-top-level-functions --json > /tmp/bpl3-clean-control-phases.json
bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --tree-shake-top-level-functions --compare /tmp/bpl3-baseline-phases.json --timing-baseline /tmp/bpl3-control-phases.json --noise-control /tmp/bpl3-clean-control-phases.json --gate-phases codegen,full --max-phase-regression 2 --max-full-regression 1 --max-noise-control-regression 3
```

`--noise-control` does not relax signature validation. It only prevents broad
same-run host drift from failing a phase gate when a matching clean-control run
already shows that drift without the candidate change. Add
`--max-noise-control-regression` for micro-optimization work so a too-noisy
clean control fails the run instead of normalizing away an unreliable
measurement.

If a candidate comparison already wrote a JSON artifact and later clean-control
evidence shows broad host drift, re-check the saved candidate without
remeasuring it:

```bash
bun benchmark/measure_compilation.ts --mode phases --compare /tmp/bpl3-baseline-phases.json --timing-baseline /tmp/bpl3-control-phases.json --noise-control /tmp/bpl3-late-clean-control-phases.json --candidate-result /tmp/bpl3-candidate-phases.json --gate-phases typecheck,full --max-phase-regression 2 --max-full-regression 1 --max-noise-control-regression 3 --json
```

`--candidate-result` accepts either raw phase JSON or the wrapped
`{ result, comparison }` JSON emitted by compare mode. This is useful after
reverting a noisy candidate: keep the candidate artifact, capture a fresh clean
control from the reverted tree, then compare the saved candidate against that
control to decide whether the full-phase failure was broad host drift or a real
candidate regression.

For phase-specific compiler work, keep all reporting and signature validation
but gate only the affected phase plus `full`:

```bash
bun benchmark/measure_compilation.ts --mode phases --functions 5000 --rounds 31 --warmups 5 --compare /tmp/bpl3-baseline-phases.json --gate-phases codegen,full --max-phase-regression 2 --max-full-regression 1
```

When `--gate-phases` is provided, ungated phase deltas are still printed but do
not fail the run. Signature drift always fails the comparison.

## Requirements

- `bun` (for running the BPL compiler)
- `clang` or `gcc` (for C; the runner prefers `clang`)
- `go` (for Go)
- `python3` (for Python)
- `node` (for JavaScript)
