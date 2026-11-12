# Self-tests for execution planning, TCA and trade surveillance.

import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [AlmgrenChriss], [AcParams], [AcPlan], [Impact], [Fill], [Shortfall], [TcaReport], [TcaCalc] from "../execution/tca.bpl";
import [JournaledEngine] from "../journal/journal.bpl";
import [Engine], [OrderRequest], [ExecReport] from "../market/engine.bpl";
import [Ticks], [Side] from "../market/order.bpl";
import [Surveillance], [SurvConfig], [Alert], [AlertKind] from "../market/surveillance.bpl";

export runExecutionTests;

frame acParams(lambda: float) ret AcParams {
    # Almgren-Chriss (2000) example: 1M shares over 5 days in 5 periods,
    # 30% annual vol on a $50 stock.
    return AcParams { shares: 1000000.0, periods: 5, horizon: 5.0, sigma: 0.95, eta: 0.0000025, gamma: 0.00000025, epsilon: 0.0625, lambda: lambda, price: 50.0 };
}

frame testAlmgrenChriss(c: *Check) {
    c.begin("almgren_chriss");
    local neutral: AcParams = acParams(0.0);
    local twap: AcPlan = AlmgrenChriss.plan(&neutral);
    c.near("twap_trade", twap.trades[1], 200000.0, 0.000001);
    c.near("twap_ends_flat", twap.holdings[5], 0.0, 0.0);
    c.value("twap_cost", twap.expected_cost, 2);
    local averse: AcParams = acParams(0.000001);
    local plan: AcPlan = AlmgrenChriss.plan(&averse);
    c.value("kappa", plan.kappa, 6);
    c.value("first_trade", plan.trades[1], 2);
    c.ok("front_loaded", (plan.trades[1] > plan.trades[2]) && (plan.trades[4] > plan.trades[5]));
    local total: float = 0.0;
    loop (local k: int = 1; k <= 5; k = k + 1) {
        total = total + plan.trades[k];
    }
    c.near("sells_everything", total, 1000000.0, 0.000001);
    c.ok("less_risk", plan.variance < twap.variance);
    c.ok("more_cost", plan.expected_cost > twap.expected_cost);
    # The optimum beats TWAP on the mean-variance objective.
    c.ok("optimal_utility", plan.utility(0.000001) < twap.utility(0.000001));
    # A perturbed schedule is worse.
    local bumped: float[6];
    loop (local k: int = 0; k <= 5; k = k + 1) {
        bumped[k] = plan.trades[k];
    }
    bumped[1] = bumped[1] + 10000.0;
    bumped[2] = bumped[2] - 10000.0;
    local cost: float = 0.0;
    local variance: float = 0.0;
    AlmgrenChriss.evaluate(&averse, &bumped[0], 5, &cost, &variance);
    c.ok("perturbed_worse", (cost + (0.000001 * variance)) > plan.utility(0.000001));
    local costs: float[5];
    local sds: float[5];
    local lambdas: float[5];
    AlmgrenChriss.frontier(&averse, 0.0000001, 0.0001, 5, &costs[0], &sds[0], &lambdas[0]);
    c.ok("frontier_tradeoff", (costs[4] > costs[0]) && (sds[4] < sds[0]));
    twap.destroy();
    plan.destroy();
    c.value("sqrt_impact_bps", Impact.squareRootBps(100000.0, 1000000.0, 0.02, 0.8), 4);
    c.near("participation", Impact.participation(50000.0, 1000000.0, 39.0, 390.0), 0.5, 0.000000001);
}

frame testShortfall(c: *Check) {
    c.begin("tca");
    local fills: Fill[3] = [Fill { price: 100.10, quantity: 3000.0, time: 1.0 }, Fill { price: 100.20, quantity: 4000.0, time: 2.0 }, Fill { price: 100.40, quantity: 1000.0, time: 3.0 }];
    local s: Shortfall = TcaCalc.shortfall(1.0, 10000.0, 100.0, 100.05, 100.50, &fills[0], 3, 0.005);
    c.near("executed", s.executed, 8000.0, 0.0);
    c.near("delay", s.delay_cost, 0.05 * 8000.0, 0.0000001);
    c.near("trading", s.trading_cost, (3000.0 * 0.05) + (4000.0 * 0.15) + (1000.0 * 0.35), 0.0000001);
    c.near("opportunity", s.opportunity_cost, 0.5 * 2000.0, 0.0000001);
    c.near("fees", s.fees, 40.0, 0.0000001);
    c.value("total_bps", s.total_bps, 4);
    local sell: Shortfall = TcaCalc.shortfall(-1.0, 8000.0, 100.0, 100.05, 100.50, &fills[0], 3, 0.0);
    c.ok("selling_up_gains", (sell.trading_cost < 0.0) && (sell.delay_cost < 0.0));
    local r: TcaReport = TcaCalc.report(1.0, 10000.0, 100.0, 100.05, 100.50, 100.25, 80000.0, &fills[0], 3, 0.005);
    c.value("avg_price", r.vwap, 4);
    c.value("vs_arrival_bps", r.vs_arrival_bps, 4);
    c.value("vs_vwap_bps", r.vs_vwap_bps, 4);
    c.near("participation", r.participation, 0.1, 0.000000001);
}

frame px(v: float) ret long {
    return Ticks.fromFloat(v);
}

frame testSurveillance(c: *Check) {
    c.begin("surveillance");
    local je: JournaledEngine;
    je.init(100000);
    local sym: int = je.addSymbol("ACME", px(100.0));
    local mm: int = je.accountId("maker");
    local spoof: int = je.accountId("spoofer");
    local fa: int = je.accountId("fund:alpha");
    local fb: int = je.accountId("fund:beta");
    local noisy: int = je.accountId("hft");
    local closer: int = je.accountId("closer");
    local rng: Xoshiro = Xoshiro.new(cast<u64>(5));
    # Background two-sided flow.
    loop (local i: int = 0; i < 200; i = i + 1) {
        local bid: OrderRequest = OrderRequest.limit(sym, mm, Side.Buy, px(99.9 - (0.01 * cast<float>(rng.range(0, 10)))), 100);
        local ask: OrderRequest = OrderRequest.limit(sym, mm, Side.Sell, px(100.1 + (0.01 * cast<float>(rng.range(0, 10)))), 100);
        je.submit(&bid);
        je.submit(&ask);
    }
    # Spoofer: small genuine orders, then a huge bid to lean on the book,
    # sells into the reaction, and cancels the bid.
    loop (local i: int = 0; i < 5; i = i + 1) {
        local small: OrderRequest = OrderRequest.limit(sym, spoof, Side.Buy, px(99.0), 100);
        je.submit(&small);
    }
    local big: OrderRequest = OrderRequest.limit(sym, spoof, Side.Buy, px(99.85), 5000);
    local big_report: ExecReport = je.submit(&big);
    local sell: OrderRequest = OrderRequest.limit(sym, spoof, Side.Sell, px(99.9), 300);
    je.submit(&sell);
    je.cancel(big_report.order_id);
    # Wash trades between two desks of one owner.
    local wa: OrderRequest = OrderRequest.limit(sym, fa, Side.Sell, px(100.05), 500);
    local wb: OrderRequest = OrderRequest.limit(sym, fb, Side.Buy, px(100.05), 500);
    je.submit(&wa);
    je.submit(&wb);
    # Quote stuffing: rapid submit/cancel bursts.
    loop (local i: int = 0; i < 40; i = i + 1) {
        local q: OrderRequest = OrderRequest.limit(sym, noisy, Side.Buy, px(99.5), 10);
        local r: ExecReport = je.submit(&q);
        je.cancel(r.order_id);
    }
    # More background flow, then an account dominating the close.
    loop (local i: int = 0; i < 300; i = i + 1) {
        local bid: OrderRequest = OrderRequest.limit(sym, mm, Side.Buy, px(99.8), 100);
        je.submit(&bid);
    }
    loop (local i: int = 0; i < 300; i = i + 1) {
        local ask: OrderRequest = OrderRequest.limit(sym, mm, Side.Sell, px(100.2 + (0.02 * cast<float>(i % 20))), 50);
        je.submit(&ask);
    }
    loop (local i: int = 0; i < 6; i = i + 1) {
        local lift: OrderRequest = OrderRequest.market(sym, closer, Side.Buy, 5000);
        je.submit(&lift);
    }
    local sv: Surveillance;
    sv.init(Surveillance.defaults());
    local replayed: long = sv.run(&je.journal.log);
    c.equalInt("replayed_all", replayed, je.journal.records);
    c.ok("same_trades", sv.engine.stats.trades == je.engine.stats.trades);
    c.equalInt("spoofing", cast<long>(sv.count(AlertKind.Spoofing)), 1);
    c.equalInt("wash_trades", cast<long>(sv.count(AlertKind.WashTrade)), 1);
    c.equalInt("stuffing", cast<long>(sv.count(AlertKind.QuoteStuffing)), 1);
    c.ok("order_to_trade", sv.count(AlertKind.OrderToTrade) >= 1);
    c.equalInt("marking_close", cast<long>(sv.count(AlertKind.MarkingClose)), 1);
    loop (local i: int = 0; i < sv.alert_count; i = i + 1) {
        local a: *Alert = sv.alerts + i;
        c.text(Surveillance.kindName(a.kind), sv.accountName(a.account));
    }
    sv.destroy();
    # A clean journal raises nothing.
    local clean: JournaledEngine;
    clean.init(1024);
    local s2: int = clean.addSymbol("ACME", px(100.0));
    local x: int = clean.accountId("x");
    local y: int = clean.accountId("y");
    loop (local i: int = 0; i < 30; i = i + 1) {
        local b: OrderRequest = OrderRequest.limit(s2, x, Side.Buy, px(100.0), 10);
        local a: OrderRequest = OrderRequest.limit(s2, y, Side.Sell, px(100.0), 10);
        clean.submit(&b);
        clean.submit(&a);
    }
    local sv2: Surveillance;
    sv2.init(Surveillance.defaults());
    sv2.run(&clean.journal.log);
    c.equalInt("clean_alerts", cast<long>(sv2.alert_count), 0);
    sv2.destroy();
    clean.destroy();
    je.destroy();
}

frame runExecutionTests(c: *Check) {
    testAlmgrenChriss(c);
    testShortfall(c);
    testSurveillance(c);
}
