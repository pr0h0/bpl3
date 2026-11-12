# Self-tests for curves and fixed-income instruments.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [DiscountCurve], [Interp], [CurveInstrument], [InstrumentKind], [NelsonSiegel], [Bootstrap] from "../rates/curve.bpl";
import [Bond], [BondMetrics], [Swap], [SwapMetrics], [CapFloor], [ShortRate], [DayCount] from "../rates/instruments.bpl";
import [RootResult] from "../math/optimize.bpl";

export runRatesTests;

frame sampleCurve(interp: Interp) ret DiscountCurve {
    local mats: float[10] = [0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0, 20.0, 30.0];
    local rates: float[10] = [0.030, 0.032, 0.034, 0.036, 0.037, 0.039, 0.040, 0.041, 0.042, 0.0415];
    local insts: CurveInstrument[10];
    loop (local i: int = 0; i < 10; i = i + 1) {
        insts[i] = CurveInstrument { kind: mats[i] <= 1.0 ? InstrumentKind.Deposit : InstrumentKind.Swap, start: 0.0, maturity: mats[i], rate: rates[i], frequency: 1 };
    }
    local err: string = nullptr;
    return Bootstrap.build(&insts[0], 10, interp, &err);
}

frame testDayCounts(c: *Check) {
    c.begin("day_counts");
    c.equalInt("epoch", DayCount.serial(1970, 1, 1), 0);
    c.equalInt("leap_feb", DayCount.serial(2024, 3, 1) - DayCount.serial(2024, 2, 1), 29);
    c.equalInt("year_2000", DayCount.serial(2000, 1, 1), 10957);
    c.equalInt("today_weekday", cast<long>(DayCount.weekday(DayCount.serial(2026, 11, 10))), 1);
    c.ok("leap_rules", DayCount.isLeap(2000) && !DayCount.isLeap(1900) && DayCount.isLeap(2024));
    c.near("act360", DayCount.act360(0, 180), 0.5, 0.0);
    c.near("thirty360", DayCount.thirty360(2026, 1, 31, 2026, 7, 31), 0.5, 0.0);
    local sat: long = DayCount.serial(2026, 11, 14);
    c.equalInt("modified_following", DayCount.modifiedFollowing(sat) - sat, 2);
}

frame testCurves(c: *Check) {
    c.begin("curves");
    local curve: DiscountCurve = sampleCurve(Interp.LogLinearDiscount);
    c.equalInt("pillars", cast<long>(curve.n), 10);
    c.near("deposit_repriced", ((1.0 / curve.discount(0.5)) - 1.0) / 0.5, 0.032, 0.000000001);
    local mats: float[6] = [2.0, 3.0, 5.0, 7.0, 10.0, 30.0];
    local rates: float[6] = [0.036, 0.037, 0.039, 0.040, 0.041, 0.0415];
    loop (local i: int = 0; i < 6; i = i + 1) {
        c.near("swap_repriced", curve.parRate(mats[i], 1), rates[i], 0.0000000001);
    }
    c.value("zero_10y", curve.zero(10.0), 8);
    c.value("forward_5y_6y", curve.forward(5.0, 6.0), 8);
    c.ok("discount_monotone", (curve.discount(1.0) > curve.discount(2.0)) && (curve.discount(20.0) > curve.discount(30.0)));
    local lin: DiscountCurve = sampleCurve(Interp.LinearZero);
    local cub: DiscountCurve = sampleCurve(Interp.CubicSpline);
    c.near("linear_reprices_swaps", lin.parRate(7.0, 1), 0.040, 0.0000000001);
    c.near("cubic_reprices_swaps", cub.parRate(7.0, 1), 0.040, 0.0000000001);
    c.value("linear_zero_4y", lin.zero(4.0), 8);
    c.value("cubic_zero_4y", cub.zero(4.0), 8);
    local up: DiscountCurve = curve.shifted(0.0001);
    c.near("parallel_shift", up.zero(7.0) - curve.zero(7.0), 0.0001, 0.0000000001);
    local ns: NelsonSiegel = NelsonSiegel.fit(curve.times, curve.zeros, curve.n);
    c.ok("nss_fit_close", ns.rmse < 0.0005);
    c.near("nss_long_end", ns.zero(30.0), curve.zero(30.0), 0.001);
    local flat: DiscountCurve = DiscountCurve.flat(0.05);
    c.near("flat_discount", flat.discount(2.0), Math.exp(-0.1), 0.0000000001);
    curve.destroy();
    lin.destroy();
    cub.destroy();
    up.destroy();
    flat.destroy();
}

frame testBonds(c: *Check) {
    c.begin("bonds");
    local b: Bond = Bond.new(100.0, 0.05, 10.0, 2);
    local m: BondMetrics = b.metrics(0.05);
    c.near("par_bond", m.price, 100.0, 0.0000001);
    c.near("macaulay", m.macaulay, 7.989445671393992, 0.000000001);
    c.near("modified", m.modified, 7.794581142823407, 0.000000001);
    c.value("convexity", m.convexity, 6);
    c.value("dv01", m.dv01, 8);
    local r: RootResult = b.yieldFromPrice(95.0);
    c.ok("yield_solved", r.converged);
    c.near("yield_roundtrip", b.priceFromYield(r.x), 95.0, 0.0000001);
    c.value("yield_at_95", r.x, 8);
    local est: float = Bond.priceChange(&m, 0.01);
    local exact: float = b.priceFromYield(0.06) - m.price;
    c.ok("convexity_estimate_close", Math.abs(est - exact) < 0.05);
    local zero_coupon: Bond = Bond.new(100.0, 0.0, 5.0, 1);
    local zm: BondMetrics = zero_coupon.metrics(0.04);
    c.near("zero_coupon_duration", zm.macaulay, 5.0, 0.0000001);
    c.near("zero_coupon_price", zm.price, 100.0 / Math.pow(1.04, 5.0), 0.0000001);
    local flat: DiscountCurve = DiscountCurve.flat(0.04);
    local zs: float = b.zSpread(&flat, 98.0);
    c.near("z_spread_roundtrip", b.priceFromCurve(&flat, zs), 98.0, 0.0000001);
    flat.destroy();
}

frame testSwapsAndOptions(c: *Check) {
    c.begin("swaps");
    local curve: DiscountCurve = sampleCurve(Interp.LogLinearDiscount);
    local par: float = curve.parRate(5.0, 1);
    local s: Swap = Swap { notional: 1000000.0, fixed_rate: par, maturity: 5.0, frequency: 1, pay_fixed: true };
    local m: SwapMetrics = s.value(&curve);
    c.near("par_swap_zero_npv", m.npv, 0.0, 0.000001);
    c.value("pv01", m.pv01, 6);
    local off: Swap = s;
    off.fixed_rate = par - 0.001;
    local mo: SwapMetrics = off.value(&curve);
    c.near("npv_vs_pv01", mo.npv, 10.0 * m.pv01, 0.000001);
    local deltas: *float = cast<*float>(malloc(cast<long>(curve.n) * sizeof(float)));
    off.keyRateDeltas(&curve, deltas);
    local total: float = 0.0;
    loop (local i: int = 0; i < curve.n; i = i + 1) {
        total = total + deltas[i];
    }
    c.ok("key_rates_concentrated", Math.abs(deltas[5]) > Math.abs(deltas[8]));
    c.value("key_rate_total", total, 4);
    free(cast<*void>(deltas));
    local cap: float = CapFloor.price(&curve, 5.0, 4, 0.04, 0.25, true, 1000000.0);
    local floor: float = CapFloor.price(&curve, 5.0, 4, 0.04, 0.25, false, 1000000.0);
    local swap_value: float = 0.0;
    local t: float = 0.25;
    loop (t <= 5.0000001) {
        swap_value = swap_value + (1000000.0 * 0.25 * curve.discount(t) * (curve.simpleForward(t - 0.25, t) - 0.04));
        t = t + 0.25;
    }
    c.near("cap_floor_parity", cap - floor, swap_value, 0.0000001);
    c.value("cap_5y", cap, 4);
    local payer: float = CapFloor.swaption(&curve, 1.0, 5.0, 1, 0.04, 0.2, true, 1000000.0);
    local receiver: float = CapFloor.swaption(&curve, 1.0, 5.0, 1, 0.04, 0.2, false, 1000000.0);
    local annuity: float = curve.annuity(1.0, 6.0, 1);
    local fwd: float = (curve.discount(1.0) - curve.discount(6.0)) / annuity;
    c.near("swaption_parity", payer - receiver, 1000000.0 * annuity * (fwd - 0.04), 0.0000001);
    c.value("payer_1y5y", payer, 4);
    curve.destroy();
}

frame testShortRate(c: *Check) {
    c.begin("short_rate");
    local p: float = ShortRate.vasicekBond(0.04, 0.3, 0.05, 0.01, 0.0001);
    c.near("vasicek_short_end", ShortRate.zeroRate(p, 0.0001), 0.04, 0.00001);
    local long_zero: float = ShortRate.zeroRate(ShortRate.vasicekBond(0.04, 0.3, 0.05, 0.01, 200.0), 200.0);
    c.near("vasicek_long_end", long_zero, 0.05 - ((0.01 * 0.01) / (2.0 * 0.09)), 0.001);
    c.value("vasicek_5y", ShortRate.vasicekBond(0.04, 0.3, 0.05, 0.01, 5.0), 8);
    c.value("cir_5y", ShortRate.cirBond(0.04, 0.3, 0.05, 0.05, 5.0), 8);
    c.near("cir_short_end", ShortRate.zeroRate(ShortRate.cirBond(0.04, 0.3, 0.05, 0.05, 0.0001), 0.0001), 0.04, 0.00001);
    local curve: DiscountCurve = sampleCurve(Interp.LogLinearDiscount);
    local bond: float = 0.0;
    local tree: float = ShortRate.hullWhiteTree(&curve, 0.1, 0.01, 5.0, 250, 1.0, 0.85, &bond);
    c.near("hw_tree_fits_curve", bond, curve.discount(5.0), 0.00001);
    local closed: float = ShortRate.hullWhiteBondOption(&curve, 0.1, 0.01, 1.0, 5.0, 0.85);
    c.near("hw_tree_vs_jamshidian", tree, closed, 0.0005);
    c.value("hw_option", closed, 8);
    curve.destroy();
}

frame runRatesTests(c: *Check) {
    testDayCounts(c);
    testCurves(c);
    testBonds(c);
    testSwapsAndOptions(c);
    testShortRate(c);
}
