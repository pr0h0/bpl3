# Self-tests for complex arithmetic, FFT, Fourier pricing and smile models.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [Cx], [Fft], [CharFn], [FourierPricer], [HestonModel], [VarianceGamma] from "../quant/fourier.bpl";
import [Sabr], [Svi], [VolSurface] from "../quant/volsurface.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "../quant/black_scholes.bpl";
import [MonteCarlo], [McResult], [HestonParams] from "../quant/monte_carlo.bpl";
import [ImpliedVol], [IvResult] from "../quant/implied_vol.bpl";

export runSurfaceTests;

frame testComplex(c: *Check) {
    c.begin("complex");
    local a: Cx = Cx.of(3.0, 4.0);
    local b: Cx = Cx.of(1.0, -2.0);
    c.near("abs", Cx.abs(a), 5.0, 0.0);
    local p: Cx = Cx.mul(a, b);
    c.ok("mul", (p.re == 11.0) && (p.im == -2.0));
    local q: Cx = Cx.div(p, b);
    c.near("div_re", q.re, 3.0, 0.000000000001);
    c.near("div_im", q.im, 4.0, 0.000000000001);
    local e: Cx = Cx.exp(Cx.of(0.0, 3.14159265358979323846));
    c.near("euler", e.re, -1.0, 0.000000000001);
    local l: Cx = Cx.log(Cx.exp(Cx.of(0.5, 1.0)));
    c.near("log_exp", l.im, 1.0, 0.000000000001);
    local r: Cx = Cx.sqrt(Cx.of(-4.0, 0.0));
    c.near("sqrt_negative", r.im, 2.0, 0.000000000001);
    local s: Cx = Cx.sqrt(Cx.of(3.0, -4.0));
    local back: Cx = Cx.mul(s, s);
    c.near("sqrt_roundtrip", back.im, -4.0, 0.000000000001);
}

frame testFft(c: *Check) {
    c.begin("fft");
    local n: int = 64;
    local rng: Xoshiro = Xoshiro.new(cast<u64>(8));
    local re: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local im: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local re0: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local im0: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local nr: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local ni: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 0; i < n; i = i + 1) {
        re[i] = rng.normal();
        im[i] = rng.normal();
        re0[i] = re[i];
        im0[i] = im[i];
    }
    Fft.naive(re0, im0, n, nr, ni);
    Fft.transform(re, im, n, false);
    local worst: float = 0.0;
    loop (local i: int = 0; i < n; i = i + 1) {
        worst = Math.max(worst, Math.abs(re[i] - nr[i]) + Math.abs(im[i] - ni[i]));
    }
    c.ok("matches_dft", worst < 0.000000001);
    Fft.transform(re, im, n, true);
    local round: float = 0.0;
    loop (local i: int = 0; i < n; i = i + 1) {
        round = Math.max(round, Math.abs(re[i] - re0[i]) + Math.abs(im[i] - im0[i]));
    }
    c.ok("inverse_roundtrip", round < 0.000000000001);
    # Parseval: sum |x|^2 = sum |X|^2 / n.
    Fft.transform(re, im, n, false);
    local e_time: float = 0.0;
    local e_freq: float = 0.0;
    loop (local i: int = 0; i < n; i = i + 1) {
        e_time = e_time + (re0[i] * re0[i]) + (im0[i] * im0[i]);
        e_freq = e_freq + (re[i] * re[i]) + (im[i] * im[i]);
    }
    c.near("parseval", e_freq / cast<float>(n), e_time, 0.000000001);
    c.ok("power_of_two", Fft.isPowerOfTwo(1024) && !Fft.isPowerOfTwo(1000));
    free(cast<*void>(re));
    free(cast<*void>(im));
    free(cast<*void>(re0));
    free(cast<*void>(im0));
    free(cast<*void>(nr));
    free(cast<*void>(ni));
}

frame testFourier(c: *Check) {
    c.begin("fourier");
    local call: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 100.0, 0.05, 0.01, 0.2, 1.0);
    local put: OptionSpec = OptionSpec.new(OptionKind.Put, 100.0, 110.0, 0.05, 0.01, 0.2, 1.0);
    local bs: CharFn = CharFn.BlackScholes(0.2);
    c.near("bs_char_call", FourierPricer.price(&bs, &call, 200.0, 100), BlackScholes.price(&call), 0.00000001);
    c.near("bs_char_put", FourierPricer.price(&bs, &put, 200.0, 100), BlackScholes.price(&put), 0.00000001);
    local h: HestonModel = HestonModel { v0: 0.04, kappa: 2.0, theta: 0.04, xi: 0.3, rho: -0.7 };
    local heston: CharFn = CharFn.Heston(h);
    local hc: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    local hp: float = FourierPricer.price(&heston, &hc, 200.0, 100);
    c.value("heston_atm", hp, 8);
    local mc_params: HestonParams = HestonParams { v0: 0.04, kappa: 2.0, theta: 0.04, xi: 0.3, rho: -0.7 };
    local mc: McResult = MonteCarlo.heston(&hc, &mc_params, 100, 20000, cast<u64>(21));
    c.ok("heston_mc_agrees", Math.abs(mc.price - hp) < ((4.0 * mc.stderr) + 0.05));
    # Negative correlation produces a downward-sloping smile.
    local low: OptionSpec = hc;
    low.strike = 80.0;
    local high: OptionSpec = hc;
    high.strike = 120.0;
    local iv_low: IvResult = ImpliedVol.solve(&low, FourierPricer.price(&heston, &low, 200.0, 100));
    local iv_high: IvResult = ImpliedVol.solve(&high, FourierPricer.price(&heston, &high, 200.0, 100));
    c.ok("heston_skew", iv_low.vol > iv_high.vol);
    c.value("heston_iv_80", iv_low.vol, 6);
    c.value("heston_iv_120", iv_high.vol, 6);
    # Carr-Madan FFT agrees with the direct integral.
    local n: int = 4096;
    local ks: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local ps: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    FourierPricer.carrMadan(&heston, 100.0, 0.05, 0.0, 1.0, 1.5, n, 0.25, ks, ps);
    local fft_price: float = FourierPricer.interpolate(ks, ps, n, 100.0);
    c.near("carr_madan_vs_integral", fft_price, hp, 0.01);
    FourierPricer.carrMadan(&bs, 100.0, 0.05, 0.01, 1.0, 1.5, n, 0.25, ks, ps);
    c.near("carr_madan_bs", FourierPricer.interpolate(ks, ps, n, 100.0), BlackScholes.price(&call), 0.01);
    free(cast<*void>(ks));
    free(cast<*void>(ps));
    local vg: CharFn = CharFn.VG(VarianceGamma { sigma: 0.2, nu: 0.2, theta: -0.1 });
    local vgp: float = FourierPricer.price(&vg, &hc, 200.0, 100);
    c.value("variance_gamma", vgp, 8);
    local vg_put: OptionSpec = hc;
    vg_put.kind = OptionKind.Put;
    local vgput: float = FourierPricer.price(&vg, &vg_put, 200.0, 100);
    c.near("vg_parity", vgp - vgput, 100.0 - (100.0 * Math.exp(-0.05)), 0.0000001);
}

frame testSabr(c: *Check) {
    c.begin("sabr");
    local model: Sabr = Sabr { alpha: 0.035, beta: 0.5, rho: -0.25, nu: 0.4, rmse: 0.0 };
    local fwd: float = 0.04;
    local t: float = 2.0;
    c.value("atm_vol", model.impliedVol(fwd, fwd, t), 8);
    c.near("atm_continuity", model.impliedVol(fwd, fwd * 1.000001, t), model.impliedVol(fwd, fwd, t), 0.000001);
    local strikes: float[9] = [0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.06, 0.07];
    local vols: float[9];
    loop (local i: int = 0; i < 9; i = i + 1) {
        vols[i] = model.impliedVol(fwd, strikes[i], t);
    }
    c.ok("skew_negative_rho", vols[0] > vols[4]);
    local fit: Sabr = Sabr.calibrate(fwd, t, 0.5, &strikes[0], &vols[0], 9);
    c.ok("calibration_rmse", fit.rmse < 0.00001);
    c.near("recovers_rho", fit.rho, -0.25, 0.01);
    c.near("recovers_nu", fit.nu, 0.4, 0.01);
    c.near("recovers_alpha", fit.alpha, 0.035, 0.0005);
}

frame testSvi(c: *Check) {
    c.begin("svi");
    local truth: Svi = Svi { a: 0.02, b: 0.1, rho: -0.4, m: 0.05, sigma: 0.15, rmse: 0.0 };
    local ks: float[11];
    local ws: float[11];
    loop (local i: int = 0; i < 11; i = i + 1) {
        ks[i] = -0.5 + (0.1 * cast<float>(i));
        ws[i] = truth.totalVariance(ks[i]);
    }
    local fit: Svi = Svi.calibrate(&ks[0], &ws[0], 11);
    c.ok("fit_rmse", fit.rmse < 0.0001);
    c.near("fit_at_atm", fit.totalVariance(0.0), truth.totalVariance(0.0), 0.0001);
    c.ok("truth_arbitrage_free", truth.arbitrageFree(-1.0, 1.0, 101));
    local bad: Svi = Svi { a: -0.05, b: 0.5, rho: -0.99, m: 0.0, sigma: 0.01, rmse: 0.0 };
    c.ok("detects_butterfly_arbitrage", !bad.arbitrageFree(-1.0, 1.0, 201));
    local surface: VolSurface = VolSurface.new(4, 100.0, 0.02, 0.0);
    surface.addSlice(0.5, Svi { a: 0.01, b: 0.08, rho: -0.4, m: 0.0, sigma: 0.15, rmse: 0.0 });
    surface.addSlice(1.0, Svi { a: 0.025, b: 0.1, rho: -0.4, m: 0.0, sigma: 0.2, rmse: 0.0 });
    surface.addSlice(2.0, Svi { a: 0.055, b: 0.12, rho: -0.35, m: 0.0, sigma: 0.25, rmse: 0.0 });
    c.ok("calendar_free", surface.calendarFree(-1.0, 1.0, 41));
    c.value("surface_vol_90_075", surface.impliedVol(90.0, 0.75), 8);
    c.value("local_vol_100_1", surface.localVol(100.0, 1.0), 8);
    c.ok("local_vol_positive", surface.localVol(95.0, 1.5) > 0.0);
    local call: float = surface.price(true, 100.0, 1.0);
    local put: float = surface.price(false, 100.0, 1.0);
    c.near("surface_parity", call - put, 100.0 - (100.0 * Math.exp(-0.02)), 0.0000001);
    surface.destroy();
}

frame runSurfaceTests(c: *Check) {
    testComplex(c);
    testFft(c);
    testFourier(c);
    testSabr(c);
    testSvi(c);
}
