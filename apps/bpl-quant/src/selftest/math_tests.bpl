# Self-tests for the core numeric modules.

import [Math] from "std/math.bpl";
import malloc, free from "std/c.bpl";
import [Check] from "./check.bpl";
import [Xoshiro], [Pcg32], [SplitMix64] from "../core/prng.bpl";
import [FVec] from "../core/vec.bpl";
import [Special] from "../math/special.bpl";
import [Stats], [Moments], [Regression], [TTest], [Histogram], [Welford] from "../math/stats.bpl";
import [Sort] from "../math/sort.bpl";
import [Matrix], [LUResult], [QRResult], [EigenResult] from "../math/matrix.bpl";
import [Optimize], [RootResult], [MinResult] from "../math/optimize.bpl";

export runMathTests;

frame testPrng(c: *Check) {
    c.begin("prng");
    local r: Xoshiro = Xoshiro.new(cast<u64>(42));
    local a: u64 = r.nextU64();
    local b: u64 = r.nextU64();
    c.ok("xoshiro_first", a == cast<u64>(1546998764402558742));
    c.ok("xoshiro_second", b == cast<u64>(6990951692964543102));
    local p: Pcg32 = Pcg32.new(cast<u64>(42), cast<u64>(54));
    c.equalInt("pcg32_reference", cast<long>(p.next()), 2707161783);
    local sm: SplitMix64 = SplitMix64.new(cast<u64>(0));
    c.ok("splitmix_zero", sm.next() == 0xE220A8397B1DCDAF);
    # Uniform moments over 100k draws.
    local w: Welford = Welford.new();
    local g: Welford = Welford.new();
    local rr: Xoshiro = Xoshiro.new(cast<u64>(2024));
    loop (local i: int = 0; i < 100000; i = i + 1) {
        w.add(rr.nextFloat());
        g.add(rr.normal());
    }
    c.value("uniform_mean", w.mean, 4);
    c.value("normal_mean", g.mean, 4);
    c.value("normal_sd", g.stddev(), 4);
    c.near("uniform_var", w.variance(), 1.0 / 12.0, 0.002);
    c.near("normal_var", g.variance(), 1.0, 0.02);
    c.ok("uniform_range", (w.min >= 0.0) && (w.max < 1.0));
    # Bounded integers are in range and roughly uniform.
    local counts: int[6] = [0, 0, 0, 0, 0, 0];
    loop (local i: int = 0; i < 60000; i = i + 1) {
        local d: int = rr.range(0, 6);
        counts[d] = counts[d] + 1;
    }
    local worst: int = 0;
    loop (local i: int = 0; i < 6; i = i + 1) {
        local dev: int = counts[i] - 10000;
        if (dev < 0) {
            dev = -dev;
        }
        if (dev > worst) {
            worst = dev;
        }
    }
    c.ok("dice_uniform", worst < 400);
    # Jumped streams differ but are deterministic.
    local j1: Xoshiro = Xoshiro.new(cast<u64>(9));
    local j2: Xoshiro = Xoshiro.new(cast<u64>(9));
    j2.jump();
    c.ok("jump_differs", j1.nextU64() != j2.nextU64());
    local j3: Xoshiro = Xoshiro.new(cast<u64>(9));
    j3.jump();
    j3.nextU64();
    c.ok("jump_deterministic", j2.nextU64() == j3.nextU64());
    # Poisson mean.
    local pw: Welford = Welford.new();
    loop (local i: int = 0; i < 20000; i = i + 1) {
        pw.add(cast<float>(rr.poisson(3.5)));
    }
    c.near("poisson_mean", pw.mean, 3.5, 0.03);
    local data: int[10] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    rr.shuffle(&data[0], 10);
    local total: int = 0;
    loop (local i: int = 0; i < 10; i = i + 1) {
        total = total + data[i];
    }
    c.equalInt("shuffle_preserves", cast<long>(total), 45);
}

frame testSpecial(c: *Check) {
    c.begin("special");
    c.near("normcdf_0", Special.normCdf(0.0), 0.5, 0.000000000001);
    c.near("normcdf_1", Special.normCdf(1.0), 0.841344746068543, 0.000000000001);
    c.near("normcdf_m2", Special.normCdf(-2.0), 0.022750131948179, 0.000000000001);
    c.near("normcdf_5", Special.normCdf(5.0), 0.999999713348428, 0.000000000001);
    c.near("invnorm_975", Special.invNormCdf(0.975), 1.959963984540054, 0.000000001);
    c.near("invnorm_01", Special.invNormCdf(0.01), -2.326347874040841, 0.000000001);
    loop (local i: int = 1; i < 20; i = i + 1) {
        local p: float = cast<float>(i) / 20.0;
        c.near("invnorm_roundtrip", Special.normCdf(Special.invNormCdf(p)), p, 0.0000000001);
    }
    c.near("erf_half", Special.erf(0.5), 0.520499877813047, 0.000000000001);
    c.near("lgamma_5", Special.lgamma(5.0), Math.log(24.0), 0.0000000001);
    c.near("gamma_half", Special.gamma(0.5), Math.sqrt(3.14159265358979323846), 0.0000000001);
    c.near("gamma_7", Special.gamma(7.0), 720.0, 0.0000000001);
    c.near("beta_2_3", Special.beta(2.0, 3.0), 1.0 / 12.0, 0.0000000001);
    c.near("ibeta_sym", Special.incompleteBeta(2.0, 2.0, 0.5), 0.5, 0.0000000001);
    c.near("igamma_1", Special.incompleteGamma(1.0, 1.0), 1.0 - Math.exp(-1.0), 0.0000000001);
    c.near("t_cdf_2_5", Special.studentTCdf(2.0, 5.0), 0.949030260585070, 0.000000001);
    c.near("t_inv", Special.studentTInv(0.975, 10.0), 2.228138851986, 0.00000001);
    c.near("chi2_cdf", Special.chiSquareCdf(3.841458820694124, 1.0), 0.95, 0.00000001);
    c.near("bvn_independent", Special.bivariateNormCdf(0.0, 0.0, 0.0), 0.25, 0.0001);
    c.near("bvn_rho_half", Special.bivariateNormCdf(0.0, 0.0, 0.5), 1.0 / 3.0, 0.0001);
    c.value("bvn_mixed", Special.bivariateNormCdf(1.0, -0.5, 0.3), 6);
}

frame testStats(c: *Check) {
    c.begin("stats");
    local x: float[8] = [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0];
    c.near("mean", Stats.mean(&x[0], 8), 5.0, 0.0000000001);
    c.near("pop_var", Stats.populationVariance(&x[0], 8), 4.0, 0.0000000001);
    c.near("median", Stats.median(&x[0], 8), 4.5, 0.0000000001);
    c.near("q25", Stats.quantile(&x[0], 8, 0.25), 4.0, 0.0000000001);
    c.near("mad", Stats.mad(&x[0], 8), 0.5, 0.0000000001);
    local m: Moments = Stats.moments(&x[0], 8);
    c.value("skew", m.skewness, 6);
    c.value("kurt", m.kurtosis, 6);
    local xs: float[5] = [1.0, 2.0, 3.0, 4.0, 5.0];
    local ys: float[5] = [2.1, 3.9, 6.2, 7.8, 10.1];
    local reg: Regression = Stats.linearRegression(&xs[0], &ys[0], 5);
    c.near("reg_slope", reg.slope, 1.99, 0.0000001);
    c.near("reg_intercept", reg.intercept, 0.05, 0.0000001);
    c.value("reg_r2", reg.r2, 6);
    c.near("corr", Stats.correlation(&xs[0], &ys[0], 5), 0.998651755568966, 0.000000001);
    c.near("spearman", Stats.spearman(&xs[0], &ys[0], 5), 1.0, 0.0000001);
    local rng: Xoshiro = Xoshiro.new(cast<u64>(77));
    local a: FVec = FVec.new(500);
    local b: FVec = FVec.new(500);
    loop (local i: int = 0; i < 500; i = i + 1) {
        a.push(rng.gaussian(0.0, 1.0));
        b.push(rng.gaussian(0.3, 1.0));
    }
    local t: TTest = Stats.welch(a.data, a.len, b.data, b.len);
    c.value("welch_t", t.t, 4);
    c.ok("welch_significant", t.p_value < 0.01);
    local jb: TTest = Stats.jarqueBera(a.data, a.len);
    c.ok("jb_normal", jb.p_value > 0.01);
    local h: Histogram = Histogram.new(-3.0, 3.0, 12);
    loop (local i: int = 0; i < a.len; i = i + 1) {
        h.add(a.data[i]);
    }
    c.integer("hist_total", cast<long>(h.total));
    c.ok("hist_mode_center", (h.mode() >= 4) && (h.mode() <= 7));
    h.destroy();
    # Welford merge equals the batch result.
    local w1: Welford = Welford.new();
    local w2: Welford = Welford.new();
    loop (local i: int = 0; i < 250; i = i + 1) {
        w1.add(a.data[i]);
    }
    loop (local i: int = 250; i < 500; i = i + 1) {
        w2.add(a.data[i]);
    }
    w1.merge(&w2);
    c.near("welford_merge", w1.variance(), Stats.variance(a.data, a.len), 0.000000001);
    local equity: float[6] = [100.0, 110.0, 99.0, 120.0, 90.0, 130.0];
    c.near("max_drawdown", Stats.maxDrawdown(&equity[0], 6), 0.25, 0.0000001);
    c.value("acf1", Stats.autocorrelation(a.data, a.len, 1), 6);
    c.value("hurst", Stats.hurst(a.data, a.len), 4);
    a.destroy();
    b.destroy();
}

frame testSort(c: *Check) {
    c.begin("sort");
    local rng: Xoshiro = Xoshiro.new(cast<u64>(5));
    local n: int = 5000;
    local v: FVec = FVec.new(n);
    loop (local i: int = 0; i < n; i = i + 1) {
        v.push(rng.uniform(-100.0, 100.0));
    }
    local copy: FVec = v.copy();
    Sort.floats(v.data, v.len);
    c.ok("introsort_sorted", Sort.isSorted(v.data, v.len));
    c.near("sum_preserved", v.sum(), copy.sum(), 0.000000001);
    local k: float = Sort.select(copy.data, copy.len, 2500);
    c.near("select_matches", k, v.data[2500], 0.0);
    local idx: *int = cast<*int>(malloc(cast<long>(n) * sizeof(int)));
    local keys: FVec = FVec.new(n);
    loop (local i: int = 0; i < n; i = i + 1) {
        keys.push(cast<float>(rng.range(0, 50)));
    }
    Sort.argsort(keys.data, idx, n);
    local ordered: bool = true;
    local stable: bool = true;
    loop (local i: int = 1; i < n; i = i + 1) {
        if (keys.data[idx[i]] < keys.data[idx[i - 1]]) {
            ordered = false;
        }
        if ((keys.data[idx[i]] == keys.data[idx[i - 1]]) && (idx[i] < idx[i - 1])) {
            stable = false;
        }
    }
    c.ok("argsort_ordered", ordered);
    c.ok("argsort_stable", stable);
    free(cast<*void>(idx));
    # Many duplicates and already-sorted input exercise the pivot logic.
    local dup: FVec = FVec.new(n);
    loop (local i: int = 0; i < n; i = i + 1) {
        dup.push(cast<float>(i % 3));
    }
    Sort.floats(dup.data, dup.len);
    c.ok("duplicates_sorted", Sort.isSorted(dup.data, dup.len));
    Sort.floats(dup.data, dup.len);
    c.ok("presorted_sorted", Sort.isSorted(dup.data, dup.len));
    c.equalInt("lower_bound", cast<long>(Sort.lowerBound(dup.data, dup.len, 1.0)), 1667);
    c.equalInt("upper_bound", cast<long>(Sort.upperBound(dup.data, dup.len, 1.0)), 3334);
    local longs: long[7] = [5, 3, 9, 1, 1, 8, 2];
    Sort.longs(&longs[0], 7);
    c.ok("longs_sorted", (longs[0] == 1) && (longs[1] == 1) && (longs[6] == 9));
    v.destroy();
    copy.destroy();
    keys.destroy();
    dup.destroy();
}

frame testMatrix(c: *Check) {
    c.begin("matrix");
    local vals: float[9] = [4.0, 12.0, -16.0, 12.0, 37.0, -43.0, -16.0, -43.0, 98.0];
    local a: Matrix = Matrix.fromRaw(3, 3, &vals[0]);
    local l: Matrix;
    c.ok("cholesky_ok", a.cholesky(&l));
    c.near("chol_00", l.at(0, 0), 2.0, 0.0000000001);
    c.near("chol_20", l.at(2, 0), -8.0, 0.0000000001);
    c.near("chol_22", l.at(2, 2), 3.0, 0.0000000001);
    local lt: Matrix = l.transpose();
    local back: Matrix = l.mul(&lt);
    c.near("chol_reconstruct", back.maxAbsDiff(&a), 0.0, 0.000000001);
    c.near("det", a.determinant(), 36.0, 0.00000001);
    local inv: Matrix;
    c.ok("inverse_ok", a.inverse(&inv));
    local prod: Matrix = a.mul(&inv);
    local eye: Matrix = Matrix.identity(3);
    c.near("inverse_identity", prod.maxAbsDiff(&eye), 0.0, 0.0000001);
    local e: EigenResult = a.eigenSymmetric();
    c.value("eig0", e.values[0], 6);
    c.value("eig1", e.values[1], 6);
    c.value("eig2", e.values[2], 6);
    c.near("eig_trace", e.values[0] + e.values[1] + e.values[2], a.trace(), 0.00000001);
    c.near("power_iteration", a.powerIteration(300), e.values[0], 0.000001);
    local b: float[3] = [1.0, 2.0, 3.0];
    local x: float[3] = [0.0, 0.0, 0.0];
    c.ok("solve_ok", a.solve(&b[0], &x[0]));
    local check: float[3] = [0.0, 0.0, 0.0];
    a.mulVec(&x[0], &check[0]);
    c.near("solve_residual", Math.abs(check[0] - 1.0) + Math.abs(check[1] - 2.0) + Math.abs(check[2] - 3.0), 0.0, 0.00000001);
    # QR least squares recovers an exact line.
    local design: Matrix = Matrix.new(6, 2);
    local y: float[6] = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    loop (local i: int = 0; i < 6; i = i + 1) {
        design.put(i, 0, 1.0);
        design.put(i, 1, cast<float>(i));
        y[i] = 3.0 + (0.5 * cast<float>(i));
    }
    local beta: float[2] = [0.0, 0.0];
    c.ok("lstsq_ok", design.leastSquares(&y[0], &beta[0]));
    c.near("lstsq_b0", beta[0], 3.0, 0.000000001);
    c.near("lstsq_b1", beta[1], 0.5, 0.000000001);
    local q: QRResult = design.qr();
    local qr: Matrix = q.q.mul(&q.r);
    c.near("qr_reconstruct", qr.maxAbsDiff(&design), 0.0, 0.000000001);
    # Singular matrix is detected.
    local sing_vals: float[4] = [1.0, 2.0, 2.0, 4.0];
    local sing: Matrix = Matrix.fromRaw(2, 2, &sing_vals[0]);
    local sinv: Matrix;
    c.ok("singular_detected", !sing.inverse(&sinv));
    # Blocked multiply agrees with the naive one.
    local rng: Xoshiro = Xoshiro.new(cast<u64>(11));
    local big: Matrix = Matrix.new(40, 40);
    loop (local i: int = 0; i < 1600; i = i + 1) {
        big.data[i] = rng.uniform(-1.0, 1.0);
    }
    local p1: Matrix = big.mul(&big);
    local p2: Matrix = big.mulBlocked(&big, 16);
    c.near("blocked_mul", p1.maxAbsDiff(&p2), 0.0, 0.000000001);
    # Repairing an indefinite matrix makes it positive definite.
    local bad_vals: float[9] = [1.0, 0.9, 0.9, 0.9, 1.0, -0.9, 0.9, -0.9, 1.0];
    local bad: Matrix = Matrix.fromRaw(3, 3, &bad_vals[0]);
    local bl: Matrix;
    c.ok("indefinite_rejected", !bad.cholesky(&bl));
    local fixed: Matrix = bad.nearestPositiveDefinite(0.0001);
    local fl: Matrix;
    c.ok("repaired_pd", fixed.cholesky(&fl));
    a.destroy();
    l.destroy();
    lt.destroy();
    back.destroy();
    inv.destroy();
    prod.destroy();
    eye.destroy();
    e.destroy();
    design.destroy();
    q.destroy();
    qr.destroy();
    sing.destroy();
    big.destroy();
    p1.destroy();
    p2.destroy();
    bad.destroy();
    bl.destroy();
    fixed.destroy();
    fl.destroy();
}

frame testOptimize(c: *Check) {
    c.begin("optimize");
    local f: Lambda<float>(float) = |x: float| ret float {
        return (x * x * x) - (2.0 * x) - 5.0;
    };
    local df: Lambda<float>(float) = |x: float| ret float {
        return (3.0 * x * x) - 2.0;
    };
    local root: float = 2.0945514815423265;
    local r1: RootResult = Optimize.bisect(f, 2.0, 3.0, 0.000000000001, 200);
    c.near("bisect", r1.x, root, 0.00000000001);
    local r2: RootResult = Optimize.brent(f, 2.0, 3.0, 0.000000000001, 200);
    c.near("brent", r2.x, root, 0.00000000001);
    c.ok("brent_faster", r2.iterations < r1.iterations);
    local r3: RootResult = Optimize.newton(f, df, 2.0, 0.000000000001, 50);
    c.near("newton", r3.x, root, 0.00000000001);
    local parabola: Lambda<float>(float) = |x: float| ret float {
        return ((x - 1.5) * (x - 1.5)) + 2.0;
    };
    local g: RootResult = Optimize.goldenSection(parabola, -10.0, 10.0, 0.00000001);
    c.near("golden", g.x, 1.5, 0.000001);
    local rosen: Lambda<float>(*float) = |p: *float| ret float {
        local a: float = 1.0 - p[0];
        local b: float = p[1] - (p[0] * p[0]);
        return (a * a) + (100.0 * b * b);
    };
    local start: float[2] = [-1.2, 1.0];
    local nm: MinResult = Optimize.nelderMead(rosen, &start[0], 2, 0.5, 0.000000000001, 5000);
    c.near("nelder_mead_x", nm.x[0], 1.0, 0.001);
    c.near("nelder_mead_y", nm.x[1], 1.0, 0.002);
    nm.destroy();
    local sinf: Lambda<float>(float) = |x: float| ret float {
        return Math.sin(x);
    };
    c.near("simpson", Optimize.simpson(sinf, 0.0, 3.14159265358979323846, 200), 2.0, 0.0000001);
    c.near("gauss_legendre", Optimize.gaussLegendre(sinf, 0.0, 3.14159265358979323846), 2.0, 0.0000000001);
}

frame runMathTests(c: *Check) {
    testPrng(c);
    testSpecial(c);
    testStats(c);
    testSort(c);
    testMatrix(c);
    testOptimize(c);
}
