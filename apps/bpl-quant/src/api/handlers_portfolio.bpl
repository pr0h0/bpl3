# Stress testing, attribution and rebalancing routes.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Request], [Response] from "bpl-express";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonDoc], [JsonKind] from "../core/json_doc.bpl";
import [Text] from "../core/text.bpl";
import [Clock] from "../core/clock.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [SeriesEntry] from "../series/store.bpl";
import [StressBook], [Scenario], [StressResult], [ReverseStress], [StressVar], [Scenarios], [PositionKind], [FactorBreakdown] from "../stress/stress.bpl";
import [Brinson], [BrinsonResult], [Linking] from "../risk/attribution.bpl";
import [Rebalancer], [RebalanceInput], [RebalancePlan], [PolicyResult] from "../risk/rebalance.bpl";

export stressScenariosHandler;
export stressRunHandler;
export stressDemoHandler;
export brinsonHandler;
export linkHandler;
export rebalanceHandler;
export rebalanceSimulateHandler;

frame writeScenario(w: *JsonWriter, s: *Scenario) {
    w.beginObject();
    w.fieldStr("name", s.name);
    w.fieldNum("market", s.market);
    w.fieldNum("vol_points", s.vol_points);
    w.fieldNum("rate_bp", s.rate_bp);
    w.fieldNum("twist_bp", s.twist_bp);
    w.fieldNum("credit_bp", s.credit_bp);
    w.fieldNum("fx", s.fx[0]);
    w.fieldNum("horizon_days", s.horizon_days);
    w.endObject();
}

frame stressScenariosHandler(_req: *Request, res: *Response) {
    local w: JsonWriter = JsonWriter.new(2048);
    w.beginObject();
    w.key("scenarios").beginArray();
    loop (local i: int = 0; i < Scenarios.count(); i = i + 1) {
        local s: Scenario = Scenarios.at(i);
        writeScenario(&w, &s);
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame writeBreakdown(w: *JsonWriter, f: *FactorBreakdown) {
    w.beginObject();
    w.fieldNum("equity", f.equity);
    w.fieldNum("volatility", f.volatility);
    w.fieldNum("rates", f.rates);
    w.fieldNum("credit", f.credit);
    w.fieldNum("fx", f.fx);
    w.fieldNum("time", f.time);
    w.fieldNum("interaction", f.interaction);
    w.endObject();
}

frame writeResult(w: *JsonWriter, book: *StressBook, r: *StressResult, positions: bool) {
    w.fieldNum("base_value", r.base_value);
    w.fieldNum("stressed_value", r.stressed_value);
    w.fieldNum("pnl", r.pnl);
    w.fieldNum("pnl_pct", r.base_value != 0.0 ? r.pnl / r.base_value : 0.0);
    w.key("by_factor");
    writeBreakdown(w, &r.by_factor);
    if (r.worst_position >= 0) {
        w.fieldStr("worst_position", book.positionLabel(r.worst_position));
    }
    if (positions) {
        w.key("by_position").beginArray();
        loop (local i: int = 0; i < r.count; i = i + 1) {
            w.beginObject();
            w.fieldStr("label", book.positionLabel(i));
            w.fieldStr("kind", StressBook.kindName(book.positions[i].kind));
            w.fieldNum("pnl", r.by_position[i]);
            w.endObject();
        }
        w.endArray();
    }
}

# Builds a book from the JSON body; returns nullptr or an error.
frame parseBook(doc: *JsonDoc, book: *StressBook) ret string {
    local root: int = doc.root();
    book.init(doc.getNum(root, "rate", 0.04), doc.getNum(root, "spread", 0.015), doc.getNum(root, "market_vol", 0.18));
    local unds: int = doc.get(root, "underlyings");
    if (doc.isKind(unds, JsonKind.Array)) {
        local cur: int = doc.first(unds);
        loop (cur >= 0) {
            local spot: float = doc.getNum(cur, "spot", -1.0);
            local vol: float = doc.getNum(cur, "vol", 0.2);
            if (!(spot > 0.0) || !(vol > 0.0) || (vol > 5.0)) {
                return "underlyings need spot > 0 and vol in (0, 5]";
            }
            local name: string = doc.getStr(cur, "name");
            if (book.addUnderlying(name == nullptr ? "U" : name, spot, vol, doc.getNum(cur, "beta", 1.0), doc.getNum(cur, "idio_vol", 0.1)) < 0) {
                return "at most 16 underlyings";
            }
            cur = doc.next(cur);
        }
    }
    local ccys: int = doc.get(root, "currencies");
    if (doc.isKind(ccys, JsonKind.Array)) {
        local cur: int = doc.first(ccys);
        loop (cur >= 0) {
            local rate: float = doc.getNum(cur, "rate", -1.0);
            if (!(rate > 0.0)) {
                return "currencies need rate > 0";
            }
            local name: string = doc.getStr(cur, "name");
            if (book.addCurrency(name == nullptr ? "FX" : name, rate, doc.getNum(cur, "vol", 0.1)) < 0) {
                return "at most 8 currencies";
            }
            cur = doc.next(cur);
        }
    }
    local pos: int = doc.get(root, "positions");
    if (!doc.isKind(pos, JsonKind.Array) || (doc.length(pos) < 1) || (doc.length(pos) > 10000)) {
        return "positions must be an array of 1-10000 entries";
    }
    local cur: int = doc.first(pos);
    loop (cur >= 0) {
        local kind: string = doc.getStr(cur, "type");
        local qty: float = doc.getNum(cur, "qty", 0.0);
        local index: int = cast<int>(doc.getNum(cur, "underlying", 0.0));
        local label: string = doc.getStr(cur, "label");
        if (Text.equals(kind, "equity") || Text.equals(kind, "call") || Text.equals(kind, "put")) {
            if ((index < 0) || (index >= book.underlyings)) {
                return "position underlying index out of range";
            }
            if (Text.equals(kind, "equity")) {
                book.addEquity(index, qty, label);
            } else {
                local strike: float = doc.getNum(cur, "strike", -1.0);
                local expiry: float = doc.getNum(cur, "expiry", -1.0);
                if (!(strike > 0.0) || !(expiry > 0.0) || (expiry > 30.0)) {
                    return "options need strike > 0 and expiry in (0, 30]";
                }
                book.addOption(index, Text.equals(kind, "call"), strike, expiry, qty, label);
            }
        } else if (Text.equals(kind, "bond")) {
            local maturity: float = doc.getNum(cur, "maturity", -1.0);
            local freq: int = cast<int>(doc.getNum(cur, "frequency", 2.0));
            if (!(maturity > 0.0) || (maturity > 50.0) || (freq < 1) || (freq > 12)) {
                return "bonds need maturity in (0, 50] and frequency 1-12";
            }
            book.addBond(doc.getNum(cur, "coupon", 0.0), maturity, freq, doc.getBool(cur, "credit", false), qty, label);
        } else if (Text.equals(kind, "fx")) {
            local ccy: int = cast<int>(doc.getNum(cur, "currency", 0.0));
            if ((ccy < 0) || (ccy >= book.currencies)) {
                return "fx position currency index out of range";
            }
            book.addFx(ccy, qty, label);
        } else {
            return "position type must be equity, call, put, bond or fx";
        }
        cur = doc.next(cur);
    }
    return nullptr;
}

frame parseScenario(doc: *JsonDoc, node: int, out: *Scenario) ret string {
    *out = StressBook.zero();
    if (doc.isKind(node, JsonKind.String)) {
        local i: int = Scenarios.find(doc.str(node));
        if (i < 0) {
            return "unknown scenario name (see /api/stress/scenarios)";
        }
        *out = Scenarios.at(i);
        return nullptr;
    }
    if (!doc.isKind(node, JsonKind.Object)) {
        return "scenario must be a name or an object";
    }
    out.name = "custom";
    out.market = doc.getNum(node, "market", 0.0);
    out.vol_points = doc.getNum(node, "vol_points", 0.0);
    out.vol_skew = doc.getNum(node, "vol_skew", 0.0);
    out.rate_bp = doc.getNum(node, "rate_bp", 0.0);
    out.twist_bp = doc.getNum(node, "twist_bp", 0.0);
    out.credit_bp = doc.getNum(node, "credit_bp", 0.0);
    out.horizon_days = doc.getNum(node, "horizon_days", 0.0);
    local fx: float = doc.getNum(node, "fx", 0.0);
    loop (local i: int = 0; i < 8; i = i + 1) {
        out.fx[i] = fx;
    }
    local idio: int = doc.get(node, "idio");
    if (doc.isKind(idio, JsonKind.Array)) {
        doc.numbers(idio, &out.idio[0], 16);
    }
    if ((out.market < -0.99) || (out.market > 10.0) || (out.horizon_days < 0.0) || (out.horizon_days > 3650.0)) {
        return "market must be in [-0.99, 10] and horizon_days in [0, 3650]";
    }
    return nullptr;
}

# Shared report: one scenario (if given) or every built-in, plus ladders,
# a reverse stress test and Monte Carlo stressed VaR.
frame stressReport(res: *Response, book: *StressBook, doc: *JsonDoc, scenario_node: int, mc_paths: int) {
    local started: long = Clock.nowNs();
    local w: JsonWriter = JsonWriter.new(8192);
    w.precision = 10;
    w.beginObject();
    local base: Scenario = StressBook.zero();
    w.fieldNum("book_value", book.value(&base));
    w.fieldInt("positions", cast<long>(book.count));
    if (scenario_node >= 0) {
        local sc: Scenario;
        local err: string = parseScenario(doc, scenario_node, &sc);
        if (err != nullptr) {
            w.destroy();
            Reply.error(res, 422, err);
            return;
        }
        local r: StressResult = book.run(&sc);
        w.key("scenario");
        writeScenario(&w, &sc);
        writeResult(&w, book, &r, true);
        r.destroy();
    } else {
        w.key("scenarios").beginArray();
        loop (local i: int = 0; i < Scenarios.count(); i = i + 1) {
            local sc: Scenario = Scenarios.at(i);
            local r: StressResult = book.run(&sc);
            w.beginObject();
            w.fieldStr("name", sc.name);
            writeResult(&w, book, &r, false);
            w.endObject();
            r.destroy();
        }
        w.endArray();
    }
    local eq: float[13];
    book.equityLadder(-0.3, 0.3, 13, 0.5, &eq[0]);
    w.key("equity_ladder").beginObject();
    w.fieldNum("from", -0.3);
    w.fieldNum("to", 0.3);
    w.fieldNumArray("pnl", &eq[0], 13);
    w.endObject();
    local rl: float[9];
    book.rateLadder(-200.0, 200.0, 9, &rl[0]);
    w.key("rate_ladder_bp").beginObject();
    w.fieldNum("from", -200.0);
    w.fieldNum("to", 200.0);
    w.fieldNumArray("pnl", &rl[0], 9);
    w.endObject();
    local loss: float = doc != nullptr ? doc.getNum(doc.root(), "reverse_loss", 0.0) : 0.0;
    if (!(loss > 0.0)) {
        loss = 0.1 * Math.abs(book.value(&base));
    }
    local unit: Scenario = StressBook.zero();
    unit.market = -0.1;
    unit.vol_points = 5.0;
    unit.credit_bp = 50.0;
    unit.name = "unit_crash";
    local rev: ReverseStress = book.reverse(&unit, loss, 9.9);
    w.key("reverse").beginObject();
    w.fieldNum("target_loss", loss);
    w.fieldBool("found", rev.found);
    w.fieldNum("scale", rev.scale);
    w.fieldNum("market_move", -0.1 * rev.scale);
    w.fieldNum("pnl", rev.pnl);
    w.fieldInt("evaluations", cast<long>(rev.iterations));
    w.endObject();
    if (mc_paths > 0) {
        local mc: StressVar = book.monteCarlo(mc_paths, 10.0, 0.99, 5.0, cast<u64>(17));
        w.key("monte_carlo").beginObject();
        w.fieldInt("paths", cast<long>(mc.paths));
        w.fieldNum("horizon_days", 10.0);
        w.fieldNum("var_99", mc.var);
        w.fieldNum("es_99", mc.es);
        w.fieldNum("worst", mc.worst);
        w.fieldNum("mean_pnl", mc.mean);
        w.endObject();
    }
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame stressRunHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(1048576)) {
        p.reject(res);
        return;
    }
    local paths: int = p.integer("mc_paths", 5000, 0, 200000);
    if (p.reject(res)) {
        return;
    }
    local book: StressBook;
    local err: string = parseBook(&p.body, &book);
    if (err != nullptr) {
        book.destroy();
        Reply.error(res, 422, err);
        return;
    }
    local scenario: int = p.body.get(p.body.root(), "scenario");
    stressReport(res, &book, &p.body, scenario, paths);
    book.destroy();
}

# Stress of a book made from the live series: long 1,000 shares of each
# requested symbol (latest close), a protective put on the first, and a
# bond ladder.
frame stressDemoHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local listed: string = p.str("symbols", "ACME,GLOBEX,HOOLI");
    local paths: int = p.integer("mc_paths", 5000, 0, 200000);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local book: StressBook;
    book.init(0.04, 0.015, 0.18);
    local n: int = Text.length(listed);
    local start: int = 0;
    loop (local i: int = 0; i <= n; i = i + 1) {
        if ((i == n) || (listed[i] == ',')) {
            if (i > start) {
                local name: string = Text.copyN(cast<string>(cast<*char>(listed) + start), i - start);
                local e: *SeriesEntry = s.series.find(name);
                if ((e != nullptr) && (e.bars.len > 1) && (book.underlyings < 16)) {
                    local stable: string = s.series.symbolAt(s.series.names.find(name));
                    local u: int = book.addUnderlying(stable, e.bars.close[e.bars.len - 1], 0.25, 1.0 + (0.1 * cast<float>(book.underlyings)), 0.1);
                    book.addEquity(u, 1000.0, stable);
                }
                Text.release(name);
            }
            start = i + 1;
        }
    }
    if (book.underlyings == 0) {
        book.destroy();
        Reply.error(res, 422, "symbols must name at least one series with history");
        return;
    }
    book.addOption(0, false, book.spots[0] * 0.9, 0.5, 1000.0, "protective put");
    book.addBond(0.04, 2.0, 2, false, 200.0, "2y government");
    book.addBond(0.042, 10.0, 2, false, 200.0, "10y government");
    book.addBond(0.06, 5.0, 2, true, 200.0, "5y corporate");
    stressReport(res, &book, nullptr, -1, paths);
    book.destroy();
}

# Body: {"method":"fachler|bhb","sectors":[{"name","wp","wb","rp","rb"}]}
frame brinsonHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(262144)) {
        p.reject(res);
        return;
    }
    local options: string[2] = ["fachler", "bhb"];
    local method: string = p.oneOf("method", "fachler", &options[0], 2);
    if (p.reject(res)) {
        return;
    }
    local sectors: int = p.body.get(p.body.root(), "sectors");
    local n: int = p.body.isKind(sectors, JsonKind.Array) ? p.body.length(sectors) : 0;
    if ((n < 1) || (n > 1000)) {
        Reply.error(res, 422, "sectors must be an array of 1-1000 entries");
        return;
    }
    local wp: *float = cast<*float>(malloc(cast<long>(n * 4) * sizeof(float)));
    local wb: *float = wp + n;
    local rp: *float = wb + n;
    local rb: *float = rp + n;
    local cur: int = p.body.first(sectors);
    local i: int = 0;
    loop (cur >= 0) {
        wp[i] = p.body.getNum(cur, "wp", 0.0);
        wb[i] = p.body.getNum(cur, "wb", 0.0);
        rp[i] = p.body.getNum(cur, "rp", 0.0);
        rb[i] = p.body.getNum(cur, "rb", 0.0);
        i = i + 1;
        cur = p.body.next(cur);
    }
    local r: BrinsonResult = Brinson.single(wp, wb, rp, rb, n, Text.equals(method, "fachler"));
    local w: JsonWriter = JsonWriter.new(512 + (n * 220));
    w.precision = 10;
    w.beginObject();
    w.fieldStr("method", method);
    w.fieldNum("portfolio_return", r.portfolio_return);
    w.fieldNum("benchmark_return", r.benchmark_return);
    w.fieldNum("active_return", r.active_return);
    w.fieldNum("allocation", r.allocation);
    w.fieldNum("selection", r.selection);
    w.fieldNum("interaction", r.interaction);
    if (r.weight_error > 0.000001) {
        w.fieldStr("warning", "weights do not sum to one; add a cash sector");
    }
    w.key("sectors").beginArray();
    cur = p.body.first(sectors);
    loop (local k: int = 0; k < n; k = k + 1) {
        w.beginObject();
        local name: string = p.body.getStr(cur, "name");
        w.fieldStr("name", name == nullptr ? "?" : name);
        w.fieldNum("allocation", r.sectors[k].allocation);
        w.fieldNum("selection", r.sectors[k].selection);
        w.fieldNum("interaction", r.sectors[k].interaction);
        w.fieldNum("total", r.sectors[k].total);
        w.fieldNum("contribution", r.sectors[k].contribution_portfolio);
        w.endObject();
        cur = p.body.next(cur);
    }
    w.endArray();
    w.endObject();
    r.destroy();
    free(cast<*void>(wp));
    Reply.ok(res, &w);
    w.destroy();
}

# Body: {"portfolio":[r1,...], "benchmark":[b1,...], "effects":{"allocation":[...], ...}, "method":"carino|menchero"}
frame linkHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(262144)) {
        p.reject(res);
        return;
    }
    local options: string[2] = ["carino", "menchero"];
    local method: string = p.oneOf("method", "carino", &options[0], 2);
    if (p.reject(res)) {
        return;
    }
    local root: int = p.body.root();
    local pn: int = p.body.length(p.body.get(root, "portfolio"));
    if ((pn < 1) || (pn > 10000) || (pn != p.body.length(p.body.get(root, "benchmark")))) {
        Reply.error(res, 422, "portfolio and benchmark must be arrays of the same length (1-10000)");
        return;
    }
    local rp: *float = cast<*float>(malloc(cast<long>(pn * 4) * sizeof(float)));
    local rb: *float = rp + pn;
    local k: *float = rb + pn;
    local scratch: *float = k + pn;
    p.body.numbers(p.body.get(root, "portfolio"), rp, pn);
    p.body.numbers(p.body.get(root, "benchmark"), rb, pn);
    if (Text.equals(method, "carino")) {
        Linking.carino(rp, rb, pn, k);
    } else {
        Linking.menchero(rp, rb, pn, k);
    }
    local total_p: float = Linking.compound(rp, pn);
    local total_b: float = Linking.compound(rb, pn);
    local w: JsonWriter = JsonWriter.new(512 + (pn * 40));
    w.precision = 12;
    w.beginObject();
    w.fieldStr("method", method);
    w.fieldNum("portfolio_return", total_p);
    w.fieldNum("benchmark_return", total_b);
    w.fieldNum("active_return", total_p - total_b);
    w.fieldNumArray("factors", k, pn);
    loop (local t: int = 0; t < pn; t = t + 1) {
        scratch[t] = rp[t] - rb[t];
    }
    w.fieldNum("linked_active", Linking.link(scratch, k, pn));
    local effects: int = p.body.get(root, "effects");
    if (p.body.isKind(effects, JsonKind.Object)) {
        w.key("linked_effects").beginObject();
        local cur: int = p.body.first(effects);
        loop (cur >= 0) {
            if (p.body.numbers(cur, scratch, pn) == pn) {
                w.fieldNum(p.body.keyOf(cur), Linking.link(scratch, k, pn));
            }
            cur = p.body.next(cur);
        }
        w.endObject();
    }
    w.endObject();
    free(cast<*void>(rp));
    Reply.ok(res, &w);
    w.destroy();
}

# Body: {"holdings":[{"symbol","shares","lot","price"}], "targets":{"SYM":w}, "cash",
#        "band", "min_trade", "max_turnover", "commission_bps", "cash_buffer"}
# Prices default to the latest close of the symbol's series.
frame rebalanceHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(262144)) {
        p.reject(res);
        return;
    }
    local cash: float = p.num("cash", 0.0, 0.0, 1000000000000.0);
    local band: float = p.num("band", 0.0, 0.0, 1.0);
    local min_trade: float = p.num("min_trade", 0.0, 0.0, 1000000000.0);
    local max_turnover: float = p.num("max_turnover", 0.0, 0.0, 1.0);
    local fee: float = p.num("commission_bps", 0.0, 0.0, 1000.0);
    local buffer: float = p.num("cash_buffer", 0.0, 0.0, 0.5);
    if (p.reject(res)) {
        return;
    }
    local root: int = p.body.root();
    local holdings: int = p.body.get(root, "holdings");
    local targets: int = p.body.get(root, "targets");
    local n: int = p.body.isKind(holdings, JsonKind.Array) ? p.body.length(holdings) : 0;
    if ((n < 1) || (n > 500) || !p.body.isKind(targets, JsonKind.Object)) {
        Reply.error(res, 422, "need 1-500 holdings and a targets object");
        return;
    }
    local s: *AppState = appState();
    local data: *float = cast<*float>(malloc(cast<long>(n * 4) * sizeof(float)));
    local input: RebalanceInput = RebalanceInput { count: n, shares: data, prices: data + n, targets: data + (2 * n), lots: data + (3 * n), cash: cash, band: band, min_trade: min_trade, max_turnover: max_turnover, commission_bps: fee, cash_buffer: buffer };
    local names: *string = cast<*string>(malloc(cast<long>(n) * sizeof(string)));
    local cur: int = p.body.first(holdings);
    local i: int = 0;
    local target_sum: float = 0.0;
    local problem: string = nullptr;
    loop ((cur >= 0) && (problem == nullptr)) {
        local sym: string = p.body.getStr(cur, "symbol");
        names[i] = sym == nullptr ? "?" : sym;
        input.shares[i] = p.body.getNum(cur, "shares", 0.0);
        input.lots[i] = p.body.getNum(cur, "lot", 1.0);
        local price: float = p.body.getNum(cur, "price", 0.0);
        if (!(price > 0.0) && (sym != nullptr)) {
            local e: *SeriesEntry = s.series.find(sym);
            if ((e != nullptr) && (e.bars.len > 0)) {
                price = e.bars.close[e.bars.len - 1];
            }
        }
        input.prices[i] = price;
        input.targets[i] = p.body.getNum(targets, names[i], 0.0);
        target_sum = target_sum + input.targets[i];
        if (!(price > 0.0) || (input.shares[i] < 0.0) || !(input.lots[i] > 0.0) || (input.targets[i] < 0.0)) {
            problem = "each holding needs a symbol with a known price (or price > 0), shares >= 0, lot > 0 and target >= 0";
        }
        i = i + 1;
        cur = p.body.next(cur);
    }
    if ((problem == nullptr) && (target_sum > 1.000001)) {
        problem = "targets sum to more than 1";
    }
    if (problem != nullptr) {
        free(cast<*void>(data));
        free(cast<*void>(names));
        Reply.error(res, 422, problem);
        return;
    }
    local plan: RebalancePlan = Rebalancer.plan(&input);
    local w: JsonWriter = JsonWriter.new(512 + (n * 200));
    w.precision = 10;
    w.beginObject();
    w.fieldNum("value", plan.value);
    w.key("trades").beginArray();
    loop (local k: int = 0; k < n; k = k + 1) {
        w.beginObject();
        w.fieldStr("symbol", names[k]);
        w.fieldNum("price", input.prices[k]);
        w.fieldNum("shares", input.shares[k]);
        w.fieldNum("trade", plan.trades[k]);
        w.fieldStr("side", plan.trades[k] > 0.0 ? "buy" : (plan.trades[k] < 0.0 ? "sell" : "none"));
        w.fieldNum("target", input.targets[k]);
        w.fieldNum("weight_before", plan.pre_weights[k]);
        w.fieldNum("weight_after", plan.post_weights[k]);
        w.endObject();
    }
    w.endArray();
    w.fieldNum("bought", plan.bought);
    w.fieldNum("sold", plan.sold);
    w.fieldNum("turnover", plan.turnover);
    w.fieldNum("commission", plan.commission);
    w.fieldNum("cash_after", plan.cash_after);
    w.fieldNum("tracking_before", plan.tracking_before);
    w.fieldNum("tracking_after", plan.tracking_after);
    w.fieldNum("turnover_scale", plan.scaled_by);
    w.fieldInt("inside_band", cast<long>(plan.skipped_band));
    w.fieldInt("below_min_trade", cast<long>(plan.skipped_small));
    w.endObject();
    plan.destroy();
    free(cast<*void>(data));
    free(cast<*void>(names));
    Reply.ok(res, &w);
    w.destroy();
}

# Calendar vs threshold rebalancing over the symbols' aligned closes.
frame rebalanceSimulateHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local listed: string = p.str("symbols", "ACME,GLOBEX");
    local weights_text: string = p.str("weights", nullptr);
    local period: int = p.integer("period", 21, 1, 10000);
    local band: float = p.num("band", 0.05, 0.001, 1.0);
    local fee: float = p.num("commission_bps", 5.0, 0.0, 1000.0);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local entries: *SeriesEntry[16];
    local names: string[16];
    local n: int = 0;
    local len: int = Text.length(listed);
    local start: int = 0;
    local unknown: bool = false;
    loop (local i: int = 0; i <= len; i = i + 1) {
        if ((i == len) || (listed[i] == ',')) {
            if ((i > start) && (n < 16)) {
                local name: string = Text.copyN(cast<string>(cast<*char>(listed) + start), i - start);
                local e: *SeriesEntry = s.series.find(name);
                if (e == nullptr) {
                    unknown = true;
                } else {
                    entries[n] = e;
                    names[n] = s.series.symbolAt(s.series.names.find(name));
                    n = n + 1;
                }
                Text.release(name);
            }
            start = i + 1;
        }
    }
    if (unknown || (n < 1)) {
        Reply.error(res, 422, "symbols must name known series");
        return;
    }
    local weights: float[16];
    loop (local i: int = 0; i < n; i = i + 1) {
        weights[i] = 1.0 / cast<float>(n);
    }
    if (weights_text != nullptr) {
        local k: int = 0;
        local wl: int = Text.length(weights_text);
        local ws: int = 0;
        local total: float = 0.0;
        loop (local i: int = 0; i <= wl; i = i + 1) {
            if ((i == wl) || (weights_text[i] == ',')) {
                if ((i > ws) && (k < 16)) {
                    local part: string = Text.copyN(cast<string>(cast<*char>(weights_text) + ws), i - ws);
                    weights[k] = Text.parseFloatOr(part, -1.0);
                    total = total + weights[k];
                    Text.release(part);
                    k = k + 1;
                }
                ws = i + 1;
            }
        }
        if ((k != n) || (Math.abs(total - 1.0) > 0.000001)) {
            Reply.error(res, 422, "weights must give one value per symbol and sum to 1");
            return;
        }
    }
    local bars: int = entries[0].bars.len;
    loop (local i: int = 1; i < n; i = i + 1) {
        if (entries[i].bars.len < bars) {
            bars = entries[i].bars.len;
        }
    }
    if (bars < 2) {
        Reply.error(res, 422, "not enough history");
        return;
    }
    local path: *float = cast<*float>(malloc(cast<long>(bars * n) * sizeof(float)));
    loop (local t: int = 0; t < bars; t = t + 1) {
        loop (local i: int = 0; i < n; i = i + 1) {
            local b: int = (entries[i].bars.len - bars) + t;
            path[(t * n) + i] = entries[i].bars.close[b];
        }
    }
    local never: PolicyResult = Rebalancer.simulate(path, bars, n, &weights[0], 1000000.0, 0, 0, 0.0, fee);
    local calendar: PolicyResult = Rebalancer.simulate(path, bars, n, &weights[0], 1000000.0, 0, period, 0.0, fee);
    local threshold: PolicyResult = Rebalancer.simulate(path, bars, n, &weights[0], 1000000.0, 1, 0, band, fee);
    free(cast<*void>(path));
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.key("symbols").beginArray();
    loop (local i: int = 0; i < n; i = i + 1) {
        w.str(names[i]);
    }
    w.endArray();
    w.fieldNumArray("weights", &weights[0], n);
    w.fieldInt("bars", cast<long>(bars));
    local labels: string[3] = ["buy_and_hold", "calendar", "threshold"];
    local results: PolicyResult[3] = [never, calendar, threshold];
    w.key("policies").beginObject();
    loop (local i: int = 0; i < 3; i = i + 1) {
        w.key(labels[i]).beginObject();
        w.fieldInt("rebalances", cast<long>(results[i].rebalances));
        w.fieldNum("turnover", results[i].turnover);
        w.fieldNum("commission", results[i].commission);
        w.fieldNum("tracking_error", results[i].tracking_error);
        w.fieldNum("max_drift", results[i].max_drift);
        w.fieldNum("total_return", results[i].total_return);
        w.endObject();
    }
    w.endObject();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}
