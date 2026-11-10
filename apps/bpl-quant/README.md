# bpl-quant

A market-data and analytics server written in BPL. It is both a showcase and a
compiler stress test: a large multi-module program with numeric kernels, data
structures and an HTTP API.

Work in progress. Current modules:

- `src/core/`: deterministic PRNGs (xoshiro256\*\*, SplitMix64, PCG32), owned
  buffers, strict text parsing, a streaming JSON writer.
- `src/math/`: special functions, statistics, sorting/selection, dense matrices
  (LU, Cholesky, QR, Jacobi eigenvalues), root finding and Nelder-Mead.
- `src/quant/`: Black-Scholes with Greeks, implied volatility, binomial and
  trinomial trees, Crank-Nicolson, Barone-Adesi-Whaley, Monte Carlo (European,
  Asian, barrier, lookback, basket, Longstaff-Schwartz, Heston, Merton).

## Build and test

From the repository root:

```bash
bun index.ts build apps/bpl-quant/src/main.bpl -O 2 -o apps/bpl-quant/out/bpl-quant
apps/bpl-quant/out/bpl-quant selftest
bun test tests/BplQuantApp.test.ts
```

`selftest` prints deterministic values and checks; its output is compared with
`tests/selftest.expected`.
