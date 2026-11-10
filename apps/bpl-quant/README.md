# bpl-quant

A market-data and analytics server written in BPL: an order-matching engine,
a FIX gateway and an ITCH-style binary feed, a risk-checked journaled order
desk with snapshots and recovery, a time-series store with technical
indicators, option pricing, fixed income, portfolio risk, stress testing and
attribution, a columnar query cache, two small query/scripting languages, a
WebSocket push feed and a JSON REST API with 159 routes. It is a showcase and
a stress test for the compiler: about 48,000 lines of BPL in 141 modules, plus
the bundled web packages.

Everything numeric is deterministic: generators are seeded, and the self-test
output is byte-identical at -O0 and -O2.

## Build and run

The app links SQLite (used by bpl-sqlite and bpl-rate-limit). From the
repository root:

```bash
bun index.ts build apps/bpl-quant/src/main.bpl -O 2 --clang-flag=-l:libsqlite3.so.0 -o apps/bpl-quant/out/bpl-quant
cd apps/bpl-quant
./out/bpl-quant selftest                 # 1139 deterministic checks, exit 1 on failure
./out/bpl-quant bench 1                  # timed compute kernels
./out/bpl-quant serve 8080 4             # API on 127.0.0.1:8080 with 4 process workers
./out/bpl-quant loadgen 8080 8000 8 mixed
```

| Environment            | Effect                                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| `BPLQUANT_DB`          | SQLite path; enables `/api/store/*` and worker-local persistence (WAL) |
| `BPLQUANT_RATE_LIMIT`  | Requests per window and socket peer (needs `BPLQUANT_DB`)              |
| `BPLQUANT_RATE_WINDOW` | Rate-limit window in seconds (default 60)                              |
| `BPLQUANT_ACCESS_LOG`  | `1` prints one JSON line per request                                   |

With more than one worker, each process has its own in-memory books (bpl-express
`listenWorkers` workers have private memory); persisted trades and rate-limit
counters are shared through SQLite.

`bun test tests/BplQuantApp.test.ts` builds the app at -O2, compares the
self-test with `tests/selftest.expected`, exercises the API on an ephemeral
port (including the desk, FIX, feed, columnar cache, portfolio routes and the
WebSocket feed), runs a two-worker persistence/rate-limit check and a short
load test (about 70 seconds, mostly the -O2 build).

## Layout

| Directory       | Contents                                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core`      | xoshiro256\*\*/SplitMix64/PCG32, owned buffers, open-addressing maps, strict parsing, JSON writer, JSON DOM parser, latency histograms, clocks                                                                                                                                                                                                              |
| `src/math`      | special functions, statistics, sorting/selection, dense matrices (LU, Cholesky, QR, Jacobi), root finding, Nelder-Mead, quadrature, simplex LP, box-constrained QP                                                                                                                                                                                          |
| `src/market`    | order book (price-time FIFO levels), multi-symbol matching engine (limit/market/stop/stop-limit, GTC/IOC/FOK/Day, cancel/replace, self-trade prevention), trade tape, flow simulator, FIFO position ledger, call auctions, TWAP/VWAP/POV, Avellaneda-Stoikov, trade surveillance (spoofing, wash trades, order-to-trade, quote stuffing, marking the close) |
| `src/series`    | OHLCV bars, aggregation and resampling, O(1) rolling windows, 54 indicators, corporate actions, liquidity measures                                                                                                                                                                                                                                          |
| `src/quant`     | Black-Scholes and Greeks, implied vol, trees, Crank-Nicolson, Barone-Adesi-Whaley, Monte Carlo (European, Asian, barrier, lookback, basket, LSM, Heston, Merton), Fourier/FFT pricing, SABR, SVI, local vol, credit and FX                                                                                                                                  |
| `src/rates`     | curve bootstrapping and interpolation, Nelson-Siegel-Svensson, bonds, swaps, caps/floors, swaptions, Vasicek, CIR, Hull-White tree                                                                                                                                                                                                                          |
| `src/risk`      | covariance estimators, VaR/ES (five methods) and backtests, portfolio construction, pre-trade limits, Brinson attribution, rebalancing, SPAN margin                                                                                                                                                                                                         |
| `src/tsa`       | GARCH/GJR/EGARCH, ARIMA, ADF/KPSS, Kalman filters, cointegration, Gaussian HMM regimes                                                                                                                                                                                                                                                                      |
| `src/ml`        | PCA, multi-factor OLS, k-means, logistic regression, bootstrap, KDE                                                                                                                                                                                                                                                                                         |
| `src/dsl`       | QScript: lexer, parser, bytecode compiler, sandboxed VM                                                                                                                                                                                                                                                                                                     |
| `src/sql`       | QQL: a SQL dialect over trades, bars, orders and symbols                                                                                                                                                                                                                                                                                                    |
| `src/backtest`  | vectorised backtester, built-in strategies, pairs trading, position sizing                                                                                                                                                                                                                                                                                  |
| `src/proto`     | binary wire codec (varints, CRC-32), FIX 4.4 codec, session layer (heartbeats, gap fill, resend) and order gateway, ITCH-style feed in MoldUDP64-like packets, book rebuilding and lossy replay                                                                                                                                                             |
| `src/journal`   | CRC-framed command journal, engine snapshots, recovery with torn-record detection, state hashing, compaction                                                                                                                                                                                                                                                |
| `src/oms`       | risk-checked journaled order desk with an in-process FIX session                                                                                                                                                                                                                                                                                            |
| `src/stress`    | multi-asset scenario engine, historical scenarios, factor breakdown, reverse stress, Monte Carlo stressed VaR                                                                                                                                                                                                                                               |
| `src/cache`     | columnar store with zone maps, grouped aggregates and an LRU result cache                                                                                                                                                                                                                                                                                   |
| `src/execution` | Almgren-Chriss scheduling, square-root impact, implementation shortfall                                                                                                                                                                                                                                                                                     |
| `src/store`     | SQLite persistence                                                                                                                                                                                                                                                                                                                                          |
| `src/api`       | bpl-express routes, parameter validation, filters, metrics                                                                                                                                                                                                                                                                                                  |
| `src/bench`     | kernel benchmark and HTTP load generator                                                                                                                                                                                                                                                                                                                    |
| `src/selftest`  | deterministic self-test sections                                                                                                                                                                                                                                                                                                                            |
| `repros`        | minimal reproductions of compiler bugs found while writing the app                                                                                                                                                                                                                                                                                          |

## API tour

`GET /api/routes` lists every route with a description. Some examples:

```bash
curl -X POST localhost:8080/api/orders -d '{"symbol":"ACME","account":"a","side":"buy","price":99.5,"qty":100}' -H 'content-type: application/json'
curl -X POST 'localhost:8080/api/sim/ACME?events=5000&seed=7'
curl 'localhost:8080/api/trades?symbol=ACME&filter=qty%20%3E%3D%20100%20and%20side%20%3D%20%22buy%22&sort=price:desc&limit=20'
curl 'localhost:8080/api/price/greeks?spot=100&strike=105&rate=0.03&vol=0.25&expiry=0.5'
curl 'localhost:8080/api/risk/var?symbols=ACME,GLOBEX,HOOLI&confidence=0.99'
curl 'localhost:8080/api/tsa/ACME/garch?model=gjr&horizon=10'
curl 'localhost:8080/metrics'          # Prometheus text
```

List endpoints accept `filter=` expressions (`and`/`or`/`not`, comparisons,
`~` containment, `in [...]`, arithmetic and functions), multi-key `sort=` and
`offset`/`limit` pagination. Invalid input returns 422 with every field error,
for example `{"error":"validation failed","fields":[{"field":"qty","message":"is required"}, ...]}`.

### Order desk, FIX and market data

`/api/oms/*` is a second venue whose every change goes through a command
journal and pre-trade risk checks (kill switch, restricted list, order size
and notional, price collar, open orders, order rate, worst-case position,
gross notional, loss limit). Rejections return 403 with the rule.

```bash
curl -X PUT localhost:8080/api/oms/limits/bob -d '{"max_order_qty":50}' -H 'content-type: application/json'
curl -X POST localhost:8080/api/oms/orders -d '{"symbol":"ACME","account":"bob","side":"buy","price":100,"qty":100}' -H 'content-type: application/json'
curl -X POST localhost:8080/api/fix/order -d '{"clordid":"c1","symbol":"ACME","side":"buy","qty":60,"price":100.5}' -H 'content-type: application/json'
curl -X POST localhost:8080/api/oms/snapshot
curl -X POST localhost:8080/api/oms/recover        # rebuild from snapshot + journal, compare state hashes
curl 'localhost:8080/api/oms/surveillance?filter=kind%20%3D%20%22wash_trade%22'
curl 'localhost:8080/api/feed/replay?events=20000&drop_every=7'   # lossy ITCH replay, books compared level by level
```

`/api/ws/feed` is a WebSocket session (send `{"op":"subscribe","symbol":"ACME"}`,
`{"op":"sim","events":500}`, `{"op":"snapshot"}`, `{"op":"close"}`) that pushes
trades and depth; `/api/ws/feed?format=itch` streams binary ITCH packets.

### Portfolio and analytics

```bash
curl 'localhost:8080/api/stress/demo?symbols=ACME,GLOBEX'            # seven historical scenarios, ladders, reverse stress, MC
curl -X POST localhost:8080/api/attribution/brinson -d '{"sectors":[{"name":"tech","wp":0.6,"wb":0.5,"rp":0.1,"rb":0.08},{"name":"energy","wp":0.4,"wb":0.5,"rp":0.02,"rb":0.03}]}'
curl 'localhost:8080/api/rebalance/simulate?symbols=ACME,GLOBEX&weights=0.6,0.4&band=0.03'
curl 'localhost:8080/api/columnar/trades?where=qty%20%3E%3D%2050&group=side&aggs=count(*),vwap(price,qty)'
curl 'localhost:8080/api/tca/schedule?shares=1000000&periods=5&horizon=5&sigma=0.95&eta=0.0000025&lambda=0.000001'
curl 'localhost:8080/api/options/strategy?template=iron_condor'
curl 'localhost:8080/api/price/models?spot=100&strike=90&vol=0.25&expiry=0.5&barrier=95&rebate=3'
curl 'localhost:8080/api/tsa/ACME/regime?states=2'
```

### QScript

`POST /api/strategy/run` runs a strategy script against a symbol's bars; calls
to `position(i, size)` are backtested (next-open execution, commission, spread).

```text
let fast = ema(close, 12);
let slow = ema(close, 26);
fn signal(i) {
    if fast[i] > slow[i] { return 1; }
    return -1;
}
for i in 26..bars { position(i, signal(i)); }
emit("last_fast", fast[-1]);
```

The language has numbers, strings, booleans, nil, arrays, functions with
recursion, `let`, compound assignment, `if/elif/else`, `while`, `for .. in`,
`break`/`continue` and 44 builtins. Scripts compile to bytecode and run under
an instruction budget, call-depth limit and memory budget.
`POST /api/strategy/check` returns the bytecode listing.

### QQL

`GET /api/query?q=...` (or `/api/query.csv`) runs SQL over live data:

```sql
SELECT side, COUNT(*) AS n, SUM(qty) AS volume, ROUND(VWAP(price, qty), 4) AS vwap
FROM trades WHERE symbol = 'ACME' GROUP BY side ORDER BY volume DESC

SELECT BUCKET(time, 604800) AS week, FIRST(open), MAX(high), MIN(low), LAST(close)
FROM bars('GLOBEX') GROUP BY BUCKET(time, 604800) ORDER BY week
```

## Benchmarks

Measured on the development machine (4 cores, shared with other jobs, load
average about 2.5), -O2 build.

`bpl-quant bench 1`:

| Kernel                         | Time   | Rate                   |
| ------------------------------ | ------ | ---------------------- |
| xoshiro normal, 2M draws       | 107 ms | 18.6M draws/s          |
| introsort, 1M doubles          | 133 ms | 7.5M elements/s        |
| blocked matmul 200x200         | 16 ms  | 1.0 GFLOP/s            |
| Cholesky + LU inverse 200x200  | 109 ms |                        |
| Black-Scholes with 14 Greeks   | 165 ms | 3.0M options/s         |
| implied vol (Newton/Brent)     | 63 ms  | 1.6M solves/s          |
| CRR American, 2000 steps       | 66 ms  | 304 trees/s            |
| Monte Carlo European, 1M paths | 42 ms  | 23.6M paths/s          |
| Longstaff-Schwartz, 20k x 50   | 111 ms | 180k paths/s           |
| matching engine, 200k events   | 426 ms | 469k events/s          |
| 8 indicators over 200k bars    | 123 ms | 13.0M bar-indicators/s |
| JSON write + parse             | 148 ms | 136k documents/s       |
| filter expression evaluation   | 314 ms | 3.2M rows/s            |

`bpl-quant loadgen` (one connection per request, the server closes each
connection):

| Server    | Clients | Scenario | Throughput  | p50    | p99    |
| --------- | ------- | -------- | ----------- | ------ | ------ |
| 1 worker  | 4       | read     | 5,254 req/s | 703 us | 2.3 ms |
| 1 worker  | 4       | mixed    | 4,881 req/s | 735 us | 2.9 ms |
| 1 worker  | 4       | compute  | 4,977 req/s | 735 us | 1.9 ms |
| 4 workers | 8       | read     | 7,295 req/s | 831 us | 4.0 ms |
| 4 workers | 8       | mixed    | 6,928 req/s | 863 us | 4.9 ms |
| 4 workers | 8       | compute  | 6,477 req/s | 927 us | 4.6 ms |

The load generator runs on the same 4 cores, so the multi-worker numbers are
bounded by the client as much as by the server.

## Compiler behaviour on this code base

Measured on the merged tree (141 modules, ~48k app lines plus packages), 4
cores shared with other jobs (load average about 2.5). Peak RSS is the sum
over the process tree (bun plus clang), sampled every 200 ms.

| Measurement     | ~32k lines (previous)    | ~48k lines               |
| --------------- | ------------------------ | ------------------------ |
| `bpl check`     | 3.0 s, 237 MB RSS        | 3.7 s, 278 MB RSS        |
| `bpl build -O0` | 11.8 s, 578 MB RSS       | 18.3 s, 1.2 GB RSS       |
| `bpl build -O2` | 40 s, 554 MB RSS         | 67 s, 1.1 GB RSS         |
| emitted LLVM IR | 15.8 MB, 2,519 functions | 27.2 MB, 4,403 functions |
| -O2 executable  | 1.9 MB                   | 2.9 MB                   |

Most of the -O2 time is LLVM. Before the BUG-803 workaround one function took
51 s of instruction selection by itself and the -O2 build took 77 s; the new
modules fill multi-kilobyte results in place for the same reason.

Compiler bugs found while writing the app are logged in
[docs/project/BUGS.md](../../docs/project/BUGS.md) (section "bpl-quant
application (2026-11-10)", BUG-800 to BUG-804 and BUG-820) with
reproductions in `repros/`:

- BUG-800: method calls on malloc'd structs crash through a null vtable (the
  order pool and app state call an `init` method on fresh memory).
- BUG-801: calls through pointers to structs without descendants are always
  virtual, and the per-function stack guard keeps small functions from being
  inlined.
- BUG-802: a keyword used as a method name gives a whole-struct syntax error.
- BUG-803: large structs returned by value make instruction selection very
  slow (the compiler and VM structs now initialize in place).
- BUG-804: `bpl build` reports parse errors in imported modules at the
  importing line without the inner location (hit again for `from`, `match`
  and `spec` used as names in new modules).
- BUG-820: a parameter named `entry` produces invalid LLVM IR (it collides
  with the function's `entry` block label).

## Limits

This is a demonstration, not a trading system: books live in process memory,
the HTTP layer is HTTP/1.1 without keep-alive, the FIX session and ITCH feed
run in process rather than over their own sockets, a WebSocket connection holds
a worker process, there is no authentication, and
models are textbook implementations validated against known values rather than
production-calibrated libraries.
