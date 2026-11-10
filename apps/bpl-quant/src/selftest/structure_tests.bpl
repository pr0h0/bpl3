# Self-tests for option strategies, HMM regimes, corporate actions,
# liquidity measures and scenario margin.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [Strategy], [LegKind], [StrategyStats] from "../quant/strategies.bpl";
import [Hmm], [HmmFit] from "../tsa/regime.bpl";
import [BarSeries], [Bar] from "../series/bars.bpl";
import [Corporate], [CorporateAction], [ActionKind], [Liquidity] from "../series/corporate.bpl";
import [SpanBook], [SpanProduct], [SpanOption], [SpanResult] from "../risk/margin.bpl";

export runStructureTests;

frame testStrategies(c: *Check) {
    c.begin("strategies");
    # Bull call spread with given premiums: debit 3.0, max profit 7, max loss 3.
    local s: Strategy = Strategy.create("bull", 100.0, 0.2, 0.0, 0.0);
    s.add(LegKind.Call, 100.0, 0.5, 1.0, 5.0);
    s.add(LegKind.Call, 110.0, 0.5, -1.0, 2.0);
    local st: StrategyStats = s.analyse();
    c.near("debit", st.cost, 3.0, 0.0);
    c.near("max_profit", st.max_profit, 7.0, 0.000001);
    c.near("max_loss", st.max_loss, -3.0, 0.000001);
    c.equalInt("breakevens", cast<long>(st.breakeven_count), 1);
    c.near("breakeven", st.breakevens[0], 103.0, 0.000001);
    c.ok("bounded", !st.profit_unbounded && !st.loss_unbounded);
    c.value("pop", st.probability_of_profit, 6);
    # Long straddle: unbounded profit, two breakevens symmetric about K
    # at K +- premium.
    local straddle: Strategy;
    c.ok("template", Strategy.template("long_straddle", 100.0, 0.25, 0.02, 0.25, 5.0, &straddle));
    local ss: StrategyStats = straddle.analyse();
    c.ok("straddle_unbounded", ss.profit_unbounded && !ss.loss_unbounded);
    c.equalInt("straddle_breakevens", cast<long>(ss.breakeven_count), 2);
    c.near("straddle_symmetric", ss.breakevens[0] + ss.breakevens[1], 200.0, 0.000001);
    c.near("straddle_max_loss", ss.max_loss, -ss.cost, 0.001);
    c.value("straddle_cost", ss.cost, 6);
    c.value("straddle_delta", ss.delta, 6);
    c.ok("straddle_long_gamma", (ss.gamma > 0.0) && (ss.vega > 0.0) && (ss.theta < 0.0));
    # Risk-neutral expected P&L of any strategy at expiry is close to the
    # forward value of its cost being fair: E[payoff] ~ cost * e^{rT}.
    c.near("fair_pricing", ss.expected_pnl + ss.cost, ss.cost * Math.exp(0.02 * 0.25), 0.002);
    # Iron condor: credit, bounded, short vega.
    local condor: Strategy;
    Strategy.template("iron_condor", 100.0, 0.2, 0.0, 0.25, 5.0, &condor);
    local cs: StrategyStats = condor.analyse();
    c.ok("condor_credit", cs.cost < 0.0);
    c.near("condor_max_profit", cs.max_profit, -cs.cost, 0.000001);
    c.near("condor_max_loss", cs.max_loss, -(5.0 + cs.cost), 0.000001);
    c.ok("condor_short_vega", cs.vega < 0.0);
    c.value("condor_pop", cs.probability_of_profit, 6);
    # Covered call: stock leg slope cancels the short call above the strike.
    local covered: Strategy;
    Strategy.template("covered_call", 100.0, 0.2, 0.0, 0.25, 5.0, &covered);
    local cc: StrategyStats = covered.analyse();
    c.ok("covered_bounded_profit", !cc.profit_unbounded);
    c.near("covered_max_profit", cc.max_profit, 105.0 - cc.cost, 0.000001);
    local count: int = 0;
    loop (local i: int = 0; i < Strategy.templateCount(); i = i + 1) {
        local t: Strategy;
        if (Strategy.template(Strategy.templateName(i), 100.0, 0.2, 0.01, 0.25, 5.0, &t)) {
            count = count + 1;
        }
    }
    c.equalInt("templates", cast<long>(count), 10);
    local none: Strategy;
    c.ok("unknown_template", !Strategy.template("nope", 100.0, 0.2, 0.0, 0.25, 5.0, &none));
}

frame testRegime(c: *Check) {
    c.begin("regime");
    # Two regimes: calm (sd 0.5%) and turbulent (sd 2.5%) with sticky switching.
    local n: int = 2000;
    local x: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local truth: *int = cast<*int>(malloc(cast<long>(n) * sizeof(int)));
    local rng: Xoshiro = Xoshiro.new(cast<u64>(91));
    local state: int = 0;
    loop (local t: int = 0; t < n; t = t + 1) {
        if (rng.chance(state == 0 ? 0.01 : 0.03)) {
            state = 1 - state;
        }
        truth[t] = state;
        x[t] = state == 0 ? 0.0005 + (0.005 * rng.normal()) : -0.001 + (0.025 * rng.normal());
    }
    local h: Hmm = Hmm.initial(2, x, n);
    local gamma: *float = cast<*float>(malloc(cast<long>(n * 4) * sizeof(float)));
    local fit: HmmFit = h.fit(x, n, 200, 0.000001, gamma);
    c.ok("converged", fit.converged);
    c.value("sigma_calm", h.sigma[0], 5);
    c.value("sigma_turbulent", h.sigma[1], 5);
    c.near("calm_vol_recovered", h.sigma[0], 0.005, 0.1);
    c.ok("turbulent_vol", Math.abs(h.sigma[1] - 0.025) < 0.005);
    c.value("stay_calm", h.a[0], 4);
    c.value("calm_duration", h.duration(0), 2);
    local path: *int = cast<*int>(malloc(cast<long>(n) * sizeof(int)));
    h.viterbi(x, n, path);
    local agree: int = 0;
    local post_agree: int = 0;
    loop (local t: int = 0; t < n; t = t + 1) {
        if (path[t] == truth[t]) {
            agree = agree + 1;
        }
        local guess: int = gamma[(t * 4) + 1] > 0.5 ? 1 : 0;
        if (guess == truth[t]) {
            post_agree = post_agree + 1;
        }
    }
    c.value("viterbi_accuracy", cast<float>(agree) / cast<float>(n), 4);
    c.ok("viterbi_accurate", agree > ((n * 9) / 10));
    c.ok("posterior_accurate", post_agree > ((n * 9) / 10));
    local pi: float[4];
    h.stationary(&pi[0]);
    c.near("stationary_sums", pi[0] + pi[1], 1.0, 0.000000001);
    # Three states fit at least as well; BIC penalises the extra parameters.
    local h3: Hmm = Hmm.initial(3, x, n);
    local fit3: HmmFit = h3.fit(x, n, 200, 0.000001, nullptr);
    c.ok("more_states_fit", fit3.log_likelihood >= (fit.log_likelihood - 0.5));
    c.value("bic_2", fit.bic, 2);
    free(cast<*void>(x));
    free(cast<*void>(truth));
    free(cast<*void>(gamma));
    free(cast<*void>(path));
}

frame testCorporate(c: *Check) {
    c.begin("corporate");
    local s: BarSeries = BarSeries.new(10, 86400);
    local closes: float[10] = [100.0, 102.0, 104.0, 52.5, 53.0, 54.0, 53.0, 55.0, 56.0, 57.0];
    loop (local i: int = 0; i < 10; i = i + 1) {
        local p: float = closes[i];
        s.push(Bar { time: cast<long>(i * 86400), open: p, high: p * 1.01, low: p * 0.99, close: p, volume: 1000.0, trades: 10, vwap: p });
    }
    # A 2-for-1 split on day 3 and a 1.0 dividend on day 6.
    local actions: CorporateAction[2] = [CorporateAction { kind: ActionKind.Split, time: 3 * 86400, value: 2.0 }, CorporateAction { kind: ActionKind.Dividend, time: 6 * 86400, value: 1.0 }];
    local tr: float[10];
    Corporate.totalReturn(&s, &actions[0], 2, 100.0, &tr[0]);
    c.near("tr_split_day", tr[3], 100.0 * (104.0 / 100.0) * ((52.5 * 2.0) / 104.0), 0.000000001);
    c.near("tr_dividend_day", tr[6], tr[5] * ((53.0 + 1.0) / 54.0), 0.000000001);
    c.value("total_return_index", tr[9], 6);
    c.near("yield", Corporate.trailingYield(&s, &actions[0], 2, 365 * 86400), 1.0 / 57.0, 0.000000001);
    c.equalInt("applied", cast<long>(Corporate.backAdjust(&s, &actions[0], 2)), 2);
    # After adjusting, the split gap is gone and the dividend scales history.
    local f: float = 1.0 - (1.0 / 54.0);
    c.near("adjusted_pre_split", s.close[2], 104.0 * 0.5 * f, 0.000000001);
    c.near("adjusted_volume", s.volume[0], 2000.0, 0.0);
    c.near("unadjusted_after", s.close[9], 57.0, 0.0);
    c.ok("no_split_gap", Math.abs((s.close[3] / s.close[2]) - 1.0) < 0.02);
    s.destroy();
    c.begin("liquidity");
    # Roll: prices bouncing between bid and ask around a fixed value.
    local bounce: float[200];
    local rng: Xoshiro = Xoshiro.new(cast<u64>(12));
    loop (local i: int = 0; i < 200; i = i + 1) {
        bounce[i] = 100.0 + (rng.chance(0.5) ? 0.05 : -0.05);
    }
    c.near("roll_spread", Liquidity.roll(&bounce[0], 200), 0.001, 0.0003);
    local bars: BarSeries = BarSeries.synthetic(cast<u64>(4), 250, 50.0, 0.0, 0.3, 86400);
    c.value("amihud", Liquidity.amihud(&bars), 8);
    c.value("corwin_schultz", Liquidity.corwinSchultz(&bars), 6);
    local vp: float = Liquidity.vpin(&bars, 50);
    c.value("vpin", vp, 6);
    c.ok("vpin_range", (vp >= 0.0) && (vp <= 1.0));
    local dp: float[300];
    local sv: float[300];
    loop (local i: int = 0; i < 300; i = i + 1) {
        sv[i] = rng.normal() * 1000.0;
        dp[i] = (0.0002 * sv[i]) + (0.01 * rng.normal());
    }
    c.near("kyle_lambda", Liquidity.kyleLambda(&dp[0], &sv[0], 300), 0.0002, 0.00002);
    bars.destroy();
}

frame testMargin(c: *Check) {
    c.begin("span_margin");
    local book: SpanBook;
    book.init(0.03, 0.5);
    local es: int = book.addProduct(SpanProduct { name: "ES", price: 5000.0, vol: 0.18, price_range: 0.06, vol_range: 0.04, multiplier: 50.0, futures: 2.0, group: 1, short_option_min: 500.0 });
    local nq: int = book.addProduct(SpanProduct { name: "NQ", price: 17000.0, vol: 0.22, price_range: 0.07, vol_range: 0.05, multiplier: 20.0, futures: -1.0, group: 1, short_option_min: 600.0 });
    local r: SpanResult;
    book.compute(&r);
    # A futures-only product: scan risk is the full price range move.
    c.near("es_scan", r.scan_risk[es], 2.0 * 5000.0 * 0.06 * 50.0, 0.000001);
    c.near("nq_scan", r.scan_risk[nq], 17000.0 * 0.07 * 20.0, 0.000001);
    c.near("credit", r.credit, 0.5 * Math.min(2.0 * 5000.0 * 0.06 * 50.0, 17000.0 * 0.07 * 20.0), 0.000001);
    c.value("total_futures", r.total, 2);
    # Short puts: scan risk on the down moves, with the short option minimum.
    local opt: SpanBook;
    opt.init(0.03, 0.5);
    local p: int = opt.addProduct(SpanProduct { name: "ES", price: 5000.0, vol: 0.18, price_range: 0.06, vol_range: 0.04, multiplier: 50.0, futures: 0.0, group: 0, short_option_min: 500.0 });
    opt.addOption(SpanOption { product: p, is_call: false, strike: 4500.0, expiry: 0.1, quantity: -4.0 });
    local ro: SpanResult;
    opt.compute(&ro);
    c.value("short_put_scan", ro.scan_risk[p], 2);
    c.text("short_put_worst", SpanBook.scenarioLabel(ro.worst_scenario[p]));
    c.ok("som_floor", ro.product_margin[p] >= 2000.0);
    # Hedging with a long put lowers the margin.
    opt.addOption(SpanOption { product: p, is_call: false, strike: 4400.0, expiry: 0.1, quantity: 4.0 });
    local rh: SpanResult;
    opt.compute(&rh);
    c.ok("spread_cheaper", rh.scan_risk[p] < ro.scan_risk[p]);
    c.value("put_spread_margin", rh.total, 2);
}

frame runStructureTests(c: *Check) {
    testStrategies(c);
    testRegime(c);
    testCorporate(c);
    testMargin(c);
}
