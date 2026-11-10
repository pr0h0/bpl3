# In-process benchmark of the compute kernels.
#
#   bpl-quant bench [scale]
#
# Each kernel runs a fixed workload multiplied by `scale` and prints its
# wall time, throughput, and a checksum so the optimizer cannot discard work.

import printf, malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Clock] from "../core/clock.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [FVec] from "../core/vec.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonDoc] from "../core/json_doc.bpl";
import [Sort] from "../math/sort.bpl";
import [Matrix], [EigenResult] from "../math/matrix.bpl";
import [Stats] from "../math/stats.bpl";
import [OptionSpec], [OptionKind], [BlackScholes], [Greeks] from "../quant/black_scholes.bpl";
import [ImpliedVol], [IvResult] from "../quant/implied_vol.bpl";
import [Lattice], [TreeResult] from "../quant/lattice.bpl";
import [MonteCarlo], [McResult] from "../quant/monte_carlo.bpl";
import [Engine], [OrderRequest] from "../market/engine.bpl";
import [FlowSimulator], [SimSummary] from "../market/simulator.bpl";
import [Ticks] from "../market/order.bpl";
import [BarSeries] from "../series/bars.bpl";
import [Indicators], [MacdOut], [BandsOut] from "../series/indicators.bpl";
import [ReturnPanel], [Covariance] from "../risk/covariance.bpl";
import [VaR], [VarReport] from "../risk/var.bpl";
import [Portfolio], [Allocation] from "../risk/portfolio.bpl";
import [Filter], [FValue], [FilterSchema] from "../api/filter.bpl";

export runBench;

struct BenchClock {
    name: string,
    started: long,
    units: string,

    frame start(name: string, units: string) ret BenchClock {
        return BenchClock { name: name, started: Clock.nowNs(), units: units };
    }

    frame stop(this: *BenchClock, work: float, checksum: float) ret float {
        local ms: float = Clock.elapsedMs(this.started);
        local rate: float = ms > 0.0 ? work / (ms / 1000.0) : 0.0;
        printf("%-28s %10.2f ms %14.0f %-12s checksum %.6g\n", this.name, ms, rate, this.units, checksum);
        return ms;
    }
}

frame benchPrng(scale: int) ret float {
    local n: int = 2000000 * scale;
    local rng: Xoshiro = Xoshiro.new(cast<u64>(1));
    local c: BenchClock = BenchClock.start("xoshiro normal", "draws/s");
    local s: float = 0.0;
    loop (local i: int = 0; i < n; i = i + 1) {
        s = s + rng.normal();
    }
    return c.stop(cast<float>(n), s);
}

frame benchSort(scale: int) ret float {
    local n: int = 1000000 * scale;
    local rng: Xoshiro = Xoshiro.new(cast<u64>(2));
    local v: FVec = FVec.new(n);
    loop (local i: int = 0; i < n; i = i + 1) {
        v.push(rng.nextFloat());
    }
    local c: BenchClock = BenchClock.start("introsort 1M doubles", "elems/s");
    Sort.floats(v.data, v.len);
    local ms: float = c.stop(cast<float>(n), v.data[n / 2]);
    v.destroy();
    return ms;
}

frame benchMatrix(scale: int) ret float {
    local n: int = 160 + (40 * scale);
    local rng: Xoshiro = Xoshiro.new(cast<u64>(3));
    local a: Matrix = Matrix.new(n, n);
    loop (local i: int = 0; i < (n * n); i = i + 1) {
        a.data[i] = rng.uniform(-1.0, 1.0);
    }
    local c: BenchClock = BenchClock.start("matmul blocked NxN", "flop/s");
    local p: Matrix = a.mulBlocked(&a, 32);
    local flops: float = 2.0 * cast<float>(n) * cast<float>(n) * cast<float>(n);
    local ms: float = c.stop(flops, p.trace());
    # Symmetric positive definite: A A' + n I.
    local at: Matrix = a.transpose();
    local spd: Matrix = a.mul(&at);
    loop (local i: int = 0; i < n; i = i + 1) {
        spd.addAt(i, i, cast<float>(n));
    }
    local c2: BenchClock = BenchClock.start("cholesky + inverse", "matrices/s");
    local l: Matrix;
    spd.cholesky(&l);
    local inv: Matrix;
    spd.inverse(&inv);
    ms = ms + c2.stop(1.0, l.trace() + inv.trace());
    local small: Matrix = Matrix.new(40, 40);
    loop (local i: int = 0; i < 40; i = i + 1) {
        loop (local j: int = 0; j < 40; j = j + 1) {
            small.put(i, j, spd.at(i, j));
        }
    }
    local c3: BenchClock = BenchClock.start("jacobi eigen 40x40", "matrices/s");
    local e: EigenResult = small.eigenSymmetric();
    ms = ms + c3.stop(1.0, e.values[0]);
    e.destroy();
    small.destroy();
    a.destroy();
    p.destroy();
    at.destroy();
    spd.destroy();
    l.destroy();
    inv.destroy();
    return ms;
}

frame benchBlackScholes(scale: int) ret float {
    local n: int = 500000 * scale;
    local c: BenchClock = BenchClock.start("black-scholes greeks", "options/s");
    local s: float = 0.0;
    loop (local i: int = 0; i < n; i = i + 1) {
        local sp: OptionSpec = OptionSpec.new((i % 2) == 0 ? OptionKind.Call : OptionKind.Put, 100.0, 80.0 + cast<float>(i % 40), 0.03, 0.01, 0.15 + (0.001 * cast<float>(i % 100)), 0.25 + (0.01 * cast<float>(i % 50)));
        local g: Greeks = BlackScholes.greeks(&sp);
        s = s + g.delta + g.gamma;
    }
    local ms: float = c.stop(cast<float>(n), s);
    local m: int = 100000 * scale;
    local c2: BenchClock = BenchClock.start("implied vol solve", "solves/s");
    local t: float = 0.0;
    loop (local i: int = 0; i < m; i = i + 1) {
        local sp: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 90.0 + cast<float>(i % 20), 0.03, 0.0, 0.3, 1.0);
        local price: float = BlackScholes.price(&sp);
        local r: IvResult = ImpliedVol.solve(&sp, price);
        t = t + r.vol;
    }
    return ms + c2.stop(cast<float>(m), t);
}

frame benchTrees(scale: int) ret float {
    local sp: OptionSpec = OptionSpec.new(OptionKind.Put, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    local n: int = 20 * scale;
    local c: BenchClock = BenchClock.start("CRR american 2000 steps", "trees/s");
    local s: float = 0.0;
    loop (local i: int = 0; i < n; i = i + 1) {
        local t: TreeResult = Lattice.crr(&sp, 2000, true);
        s = s + t.price;
    }
    local ms: float = c.stop(cast<float>(n), s / cast<float>(n));
    local c2: BenchClock = BenchClock.start("crank-nicolson 400x400", "grids/s");
    local cn: float = 0.0;
    loop (local i: int = 0; i < scale; i = i + 1) {
        cn = cn + Lattice.crankNicolson(&sp, 400, 400, true);
    }
    return ms + c2.stop(cast<float>(scale), cn / cast<float>(scale));
}

frame benchMonteCarlo(scale: int) ret float {
    local sp: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    local paths: int = 1000000 * scale;
    local c: BenchClock = BenchClock.start("MC european 1M paths", "paths/s");
    local r: McResult = MonteCarlo.european(&sp, paths, cast<u64>(1));
    local ms: float = c.stop(cast<float>(paths), r.price);
    local apaths: int = 20000 * scale;
    local c2: BenchClock = BenchClock.start("MC asian 52 fixings", "paths/s");
    local a: McResult = MonteCarlo.asian(&sp, 52, apaths, cast<u64>(2));
    ms = ms + c2.stop(cast<float>(apaths), a.price);
    local put: OptionSpec = sp;
    put.kind = OptionKind.Put;
    local lpaths: int = 20000 * scale;
    local c3: BenchClock = BenchClock.start("longstaff-schwartz 50x", "paths/s");
    local l: McResult = MonteCarlo.longstaffSchwartz(&put, 50, lpaths, cast<u64>(3));
    return ms + c3.stop(cast<float>(lpaths), l.price);
}

frame benchMatching(scale: int) ret float {
    local e: Engine = Engine.new(65536);
    local sym: int = e.addSymbol("BENCH", Ticks.fromFloat(100.0));
    local sim: FlowSimulator = FlowSimulator.new(cast<u64>(9), sym, 100.0);
    local events: int = 200000 * scale;
    local c: BenchClock = BenchClock.start("matching engine events", "events/s");
    local s: SimSummary = sim.run(&e, events);
    local ms: float = c.stop(cast<float>(events), cast<float>(e.stats.trades));
    printf("%-28s trades=%lld volume=%lld open=%d valid=%s\n", "", e.stats.trades, e.stats.volume, e.openOrders(), e.validate() == nullptr ? "yes" : "no");
    sim.destroy();
    e.destroy();
    return ms + (cast<float>(s.orders) * 0.0);
}

frame benchIndicators(scale: int) ret float {
    local n: int = 200000 * scale;
    local bars: BarSeries = BarSeries.synthetic(cast<u64>(4), n, 100.0, 0.05, 0.25, 60);
    local out: *float = Indicators.alloc(n);
    local c: BenchClock = BenchClock.start("indicators (8 kinds)", "bars/s");
    Indicators.ema(bars.close, n, 20, out);
    local s: float = out[n - 1];
    Indicators.rsi(bars.close, n, 14, out);
    s = s + out[n - 1];
    Indicators.atr(&bars, 14, out);
    s = s + out[n - 1];
    Indicators.mfi(&bars, 14, out);
    s = s + out[n - 1];
    Indicators.parabolicSar(&bars, 0.02, 0.2, out);
    s = s + out[n - 1];
    local m: MacdOut = Indicators.macd(bars.close, n, 12, 26, 9);
    s = s + m.macd[n - 1];
    m.destroy();
    local b: BandsOut = Indicators.bollinger(bars.close, n, 20, 2.0);
    s = s + b.upper[n - 1];
    b.destroy();
    local d: BandsOut = Indicators.donchian(&bars, 20);
    s = s + d.upper[n - 1];
    d.destroy();
    local ms: float = c.stop(cast<float>(n) * 8.0, s);
    free(cast<*void>(out));
    bars.destroy();
    return ms;
}

frame benchRisk(scale: int) ret float {
    local assets: int = 20;
    local cov: Matrix = Matrix.new(assets, assets);
    loop (local i: int = 0; i < assets; i = i + 1) {
        loop (local j: int = 0; j < assets; j = j + 1) {
            local rho: float = i == j ? 1.0 : 0.3;
            cov.put(i, j, rho * 0.0002);
        }
    }
    local mu: float[20];
    local w: float[20];
    loop (local i: int = 0; i < assets; i = i + 1) {
        mu[i] = 0.0002 + (0.00002 * cast<float>(i));
        w[i] = 1.0 / cast<float>(assets);
    }
    local c: BenchClock = BenchClock.start("panel sim + covariance", "obs/s");
    local periods: int = 50000 * scale;
    local panel: ReturnPanel = ReturnPanel.simulate(&mu[0], &cov, periods, cast<u64>(5));
    local s: Matrix = Covariance.sample(&panel);
    local delta: float = 0.0;
    local lw: Matrix = Covariance.ledoitWolf(&panel, &delta);
    local ms: float = c.stop(cast<float>(periods), s.trace() + lw.trace());
    local c2: BenchClock = BenchClock.start("VaR 5 methods", "portfolios/s");
    local series: *float = cast<*float>(malloc(cast<long>(periods) * sizeof(float)));
    panel.portfolioReturns(&w[0], series);
    local h: VarReport = VaR.historical(series, periods, 0.99, 1.0);
    local mc: VarReport = VaR.monteCarlo(&w[0], &mu[0], &cov, 0.99, 1.0, 50000 * scale, cast<u64>(6));
    local f: VarReport = VaR.filteredHistorical(series, periods, 0.94, 0.99, 1.0);
    ms = ms + c2.stop(1.0, h.var + mc.var + f.var);
    local c3: BenchClock = BenchClock.start("portfolio optimizers", "solves/s");
    local opt_runs: int = 50 * scale;
    local acc: float = 0.0;
    loop (local i: int = 0; i < opt_runs; i = i + 1) {
        local a: Allocation = Portfolio.longOnly(&mu[0], &s, 3.0, 0.0, 2000);
        local b: Allocation = Portfolio.riskParity(&mu[0], &s, 0.0, 200);
        acc = acc + a.weights[0] + b.weights[0];
        a.destroy();
        b.destroy();
    }
    ms = ms + c3.stop(cast<float>(opt_runs), acc);
    free(cast<*void>(series));
    panel.destroy();
    s.destroy();
    lw.destroy();
    cov.destroy();
    return ms;
}

frame benchJson(scale: int) ret float {
    local n: int = 20000 * scale;
    local c: BenchClock = BenchClock.start("json write + parse", "docs/s");
    local total: float = 0.0;
    loop (local i: int = 0; i < n; i = i + 1) {
        local w: JsonWriter = JsonWriter.new(256);
        w.beginObject();
        w.fieldStr("symbol", "ACME");
        w.fieldInt("qty", cast<long>(i));
        w.fieldNum("price", 100.0 + (cast<float>(i % 100) * 0.01));
        w.key("levels").beginArray();
        loop (local k: int = 0; k < 8; k = k + 1) {
            w.num(cast<float>(k) * 1.5);
        }
        w.endArray();
        w.endObject();
        local d: JsonDoc = JsonDoc.parse(w.toString());
        total = total + d.getNum(d.root(), "price", 0.0);
        d.destroy();
        w.destroy();
    }
    return c.stop(cast<float>(n), total);
}

frame benchFilter(scale: int) ret float {
    local names: string[3] = ["price", "qty", "side"];
    local f: Filter = Filter.compile("(price > 100 and qty >= 50) or side = \"sell\" and not qty in [1, 2, 3]", FilterSchema.new(&names[0], 3));
    local n: int = 1000000 * scale;
    local hits: int = 0;
    local c: BenchClock = BenchClock.start("filter evaluation", "rows/s");
    loop (local i: int = 0; i < n; i = i + 1) {
        local row: int = i;
        local get: Lambda<FValue>(int) = |field: int| ret FValue {
            if (field == 0) {
                return FValue.number(95.0 + cast<float>(row % 10));
            }
            if (field == 1) {
                return FValue.number(cast<float>(row % 100));
            }
            return FValue.text((row % 3) == 0 ? "sell" : "buy");
        };
        if (f.matches(get)) {
            hits = hits + 1;
        }
    }
    local ms: float = c.stop(cast<float>(n), cast<float>(hits));
    f.destroy();
    return ms;
}

frame runBench(scale: int) ret int {
    printf("bpl-quant kernel benchmark (scale %d)\n", scale);
    printf("%-28s %13s %14s %-12s\n", "kernel", "time", "rate", "unit");
    local total: float = 0.0;
    total = total + benchPrng(scale);
    total = total + benchSort(scale);
    total = total + benchMatrix(scale);
    total = total + benchBlackScholes(scale);
    total = total + benchTrees(scale);
    total = total + benchMonteCarlo(scale);
    total = total + benchMatching(scale);
    total = total + benchIndicators(scale);
    total = total + benchRisk(scale);
    total = total + benchJson(scale);
    total = total + benchFilter(scale);
    printf("%-28s %10.2f ms\n", "total", total);
    return 0;
}
