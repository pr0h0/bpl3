# Self-tests for the stress engine, Brinson attribution and rebalancing.

import [Math] from "std/math.bpl";
import free from "std/c.bpl";
import [Check] from "./check.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [StressBook], [Scenario], [StressResult], [ReverseStress], [StressVar], [Scenarios] from "../stress/stress.bpl";
import [Brinson], [BrinsonResult], [Linking] from "../risk/attribution.bpl";
import [Rebalancer], [RebalanceInput], [RebalancePlan], [PolicyResult] from "../risk/rebalance.bpl";
import [Bond] from "../rates/instruments.bpl";

export runPortfolioTests;

frame demoBook(b: *StressBook) {
    b.init(0.04, 0.015, 0.18);
    local spx: int = b.addUnderlying("SPX", 100.0, 0.2, 1.0, 0.05);
    local tech: int = b.addUnderlying("TECH", 50.0, 0.35, 1.4, 0.15);
    local eur: int = b.addCurrency("EUR", 1.1, 0.08);
    b.addEquity(spx, 1000.0, nullptr);
    b.addEquity(tech, 800.0, nullptr);
    b.addOption(spx, false, 90.0, 0.5, 1000.0, "SPX 90 put");
    b.addOption(tech, true, 55.0, 0.25, -500.0, "short TECH call");
    b.addBond(0.04, 10.0, 2, false, 500.0, "10y government");
    b.addBond(0.06, 5.0, 2, true, 300.0, "5y corporate");
    b.addFx(eur, 20000.0, nullptr);
}

frame testStress(c: *Check) {
    c.begin("stress");
    local lin: StressBook;
    lin.init(0.04, 0.0, 0.18);
    local u: int = lin.addUnderlying("SPX", 100.0, 0.2, 1.0, 0.05);
    lin.addEquity(u, 100.0, nullptr);
    lin.addBond(0.04, 10.0, 2, false, 10.0, nullptr);
    local none: Scenario = StressBook.zero();
    c.near("par_bond", lin.value(&none), 10000.0 + 1000.0, 0.000000001);
    local down: Scenario = StressBook.zero();
    down.market = -0.1;
    local r: StressResult = lin.run(&down);
    c.near("linear_equity", r.pnl, -1000.0, 0.000000001);
    c.near("linear_no_interaction", r.by_factor.interaction, 0.0, 0.000000001);
    r.destroy();
    local b10: Bond = Bond.new(100.0, 0.04, 10.0, 2);
    local up: Scenario = StressBook.zero();
    up.rate_bp = 100.0;
    local ru: StressResult = lin.run(&up);
    c.near("rate_shift", ru.pnl, 10.0 * (b10.priceFromYield(0.05) - 100.0), 0.000000001);
    ru.destroy();
    lin.destroy();
    local book: StressBook;
    demoBook(&book);
    local base: Scenario = StressBook.zero();
    c.value("book_value", book.value(&base), 4);
    loop (local i: int = 0; i < Scenarios.count(); i = i + 1) {
        local sc: Scenario = Scenarios.at(i);
        local res: StressResult = book.run(&sc);
        c.value(sc.name, res.pnl, 2);
        local parts: float = res.by_factor.equity + res.by_factor.volatility + res.by_factor.rates + res.by_factor.credit + res.by_factor.fx + res.by_factor.time + res.by_factor.interaction;
        c.near("decomposes", parts, res.pnl, 0.0000001);
        local sum: float = 0.0;
        loop (local k: int = 0; k < res.count; k = k + 1) {
            sum = sum + res.by_position[k];
        }
        c.near("positions_sum", sum, res.pnl, 0.0000001);
        res.destroy();
    }
    local crash: Scenario = Scenarios.at(Scenarios.find("lehman_2008"));
    local cr: StressResult = book.run(&crash);
    c.text("lehman_worst", book.positionLabel(cr.worst_position));
    c.value("lehman_equity", cr.by_factor.equity, 2);
    c.value("lehman_vol", cr.by_factor.volatility, 2);
    c.value("lehman_credit", cr.by_factor.credit, 2);
    c.ok("put_hedges", cr.by_position[2] > 0.0);
    cr.destroy();
    # Reverse stress: how much of a crash produces a 15k loss?
    local unit: Scenario = StressBook.zero();
    unit.market = -0.1;
    unit.vol_points = 5.0;
    unit.credit_bp = 50.0;
    local rev: ReverseStress = book.reverse(&unit, 15000.0, 10.0);
    c.ok("reverse_found", rev.found);
    c.near("reverse_pnl", rev.pnl, -15000.0, 0.01);
    c.value("reverse_scale", rev.scale, 4);
    local ladder: float[7];
    book.equityLadder(-0.3, 0.3, 7, 0.5, &ladder[0]);
    c.near("ladder_center", ladder[3], 0.0, 0.0000001);
    c.ok("ladder_monotone_down", (ladder[0] < ladder[1]) && (ladder[1] < ladder[2]) && (ladder[2] < ladder[3]));
    local rates: float[5];
    book.rateLadder(-200.0, 200.0, 5, &rates[0]);
    c.ok("rates_hurt", rates[4] < 0.0);
    local mc: StressVar = book.monteCarlo(20000, 10.0, 0.99, 5.0, cast<u64>(77));
    c.value("mc_var99", mc.var, 2);
    c.value("mc_es99", mc.es, 2);
    c.ok("es_above_var", (mc.es >= mc.var) && (mc.worst >= mc.es));
    book.destroy();
}

frame testBrinson(c: *Check) {
    c.begin("brinson");
    # Three sectors plus cash.
    local wp: float[4] = [0.5, 0.3, 0.15, 0.05];
    local wb: float[4] = [0.4, 0.4, 0.2, 0.0];
    local rp: float[4] = [0.08, 0.025, -0.03, 0.001];
    local rb: float[4] = [0.06, 0.03, -0.01, 0.001];
    local bf: BrinsonResult = Brinson.single(&wp[0], &wb[0], &rp[0], &rb[0], 4, true);
    c.value("portfolio_return", bf.portfolio_return, 6);
    c.value("benchmark_return", bf.benchmark_return, 6);
    c.near("fachler_sums", bf.allocation + bf.selection + bf.interaction, bf.active_return, 0.000000000001);
    c.value("allocation", bf.allocation, 6);
    c.value("selection", bf.selection, 6);
    c.value("interaction", bf.interaction, 6);
    c.near("sector0_allocation", bf.sectors[0].allocation, 0.1 * (0.06 - bf.benchmark_return), 0.000000000001);
    local bhb: BrinsonResult = Brinson.single(&wp[0], &wb[0], &rp[0], &rb[0], 4, false);
    c.near("bhb_sums", bhb.allocation + bhb.selection + bhb.interaction, bhb.active_return, 0.000000000001);
    c.near("same_selection", bhb.selection, bf.selection, 0.000000000001);
    c.near("weights_ok", bf.weight_error, 0.0, 0.000000000001);
    bf.destroy();
    bhb.destroy();
    # Linking over 4 periods: linked active returns add up to the compounded difference.
    local prt: float[4] = [0.03, -0.02, 0.05, 0.01];
    local brt: float[4] = [0.02, -0.01, 0.04, 0.015];
    local active: float[4];
    loop (local t: int = 0; t < 4; t = t + 1) {
        active[t] = prt[t] - brt[t];
    }
    local target: float = Linking.compound(&prt[0], 4) - Linking.compound(&brt[0], 4);
    local k: float[4];
    Linking.carino(&prt[0], &brt[0], 4, &k[0]);
    c.near("carino_links", Linking.link(&active[0], &k[0], 4), target, 0.000000000001);
    Linking.menchero(&prt[0], &brt[0], 4, &k[0]);
    c.near("menchero_links", Linking.link(&active[0], &k[0], 4), target, 0.000000000001);
    c.value("compounded_active", target, 8);
    c.ok("arithmetic_differs", Math.abs((active[0] + active[1] + active[2] + active[3]) - target) > 0.0001);
}

frame testRebalance(c: *Check) {
    c.begin("rebalance");
    local shares: float[4] = [100.0, 300.0, 0.0, 50.0];
    local prices: float[4] = [50.0, 20.0, 100.0, 200.0];
    local targets: float[4] = [0.25, 0.25, 0.25, 0.2];
    local lots: float[4] = [1.0, 10.0, 5.0, 1.0];
    local input: RebalanceInput = RebalanceInput { count: 4, shares: &shares[0], prices: &prices[0], targets: &targets[0], lots: &lots[0], cash: 6000.0, band: 0.0, min_trade: 0.0, max_turnover: 0.0, commission_bps: 10.0, cash_buffer: 0.0 };
    local p: RebalancePlan = Rebalancer.plan(&input);
    c.near("value", p.value, 5000.0 + 6000.0 + 0.0 + 10000.0 + 6000.0, 0.0);
    c.value("trade0", p.trades[0], 0);
    c.value("trade1", p.trades[1], 0);
    c.value("trade2", p.trades[2], 0);
    c.value("trade3", p.trades[3], 0);
    c.ok("lots_respected", (Math.abs(p.trades[1] - (10.0 * Math.floor(p.trades[1] / 10.0))) < 0.0000001) && (Math.abs(p.trades[2] - (5.0 * Math.floor(p.trades[2] / 5.0))) < 0.0000001));
    c.ok("cash_non_negative", p.cash_after >= 0.0);
    c.ok("closer_to_target", p.tracking_after < p.tracking_before);
    c.value("turnover", p.turnover, 6);
    c.value("commission", p.commission, 4);
    p.destroy();
    # Tolerance band leaves names that are close enough.
    input.band = 0.05;
    local banded: RebalancePlan = Rebalancer.plan(&input);
    c.equalInt("band_skipped", cast<long>(banded.skipped_band), 1);
    banded.destroy();
    # Turnover cap halves the trades.
    input.band = 0.0;
    input.max_turnover = 0.05;
    local capped: RebalancePlan = Rebalancer.plan(&input);
    c.ok("turnover_capped", capped.turnover <= 0.0500001);
    c.ok("scaled", capped.scaled_by < 1.0);
    capped.destroy();
    # Not enough cash: buys shrink so cash stays non-negative.
    input.max_turnover = 0.0;
    input.cash = 0.0;
    input.cash_buffer = 0.02;
    local tight: RebalancePlan = Rebalancer.plan(&input);
    c.ok("tight_cash", tight.cash_after >= -0.000001);
    tight.destroy();
    # Policy simulation on a two-asset random walk.
    local bars: int = 500;
    local path: *float = Rebalancer.alloc(bars * 2);
    local rng: Xoshiro = Xoshiro.new(cast<u64>(3));
    path[0] = 100.0;
    path[1] = 100.0;
    loop (local t: int = 1; t < bars; t = t + 1) {
        path[t * 2] = path[(t - 1) * 2] * Math.exp((rng.normal() * 0.012) + 0.0004);
        path[(t * 2) + 1] = path[((t - 1) * 2) + 1] * Math.exp((rng.normal() * 0.005) + 0.0001);
    }
    local mix: float[2] = [0.6, 0.4];
    local never: PolicyResult = Rebalancer.simulate(path, bars, 2, &mix[0], 1000000.0, 0, 0, 0.0, 5.0);
    local monthly: PolicyResult = Rebalancer.simulate(path, bars, 2, &mix[0], 1000000.0, 0, 21, 0.0, 5.0);
    local threshold: PolicyResult = Rebalancer.simulate(path, bars, 2, &mix[0], 1000000.0, 1, 0, 0.03, 5.0);
    c.equalInt("never_rebalances", cast<long>(never.rebalances), 0);
    c.integer("monthly_rebalances", cast<long>(monthly.rebalances));
    c.integer("threshold_rebalances", cast<long>(threshold.rebalances));
    c.ok("rebalancing_tracks", (monthly.tracking_error < never.tracking_error) && (threshold.tracking_error < never.tracking_error));
    c.ok("threshold_bounded", threshold.max_drift < 0.05);
    c.value("monthly_turnover", monthly.turnover, 6);
    c.value("threshold_turnover", threshold.turnover, 6);
    c.value("buy_and_hold_return", never.total_return, 6);
    free(cast<*void>(path));
}

frame runPortfolioTests(c: *Check) {
    testStress(c);
    testBrinson(c);
    testRebalance(c);
}
