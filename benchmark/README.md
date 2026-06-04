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
