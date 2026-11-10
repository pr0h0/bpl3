# Option strategies, regimes, corporate actions, liquidity and margin.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Request], [Response] from "bpl-express";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonDoc], [JsonKind] from "../core/json_doc.bpl";
import [Text] from "../core/text.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [SeriesEntry] from "../series/store.bpl";
import [BarSeries] from "../series/bars.bpl";
import [Strategy], [LegKind], [StrategyStats], [Leg] from "../quant/strategies.bpl";
import [Hmm], [HmmFit] from "../tsa/regime.bpl";
import [Corporate], [CorporateAction], [ActionKind], [Liquidity] from "../series/corporate.bpl";
import [SpanBook], [SpanProduct], [SpanOption], [SpanResult] from "../risk/margin.bpl";
import [Engine] from "../market/engine.bpl";
import [Trade], [Side], [Ticks] from "../market/order.bpl";

export strategyHandler;
export templatesHandler;
export regimeHandler;
export adjustHandler;
export liquidityHandler;
export spanHandler;

frame templatesHandler(_req: *Request, res: *Response) {
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    w.key("templates").beginArray();
    loop (local i: int = 0; i < Strategy.templateCount(); i = i + 1) {
        w.str(Strategy.templateName(i));
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame writeStrategy(w: *JsonWriter, s: *Strategy, points: int) {
    local st: StrategyStats = s.analyse();
    w.fieldStr("name", s.name);
    w.key("legs").beginArray();
    loop (local i: int = 0; i < s.count; i = i + 1) {
        local leg: *Leg = &s.legs[i];
        w.beginObject();
        w.fieldStr("type", Strategy.kindName(leg.kind));
        if (leg.kind != LegKind.Stock) {
            w.fieldNum("strike", leg.strike);
            w.fieldNum("expiry", leg.expiry);
        }
        w.fieldNum("qty", leg.quantity);
        w.fieldNum("premium", leg.premium);
        w.endObject();
    }
    w.endArray();
    w.fieldNum("net_cost", st.cost);
    if (st.profit_unbounded) {
        w.fieldStr("max_profit", "unbounded");
    } else {
        w.fieldNum("max_profit", st.max_profit);
    }
    if (st.loss_unbounded) {
        w.fieldStr("max_loss", "unbounded");
    } else {
        w.fieldNum("max_loss", st.max_loss);
    }
    w.fieldNumArray("breakevens", &st.breakevens[0], st.breakeven_count);
    w.fieldNum("probability_of_profit", st.probability_of_profit);
    w.fieldNum("expected_pnl", st.expected_pnl);
    w.key("greeks").beginObject().fieldNum("delta", st.delta).fieldNum("gamma", st.gamma).fieldNum("vega", st.vega).fieldNum("theta", st.theta).endObject();
    if (points > 1) {
        local lo: float = 0.0;
        local hi: float = 0.0;
        s.strikeRange(&lo, &hi);
        local x_lo: float = lo * 0.7;
        local x_hi: float = hi * 1.3;
        local xs: *float = cast<*float>(malloc(cast<long>(points * 3) * sizeof(float)));
        local expiry_pnl: *float = xs + points;
        local today: *float = expiry_pnl + points;
        loop (local i: int = 0; i < points; i = i + 1) {
            xs[i] = x_lo + (((x_hi - x_lo) * cast<float>(i)) / cast<float>(points - 1));
            expiry_pnl[i] = s.payoff(xs[i]);
            today[i] = s.pnl(xs[i], 0.0);
        }
        w.key("curve").beginObject();
        w.fieldNumArray("spot", xs, points);
        w.fieldNumArray("pnl_at_expiry", expiry_pnl, points);
        w.fieldNumArray("pnl_now", today, points);
        w.endObject();
        free(cast<*void>(xs));
    }
}

# GET ?template=&spot=&vol=&rate=&expiry=&width=&points=, or POST
# {spot, vol, rate, dividend, legs:[{type, strike, expiry, qty, premium?}]}.
frame strategyHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local has_body: bool = (req.body != nullptr) && (req.body_length > 0);
    if (has_body && !p.parseBody(65536)) {
        p.reject(res);
        return;
    }
    local spot: float = p.num("spot", 100.0, 0.0001, 100000000.0);
    local vol: float = p.num("vol", 0.2, 0.001, 5.0);
    local rate: float = p.num("rate", 0.0, -0.5, 1.0);
    local dividend: float = p.num("dividend", 0.0, -0.5, 1.0);
    local expiry: float = p.num("expiry", 0.25, 0.001, 30.0);
    local width: float = p.num("width", spot * 0.05, 0.0001, 100000000.0);
    local points: int = p.integer("points", 41, 0, 1001);
    if (p.reject(res)) {
        return;
    }
    local s: Strategy;
    if (!has_body) {
        local name: string = p.str("template", "long_straddle");
        if (!Strategy.template(name, spot, vol, rate, expiry, width, &s)) {
            Reply.error(res, 422, "unknown template (see /api/options/templates)");
            return;
        }
    } else {
        s = Strategy.create("custom", spot, vol, rate, dividend);
        local legs: int = p.body.get(p.body.root(), "legs");
        local n: int = p.body.isKind(legs, JsonKind.Array) ? p.body.length(legs) : 0;
        if ((n < 1) || (n > 8)) {
            Reply.error(res, 422, "legs must be an array of 1-8 entries");
            return;
        }
        local cur: int = p.body.first(legs);
        loop (cur >= 0) {
            local t: string = p.body.getStr(cur, "type");
            local kind: LegKind = LegKind.Stock;
            if (Text.equals(t, "call")) {
                kind = LegKind.Call;
            } else if (Text.equals(t, "put")) {
                kind = LegKind.Put;
            } else if (!Text.equals(t, "stock")) {
                Reply.error(res, 422, "leg type must be call, put or stock");
                return;
            }
            local strike: float = p.body.getNum(cur, "strike", 0.0);
            local leg_expiry: float = p.body.getNum(cur, "expiry", expiry);
            if ((kind != LegKind.Stock) && (!(strike > 0.0) || !(leg_expiry > 0.0) || (leg_expiry > 30.0))) {
                Reply.error(res, 422, "option legs need strike > 0 and expiry in (0, 30]");
                return;
            }
            s.add(kind, strike, leg_expiry, p.body.getNum(cur, "qty", 1.0), p.body.getNum(cur, "premium", -1.0));
            cur = p.body.next(cur);
        }
    }
    local w: JsonWriter = JsonWriter.new(2048 + (points * 80));
    w.precision = 10;
    w.beginObject();
    writeStrategy(&w, &s, points);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame seriesOf(req: *Request, res: *Response) ret *SeriesEntry {
    local p: Params = Params.of(req);
    local s: *AppState = appState();
    local e: *SeriesEntry = s.series.find(p.path("symbol"));
    if ((e == nullptr) || (e.bars.len < 2)) {
        Reply.notFound(res, "unknown symbol or no history");
        return nullptr;
    }
    return e;
}

frame regimeHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local states: int = p.integer("states", 2, 2, 4);
    local iters: int = p.integer("max_iter", 200, 1, 2000);
    local tail: int = p.integer("tail", 20, 1, 100000);
    if (p.reject(res)) {
        return;
    }
    local e: *SeriesEntry = seriesOf(req, res);
    if (e == nullptr) {
        return;
    }
    local n: int = e.bars.len - 1;
    if (n < 50) {
        Reply.error(res, 422, "need at least 51 bars");
        return;
    }
    local x: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local t: int = 0; t < n; t = t + 1) {
        x[t] = Math.log(e.bars.close[t + 1] / e.bars.close[t]);
    }
    local h: Hmm = Hmm.initial(states, x, n);
    local gamma: *float = cast<*float>(malloc(cast<long>(n * 4) * sizeof(float)));
    local fit: HmmFit = h.fit(x, n, iters, 0.000001, gamma);
    local path: *int = cast<*int>(malloc(cast<long>(n) * sizeof(int)));
    h.viterbi(x, n, path);
    local w: JsonWriter = JsonWriter.new(2048 + (tail * 60));
    w.precision = 10;
    w.beginObject();
    w.fieldInt("returns", cast<long>(n));
    w.fieldInt("iterations", cast<long>(fit.iterations));
    w.fieldBool("converged", fit.converged);
    w.fieldNum("log_likelihood", fit.log_likelihood);
    w.fieldNum("aic", fit.aic);
    w.fieldNum("bic", fit.bic);
    local pi: float[4];
    h.stationary(&pi[0]);
    w.key("states").beginArray();
    loop (local i: int = 0; i < h.k; i = i + 1) {
        w.beginObject();
        w.fieldNum("mean", h.mu[i]);
        w.fieldNum("stdev", h.sigma[i]);
        w.fieldNum("annual_vol", h.sigma[i] * Math.sqrt(252.0));
        w.fieldNum("expected_duration", h.duration(i));
        w.fieldNum("stationary", pi[i]);
        w.fieldNum("probability_now", gamma[((n - 1) * 4) + i]);
        w.fieldNumArray("transitions", &h.a[i * 4], h.k);
        w.endObject();
    }
    w.endArray();
    local start: int = n > tail ? n - tail : 0;
    w.key("viterbi_tail").beginArray();
    loop (local t: int = start; t < n; t = t + 1) {
        w.integer(cast<long>(path[t]));
    }
    w.endArray();
    w.endObject();
    free(cast<*void>(x));
    free(cast<*void>(gamma));
    free(cast<*void>(path));
    Reply.ok(res, &w);
    w.destroy();
}

# Body: {"actions":[{"type":"split|dividend","time","value"}], "apply": false}
frame adjustHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(65536)) {
        p.reject(res);
        return;
    }
    local apply: bool = p.flag("apply", false);
    if (p.reject(res)) {
        return;
    }
    local e: *SeriesEntry = seriesOf(req, res);
    if (e == nullptr) {
        return;
    }
    local list: int = p.body.get(p.body.root(), "actions");
    local n: int = p.body.isKind(list, JsonKind.Array) ? p.body.length(list) : 0;
    if ((n < 1) || (n > 1000)) {
        Reply.error(res, 422, "actions must be an array of 1-1000 entries");
        return;
    }
    local actions: *CorporateAction = cast<*CorporateAction>(malloc(cast<long>(n) * sizeof(CorporateAction)));
    local cur: int = p.body.first(list);
    local i: int = 0;
    loop (cur >= 0) {
        local t: string = p.body.getStr(cur, "type");
        local value: float = p.body.getNum(cur, "value", 0.0);
        if ((!Text.equals(t, "split") && !Text.equals(t, "dividend")) || !(value > 0.0)) {
            free(cast<*void>(actions));
            Reply.error(res, 422, "each action needs type split|dividend and value > 0");
            return;
        }
        actions[i] = CorporateAction { kind: Text.equals(t, "split") ? ActionKind.Split : ActionKind.Dividend, time: cast<long>(p.body.getNum(cur, "time", 0.0)), value: value };
        i = i + 1;
        cur = p.body.next(cur);
    }
    local bars: *BarSeries = &e.bars;
    local tr: *float = cast<*float>(malloc(cast<long>(bars.len) * sizeof(float)));
    Corporate.totalReturn(bars, actions, n, 100.0, tr);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("price_return", (bars.close[bars.len - 1] / bars.close[0]) - 1.0);
    w.fieldNum("total_return", (tr[bars.len - 1] / 100.0) - 1.0);
    w.fieldNum("trailing_yield", Corporate.trailingYield(bars, actions, n, 31536000));
    if (apply) {
        w.fieldInt("applied", cast<long>(Corporate.backAdjust(bars, actions, n)));
        w.fieldNum("first_close_adjusted", bars.close[0]);
    }
    w.endObject();
    free(cast<*void>(tr));
    free(cast<*void>(actions));
    Reply.ok(res, &w);
    w.destroy();
}

# Bar-based measures plus Kyle's lambda and Roll from the live trade tape.
frame liquidityHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local buckets: int = p.integer("buckets", 50, 1, 10000);
    if (p.reject(res)) {
        return;
    }
    local e: *SeriesEntry = seriesOf(req, res);
    if (e == nullptr) {
        return;
    }
    local s: *AppState = appState();
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("amihud", Liquidity.amihud(&e.bars));
    w.fieldNum("corwin_schultz", Liquidity.corwinSchultz(&e.bars));
    w.fieldNum("roll_bars", Liquidity.roll(e.bars.close, e.bars.len));
    w.fieldNum("vpin", Liquidity.vpin(&e.bars, buckets));
    local sym: int = s.engine.symbolId(p.path("symbol"));
    local count: int = 0;
    if (sym >= 0) {
        loop (local i: int = 0; i < s.engine.tape.count; i = i + 1) {
            if (s.engine.tape.at(i).symbol == sym) {
                count = count + 1;
            }
        }
    }
    w.fieldInt("tape_trades", cast<long>(count));
    if (count >= 10) {
        local prices: *float = cast<*float>(malloc(cast<long>(count * 3) * sizeof(float)));
        local dp: *float = prices + count;
        local sv: *float = dp + count;
        local k: int = 0;
        loop (local i: int = 0; i < s.engine.tape.count; i = i + 1) {
            local t: *Trade = s.engine.tape.at(i);
            if (t.symbol == sym) {
                prices[k] = Ticks.toFloat(t.price);
                k = k + 1;
            }
        }
        k = 0;
        local prev: float = 0.0;
        loop (local i: int = 0; i < s.engine.tape.count; i = i + 1) {
            local t: *Trade = s.engine.tape.at(i);
            if (t.symbol != sym) {
                continue;
            }
            local px: float = Ticks.toFloat(t.price);
            if (k > 0) {
                dp[k - 1] = px - prev;
                sv[k - 1] = t.aggressor == Side.Buy ? cast<float>(t.quantity) : -cast<float>(t.quantity);
            }
            prev = px;
            k = k + 1;
        }
        w.fieldNum("roll_tape", Liquidity.roll(prices, count));
        w.fieldNum("kyle_lambda", Liquidity.kyleLambda(dp, sv, count - 1));
        free(cast<*void>(prices));
    }
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

# Body: {"rate","spread_credit","products":[{name, price, vol, price_range,
#        vol_range, multiplier, futures, group, short_option_min}],
#        "options":[{product, type, strike, expiry, qty}]}
frame spanHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(262144)) {
        p.reject(res);
        return;
    }
    local doc: *JsonDoc = &p.body;
    local root: int = doc.root();
    local book: SpanBook;
    book.init(doc.getNum(root, "rate", 0.03), doc.getNum(root, "spread_credit", 0.5));
    local products: int = doc.get(root, "products");
    if (!doc.isKind(products, JsonKind.Array) || (doc.length(products) < 1) || (doc.length(products) > 16)) {
        Reply.error(res, 422, "products must be an array of 1-16 entries");
        return;
    }
    local cur: int = doc.first(products);
    loop (cur >= 0) {
        local price: float = doc.getNum(cur, "price", -1.0);
        local range: float = doc.getNum(cur, "price_range", 0.05);
        if (!(price > 0.0) || !(range > 0.0) || (range > 1.0)) {
            Reply.error(res, 422, "products need price > 0 and price_range in (0, 1]");
            return;
        }
        local name: string = doc.getStr(cur, "name");
        book.addProduct(SpanProduct { name: name == nullptr ? "?" : name, price: price, vol: doc.getNum(cur, "vol", 0.2), price_range: range, vol_range: doc.getNum(cur, "vol_range", 0.04), multiplier: doc.getNum(cur, "multiplier", 1.0), futures: doc.getNum(cur, "futures", 0.0), group: cast<int>(doc.getNum(cur, "group", 0.0)), short_option_min: doc.getNum(cur, "short_option_min", 0.0) });
        cur = doc.next(cur);
    }
    local options: int = doc.get(root, "options");
    if (doc.isKind(options, JsonKind.Array)) {
        cur = doc.first(options);
        loop (cur >= 0) {
            local t: string = doc.getStr(cur, "type");
            local strike: float = doc.getNum(cur, "strike", -1.0);
            local expiry: float = doc.getNum(cur, "expiry", -1.0);
            if ((!Text.equals(t, "call") && !Text.equals(t, "put")) || !(strike > 0.0) || !(expiry > 0.0)) {
                Reply.error(res, 422, "options need type call|put, strike > 0 and expiry > 0");
                return;
            }
            if (book.addOption(SpanOption { product: cast<int>(doc.getNum(cur, "product", -1.0)), is_call: Text.equals(t, "call"), strike: strike, expiry: expiry, quantity: doc.getNum(cur, "qty", 0.0) }) < 0) {
                Reply.error(res, 422, "option product index out of range (or more than 64 options)");
                return;
            }
            cur = doc.next(cur);
        }
    }
    local r: SpanResult;
    book.compute(&r);
    local w: JsonWriter = JsonWriter.new(4096);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("total_margin", r.total);
    w.fieldNum("spread_credit", r.credit);
    w.key("products").beginArray();
    loop (local i: int = 0; i < book.product_count; i = i + 1) {
        w.beginObject();
        w.fieldStr("name", book.products[i].name);
        w.fieldNum("scan_risk", r.scan_risk[i]);
        w.fieldStr("worst_scenario", SpanBook.scenarioLabel(r.worst_scenario[i]));
        w.fieldNum("margin", r.product_margin[i]);
        w.fieldNum("net_delta", r.net_delta[i]);
        w.fieldNumArray("risk_array", &r.scenario_pnl[i * 16], 16);
        w.endObject();
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}
