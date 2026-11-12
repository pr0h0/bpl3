# CSV bar import, option-book scenarios and quasi-Monte Carlo pricing.

import [Request], [Response] from "bpl-express";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonKind] from "../core/json_doc.bpl";
import [Text] from "../core/text.bpl";
import [Clock] from "../core/clock.bpl";
import [CsvTable] from "../core/csv_reader.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [Bar], [BarSeries] from "../series/bars.bpl";
import [OptionBook], [BookPosition], [BookGreeks], [ScenarioGrid], [Sobol] from "../quant/scenario.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "../quant/black_scholes.bpl";

export importBarsHandler;
export bookScenarioHandler;
export qmcHandler;

# Body: CSV with a header naming time, open, high, low, close and optionally volume.
frame importBarsHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local interval: long = p.longInt("interval", 86400, 1, 31536000);
    if (!Text.isSymbol(symbol)) {
        p.fail("symbol", "invalid symbol");
    }
    if ((req.body == nullptr) || (req.body_length == 0) || (Text.length(req.body) != cast<int>(req.body_length))) {
        p.fail("body", "CSV text required");
    }
    if (p.reject(res)) {
        return;
    }
    local t: CsvTable;
    if (!t.parse(req.body, 1000001)) {
        local w: JsonWriter = JsonWriter.new(128);
        w.beginObject().fieldStr("error", t.error).fieldInt("line", cast<long>(t.error_line)).endObject();
        Reply.json(res, 400, &w);
        w.destroy();
        t.destroy();
        return;
    }
    local cols: int[6] = [t.column("time"), t.column("open"), t.column("high"), t.column("low"), t.column("close"), t.column("volume")];
    if ((cols[0] < 0) || (cols[1] < 0) || (cols[2] < 0) || (cols[3] < 0) || (cols[4] < 0)) {
        t.destroy();
        Reply.error(res, 422, "header must name time, open, high, low and close");
        return;
    }
    local bars: BarSeries = BarSeries.new(t.rows, interval);
    local ok: bool = true;
    local bad_row: int = -1;
    loop (local r: int = 1; (r < t.rows) && ok; r = r + 1) {
        local b: Bar;
        b.time = cast<long>(t.number(r, cols[0], &ok));
        b.open = t.number(r, cols[1], &ok);
        b.high = t.number(r, cols[2], &ok);
        b.low = t.number(r, cols[3], &ok);
        b.close = t.number(r, cols[4], &ok);
        b.volume = cols[5] >= 0 ? t.number(r, cols[5], &ok) : 0.0;
        b.trades = 0;
        b.vwap = (b.high + b.low + b.close) / 3.0;
        local consistent: bool = (b.low <= b.open) && (b.low <= b.close) && (b.high >= b.open) && (b.high >= b.close) && (b.low > 0.0);
        local ordered: bool = (bars.len == 0) || (b.time > bars.time[bars.len - 1]);
        if (!ok || !consistent || !ordered) {
            ok = false;
            bad_row = r + 1;
        } else {
            bars.push(b);
        }
    }
    t.destroy();
    if (!ok) {
        bars.destroy();
        local w: JsonWriter = JsonWriter.new(128);
        w.beginObject().fieldStr("error", "invalid bar (numbers, low <= open/close <= high, increasing time)").fieldInt("line", cast<long>(bad_row)).endObject();
        Reply.json(res, 422, &w);
        w.destroy();
        return;
    }
    local n: int = bars.len;
    local s: *AppState = appState();
    s.series.load(symbol, bars);
    local w: JsonWriter = JsonWriter.new(128);
    w.beginObject().fieldStr("symbol", symbol).fieldInt("imported", cast<long>(n)).endObject();
    Reply.json(res, 201, &w);
    w.destroy();
}

# Body: {"rate":0.03, "underlyings":[{"spot":100,"vol":0.2}], "positions":[{"underlying":0,"type":"call|put|stock","strike":100,"expiry":0.5,"qty":-10}],
#        "spot_range":0.2, "vol_range":0.1, "spot_steps":9, "vol_steps":5, "days":0}
frame bookScenarioHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(262144)) {
        p.reject(res);
        return;
    }
    local rate: float = p.num("rate", 0.03, -0.5, 1.0);
    local spot_range: float = p.num("spot_range", 0.2, 0.0, 0.9);
    local vol_range: float = p.num("vol_range", 0.1, 0.0, 2.0);
    local ns: int = p.integer("spot_steps", 9, 1, 101);
    local nv: int = p.integer("vol_steps", 5, 1, 51);
    local days: float = p.num("days", 0.0, 0.0, 3650.0);
    if (p.reject(res)) {
        return;
    }
    local root: int = p.body.root();
    local unds: int = p.body.get(root, "underlyings");
    local pos: int = p.body.get(root, "positions");
    if (!p.body.isKind(unds, JsonKind.Array) || (p.body.length(unds) < 1) || (p.body.length(unds) > 16) || !p.body.isKind(pos, JsonKind.Array) || (p.body.length(pos) < 1) || (p.body.length(pos) > 10000)) {
        Reply.error(res, 422, "need 1-16 underlyings and 1-10000 positions");
        return;
    }
    local book: OptionBook;
    book.init(rate);
    local cur: int = p.body.first(unds);
    loop (cur >= 0) {
        local spot: float = p.body.getNum(cur, "spot", -1.0);
        local vol: float = p.body.getNum(cur, "vol", -1.0);
        if (!(spot > 0.0) || !(vol > 0.0) || (vol > 5.0)) {
            book.destroy();
            Reply.error(res, 422, "each underlying needs spot > 0 and vol in (0, 5]");
            return;
        }
        book.addUnderlying(spot, vol);
        cur = p.body.next(cur);
    }
    cur = p.body.first(pos);
    loop (cur >= 0) {
        local kind_text: string = p.body.getStr(cur, "type");
        local und: float = p.body.getNum(cur, "underlying", 0.0);
        local qty: float = p.body.getNum(cur, "qty", 0.0);
        local is_stock: bool = Text.equals(kind_text, "stock");
        local is_call: bool = Text.equals(kind_text, "call");
        if ((!is_stock && !is_call && !Text.equals(kind_text, "put")) || (und < 0.0) || (cast<int>(und) >= book.underlyings)) {
            book.destroy();
            Reply.error(res, 422, "each position needs type call|put|stock and a valid underlying index");
            return;
        }
        local strike: float = p.body.getNum(cur, "strike", 0.0);
        local expiry: float = p.body.getNum(cur, "expiry", 0.0);
        if (!is_stock && (!(strike > 0.0) || !(expiry > 0.0) || (expiry > 30.0))) {
            book.destroy();
            Reply.error(res, 422, "option positions need strike > 0 and expiry in (0, 30]");
            return;
        }
        book.add(BookPosition { underlying: cast<int>(und), is_option: !is_stock, kind: is_call ? OptionKind.Call : OptionKind.Put, strike: strike, expiry: expiry, quantity: qty });
        cur = p.body.next(cur);
    }
    local started: long = Clock.nowNs();
    local g: BookGreeks = book.greeks();
    local grid: ScenarioGrid = book.grid(-spot_range, spot_range, ns, -vol_range, vol_range, nv, days / 365.0);
    local w: JsonWriter = JsonWriter.new(1024 + (ns * nv * 24));
    w.precision = 10;
    w.beginObject();
    w.key("greeks").beginObject();
    w.fieldNum("value", g.value);
    w.fieldNum("delta_cash", g.delta);
    w.fieldNum("gamma_cash_per_1pct", g.gamma);
    w.fieldNum("vega_per_vol_point", g.vega);
    w.fieldNum("theta_per_day", g.theta);
    w.fieldNum("rho_per_bp", g.rho / 100.0);
    w.endObject();
    w.fieldNumArray("spot_shocks", grid.spot_shocks, ns);
    w.fieldNumArray("vol_shocks", grid.vol_shocks, nv);
    w.key("pnl").beginArray();
    loop (local i: int = 0; i < ns; i = i + 1) {
        w.numArray(grid.pnl + (i * nv), nv);
    }
    w.endArray();
    w.key("worst").beginObject().fieldNum("pnl", grid.worst).fieldNum("spot_shock", grid.worst_spot).fieldNum("vol_shock", grid.worst_vol).endObject();
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    grid.destroy();
    book.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

frame qmcHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local is_put: bool = Text.equals(p.str("type", "call"), "put");
    local spot: float = p.requiredNum("spot", 0.0001, 100000000.0);
    local strike: float = p.requiredNum("strike", 0.0001, 100000000.0);
    local rate: float = p.num("rate", 0.0, -1.0, 1.0);
    local vol: float = p.num("vol", 0.2, 0.0001, 10.0);
    local expiry: float = p.requiredNum("expiry", 0.0001, 100.0);
    local points: int = p.integer("points", 16383, 15, 4194303);
    if (p.reject(res)) {
        return;
    }
    local s: OptionSpec = OptionSpec.new(is_put ? OptionKind.Put : OptionKind.Call, spot, strike, rate, 0.0, vol, expiry);
    local started: long = Clock.nowNs();
    local q: float = Sobol.european(&s, points);
    local exact: float = BlackScholes.price(&s);
    local w: JsonWriter = JsonWriter.new(256);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("qmc_price", q);
    w.fieldNum("black_scholes", exact);
    w.fieldNum("error", q - exact);
    w.fieldInt("points", cast<long>(points));
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}
