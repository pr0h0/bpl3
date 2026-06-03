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

## Requirements

- `bun` (for running the BPL compiler)
- `clang` or `gcc` (for C; the runner prefers `clang`)
- `go` (for Go)
- `python3` (for Python)
- `node` (for JavaScript)
