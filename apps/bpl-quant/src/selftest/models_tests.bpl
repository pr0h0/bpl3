# Self-tests for pricing-model plug-ins, immunization, pairs trading and
# position sizing.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "../quant/black_scholes.bpl";
import [PricingModel], [BlackScholesModel], [BachelierModel], [BinomialModel], [JumpModel], [BarrierModel], [ModelRegistry], [BarrierKind] from "../quant/models.bpl";
import [DiscountCurve] from "../rates/curve.bpl";
import [Bond] from "../rates/instruments.bpl";
import [Immunizer], [CashFlows], [ImmunizedPortfolio] from "../rates/immunize.bpl";
import [PairsBacktest], [PairsConfig], [PairsResult], [Sizing] from "../backtest/pairs.bpl";

export runModelsTests;

frame testModels(c: *Check) {
    c.begin("pricing_models");
    local call: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    local bs: BlackScholesModel = BlackScholesModel { tag: 0 };
    local normal: BachelierModel = BachelierModel { tag: 0 };
    local euro: BinomialModel = BinomialModel { steps: 1000, american: false };
    local amer: BinomialModel = BinomialModel { steps: 1000, american: true };
    local jumps: JumpModel = JumpModel { intensity: 0.0, jump_mean: 0.0, jump_vol: 0.0 };
    local reg: ModelRegistry = ModelRegistry.create();
    reg.add(&bs);
    reg.add(&normal);
    reg.add(&euro);
    reg.add(&amer);
    reg.add(&jumps);
    c.equalInt("registered", cast<long>(reg.count), 5);
    loop (local i: int = 0; i < reg.count; i = i + 1) {
        local m: *PricingModel = reg.at(i);
        c.value(m.name(), m.price(&call), 6);
    }
    local found: *PricingModel = reg.find("crr_european");
    c.ok("find", found != nullptr);
    c.ok("missing", reg.find("nope") == nullptr);
    c.near("crr_converges", found.price(&call), 10.450583572, 0.002);
    c.near("no_jumps_is_bs", jumps.price(&call), BlackScholes.price(&call), 0.000000001);
    local put: OptionSpec = OptionSpec.new(OptionKind.Put, 100.0, 100.0, 0.05, 0.0, 0.2, 1.0);
    c.near("american_put", amer.price(&put), 6.0888, 0.002);
    c.ok("early_exercise_premium", amer.price(&put) > euro.price(&put));
    # Bachelier put-call parity and closeness to Black-Scholes at the money.
    local f: float = 100.0 * Math.exp(0.05);
    c.near("bachelier_parity", normal.price(&call) - normal.price(&put), Math.exp(-0.05) * (f - 100.0), 0.000000001);
    c.near("bachelier_near_bs", normal.price(&call), BlackScholes.price(&call), 0.06);
    # Jumps add value to out-of-the-money puts.
    local jumpy: JumpModel = JumpModel { intensity: 0.5, jump_mean: -0.1, jump_vol: 0.15 };
    local otm: OptionSpec = OptionSpec.new(OptionKind.Put, 100.0, 80.0, 0.05, 0.0, 0.2, 1.0);
    c.value("merton_otm_put", jumpy.price(&otm), 6);
    c.ok("jump_premium", jumpy.price(&otm) > BlackScholes.price(&otm));
    # Barriers: in + out = vanilla, far barriers vanish, Haug's table value.
    local kinds: BarrierKind[4] = [BarrierKind.DownOut, BarrierKind.DownIn, BarrierKind.UpOut, BarrierKind.UpIn];
    local levels: float[4] = [90.0, 90.0, 120.0, 120.0];
    loop (local k: int = 0; k < 4; k = k + 2) {
        local o: BarrierModel = BarrierModel { kind: kinds[k], barrier: levels[k], rebate: 0.0 };
        local inn: BarrierModel = BarrierModel { kind: kinds[k + 1], barrier: levels[k], rebate: 0.0 };
        c.near("call_in_out_parity", o.price(&call) + inn.price(&call), BlackScholes.price(&call), 0.0000001);
        c.near("put_in_out_parity", o.price(&put) + inn.price(&put), BlackScholes.price(&put), 0.0000001);
        c.value(o.name(), o.price(&call), 6);
    }
    local far: BarrierModel = BarrierModel { kind: BarrierKind.DownOut, barrier: 1.0, rebate: 0.0 };
    c.near("far_barrier", far.price(&call), BlackScholes.price(&call), 0.000001);
    # Haug (2007) table 4-13: S=100, K=90, H=95, T=0.5, r=0.08, q=0.04, vol=0.25, rebate 3: down-out call 9.0246.
    local haug: OptionSpec = OptionSpec.new(OptionKind.Call, 100.0, 90.0, 0.08, 0.04, 0.25, 0.5);
    local dao: BarrierModel = BarrierModel { kind: BarrierKind.DownOut, barrier: 95.0, rebate: 3.0 };
    c.near("haug_down_out_call", dao.price(&haug), 9.0246, 0.0005);
    local dai: BarrierModel = BarrierModel { kind: BarrierKind.DownIn, barrier: 95.0, rebate: 3.0 };
    c.near("haug_down_in_call", dai.price(&haug), 7.7627, 0.0005);
    local breached: BarrierModel = BarrierModel { kind: BarrierKind.UpOut, barrier: 95.0, rebate: 2.0 };
    c.near("knocked_out_rebate", breached.price(&call), 2.0, 0.0);
}

frame testImmunize(c: *Check) {
    c.begin("immunization");
    local curve: DiscountCurve = DiscountCurve.flat(0.04);
    local liabilities: CashFlows = CashFlows.empty();
    liabilities.add(5.0, 1000000.0);
    liabilities.add(7.0, 1500000.0);
    local bonds: Bond[4] = [Bond.new(100.0, 0.03, 2.0, 2), Bond.new(100.0, 0.04, 5.0, 2), Bond.new(100.0, 0.045, 10.0, 2), Bond.new(100.0, 0.05, 20.0, 2)];
    local imm: ImmunizedPortfolio = Immunizer.immunize(&curve, &liabilities, &bonds[0], 4);
    c.ok("found", imm.found);
    c.equalInt("short_leg", cast<long>(imm.bond_a), 1);
    c.equalInt("long_leg", cast<long>(imm.bond_b), 2);
    c.near("pv_matched", imm.asset_pv, imm.liability_pv, 0.000000001);
    c.near("duration_matched", imm.asset_duration, imm.liability_duration, 0.0000001);
    c.ok("redington", imm.redington);
    c.value("liability_duration", imm.liability_duration, 6);
    c.value("units_short", imm.units_a, 4);
    c.value("units_long", imm.units_b, 4);
    # Duration-matched with more convexity: surplus never falls for parallel shifts.
    c.ok("surplus_protected", (imm.surplus[0] >= -0.01) && (imm.surplus[1] >= -0.01) && (imm.surplus[2] >= -0.01) && (imm.surplus[3] >= -0.01));
    local pillars: float[4] = [2.0, 5.0, 10.0, 30.0];
    local kr: float[4];
    Immunizer.keyRates(&curve, &liabilities, &pillars[0], 4, &kr[0]);
    local sum: float = kr[0] + kr[1] + kr[2] + kr[3];
    local parallel: float = liabilities.pv(&curve, 0.0001) - liabilities.pv(&curve, 0.0);
    c.near("key_rates_sum", sum, parallel, 0.01);
    c.ok("no_short_end_risk", Math.abs(kr[0]) < 0.000001);
    curve.destroy();
}

frame testPairs(c: *Check) {
    c.begin("pairs");
    # A cointegrated pair: b is a random walk, a = 1.5 b-log-scaled plus a
    # mean-reverting spread.
    local n: int = 1000;
    local a: *float = cast<*float>(malloc(cast<long>(n * 2) * sizeof(float)));
    local b: *float = a + n;
    local rng: Xoshiro = Xoshiro.new(cast<u64>(31));
    local lb: float = Math.log(50.0);
    local s: float = 0.0;
    loop (local t: int = 0; t < n; t = t + 1) {
        lb = lb + (0.03 * rng.normal());
        s = (0.9 * s) + (0.01 * rng.normal());
        b[t] = Math.exp(lb);
        a[t] = Math.exp(0.5 + (1.5 * lb) + s);
    }
    local cfg: PairsConfig = PairsConfig { window: 60, entry: 2.0, exit: 0.5, stop: 4.0, cost_bps: 2.0, capital: 100000.0 };
    local r: PairsResult = PairsBacktest.run(a, b, n, &cfg);
    c.integer("trades", cast<long>(r.trades));
    c.value("total_return", r.total_return, 6);
    c.value("sharpe", r.sharpe, 4);
    c.value("half_life", r.half_life, 4);
    c.near("beta_recovered", r.last_beta, 1.5, 0.15);
    c.ok("profitable", r.total_return > 0.0);
    c.ok("mean_reverting", (r.half_life > 2.0) && (r.half_life < 20.0));
    # Independent walks: the spread barely reverts.
    loop (local t: int = 1; t < n; t = t + 1) {
        a[t] = a[t - 1] * Math.exp(0.015 * rng.normal());
    }
    local rw: PairsResult = PairsBacktest.run(a, b, n, &cfg);
    c.ok("random_walk_slower", rw.half_life > r.half_life);
    free(cast<*void>(a));
    c.begin("sizing");
    c.near("kelly_bet", Sizing.kellyBet(0.6, 1.0), 0.2, 0.000000001);
    local rets: float[500];
    loop (local i: int = 0; i < 500; i = i + 1) {
        rets[i] = 0.001 + (0.02 * rng.normal());
    }
    local k: float = Sizing.kelly(&rets[0], 500);
    c.value("kelly_fraction", k, 4);
    # Growth is maximised near the Kelly fraction.
    local g_k: float = Sizing.growth(&rets[0], 500, k);
    c.ok("kelly_beats_half", g_k >= Sizing.growth(&rets[0], 500, 0.5 * k));
    c.ok("kelly_beats_double", g_k >= Sizing.growth(&rets[0], 500, 2.0 * k));
    c.value("vol_target_leverage", Sizing.volTarget(&rets[0], 500, 0.1, 252.0, 3.0), 4);
    c.near("fixed_fractional", Sizing.fixedFractional(100000.0, 0.01, 50.0, 48.0), 500.0, 0.0);
}

frame runModelsTests(c: *Check) {
    testModels(c);
    testImmunize(c);
    testPairs(c);
}
