# Self-tests for covariance estimation, VaR and portfolio construction.

import [Math] from "std/math.bpl";
import malloc, free from "std/c.bpl";
import [Check] from "./check.bpl";
import [Matrix] from "../math/matrix.bpl";
import [ReturnPanel], [Covariance] from "../risk/covariance.bpl";
import [VaR], [VarReport], [BacktestResult] from "../risk/var.bpl";
import [Portfolio], [Allocation], [Frontier] from "../risk/portfolio.bpl";
import [Xoshiro] from "../core/prng.bpl";

export runRiskTests;

frame testCovMatrix() ret Matrix {
    local vols: float[4] = [0.010, 0.015, 0.020, 0.012];
    local corr: float[16] = [1.0, 0.6, 0.3, 0.2, 0.6, 1.0, 0.4, 0.1, 0.3, 0.4, 1.0, 0.5, 0.2, 0.1, 0.5, 1.0];
    local m: Matrix = Matrix.new(4, 4);
    loop (local i: int = 0; i < 4; i = i + 1) {
        loop (local j: int = 0; j < 4; j = j + 1) {
            m.put(i, j, corr[(i * 4) + j] * vols[i] * vols[j]);
        }
    }
    return m;
}

frame testCovariance(c: *Check) {
    c.begin("covariance");
    local truth: Matrix = testCovMatrix();
    local mu: float[4] = [0.0004, 0.0006, 0.0008, 0.0005];
    local panel: ReturnPanel = ReturnPanel.simulate(&mu[0], &truth, 5000, cast<u64>(17));
    local s: Matrix = Covariance.sample(&panel);
    c.ok("sample_symmetric", s.isSymmetric(0.0));
    c.near("sample_var0", s.at(0, 0), truth.at(0, 0), 0.000005);
    c.near("sample_cov02", s.at(0, 2), truth.at(0, 2), 0.000005);
    local corr: Matrix = Covariance.toCorrelation(&s);
    c.near("corr_diag", corr.at(1, 1), 1.0, 0.0000000001);
    c.near("corr01", corr.at(0, 1), 0.6, 0.03);
    c.value("avg_corr", Covariance.averageCorrelation(&corr), 6);
    local e: Matrix = Covariance.ewma(&panel, 0.94);
    c.ok("ewma_symmetric", e.isSymmetric(0.0000000000001));
    local ech: Matrix;
    c.ok("ewma_pd", e.cholesky(&ech));
    local delta: float = 0.0;
    local lw: Matrix = Covariance.ledoitWolf(&panel, &delta);
    c.value("ledoit_wolf_delta", delta, 6);
    c.ok("lw_delta_range", (delta >= 0.0) && (delta <= 1.0));
    c.near("lw_trace", lw.trace(), s.trace(), 0.0000000001);
    local market: *float = cast<*float>(malloc(cast<long>(panel.periods) * sizeof(float)));
    local ew: float[4] = [0.25, 0.25, 0.25, 0.25];
    panel.portfolioReturns(&ew[0], market);
    local si: Matrix = Covariance.singleIndex(&panel, market);
    c.ok("single_index_pd", si.isSymmetric(0.0000000000001));
    c.value("single_index_00", si.at(0, 0) * 10000.0, 6);
    free(cast<*void>(market));
    local vols: float[4] = [0.1, 0.2, 0.3, 0.4];
    local back: Matrix = Covariance.fromCorrelation(&corr, &vols[0]);
    c.near("from_corr", back.at(1, 1), 0.04, 0.0000000001);
    truth.destroy();
    panel.destroy();
    s.destroy();
    corr.destroy();
    e.destroy();
    ech.destroy();
    lw.destroy();
    si.destroy();
    back.destroy();
}

frame testVaR(c: *Check) {
    c.begin("var");
    local rng: Xoshiro = Xoshiro.new(cast<u64>(4242));
    local n: int = 20000;
    local r: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 0; i < n; i = i + 1) {
        r[i] = rng.gaussian(0.0, 0.01);
    }
    local hist: VarReport = VaR.historical(r, n, 0.99, 1000000.0);
    c.value("historical_99", hist.var, 2);
    c.value("historical_es", hist.es, 2);
    c.near("historical_vs_normal", hist.var, 23263.0, 0.03);
    local para: VarReport = VaR.parametric(0.0, 0.01, 0.99, 1.0, 1000000.0);
    c.near("parametric_99", para.var, 23263.48, 0.0001);
    c.near("parametric_es", para.es, 26652.14, 0.0001);
    local ten: VarReport = VaR.parametric(0.0, 0.01, 0.99, 10.0, 1.0);
    c.near("sqrt_time", ten.var, (para.var / 1000000.0) * Math.sqrt(10.0), 0.0000001);
    c.ok("es_exceeds_var", hist.es > hist.var);
    local cf: VarReport = VaR.cornishFisher(r, n, 0.99, 1000000.0);
    c.near("cornish_fisher_normal", cf.var, para.var, 0.05);
    local fhs: VarReport = VaR.filteredHistorical(r, n, 0.94, 0.99, 1000000.0);
    c.value("filtered_historical", fhs.var, 2);
    # Backtest: the true 99% quantile forecast should land in the green zone.
    local fc: *float = cast<*float>(malloc(cast<long>(250) * sizeof(float)));
    loop (local i: int = 0; i < 250; i = i + 1) {
        fc[i] = 0.023263;
    }
    local bt: BacktestResult = VaR.backtest(r, fc, 250, 0.99);
    c.integer("backtest_exceptions", cast<long>(bt.exceptions));
    c.text("backtest_zone", bt.zone);
    c.value("kupiec_p", bt.kupiec_p, 6);
    loop (local i: int = 0; i < 250; i = i + 1) {
        fc[i] = 0.005;
    }
    local bad: BacktestResult = VaR.backtest(r, fc, 250, 0.99);
    c.text("undersized_zone", bad.zone);
    c.ok("undersized_rejected", bad.kupiec_p < 0.001);
    free(cast<*void>(fc));
    local rolling: *float = cast<*float>(malloc(cast<long>(600) * sizeof(float)));
    VaR.rollingHistorical(r, 600, 250, 0.99, rolling);
    c.ok("rolling_warmup", rolling[100] != rolling[100]);
    c.value("rolling_last", rolling[599], 6);
    free(cast<*void>(rolling));
    local cov: Matrix = testCovMatrix();
    local w: float[4] = [0.4, 0.3, 0.2, 0.1];
    local mu: float[4] = [0.0, 0.0, 0.0, 0.0];
    local pv: VarReport = VaR.portfolio(&w[0], &mu[0], &cov, 0.99, 1.0, 1000000.0);
    c.value("portfolio_var", pv.var, 2);
    local comps: float[4] = [0.0, 0.0, 0.0, 0.0];
    local total: float = VaR.components(&w[0], &cov, 0.99, 1000000.0, &comps[0]);
    c.near("components_sum", comps[0] + comps[1] + comps[2] + comps[3], total, 0.0000001);
    c.near("components_total", total, pv.var, 0.0000001);
    local mc: VarReport = VaR.monteCarlo(&w[0], &mu[0], &cov, 0.99, 1000000.0, 50000, cast<u64>(5));
    c.near("monte_carlo_close", mc.var, pv.var, 0.04);
    local shocks: float[4] = [-0.1, -0.05, -0.2, 0.0];
    c.near("stress", VaR.stress(&w[0], &shocks[0], 4, 1000000.0), -95000.0, 0.0000001);
    cov.destroy();
    free(cast<*void>(r));
}

frame testPortfolio(c: *Check) {
    c.begin("portfolio");
    local cov: Matrix = testCovMatrix();
    local mu: float[4] = [0.0004, 0.0006, 0.0008, 0.0005];
    local rf: float = 0.0001;
    local gmv: Allocation = Portfolio.minVariance(&mu[0], &cov, rf);
    c.ok("gmv_ok", gmv.ok);
    c.near("gmv_sum", gmv.weightSum(), 1.0, 0.0000000001);
    c.value("gmv_w0", gmv.weights[0], 6);
    c.value("gmv_vol", gmv.volatility, 8);
    local ew: Allocation = Portfolio.equalWeight(&mu[0], &cov, rf);
    c.ok("gmv_beats_equal", gmv.volatility < ew.volatility);
    local tan: Allocation = Portfolio.maxSharpe(&mu[0], &cov, rf);
    c.value("tangency_sharpe", tan.sharpe, 6);
    c.ok("tangency_best_sharpe", (tan.sharpe >= gmv.sharpe) && (tan.sharpe >= ew.sharpe));
    local tr: Allocation = Portfolio.targetReturn(&mu[0], &cov, 0.0006, rf);
    c.near("target_hit", tr.expected_return, 0.0006, 0.0000000001);
    c.near("target_sum", tr.weightSum(), 1.0, 0.0000000001);
    local tr_gmv: Allocation = Portfolio.targetReturn(&mu[0], &cov, gmv.expected_return, rf);
    c.near("frontier_min_is_gmv", tr_gmv.volatility, gmv.volatility, 0.0000001);
    local lo: Allocation = Portfolio.longOnly(&mu[0], &cov, 5.0, rf, 5000);
    c.near("long_only_sum", lo.weightSum(), 1.0, 0.0000000001);
    c.ok("long_only_nonneg", lo.minWeight() >= 0.0);
    c.value("long_only_w2", lo.weights[2], 6);
    local rp: Allocation = Portfolio.riskParity(&mu[0], &cov, rf, 500);
    local rc: float[4] = [0.0, 0.0, 0.0, 0.0];
    Portfolio.riskContributions(rp.weights, &cov, &rc[0]);
    c.near("risk_parity_equal", rc[0], 0.25, 0.000001);
    c.near("risk_parity_equal3", rc[3], 0.25, 0.000001);
    c.value("risk_parity_w0", rp.weights[0], 6);
    local iv: Allocation = Portfolio.inverseVol(&mu[0], &cov, rf);
    c.near("inverse_vol_sum", iv.weightSum(), 1.0, 0.0000000001);
    local f: Frontier = Portfolio.frontier(&mu[0], &cov, 11);
    local monotone: bool = true;
    loop (local k: int = 1; k < 11; k = k + 1) {
        if (f.vols[k] < (f.vols[k - 1] - 0.0000000001)) {
            monotone = false;
        }
    }
    c.ok("frontier_monotone", monotone);
    c.value("frontier_top_vol", f.vols[10], 8);
    f.destroy();
    local projected: float[4] = [0.0, 0.0, 0.0, 0.0];
    local raw: float[4] = [0.5, 1.2, -0.3, 0.1];
    Portfolio.projectSimplex(&raw[0], 4, &projected[0]);
    c.near("simplex_sum", projected[0] + projected[1] + projected[2] + projected[3], 1.0, 0.0000000001);
    c.near("simplex_value", projected[1], 0.85, 0.0000000001);
    local mw: float[4] = [0.25, 0.25, 0.25, 0.25];
    local views: float[4] = [0.0, 0.0, 0.002, 0.0];
    local mask: bool[4] = [false, false, true, false];
    local post: float[4] = [0.0, 0.0, 0.0, 0.0];
    c.ok("black_litterman_ok", Portfolio.blackLitterman(&cov, &mw[0], 2.5, 0.05, &views[0], &mask[0], 0.00001, &post[0]));
    c.value("bl_view_asset", post[2] * 10000.0, 6);
    c.ok("bl_view_pulls_up", post[2] > post[0]);
    c.value("tracking_error", Portfolio.trackingError(gmv.weights, ew.weights, &cov), 8);
    c.value("diversification_ratio", Portfolio.diversificationRatio(ew.weights, &cov), 6);
    gmv.destroy();
    ew.destroy();
    tan.destroy();
    tr.destroy();
    tr_gmv.destroy();
    lo.destroy();
    rp.destroy();
    iv.destroy();
    cov.destroy();
}

frame runRiskTests(c: *Check) {
    testCovariance(c);
    testVaR(c);
    testPortfolio(c);
}
