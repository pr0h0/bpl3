# Self-tests for bars, rolling windows and indicators.

import [Math] from "std/math.bpl";
import free from "std/c.bpl";
import [Check] from "./check.bpl";
import [Bar], [BarSeries], [BarAggregator], [BarMode] from "../series/bars.bpl";
import [RollingWindow], [RollingMedian], [RollingCovariance], [Ewma] from "../series/rolling.bpl";
import [Indicators], [MacdOut], [BandsOut], [StochOut], [AdxOut], [IchimokuOut] from "../series/indicators.bpl";
import [SeriesStore], [SeriesEntry] from "../series/store.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [Stats] from "../math/stats.bpl";

export runSeriesTests;

frame testRolling(c: *Check) {
    c.begin("rolling");
    local rng: Xoshiro = Xoshiro.new(cast<u64>(99));
    local w: RollingWindow = RollingWindow.new(20);
    local data: float[500];
    loop (local i: int = 0; i < 500; i = i + 1) {
        data[i] = rng.uniform(-10.0, 10.0);
    }
    local ok_mean: bool = true;
    local ok_min: bool = true;
    local ok_max: bool = true;
    local ok_var: bool = true;
    loop (local i: int = 0; i < 500; i = i + 1) {
        w.push(data[i]);
        if (i >= 19) {
            local lo: float = data[i];
            local hi: float = data[i];
            loop (local k: int = i - 19; k <= i; k = k + 1) {
                lo = Math.min(lo, data[k]);
                hi = Math.max(hi, data[k]);
            }
            if (w.min() != lo) {
                ok_min = false;
            }
            if (w.max() != hi) {
                ok_max = false;
            }
            if (Math.abs(w.mean() - Stats.mean(&data[i - 19], 20)) > 0.000000001) {
                ok_mean = false;
            }
            if (Math.abs(w.variance() - Stats.variance(&data[i - 19], 20)) > 0.0000001) {
                ok_var = false;
            }
        }
    }
    c.ok("window_min", ok_min);
    c.ok("window_max", ok_max);
    c.ok("window_mean", ok_mean);
    c.ok("window_variance", ok_var);
    w.destroy();
    local m: RollingMedian = RollingMedian.new(5);
    local seq: float[7] = [5.0, 1.0, 4.0, 2.0, 3.0, 10.0, 0.0];
    loop (local i: int = 0; i < 7; i = i + 1) {
        m.push(seq[i]);
    }
    # Window is now [4, 2, 3, 10, 0].
    c.near("median", m.median(), 3.0, 0.0);
    c.near("quantile_90", m.quantile(0.9), 7.6, 0.0000001);
    m.destroy();
    local rc: RollingCovariance = RollingCovariance.new(50);
    loop (local i: int = 0; i < 200; i = i + 1) {
        local x: float = rng.normal();
        rc.push(x, (2.0 * x) + (0.1 * rng.normal()));
    }
    c.near("rolling_beta", rc.beta(), 2.0, 0.05);
    c.ok("rolling_corr_high", rc.correlation() > 0.99);
    rc.destroy();
    local e: Ewma = Ewma.fromSpan(9);
    loop (local i: int = 0; i < 100; i = i + 1) {
        e.push(5.0);
    }
    c.near("ewma_constant", e.value, 5.0, 0.0);
    c.near("ewma_constant_var", e.variance, 0.0, 0.0);
    local h: Ewma = Ewma.fromHalfLife(10.0);
    c.near("half_life_alpha", h.alpha, 1.0 - Math.pow(0.5, 0.1), 0.0000000001);
}

frame testMovingAverages(c: *Check) {
    c.begin("moving_averages");
    local x: float[10] = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
    local out: *float = Indicators.alloc(10);
    Indicators.sma(&x[0], 10, 3, out);
    c.ok("sma_warmup", Indicators.isNan(out[1]));
    c.near("sma_2", out[2], 2.0, 0.0);
    c.near("sma_9", out[9], 9.0, 0.0);
    Indicators.ema(&x[0], 10, 3, out);
    c.near("ema_seed", out[2], 2.0, 0.0);
    c.near("ema_3", out[3], 3.0, 0.0);
    c.near("ema_9", out[9], 9.0, 0.0000001);
    Indicators.wma(&x[0], 10, 3, out);
    c.near("wma_9", out[9], ((10.0 * 3.0) + (9.0 * 2.0) + 8.0) / 6.0, 0.0000001);
    Indicators.dema(&x[0], 10, 3, out);
    c.near("dema_linear", out[9], 10.0, 0.0000001);
    Indicators.tema(&x[0], 10, 3, out);
    c.near("tema_linear", out[9], 10.0, 0.0000001);
    Indicators.rma(&x[0], 10, 4, out);
    c.near("rma_seed", out[3], 2.5, 0.0);
    c.near("rma_4", out[4], ((2.5 * 3.0) + 5.0) / 4.0, 0.0000001);
    Indicators.roc(&x[0], 10, 1, out);
    c.near("roc", out[1], 100.0, 0.0000001);
    Indicators.momentum(&x[0], 10, 3, out);
    c.near("momentum", out[9], 3.0, 0.0);
    free(cast<*void>(out));
    local up: float[30];
    loop (local i: int = 0; i < 30; i = i + 1) {
        up[i] = 100.0 + cast<float>(i);
    }
    local r: *float = Indicators.alloc(30);
    Indicators.rsi(&up[0], 30, 14, r);
    c.near("rsi_uptrend", r[29], 100.0, 0.0);
    c.equalInt("rsi_first_valid", cast<long>(Indicators.firstValid(r, 30)), 14);
    loop (local i: int = 0; i < 30; i = i + 1) {
        up[i] = (i % 2) == 0 ? 100.0 : 101.0;
    }
    Indicators.rsi(&up[0], 30, 14, r);
    c.near("rsi_oscillating", r[29], 50.0, 5.0);
    free(cast<*void>(r));
}

frame testIndicators(c: *Check) {
    c.begin("indicators");
    local s: BarSeries = BarSeries.synthetic(cast<u64>(2026), 400, 100.0, 0.05, 0.25, 60);
    c.equalInt("bars", cast<long>(s.len), 400);
    c.value("last_close", s.close[399], 6);
    local consistent: bool = true;
    loop (local i: int = 0; i < s.len; i = i + 1) {
        if ((s.high[i] < s.low[i]) || (s.close[i] > s.high[i]) || (s.close[i] < s.low[i]) || (s.open[i] > s.high[i])) {
            consistent = false;
        }
    }
    c.ok("ohlc_consistent", consistent);
    local n: int = s.len;
    local m: MacdOut = Indicators.macd(s.close, n, 12, 26, 9);
    c.equalInt("macd_first", cast<long>(Indicators.firstValid(m.macd, n)), 25);
    c.equalInt("signal_first", cast<long>(Indicators.firstValid(m.signal, n)), 33);
    c.value("macd_last", m.macd[n - 1], 6);
    c.value("signal_last", m.signal[n - 1], 6);
    c.near("hist_identity", m.histogram[n - 1], m.macd[n - 1] - m.signal[n - 1], 0.0000000001);
    m.destroy();
    local bb: BandsOut = Indicators.bollinger(s.close, n, 20, 2.0);
    c.value("bb_upper", bb.upper[n - 1], 6);
    c.value("bb_lower", bb.lower[n - 1], 6);
    c.near("bb_symmetric", bb.upper[n - 1] - bb.middle[n - 1], bb.middle[n - 1] - bb.lower[n - 1], 0.0000001);
    local inside: int = 0;
    loop (local i: int = 19; i < n; i = i + 1) {
        if ((s.close[i] <= bb.upper[i]) && (s.close[i] >= bb.lower[i])) {
            inside = inside + 1;
        }
    }
    c.ok("bb_mostly_inside", (cast<float>(inside) / cast<float>(n - 19)) > 0.85);
    bb.destroy();
    local atr: *float = Indicators.alloc(n);
    Indicators.atr(&s, 14, atr);
    c.value("atr_last", atr[n - 1], 6);
    c.ok("atr_positive", atr[n - 1] > 0.0);
    local kc: BandsOut = Indicators.keltner(&s, 20, 2.0);
    c.value("keltner_upper", kc.upper[n - 1], 6);
    kc.destroy();
    local dc: BandsOut = Indicators.donchian(&s, 20);
    local hi: float = s.high[n - 20];
    loop (local i: int = n - 20; i < n; i = i + 1) {
        hi = Math.max(hi, s.high[i]);
    }
    c.near("donchian_upper", dc.upper[n - 1], hi, 0.0);
    dc.destroy();
    local st: StochOut = Indicators.stochastic(&s, 14, 3);
    c.value("stoch_k", st.k[n - 1], 6);
    c.value("stoch_d", st.d[n - 1], 6);
    c.ok("stoch_range", (st.k[n - 1] >= 0.0) && (st.k[n - 1] <= 100.0));
    st.destroy();
    local wr: *float = Indicators.alloc(n);
    Indicators.williamsR(&s, 14, wr);
    c.value("williams_r", wr[n - 1], 6);
    local cci: *float = Indicators.alloc(n);
    Indicators.cci(&s, 20, cci);
    c.value("cci", cci[n - 1], 6);
    local adx: AdxOut = Indicators.adx(&s, 14);
    c.value("adx", adx.adx[n - 1], 6);
    c.value("plus_di", adx.plus_di[n - 1], 6);
    c.value("minus_di", adx.minus_di[n - 1], 6);
    adx.destroy();
    local obv: *float = Indicators.alloc(n);
    Indicators.obv(&s, obv);
    c.value("obv", obv[n - 1], 2);
    local mfi: *float = Indicators.alloc(n);
    Indicators.mfi(&s, 14, mfi);
    c.value("mfi", mfi[n - 1], 6);
    local vw: *float = Indicators.alloc(n);
    Indicators.vwap(&s, 0, vw);
    c.value("vwap", vw[n - 1], 6);
    Indicators.rollingVwap(&s, 20, vw);
    c.value("rolling_vwap", vw[n - 1], 6);
    local trix: *float = Indicators.alloc(n);
    Indicators.trix(s.close, n, 15, trix);
    c.value("trix", trix[n - 1], 6);
    local au: *float = Indicators.alloc(n);
    local ad: *float = Indicators.alloc(n);
    Indicators.aroon(&s, 25, au, ad);
    c.value("aroon_up", au[n - 1], 6);
    c.value("aroon_down", ad[n - 1], 6);
    Indicators.chaikin(&s, au, ad);
    c.value("chaikin_osc", ad[n - 1], 2);
    local sar: *float = Indicators.alloc(n);
    Indicators.parabolicSar(&s, 0.02, 0.2, sar);
    c.value("psar", sar[n - 1], 6);
    local ich: IchimokuOut = Indicators.ichimoku(&s, 9, 26, 52);
    c.value("tenkan", ich.tenkan[n - 1], 6);
    c.value("kijun", ich.kijun[n - 1], 6);
    c.value("span_a", ich.span_a[n - 1], 6);
    c.value("span_b", ich.span_b[n - 1], 6);
    ich.destroy();
    local hma: *float = Indicators.alloc(n);
    Indicators.hma(s.close, n, 16, hma);
    c.value("hma", hma[n - 1], 6);
    Indicators.kama(s.close, n, 10, 2, 30, hma);
    c.value("kama", hma[n - 1], 6);
    local rv: *float = Indicators.alloc(n);
    Indicators.realizedVol(s.close, n, 30, 252.0, rv);
    c.value("realized_vol", rv[n - 1], 6);
    Indicators.parkinsonVol(&s, 30, 252.0, rv);
    c.value("parkinson_vol", rv[n - 1], 6);
    Indicators.garmanKlassVol(&s, 30, 252.0, rv);
    c.value("garman_klass_vol", rv[n - 1], 6);
    local fast: *float = Indicators.alloc(n);
    local slow: *float = Indicators.alloc(n);
    Indicators.sma(s.close, n, 10, fast);
    Indicators.sma(s.close, n, 30, slow);
    local cross: *int = cast<*int>(Indicators.alloc(n));
    c.integer("sma_crossings", cast<long>(Indicators.crossings(fast, slow, n, cross)));
    local z: *float = Indicators.alloc(n);
    Indicators.zscore(s.close, n, 20, z);
    c.value("zscore", z[n - 1], 6);
    free(cast<*void>(atr));
    free(cast<*void>(wr));
    free(cast<*void>(cci));
    free(cast<*void>(obv));
    free(cast<*void>(mfi));
    free(cast<*void>(vw));
    free(cast<*void>(trix));
    free(cast<*void>(au));
    free(cast<*void>(ad));
    free(cast<*void>(sar));
    free(cast<*void>(hma));
    free(cast<*void>(rv));
    free(cast<*void>(fast));
    free(cast<*void>(slow));
    free(cast<*void>(cross));
    free(cast<*void>(z));
    # Resampling to 4x the interval preserves totals and extremes.
    local r: BarSeries = s.resample(240);
    c.equalInt("resampled_bars", cast<long>(r.len), 100);
    local vol_a: float = 0.0;
    local vol_b: float = 0.0;
    loop (local i: int = 0; i < s.len; i = i + 1) {
        vol_a = vol_a + s.volume[i];
    }
    loop (local i: int = 0; i < r.len; i = i + 1) {
        vol_b = vol_b + r.volume[i];
    }
    c.near("resample_volume", vol_b, vol_a, 0.000000001);
    c.near("resample_close", r.close[r.len - 1], s.close[s.len - 1], 0.0);
    c.near("resample_high", r.high[0], Math.max(Math.max(s.high[0], s.high[1]), Math.max(s.high[2], s.high[3])), 0.0);
    r.destroy();
    s.destroy();
}

frame testAggregation(c: *Check) {
    c.begin("aggregation");
    local agg: BarAggregator = BarAggregator.new(BarMode.Time, 60);
    local rng: Xoshiro = Xoshiro.new(cast<u64>(3));
    local price: float = 50.0;
    loop (local t: long = 0; t < 600; t = t + 3) {
        price = price + rng.gaussian(0.0, 0.05);
        agg.add(t, price, 100.0);
    }
    agg.flush();
    c.equalInt("time_bars", cast<long>(agg.series.len), 10);
    c.near("bar_volume", agg.series.volume[0], 2000.0, 0.0);
    c.equalInt("bar_trades", agg.series.trades[0], 20);
    c.equalInt("bar_time", agg.series.time[3], 180);
    agg.destroy();
    local vb: BarAggregator = BarAggregator.new(BarMode.Volume, 1000);
    loop (local i: int = 0; i < 95; i = i + 1) {
        vb.add(cast<long>(i), 10.0 + cast<float>(i % 7), 110.0);
    }
    vb.flush();
    c.equalInt("volume_bars", cast<long>(vb.series.len), 10);
    vb.destroy();
    local tb: BarAggregator = BarAggregator.new(BarMode.Ticks, 25);
    loop (local i: int = 0; i < 100; i = i + 1) {
        tb.add(cast<long>(i), 1.0 + cast<float>(i), 1.0);
    }
    tb.flush();
    c.equalInt("tick_bars", cast<long>(tb.series.len), 4);
    c.near("tick_bar_open", tb.series.open[1], 26.0, 0.0);
    c.near("tick_bar_vwap", tb.series.vwap[0], 13.0, 0.0000001);
    tb.destroy();
    local store: SeriesStore = SeriesStore.new(10);
    loop (local t: long = 0; t < 100; t = t + 1) {
        store.onTrade("AAA", t, 10.0 + cast<float>(t), 1.0);
        store.onTrade("BBB", t * 2, 20.0, 2.0);
    }
    store.flush();
    local a: *SeriesEntry = store.find("AAA");
    local b: *SeriesEntry = store.find("BBB");
    c.equalInt("store_symbols", cast<long>(store.count), 2);
    c.equalInt("store_a_bars", cast<long>(a.bars.len), 10);
    c.equalInt("store_b_bars", cast<long>(b.bars.len), 20);
    c.ok("store_missing", store.find("ZZZ") == nullptr);
    c.ok("append_rejects_old", !store.append("AAA", Bar { time: 5, open: 1.0, high: 1.0, low: 1.0, close: 1.0, volume: 1.0, trades: 1, vwap: 1.0 }));
    c.equalInt("store_total", store.totalBars(), 30);
    store.destroy();
}

frame runSeriesTests(c: *Check) {
    testRolling(c);
    testMovingAverages(c);
    testIndicators(c);
    testAggregation(c);
}
