# Self-tests for option pricing: closed forms, trees, PDE and Monte Carlo.

import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [OptionSpec], [OptionKind], [BlackScholes], [Greeks] from "../quant/black_scholes.bpl";
import [ImpliedVol], [IvResult] from "../quant/implied_vol.bpl";
import [Lattice], [TreeResult] from "../quant/lattice.bpl";
import [MonteCarlo], [McResult], [BarrierKind], [HestonParams] from "../quant/monte_carlo.bpl";
import [Matrix] from "../math/matrix.bpl";

export runPricingTests;

frame testBlackScholes(c: *Check) {
    c.begin("black_scholes");
    local call: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    local put: OptionSpec = OptionSpec.new(OptionKind.Put, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    c.near("call", BlackScholes.price(&call), 10.450583572185565, 0.000000001);
    c.near("put", BlackScholes.price(&put), 5.573526022256971, 0.000000001);
    c.near("parity", BlackScholes.parityResidual(&call), 0.0, 0.000000001);
    local g: Greeks = BlackScholes.greeks(&call);
    c.value("delta", g.delta, 6);
    c.value("gamma", g.gamma, 6);
    c.value("vega", g.vega, 6);
    c.value("theta", g.theta, 6);
    c.value("rho", g.rho, 6);
    c.value("vanna", g.vanna, 6);
    c.value("volga", g.volga, 6);
    c.near("delta_fd", g.delta, BlackScholes.numericDelta(&call, 0.0001), 0.000001);
    c.near("gamma_fd", g.gamma, BlackScholes.numericGamma(&call, 0.001), 0.00001);
    c.near("vega_fd", g.vega, BlackScholes.numericVega(&call, 0.0001), 0.000001);
    local gp: Greeks = BlackScholes.greeks(&put);
    c.near("put_delta", gp.delta, g.delta - 1.0, 0.0000000001);
    c.near("put_gamma", gp.gamma, g.gamma, 0.0000000001);
    # Dividend-paying and deep in/out of the money cases.
    local div: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 95.0, 0.03, 0.02, 0.25, 0.5);
    c.value("dividend_call", BlackScholes.price(&div), 6);
    c.near("dividend_parity", BlackScholes.parityResidual(&div), 0.0, 0.000000001);
    local deep: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 10.0, 0.05, 0.0, 0.2, 1.0);
    c.near("deep_itm", BlackScholes.price(&deep), 100.0 - (10.0 * Math.exp(-0.05)), 0.0000001);
    local far: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 1000.0, 0.05, 0.0, 0.2, 1.0);
    c.ok("deep_otm", BlackScholes.price(&far) < 0.0000001);
    c.value("black76", BlackScholes.black76(true, 100.0, 100.0, 0.05, 0.2, 1.0), 6);
    c.value("digital", BlackScholes.digital(&call, 1.0), 6);
    c.near("digital_sum", BlackScholes.digital(&call, 1.0) + BlackScholes.digital(&put, 1.0), Math.exp(-0.05), 0.0000000001);
    c.near("asset_or_nothing", BlackScholes.assetOrNothing(&call) - (100.0 * BlackScholes.digital(&call, 1.0)), BlackScholes.price(&call), 0.000000001);
    c.value("margrabe", BlackScholes.margrabe(100.0, 95.0, 0.0, 0.0, 0.2, 0.3, 0.5, 1.0), 6);
    c.value("kirk", BlackScholes.kirkSpread(110.0, 100.0, 5.0, 0.3, 0.25, 0.6, 0.05, 0.5), 6);
    local bad: OptionSpec = OptionSpec.new(OptionKind.Call, -1.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    c.ok("validate_rejects", bad.validate() != nullptr);
    c.ok("validate_accepts", call.validate() == nullptr);
}

frame testImpliedVol(c: *Check) {
    c.begin("implied_vol");
    local call: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    loop (local i: int = 0; i < 9; i = i + 1) {
        local vol: float = 0.05 + (0.1 * cast<float>(i));
        loop (local k: int = 0; k < 5; k = k + 1) {
            local sp: OptionSpec = call.withVol(vol);
            sp.strike = 70.0 + (15.0 * cast<float>(k));
            sp.kind = (k % 2) == 0 ? OptionKind.Call : OptionKind.Put;
            local price: float = BlackScholes.price(&sp);
            local r: IvResult = ImpliedVol.solve(&sp, price);
            local lo: float = 0.0;
            local hi: float = 0.0;
            ImpliedVol.bounds(&sp, &lo, &hi);
            # Skip prices with no time value: volatility is not identifiable there.
            if (price > (lo + 0.0001)) {
                c.ok("solved", r.ok);
                c.near("roundtrip", r.vol, vol, 0.000001);
            }
        }
    }
    local r: IvResult = ImpliedVol.solve(&call, 12.0);
    c.value("iv_12", r.vol, 8);
    local impossible: IvResult = ImpliedVol.solve(&call, 150.0);
    c.ok("rejects_above_bound", !impossible.ok);
    local below: IvResult = ImpliedVol.solve(&call, 0.0);
    c.ok("rejects_zero", !below.ok);
    local b: IvResult = ImpliedVol.solveBisect(&call, 12.0);
    c.near("brent_agrees", b.vol, r.vol, 0.0000001);
    local strikes: float[5] = [80.0, 90.0, 100.0, 110.0, 120.0];
    local prices: float[5] = [0.0, 0.0, 0.0, 0.0, 0.0];
    loop (local i: int = 0; i < 5; i = i + 1) {
        local sp: OptionSpec = call;
        sp.strike = strikes[i];
        sp.vol = 0.2 + ((0.001 * (strikes[i] - 100.0) * (strikes[i] - 100.0)) / 10.0);
        prices[i] = BlackScholes.price(&sp);
    }
    local vols: float[5] = [0.0, 0.0, 0.0, 0.0, 0.0];
    c.equalInt("smile_solved", cast<long>(ImpliedVol.smile(&call, &strikes[0], &prices[0], 5, &vols[0])), 5);
    c.near("smile_wing", vols[0], 0.24, 0.000001);
    c.near("smile_atm", vols[2], 0.2, 0.000001);
}

frame testLattice(c: *Check) {
    c.begin("lattice");
    local call: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    local put: OptionSpec = OptionSpec.new(OptionKind.Put, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    local euro: TreeResult = Lattice.crr(&call, 1000, false);
    c.near("crr_converges", euro.price, BlackScholes.price(&call), 0.002);
    local am_call: TreeResult = Lattice.crr(&call, 500, true);
    c.near("american_call_no_div", am_call.price, Lattice.crr(&call, 500, false).price, 0.0000001);
    local am_put: TreeResult = Lattice.crr(&put, 500, true);
    c.value("american_put_crr", am_put.price, 6);
    c.ok("early_exercise_premium", am_put.price > BlackScholes.price(&put));
    c.value("american_put_delta", am_put.delta, 6);
    c.value("american_put_gamma", am_put.gamma, 6);
    local lr: TreeResult = Lattice.leisenReimer(&call, 101, false);
    c.near("leisen_reimer", lr.price, BlackScholes.price(&call), 0.0001);
    local lr_put: TreeResult = Lattice.leisenReimer(&put, 201, true);
    c.near("lr_american_put", lr_put.price, am_put.price, 0.005);
    local tri: TreeResult = Lattice.trinomial(&put, 300, true);
    c.near("trinomial_american", tri.price, am_put.price, 0.005);
    local tri_euro: TreeResult = Lattice.trinomial(&call, 300, false);
    c.near("trinomial_euro", tri_euro.price, BlackScholes.price(&call), 0.01);
    local cn: float = Lattice.crankNicolson(&put, 200, 200, true);
    c.near("crank_nicolson_american", cn, am_put.price, 0.01);
    local cn_euro: float = Lattice.crankNicolson(&call, 200, 200, false);
    c.near("crank_nicolson_euro", cn_euro, BlackScholes.price(&call), 0.01);
    local baw: float = Lattice.baroneAdesiWhaley(&put, BlackScholes.price(&put));
    c.near("baw_american_put", baw, am_put.price, 0.02);
    local div_call: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 100.0, 0.05, 0.08, 0.2, 1.0);
    local div_am: TreeResult = Lattice.crr(&div_call, 500, true);
    c.ok("dividend_call_early_exercise", div_am.early_exercise_nodes > 0);
    c.value("dividend_american_call", div_am.price, 6);
}

frame testMonteCarlo(c: *Check) {
    c.begin("monte_carlo");
    local call: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    local put: OptionSpec = OptionSpec.new(OptionKind.Put, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    local exact: float = BlackScholes.price(&call);
    local m: McResult = MonteCarlo.european(&call, 100000, cast<u64>(1));
    c.value("european", m.price, 6);
    c.value("european_se", m.stderr, 6);
    c.ok("european_within_4se", Math.abs(m.price - exact) < (4.0 * m.stderr));
    local cv: McResult = MonteCarlo.europeanControl(&call, 100000, cast<u64>(1));
    c.value("control", cv.price, 6);
    c.ok("control_within_4se", Math.abs(cv.price - exact) < (4.0 * cv.stderr));
    c.ok("control_reduces_variance", cv.stderr < (0.7 * m.stderr * 1.41421356));
    local asian: McResult = MonteCarlo.asian(&call, 12, 10000, cast<u64>(2));
    local geo: float = MonteCarlo.geometricAsianPrice(&call, 12);
    c.value("asian", asian.price, 6);
    c.value("geometric_asian", geo, 6);
    c.ok("asian_above_geometric", asian.price > geo);
    local uo: McResult = MonteCarlo.barrier(&call, BarrierKind.UpAndOut, 130.0, 0.0, 50, 10000, cast<u64>(3));
    local ui: McResult = MonteCarlo.barrier(&call, BarrierKind.UpAndIn, 130.0, 0.0, 50, 10000, cast<u64>(3));
    c.value("up_and_out", uo.price, 6);
    c.ok("in_out_parity", Math.abs((uo.price + ui.price) - exact) < ((4.0 * (uo.stderr + ui.stderr)) + 0.3));
    local lb: McResult = MonteCarlo.lookback(&call, 50, 5000, cast<u64>(4));
    c.value("lookback", lb.price, 6);
    c.ok("lookback_above_vanilla", lb.price > exact);
    local lsm: McResult = MonteCarlo.longstaffSchwartz(&put, 50, 10000, cast<u64>(5));
    c.value("longstaff_schwartz", lsm.price, 6);
    c.ok("lsm_near_tree", Math.abs(lsm.price - 6.0888) < 0.25);
    local h: HestonParams = HestonParams { v0: 0.04, kappa: 2.0, theta: 0.04, xi: 0.3, rho: -0.7 };
    local hm: McResult = MonteCarlo.heston(&call, &h, 50, 10000, cast<u64>(6));
    c.value("heston", hm.price, 6);
    c.ok("heston_near_bs", Math.abs(hm.price - exact) < 0.6);
    local series: float = MonteCarlo.mertonSeries(&call, 0.5, -0.1, 0.15, 40);
    local mj: McResult = MonteCarlo.mertonJump(&call, 0.5, -0.1, 0.15, 100000, cast<u64>(7));
    c.value("merton_series", series, 6);
    c.ok("merton_mc_matches", Math.abs(mj.price - series) < (4.0 * mj.stderr));
    local corr_vals: float[9] = [1.0, 0.5, 0.3, 0.5, 1.0, 0.4, 0.3, 0.4, 1.0];
    local corr: Matrix = Matrix.fromRaw(3, 3, &corr_vals[0]);
    local spots: float[3] = [100.0, 50.0, 25.0];
    local vols: float[3] = [0.2, 0.3, 0.25];
    local weights: float[3] = [0.5, 1.0, 2.0];
    local basket: McResult = MonteCarlo.basket(true, &spots[0], &vols[0], &weights[0], &corr, 150.0, 0.05, 1.0, 20000, cast<u64>(8));
    c.value("basket", basket.price, 6);
    corr.destroy();
}

frame runPricingTests(c: *Check) {
    testBlackScholes(c);
    testImpliedVol(c);
    testLattice(c);
    testMonteCarlo(c);
}
