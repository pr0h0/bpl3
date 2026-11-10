# Self-tests for GARCH, ARMA, unit-root tests, Kalman filters and cointegration.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [Stats] from "../math/stats.bpl";
import [Garch], [GarchKind], [GarchFit] from "../tsa/garch.bpl";
import [Arima], [ArmaFit], [UnitRoot] from "../tsa/arima.bpl";
import [LocalLevel], [DynamicHedge], [Cointegration], [CointegrationResult] from "../tsa/kalman.bpl";

export runTsaTests;

frame normals(n: int, seed: u64) ret *float {
    local rng: Xoshiro = Xoshiro.new(seed);
    local out: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 0; i < n; i = i + 1) {
        out[i] = rng.normal();
    }
    return out;
}

frame testGarch(c: *Check) {
    c.begin("garch");
    local n: int = 2500;
    local truth: GarchFit;
    truth.kind = GarchKind.Garch;
    truth.mu = 0.0002;
    truth.omega = 0.000002;
    truth.alpha = 0.08;
    truth.beta = 0.9;
    truth.gamma = 0.0;
    truth.persistence = 0.98;
    local r: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    Garch.simulate(&truth, n, cast<u64>(31), r);
    local fit: GarchFit = Garch.fit(GarchKind.Garch, r, n);
    c.near("alpha", fit.alpha, 0.08, 0.03);
    c.near("beta", fit.beta, 0.9, 0.05);
    c.near("persistence", fit.persistence, 0.98, 0.02);
    c.value("log_likelihood", fit.log_likelihood, 4);
    c.value("long_run_vol", fit.long_run_vol, 6);
    local gjr: GarchFit = Garch.fit(GarchKind.Gjr, r, n);
    c.ok("gjr_nested_likelihood", gjr.log_likelihood >= (fit.log_likelihood - 1.0));
    c.near("gjr_small_leverage", gjr.gamma, 0.0, 0.05);
    local eg: GarchFit = Garch.fit(GarchKind.Egarch, r, n);
    c.ok("egarch_persistent", eg.beta > 0.8);
    c.value("egarch_aic", eg.aic, 4);
    local f: *float = cast<*float>(malloc(cast<long>(250) * sizeof(float)));
    Garch.forecast(&fit, r, n, 250, f);
    c.ok("forecast_converges", Math.abs(f[249] - (fit.long_run_vol * fit.long_run_vol)) < (Math.abs(f[0] - (fit.long_run_vol * fit.long_run_vol)) + 0.0000000001));
    # Leverage: simulate GJR with gamma and recover a positive gamma.
    local lev: GarchFit = truth;
    lev.kind = GarchKind.Gjr;
    lev.alpha = 0.03;
    lev.gamma = 0.1;
    lev.persistence = 0.03 + 0.9 + 0.05;
    Garch.simulate(&lev, n, cast<u64>(32), r);
    local lev_fit: GarchFit = Garch.fit(GarchKind.Gjr, r, n);
    c.ok("gjr_recovers_leverage", lev_fit.gamma > 0.03);
    free(cast<*void>(f));
    free(cast<*void>(r));
}

frame testArma(c: *Check) {
    c.begin("arma");
    local n: int = 3000;
    local z: *float = normals(n, cast<u64>(41));
    local x: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local phi: float[2] = [0.5, -0.3];
    local theta: float[1] = [0.0];
    Arima.simulate(&phi[0], 2, &theta[0], 0, 1.0, n, z, x);
    local yw: ArmaFit = Arima.yuleWalker(x, n, 2);
    c.near("yw_phi1", yw.phi[0], 0.5, 0.05);
    c.near("yw_phi2", yw.phi[1], -0.3, 0.05);
    c.near("yw_sigma2", yw.sigma2, 1.0, 0.08);
    local pacf: float[6];
    Arima.pacf(x, n, 5, &pacf[0]);
    c.near("pacf_lag2", pacf[2], -0.3, 0.05);
    c.ok("pacf_cuts_off", (Math.abs(pacf[3]) < 0.06) && (Math.abs(pacf[4]) < 0.06));
    local ma_phi: float[1] = [0.6];
    local ma_theta: float[1] = [0.3];
    Arima.simulate(&ma_phi[0], 1, &ma_theta[0], 1, 1.0, n, z, x);
    local arma: ArmaFit = Arima.fit(x, n, 1, 0, 1);
    c.near("arma_phi", arma.phi[0], 0.6, 0.06);
    c.near("arma_theta", arma.theta[0], 0.3, 0.07);
    c.value("arma_aic", arma.aic, 4);
    local bp: int = 0;
    local bq: int = 0;
    Arima.selectOrder(x, 1000, 0, 2, 2, &bp, &bq);
    c.integer("selected_p", cast<long>(bp));
    c.integer("selected_q", cast<long>(bq));
    # Random walk: ARIMA(0,1,0)-like forecasts stay near the last value.
    local walk: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    walk[0] = 100.0;
    loop (local i: int = 1; i < n; i = i + 1) {
        walk[i] = walk[i - 1] + z[i];
    }
    local rw: ArmaFit = Arima.fit(walk, n, 1, 1, 0);
    local fc: float[5];
    Arima.forecast(&rw, walk, n, 5, &fc[0]);
    c.ok("random_walk_forecast", Math.abs(fc[0] - walk[n - 1]) < 3.0);
    c.near("diff_ar_small", rw.phi[0], 0.0, 0.06);
    local adf_walk: UnitRoot = Arima.adf(walk, n, 2);
    c.ok("adf_keeps_unit_root", !adf_walk.reject_5);
    local stationary: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local one: float[1] = [0.5];
    Arima.simulate(&one[0], 1, &theta[0], 0, 1.0, n, z, stationary);
    local adf_ar: UnitRoot = Arima.adf(stationary, n, 2);
    c.ok("adf_rejects_ar1", adf_ar.reject_5);
    c.value("adf_ar1_stat", adf_ar.statistic, 4);
    local kpss_ar: UnitRoot = Arima.kpss(stationary, n, 12);
    local kpss_walk: UnitRoot = Arima.kpss(walk, n, 12);
    c.ok("kpss_accepts_stationary", !kpss_ar.reject_5);
    c.ok("kpss_rejects_walk", kpss_walk.reject_5);
    free(cast<*void>(z));
    free(cast<*void>(x));
    free(cast<*void>(walk));
    free(cast<*void>(stationary));
}

frame testKalman(c: *Check) {
    c.begin("kalman");
    local n: int = 1000;
    local z: *float = normals(2 * n, cast<u64>(51));
    local truth: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local obs: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local level: float = 50.0;
    loop (local t: int = 0; t < n; t = t + 1) {
        level = level + (0.1 * z[t]);
        truth[t] = level;
        obs[t] = level + (1.0 * z[n + t]);
    }
    local filtered: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local smoothed: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    LocalLevel.filter(obs, n, 1.0, 0.01, filtered, smoothed);
    local e_obs: float = 0.0;
    local e_filt: float = 0.0;
    local e_smooth: float = 0.0;
    loop (local t: int = 50; t < n; t = t + 1) {
        e_obs = e_obs + ((obs[t] - truth[t]) * (obs[t] - truth[t]));
        e_filt = e_filt + ((filtered[t] - truth[t]) * (filtered[t] - truth[t]));
        e_smooth = e_smooth + ((smoothed[t] - truth[t]) * (smoothed[t] - truth[t]));
    }
    c.ok("filter_beats_raw", e_filt < (0.5 * e_obs));
    c.ok("smoother_beats_filter", e_smooth < e_filt);
    local q: float = 0.0;
    LocalLevel.tune(obs, n, 1.0, &q);
    c.ok("tuned_q_near_truth", (q > 0.002) && (q < 0.05));
    # Dynamic hedge ratio converges to the true beta.
    local x: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local y: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local px: float = 20.0;
    loop (local t: int = 0; t < n; t = t + 1) {
        px = px + (0.3 * z[t]);
        x[t] = px;
        y[t] = 5.0 + (1.5 * px) + (0.2 * z[n + t]);
    }
    local a: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local b: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local e: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    DynamicHedge.run(y, x, n, 0.0001, 0.04, a, b, e);
    c.near("hedge_ratio", b[n - 1], 1.5, 0.05);
    local coint: CointegrationResult = Cointegration.engleGranger(y, x, n, 1);
    c.near("eg_hedge_ratio", coint.hedge_ratio, 1.5, 0.01);
    c.ok("eg_rejects_no_cointegration", coint.adf.reject_5);
    c.ok("half_life_short", coint.half_life < 2.0);
    # An OU spread with known speed: theta = 0.1 per step -> half-life ln2/(-ln 0.9) ~ 6.58.
    local s: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    s[0] = 0.0;
    loop (local t: int = 1; t < n; t = t + 1) {
        s[t] = (0.9 * s[t - 1]) + (0.1 * z[t]);
    }
    c.near("ou_half_life", Cointegration.halfLife(s, n), 6.578813, 0.25);
    free(cast<*void>(z));
    free(cast<*void>(truth));
    free(cast<*void>(obs));
    free(cast<*void>(filtered));
    free(cast<*void>(smoothed));
    free(cast<*void>(x));
    free(cast<*void>(y));
    free(cast<*void>(a));
    free(cast<*void>(b));
    free(cast<*void>(e));
    free(cast<*void>(s));
}

frame runTsaTests(c: *Check) {
    testGarch(c);
    testArma(c);
    testKalman(c);
}
