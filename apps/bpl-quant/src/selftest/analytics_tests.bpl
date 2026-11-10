# Self-tests for the second indicator set and the extra statistics.

import free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [BarSeries], [Bar] from "../series/bars.bpl";
import [Indicators] from "../series/indicators.bpl";
import [MoreIndicators], [SuperTrendOut], [HeikinAshi], [Pivots] from "../series/indicators2.bpl";
import [Stats2], [TestResult], [DrawdownTable] from "../math/stats2.bpl";
import [Special] from "../math/special.bpl";

export runAnalyticsTests;

frame lastValid(x: *float, n: int) ret float {
    local i: int = n - 1;
    loop ((i >= 0) && (x[i] != x[i])) {
        i = i - 1;
    }
    return i >= 0 ? x[i] : 0.0;
}

frame firstValid(x: *float, n: int) ret int {
    local i: int = 0;
    loop ((i < n) && (x[i] != x[i])) {
        i = i + 1;
    }
    return i;
}

frame testIndicators(c: *Check) {
    c.begin("indicators2");
    local s: BarSeries = BarSeries.synthetic(cast<u64>(55), 400, 100.0, 0.05, 0.3, 86400);
    local out: *float = Indicators.alloc(s.len);
    local all_ok: bool = true;
    loop (local k: int = 0; k < MoreIndicators.count(); k = k + 1) {
        local name: string = MoreIndicators.name(k);
        local ok: bool = MoreIndicators.compute(name, &s, 14, out);
        all_ok = all_ok && ok;
        c.value(name, lastValid(out, s.len), 6);
        c.ok("warmup", firstValid(out, s.len) < 200);
    }
    c.ok("all_known", all_ok);
    c.ok("unknown_name", !MoreIndicators.compute("nope", &s, 14, out));
    # Exact cases on a straight line.
    local line: BarSeries = BarSeries.new(64, 86400);
    loop (local i: int = 0; i < 64; i = i + 1) {
        local px: float = 10.0 + (0.5 * cast<float>(i));
        line.push(Bar { time: cast<long>(i), open: px, high: px + 1.0, low: px - 1.0, close: px, volume: 1000.0, trades: 1, vwap: px });
    }
    local slope: *float = Indicators.alloc(64);
    local r2: *float = Indicators.alloc(64);
    MoreIndicators.linreg(line.close, 64, 20, slope, r2);
    c.near("linreg_slope", slope[63], 0.5, 0.000000001);
    c.near("linreg_r2", r2[63], 1.0, 0.000000001);
    MoreIndicators.cmo(line.close, 64, 14, out);
    c.near("cmo_trend", out[63], 100.0, 0.000000001);
    MoreIndicators.zlema(line.close, 64, 9, out);
    c.near("zlema_no_lag", out[63], line.close[63], 0.000000001);
    MoreIndicators.vwma(&line, 10, out);
    c.near("vwma_constant_volume", out[63], (line.close[54] + line.close[63]) / 2.0, 0.000000001);
    MoreIndicators.ulcer(line.close, 64, 14, out);
    c.near("ulcer_no_drawdown", out[63], 0.0, 0.0);
    MoreIndicators.vortex(&line, 14, out);
    c.ok("vortex_up", out[63] > 0.0);
    local st: SuperTrendOut = MoreIndicators.superTrend(&line, 10, 3.0);
    c.near("supertrend_up", st.direction[63], 1.0, 0.0);
    c.ok("supertrend_below", st.line[63] < line.close[63]);
    st.destroy();
    local ha: HeikinAshi = MoreIndicators.heikinAshi(&s);
    c.ok("ha_bounds", (ha.high[100] >= ha.open[100]) && (ha.high[100] >= ha.close[100]) && (ha.low[100] <= ha.open[100]));
    c.near("ha_close", ha.close[5], 0.25 * (s.open[5] + s.high[5] + s.low[5] + s.close[5]), 0.000000001);
    ha.destroy();
    local pv: Pivots = MoreIndicators.pivots(110.0, 100.0, 105.0);
    c.near("pivot", pv.pivot, 105.0, 0.0);
    c.near("pivot_r1", pv.r1, 110.0, 0.0);
    c.near("pivot_s2", pv.s2, 95.0, 0.0);
    free(cast<*void>(slope));
    free(cast<*void>(r2));
    free(cast<*void>(out));
    line.destroy();
    s.destroy();
}

frame testStats(c: *Check) {
    c.begin("stats2");
    local rng: Xoshiro = Xoshiro.new(cast<u64>(808));
    local n: int = 400;
    local a: float[400];
    local b: float[400];
    local e: float[400];
    loop (local i: int = 0; i < n; i = i + 1) {
        a[i] = rng.normal();
        b[i] = rng.normal() + 0.5;
        e[i] = rng.exponential(1.0);
    }
    local x: float[50];
    local y: float[50];
    loop (local i: int = 0; i < 50; i = i + 1) {
        x[i] = cast<float>(i);
        y[i] = Math.exp(cast<float>(i) / 10.0);
    }
    local kt: TestResult = Stats2.kendall(&x[0], &y[0], 50);
    c.near("kendall_monotone", kt.statistic, 1.0, 0.0);
    c.ok("kendall_significant", kt.p_value < 0.000001);
    local kr: TestResult = Stats2.kendall(&a[0], &e[0], n);
    c.value("kendall_random", kr.statistic, 6);
    local same: TestResult = Stats2.ks2(&a[0], 200, &a[200], 200);
    c.value("ks_same_d", same.statistic, 6);
    c.value("ks_same_p", same.p_value, 6);
    # Brute force: D = max over every sample point of |Fa(v) - Fb(v)|.
    local brute: float = 0.0;
    loop (local i: int = 0; i < n; i = i + 1) {
        local fa: float = 0.0;
        local fb: float = 0.0;
        loop (local k: int = 0; k < 200; k = k + 1) {
            if (a[k] <= a[i]) {
                fa = fa + 1.0;
            }
            if (a[200 + k] <= a[i]) {
                fb = fb + 1.0;
            }
        }
        brute = Math.max(brute, Math.abs(fa - fb) / 200.0);
    }
    c.near("ks_matches_brute_force", same.statistic, brute, 0.000000001);
    c.ok("ks_p_range", (same.p_value > 0.0) && (same.p_value < 1.0));
    local shifted: TestResult = Stats2.ks2(&a[0], n, &b[0], n);
    c.value("ks_shift_d", shifted.statistic, 6);
    c.ok("ks_shift_detected", shifted.p_value < 0.001);
    local mw: TestResult = Stats2.mannWhitney(&a[0], n, &b[0], n);
    c.value("mann_whitney_u", mw.statistic, 1);
    c.ok("mw_detected", mw.p_value < 0.001);
    local mw0: TestResult = Stats2.mannWhitney(&a[0], 200, &a[200], 200);
    c.ok("mw_same", mw0.p_value > 0.05);
    local ad_norm: TestResult = Stats2.andersonDarling(&a[0], n);
    local ad_exp: TestResult = Stats2.andersonDarling(&e[0], n);
    c.value("ad_normal", ad_norm.statistic, 6);
    c.ok("ad_normal_passes", ad_norm.p_value > 0.05);
    c.ok("ad_exponential_fails", ad_exp.p_value < 0.001);
    local ksn: TestResult = Stats2.ksNormal(&e[0], n);
    c.ok("ks_normal_rejects_exp", ksn.p_value < 0.01);
    # Performance ratios on daily returns.
    local r: float[400];
    loop (local i: int = 0; i < n; i = i + 1) {
        r[i] = 0.0005 + (0.01 * a[i]);
    }
    c.value("omega_0", Stats2.omega(&r[0], n, 0.0), 6);
    c.value("calmar", Stats2.calmar(&r[0], n, 252.0), 6);
    c.value("sortino_kappa2", Stats2.kappa(&r[0], n, 0.0, 2.0), 6);
    c.value("kappa3", Stats2.kappa(&r[0], n, 0.0, 3.0), 6);
    c.value("tail_ratio", Stats2.tailRatio(&r[0], n), 6);
    local psr: float = Stats2.probabilisticSharpe(&r[0], n, 0.0);
    c.value("psr", psr, 6);
    local dsr: float = Stats2.deflatedSharpe(&r[0], n, 100, 0.0025);
    c.ok("deflated_below_psr", dsr < psr);
    c.value("expected_max_sr", Stats2.expectedMaxSharpe(100, 0.0025), 6);
    # Drawdown table on a known path.
    local path: float[10] = [100.0, 110.0, 99.0, 104.0, 121.0, 120.0, 90.0, 95.0, 100.0, 125.0];
    local dd: DrawdownTable = Stats2.drawdowns(&path[0], 10);
    c.equalInt("drawdowns", cast<long>(dd.count), 2);
    c.near("deepest", dd.items[0].depth, 1.0 - (90.0 / 121.0), 0.000000001);
    c.equalInt("deepest_start", cast<long>(dd.items[0].start), 4);
    c.equalInt("deepest_trough", cast<long>(dd.items[0].trough), 6);
    c.equalInt("deepest_end", cast<long>(dd.items[0].end), 9);
    c.near("second", dd.items[1].depth, 0.1, 0.000000001);
    c.equalInt("max_duration", cast<long>(dd.max_duration), 5);
    local open: float[4] = [100.0, 90.0, 80.0, 85.0];
    local od: DrawdownTable = Stats2.drawdowns(&open[0], 4);
    c.equalInt("unrecovered", cast<long>(od.items[0].end), -1);
    # Hill estimator on a Pareto(alpha = 3) sample.
    local pareto: float[400];
    loop (local i: int = 0; i < n; i = i + 1) {
        pareto[i] = -Math.pow(rng.nextOpenFloat(), -1.0 / 3.0);
    }
    local alpha: float = Stats2.hill(&pareto[0], n, 80);
    c.value("hill_alpha", alpha, 4);
    c.ok("hill_near_3", Math.abs(alpha - 3.0) < 0.8);
    # Cornish-Fisher collapses to the normal VaR without skew or excess kurtosis.
    local sym: float[4] = [-1.0, -0.5, 0.5, 1.0];
    local cf: float = Stats2.cornishFisherVar(&sym[0], 4, 0.99);
    c.value("cornish_fisher", cf, 6);
    c.value("cf_var_normal_sample", Stats2.cornishFisherVar(&r[0], n, 0.99), 6);
    c.near("normal_var_reference", -Special.invNormCdf(0.01), 2.326348, 0.000001);
    # Newey-West slope equals OLS; the robust error grows with autocorrelated errors.
    local nx: float[400];
    local ny: float[400];
    local u: float = 0.0;
    loop (local i: int = 0; i < n; i = i + 1) {
        nx[i] = cast<float>(i) / 100.0;
        u = (0.8 * u) + rng.normal();
        ny[i] = 1.0 + (2.0 * nx[i]) + u;
    }
    local slope: float = 0.0;
    local se0: float = 0.0;
    local se8: float = 0.0;
    Stats2.neweyWest(&nx[0], &ny[0], n, 0, &slope, &se0);
    Stats2.neweyWest(&nx[0], &ny[0], n, 8, &slope, &se8);
    c.value("nw_slope", slope, 6);
    c.ok("nw_wider", se8 > se0);
}

frame runAnalyticsTests(c: *Check) {
    testIndicators(c);
    testStats(c);
}
