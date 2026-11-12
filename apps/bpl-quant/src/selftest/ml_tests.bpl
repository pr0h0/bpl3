# Self-tests for statistical learning, credit and FX models.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [Matrix] from "../math/matrix.bpl";
import [Stats] from "../math/stats.bpl";
import [Special] from "../math/special.bpl";
import [ReturnPanel] from "../risk/covariance.bpl";
import [Pca], [PcaResult], [Ols], [OlsResult], [KMeans], [KMeansResult], [Logistic], [LogisticResult], [Bootstrap], [Kde] from "../ml/models.bpl";
import [HazardCurve], [Cds], [CdsValue], [Merton], [MertonResult], [Vasicek1F], [Fx] from "../quant/credit_fx.bpl";
import [DiscountCurve] from "../rates/curve.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "../quant/black_scholes.bpl";

export runMlTests;

frame testPca(c: *Check) {
    c.begin("pca");
    local assets: int = 6;
    local periods: int = 2000;
    local panel: ReturnPanel = ReturnPanel.new(assets, periods);
    local rng: Xoshiro = Xoshiro.new(cast<u64>(61));
    loop (local t: int = 0; t < periods; t = t + 1) {
        local market: float = rng.normal();
        loop (local i: int = 0; i < assets; i = i + 1) {
            panel.put(i, t, (0.8 * market) + (0.4 * rng.normal()));
        }
    }
    local r: PcaResult = Pca.fit(&panel);
    # One factor with loading 0.8 and noise 0.4: first eigenvalue ~ 1 + 5 * 0.8.
    c.near("first_share", r.explained[0], (1.0 + (5.0 * 0.8)) / 6.0, 0.02);
    c.equalInt("components_95", cast<long>(r.componentsFor(0.95)), 5);
    local equal: bool = true;
    loop (local i: int = 1; i < assets; i = i + 1) {
        if (Math.abs(r.eigen.vectors.at(i, 0) - r.eigen.vectors.at(0, 0)) > 0.05) {
            equal = false;
        }
    }
    c.ok("market_loadings_equal", equal);
    c.ok("loadings_positive", r.eigen.vectors.at(0, 0) > 0.0);
    r.destroy();
    panel.destroy();
}

frame testOls(c: *Check) {
    c.begin("ols");
    local n: int = 1000;
    local rng: Xoshiro = Xoshiro.new(cast<u64>(62));
    local x: *float = cast<*float>(malloc(cast<long>(n * 3) * sizeof(float)));
    local y: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 0; i < n; i = i + 1) {
        x[i * 3] = rng.normal();
        x[(i * 3) + 1] = rng.normal();
        x[(i * 3) + 2] = rng.normal();
        y[i] = ((0.5 + (2.0 * x[i * 3])) - (1.0 * x[(i * 3) + 1])) + (0.0 * x[(i * 3) + 2]) + (0.5 * rng.normal());
    }
    local r: OlsResult = Ols.fit(y, x, n, 3);
    c.ok("ok", r.ok);
    c.near("intercept", r.beta[0], 0.5, 0.05);
    c.near("beta1", r.beta[1], 2.0, 0.05);
    c.near("beta2", r.beta[2], -1.0, 0.05);
    c.ok("null_insignificant", r.pvalue[3] > 0.01);
    c.ok("beta1_significant", r.pvalue[1] < 0.0001);
    c.near("sigma", r.sigma, 0.5, 0.03);
    c.ok("r2_high", (r.r2 > 0.9) && (r.adj_r2 <= r.r2));
    c.value("f_stat", r.f_stat, 2);
    r.destroy();
    free(cast<*void>(x));
    free(cast<*void>(y));
}

frame testKMeans(c: *Check) {
    c.begin("kmeans");
    local n: int = 300;
    local pts: *float = cast<*float>(malloc(cast<long>(n * 2) * sizeof(float)));
    local rng: Xoshiro = Xoshiro.new(cast<u64>(63));
    local cx: float[3] = [0.0, 10.0, 0.0];
    local cy: float[3] = [0.0, 0.0, 10.0];
    loop (local i: int = 0; i < n; i = i + 1) {
        local g: int = i % 3;
        pts[i * 2] = cx[g] + rng.normal();
        pts[(i * 2) + 1] = cy[g] + rng.normal();
    }
    local r: KMeansResult = KMeans.fit(pts, n, 2, 3, cast<u64>(1), 100);
    local pure: bool = true;
    loop (local i: int = 3; i < n; i = i + 1) {
        if (r.labels[i] != r.labels[i % 3]) {
            pure = false;
        }
    }
    c.ok("clusters_recovered", pure);
    c.equalInt("cluster_size", cast<long>(r.sizes[r.labels[0]]), 100);
    c.ok("inertia_small", (r.inertia / cast<float>(n)) < 2.5);
    r.destroy();
    free(cast<*void>(pts));
}

frame testLogistic(c: *Check) {
    c.begin("logistic");
    local n: int = 3000;
    local rng: Xoshiro = Xoshiro.new(cast<u64>(64));
    local x: *float = cast<*float>(malloc(cast<long>(n * 2) * sizeof(float)));
    local y: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 0; i < n; i = i + 1) {
        x[i * 2] = rng.normal();
        x[(i * 2) + 1] = rng.normal();
        local z: float = (-0.5 + (1.5 * x[i * 2])) - (1.0 * x[(i * 2) + 1]);
        local p: float = 1.0 / (1.0 + Math.exp(-z));
        y[i] = rng.nextFloat() < p ? 1.0 : 0.0;
    }
    local r: LogisticResult = Logistic.fit(y, x, n, 2, 50);
    c.ok("converged", r.converged);
    c.near("intercept", r.beta[0], -0.5, 0.12);
    c.near("beta1", r.beta[1], 1.5, 0.15);
    c.near("beta2", r.beta[2], -1.0, 0.12);
    c.ok("accuracy", r.accuracy > 0.7);
    c.value("log_likelihood", r.log_likelihood, 3);
    r.destroy();
    free(cast<*void>(x));
    free(cast<*void>(y));
}

frame testBootstrapKde(c: *Check) {
    c.begin("bootstrap_kde");
    local n: int = 500;
    local rng: Xoshiro = Xoshiro.new(cast<u64>(65));
    local x: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 0; i < n; i = i + 1) {
        x[i] = rng.gaussian(1.0, 2.0);
    }
    local lo: float = 0.0;
    local hi: float = 0.0;
    local mean: float = Bootstrap.interval(x, n, 0, 2000, 0.95, cast<u64>(5), &lo, &hi);
    c.ok("ci_contains_point", (lo < mean) && (mean < hi));
    c.ok("ci_contains_truth", (lo < 1.0) && (1.0 < hi));
    c.near("ci_width", hi - lo, (2.0 * 1.96 * 2.0) / Math.sqrt(cast<float>(n)), 0.1);
    local bw: float = Kde.silverman(x, n);
    c.ok("bandwidth_positive", bw > 0.0);
    local integral: float = 0.0;
    local step: float = 0.05;
    local t: float = -10.0;
    loop (t < 12.0) {
        integral = integral + (Kde.density(x, n, bw, t) * step);
        t = t + step;
    }
    c.near("kde_integrates_to_one", integral, 1.0, 0.01);
    c.near("kde_peak", Kde.density(x, n, bw, 1.0), Special.normPdf(0.0) / 2.0, 0.03);
    free(cast<*void>(x));
}

frame testCredit(c: *Check) {
    c.begin("credit");
    local curve: DiscountCurve = DiscountCurve.flat(0.03);
    local flat: HazardCurve = HazardCurve.new(1, 0.4);
    flat.times[0] = 30.0;
    flat.hazards[0] = 0.02;
    flat.n = 1;
    c.near("survival", flat.survival(5.0), Math.exp(-0.1), 0.0000000001);
    local v: CdsValue = Cds.value(&flat, &curve, 5.0, 0.012, 10000000.0);
    # Credit triangle: par spread ~ hazard * (1 - recovery).
    c.near("credit_triangle", v.par_spread, 0.012, 0.0005);
    c.value("risky_annuity", v.risky_annuity, 6);
    flat.destroy();
    local mats: float[4] = [1.0, 3.0, 5.0, 10.0];
    local spreads: float[4] = [0.005, 0.008, 0.011, 0.015];
    local h: HazardCurve = Cds.bootstrap(&curve, &mats[0], &spreads[0], 4, 0.4);
    local reprices: bool = true;
    loop (local i: int = 0; i < 4; i = i + 1) {
        local cv: CdsValue = Cds.value(&h, &curve, mats[i], spreads[i], 1.0);
        if (Math.abs(cv.par_spread - spreads[i]) > 0.0000001) {
            reprices = false;
        }
    }
    c.ok("bootstrap_reprices", reprices);
    c.ok("hazards_increase", h.hazards[3] > h.hazards[0]);
    c.value("pd_5y", h.defaultProbability(5.0), 6);
    h.destroy();
    # Merton round trip: build equity from known assets, then recover them.
    local va: float = 120.0;
    local sa: float = 0.25;
    local debt: float = 80.0;
    local sp: OptionSpec = OptionSpec.new(OptionKind.Call, va, debt, 0.03, 0.0, sa, 1.0);
    local equity: float = BlackScholes.price(&sp);
    local d1: float = BlackScholes.d1(&sp);
    local equity_vol: float = (Special.normCdf(d1) * sa * va) / equity;
    local m: MertonResult = Merton.solve(equity, equity_vol, debt, 0.03, 1.0);
    c.ok("merton_converged", m.converged);
    c.near("merton_assets", m.asset_value, va, 0.0001);
    c.near("merton_asset_vol", m.asset_vol, sa, 0.0001);
    c.value("merton_pd", m.default_probability, 8);
    c.ok("merton_spread_positive", m.credit_spread > 0.0);
    c.near("vasicek_zero_corr", Vasicek1F.lossQuantile(0.02, 0.000001, 0.45, 0.999), 0.45 * 0.02, 0.001);
    c.value("vasicek_999", Vasicek1F.lossQuantile(0.02, 0.15, 0.45, 0.999), 6);
    curve.destroy();
}

frame testFx(c: *Check) {
    c.begin("fx");
    local fwd: float = Fx.forward(1.10, 0.05, 0.03, 1.0);
    c.near("cip_forward", fwd, 1.10 * Math.exp(0.02), 0.0000000001);
    c.near("forward_points", Fx.forwardPoints(1.10, 0.05, 0.03, 1.0, 0.0001), (fwd - 1.10) / 0.0001, 0.0000001);
    local call: float = Fx.option(true, 1.10, 1.12, 0.05, 0.03, 0.1, 0.5);
    local put: float = Fx.option(false, 1.10, 1.12, 0.05, 0.03, 0.1, 0.5);
    c.near("gk_parity", call - put, (1.10 * Math.exp(-0.015)) - (1.12 * Math.exp(-0.025)), 0.0000000001);
    c.value("gk_call", call, 8);
    c.near("quanto", Fx.quantoDrift(0.02, 0.3, 0.2, 0.1), 0.014, 0.0000000001);
    c.near("triangular", Fx.triangularResidual(1.1, 150.0, 165.0), 0.0, 0.0000000001);
}

frame runMlTests(c: *Check) {
    testPca(c);
    testOls(c);
    testKMeans(c);
    testLogistic(c);
    testBootstrapKde(c);
    testCredit(c);
    testFx(c);
}
