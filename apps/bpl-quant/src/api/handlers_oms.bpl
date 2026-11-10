# OMS desk routes: risk-checked journaled orders, limits, kill switch,
# positions, breaches, journal paging, snapshots and recovery checks.

import [Request], [Response] from "bpl-express";
import [JsonWriter] from "../core/json_writer.bpl";
import [Text], [ParsedLong] from "../core/text.bpl";
import [Clock] from "../core/clock.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [Listing] from "./listing.bpl";
import [FValue] from "./filter.bpl";
import [Engine], [OrderRequest], [ExecReport] from "../market/engine.bpl";
import [Order], [Side], [OrderType], [TimeInForce], [OrderStatus], [RejectReason], [Ticks] from "../market/order.bpl";
import snprintf from "std/c.bpl";
import [OrderBook], [BookSide] from "../market/book.bpl";
import [RiskEngine], [RiskRule], [AccountLimits], [RiskDecision], [RiskBreach], [RiskExposure] from "../risk/limits.bpl";
import [JournalCodes] from "../journal/journal.bpl";
import [Desk], [DeskResult], [RecoveryCheck] from "../oms/desk.bpl";
import [IVec] from "../core/vec.bpl";

export omsSubmitHandler;
export omsCancelHandler;
export omsReplaceHandler;
export omsOrdersHandler;
export omsPositionsHandler;
export omsBreachesHandler;
export omsGetLimitsHandler;
export omsSetLimitsHandler;
export omsKillHandler;
export omsReviveHandler;
export omsRestrictHandler;
export omsJournalHandler;
export omsSnapshotHandler;
export omsRecoverHandler;
export omsCompactHandler;
export omsStatsHandler;
export desk;

frame desk() ret *Desk {
    local s: *AppState = appState();
    s.desk.advance(Clock.wallMs());
    return s.desk;
}

frame writeDecision(w: *JsonWriter, d: *RiskDecision) {
    w.key("risk").beginObject();
    w.fieldStr("rule", RiskEngine.ruleName(d.rule));
    w.fieldBool("passed", d.rule == RiskRule.Pass);
    if (d.rule != RiskRule.Pass) {
        w.fieldStr("message", d.message);
        w.fieldNum("value", d.value);
        w.fieldNum("limit", d.limit);
    }
    w.endObject();
}

frame writeExec(w: *JsonWriter, r: *ExecReport) {
    w.fieldInt("order_id", r.order_id);
    w.fieldStr("status", Ticks.statusName(r.status));
    if (r.reason != RejectReason.None) {
        w.fieldStr("reason", Ticks.rejectName(r.reason));
    }
    w.fieldInt("filled", r.filled);
    w.fieldInt("remaining", r.remaining);
    w.fieldNum("avg_price", r.averagePrice());
    w.fieldInt("trades", cast<long>(r.trades));
    w.fieldBool("resting", r.resting);
}

# Body: {"symbol","account","side","type","tif","price","stop_price","qty"}
frame omsSubmitHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    p.parseBody(8192);
    if (p.reject(res)) {
        return;
    }
    local d: *Desk = desk();
    local symbol: string = p.symbol("symbol");
    local account: string = p.requiredStr("account", 64);
    local side_text: string = p.requiredStr("side", 8);
    local type_text: string = p.str("type", "limit");
    local tif_text: string = p.str("tif", "gtc");
    local qty: long = p.longInt("qty", 0, 1, 1000000000);
    if (!p.present("qty")) {
        p.fail("qty", "is required");
    }
    local order: OrderRequest = OrderRequest.limit(0, 0, Side.Buy, 0, qty);
    if (!Ticks.parseSide(side_text, &order.side)) {
        p.fail("side", "must be buy or sell");
    }
    if (!Ticks.parseType(type_text, &order.kind)) {
        p.fail("type", "must be limit, market, stop or stop_limit");
    }
    if (!Ticks.parseTif(tif_text, &order.tif)) {
        p.fail("tif", "must be gtc, ioc, fok or day");
    }
    local priced: bool = (order.kind == OrderType.Limit) || (order.kind == OrderType.StopLimit);
    if (priced) {
        order.price = Ticks.fromFloat(p.requiredNum("price", 0.0001, 10000000.0));
    }
    if ((order.kind == OrderType.Stop) || (order.kind == OrderType.StopLimit)) {
        order.stop_price = Ticks.fromFloat(p.requiredNum("stop_price", 0.0001, 10000000.0));
    }
    if (order.kind == OrderType.Market) {
        order.tif = TimeInForce.ImmediateOrCancel;
    }
    if (p.reject(res)) {
        return;
    }
    order.symbol = d.symbolOf(symbol);
    if (order.symbol < 0) {
        Reply.notFound(res, "unknown symbol");
        return;
    }
    order.account = d.accountId(account);
    local result: DeskResult = d.submit(&order);
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    writeDecision(&w, &result.decision);
    if (result.accepted) {
        writeExec(&w, &result.report);
    }
    w.fieldInt("journal_seq", d.venue.journal.next_seq - 1);
    w.endObject();
    local status: int = 201;
    if (!result.accepted) {
        status = 403;
    } else if (result.report.status == OrderStatus.Rejected) {
        status = 422;
    }
    Reply.json(res, status, &w);
    w.destroy();
}

frame idParam(req: *Request, res: *Response, out: *long) ret bool {
    local p: Params = Params.of(req);
    local parsed: ParsedLong = Text.parseLong(p.path("id"));
    if (!parsed.ok || (parsed.value <= 0)) {
        Reply.error(res, 400, "order id must be a positive integer");
        return false;
    }
    *out = parsed.value;
    return true;
}

frame omsCancelHandler(req: *Request, res: *Response) {
    local id: long = 0;
    if (!idParam(req, res, &id)) {
        return;
    }
    local d: *Desk = desk();
    if (!d.cancel(id)) {
        Reply.notFound(res, "order is not open");
        return;
    }
    local w: JsonWriter = JsonWriter.new(64);
    w.beginObject().fieldInt("order_id", id).fieldStr("status", "cancelled").fieldInt("journal_seq", d.venue.journal.next_seq - 1).endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame omsReplaceHandler(req: *Request, res: *Response) {
    local id: long = 0;
    if (!idParam(req, res, &id)) {
        return;
    }
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    p.parseBody(4096);
    local price: float = p.requiredNum("price", 0.0001, 10000000.0);
    local qty: long = p.longInt("qty", 0, 1, 1000000000);
    if (!p.present("qty")) {
        p.fail("qty", "is required");
    }
    if (p.reject(res)) {
        return;
    }
    local d: *Desk = desk();
    if (d.venue.engine.findOrder(id) == nullptr) {
        Reply.notFound(res, "order is not open");
        return;
    }
    local decision: RiskDecision;
    local r: ExecReport = d.replace(id, Ticks.fromFloat(price), qty, &decision);
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    writeDecision(&w, &decision);
    if (decision.rule == RiskRule.Pass) {
        writeExec(&w, &r);
    }
    w.endObject();
    local status: int = 200;
    if (decision.rule != RiskRule.Pass) {
        status = 403;
    } else if (r.status == OrderStatus.Rejected) {
        status = 422;
    }
    Reply.json(res, status, &w);
    w.destroy();
}

global open_order_fields: string[10] = ["id", "symbol", "account", "side", "type", "price", "qty", "remaining", "filled", "time"];

# Open orders on the desk in book priority (bids then asks per symbol).
frame collectOpen(e: *Engine) ret IVec {
    local idx: IVec = IVec.new(64);
    loop (local s: int = 0; s < e.book_count; s = s + 1) {
        local b: *OrderBook = e.books + s;
        loop (local side: int = 0; side < 2; side = side + 1) {
            local bs: *BookSide = side == 0 ? &b.bids : &b.asks;
            loop (local l: int = 0; l < bs.count; l = l + 1) {
                local cur: int = bs.levels[l].head;
                loop (cur >= 0) {
                    idx.push(cur);
                    cur = e.pool.at(cur).next;
                }
            }
        }
    }
    loop (local i: int = 0; i < e.stops.len; i = i + 1) {
        idx.push(e.stops.data[i]);
    }
    return idx;
}

frame openField(e: *Engine, o: *Order, field: int) ret FValue {
    if (field == 0) {
        return FValue.number(cast<float>(o.id));
    }
    if (field == 1) {
        return FValue.text(e.symbolName(o.symbol));
    }
    if (field == 2) {
        return FValue.text(e.accounts.name(o.account));
    }
    if (field == 3) {
        return FValue.text(Ticks.sideName(o.side));
    }
    if (field == 4) {
        return FValue.text(Ticks.typeName(o.kind));
    }
    if (field == 5) {
        return FValue.number(Ticks.toFloat(o.price));
    }
    if (field == 6) {
        return FValue.number(cast<float>(o.quantity));
    }
    if (field == 7) {
        return FValue.number(cast<float>(o.remaining));
    }
    if (field == 8) {
        return FValue.number(cast<float>(o.filled()));
    }
    return FValue.number(cast<float>(o.timestamp));
}

frame omsOrdersHandler(req: *Request, res: *Response) {
    local d: *Desk = desk();
    local e: *Engine = &d.venue.engine;
    local idx: IVec = collectOpen(e);
    local pool: *IVec = &idx;
    defer pool.destroy();
    local get: Lambda<FValue>(int, int) = |row: int, field: int| ret FValue {
        return openField(e, e.pool.at(pool.data[row]), field);
    };
    local q: Listing = Listing.run(req, idx.len, &open_order_fields[0], 10, get, 100, 1000);
    local owner: *Listing = &q;
    defer owner.destroy();
    if (q.reject(res)) {
        return;
    }
    local w: JsonWriter = JsonWriter.new(256 + (q.count * 180));
    w.beginObject();
    q.writePaging(&w);
    w.key("orders").beginArray();
    loop (local i: int = 0; i < q.count; i = i + 1) {
        Listing.writeRow(&w, &open_order_fields[0], 10, q.rows[i], get);
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

global position_fields: string[9] = ["account", "symbol", "position", "open_buy", "open_sell", "cash", "traded", "mark", "pnl"];

frame positionField(d: *Desk, x: *RiskExposure, field: int) ret FValue {
    if (field == 0) {
        return FValue.text(d.accountName(x.account));
    }
    if (field == 1) {
        return FValue.text(d.venue.engine.symbolName(x.symbol));
    }
    if (field == 2) {
        return FValue.number(cast<float>(x.position));
    }
    if (field == 3) {
        return FValue.number(cast<float>(x.open_buy));
    }
    if (field == 4) {
        return FValue.number(cast<float>(x.open_sell));
    }
    if (field == 5) {
        return FValue.number(x.cash);
    }
    if (field == 6) {
        return FValue.number(cast<float>(x.traded));
    }
    local mark: float = Ticks.toFloat(d.risk.markPrice(x.symbol));
    if (field == 7) {
        return FValue.number(mark);
    }
    return FValue.number(x.cash + (cast<float>(x.position) * mark));
}

frame omsPositionsHandler(req: *Request, res: *Response) {
    local d: *Desk = desk();
    local get: Lambda<FValue>(int, int) = |row: int, field: int| ret FValue {
        return positionField(d, d.risk.exposureAt(row), field);
    };
    local q: Listing = Listing.run(req, d.risk.exposureCount(), &position_fields[0], 9, get, 100, 1000);
    local owner: *Listing = &q;
    defer owner.destroy();
    if (q.reject(res)) {
        return;
    }
    local w: JsonWriter = JsonWriter.new(256 + (q.count * 200));
    w.beginObject();
    q.writePaging(&w);
    w.key("positions").beginArray();
    loop (local i: int = 0; i < q.count; i = i + 1) {
        Listing.writeRow(&w, &position_fields[0], 9, q.rows[i], get);
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

global breach_fields: string[6] = ["account", "symbol", "rule", "value", "limit", "time_ms"];

frame breachField(d: *Desk, b: *RiskBreach, field: int) ret FValue {
    if (field == 0) {
        return FValue.text(d.accountName(b.account));
    }
    if (field == 1) {
        return FValue.text(d.venue.engine.symbolName(b.symbol));
    }
    if (field == 2) {
        return FValue.text(RiskEngine.ruleName(b.rule));
    }
    if (field == 3) {
        return FValue.number(b.value);
    }
    if (field == 4) {
        return FValue.number(b.limit);
    }
    return FValue.number(cast<float>(b.time_ms));
}

frame omsBreachesHandler(req: *Request, res: *Response) {
    local d: *Desk = desk();
    local get: Lambda<FValue>(int, int) = |row: int, field: int| ret FValue {
        return breachField(d, d.risk.breachAt(row), field);
    };
    local q: Listing = Listing.run(req, d.risk.breach_count, &breach_fields[0], 6, get, 50, 256);
    local owner: *Listing = &q;
    defer owner.destroy();
    if (q.reject(res)) {
        return;
    }
    local w: JsonWriter = JsonWriter.new(256 + (q.count * 160));
    w.beginObject();
    w.fieldInt("breaches_total", d.risk.breach_total);
    q.writePaging(&w);
    w.key("breaches").beginArray();
    loop (local i: int = 0; i < q.count; i = i + 1) {
        Listing.writeRow(&w, &breach_fields[0], 6, q.rows[i], get);
    }
    w.endArray();
    w.key("by_rule").beginObject();
    loop (local r: int = 1; r < 11; r = r + 1) {
        local rule: RiskRule = RiskEngine.ruleAt(r);
        w.fieldInt(RiskEngine.ruleName(rule), d.risk.ruleCount(rule));
    }
    w.endObject();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame writeLimits(w: *JsonWriter, l: *AccountLimits) {
    w.beginObject();
    w.fieldInt("max_order_qty", l.max_order_qty);
    w.fieldNum("max_order_notional", l.max_order_notional);
    w.fieldInt("max_position", l.max_position);
    w.fieldNum("max_gross_notional", l.max_gross_notional);
    w.fieldInt("max_open_orders", cast<long>(l.max_open_orders));
    w.fieldNum("rate_per_sec", l.rate_per_sec);
    w.fieldNum("burst", l.burst);
    w.fieldInt("collar_bps", l.collar_bps);
    w.fieldNum("max_loss", l.max_loss);
    w.endObject();
}

frame accountParam(req: *Request, res: *Response, d: *Desk) ret int {
    local p: Params = Params.of(req);
    local name: string = p.path("account");
    if (Text.isEmpty(name) || (Text.length(name) > 64)) {
        Reply.error(res, 400, "account name required (max 64 chars)");
        return -1;
    }
    return d.accountId(name);
}

frame omsGetLimitsHandler(req: *Request, res: *Response) {
    local d: *Desk = desk();
    local account: int = accountParam(req, res, d);
    if (account < 0) {
        return;
    }
    local limits: AccountLimits = d.risk.limitsFor(account);
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    w.fieldStr("account", d.accountName(account));
    w.key("limits");
    writeLimits(&w, &limits);
    w.fieldBool("killed", d.risk.isKilled(account));
    w.fieldInt("open_orders", cast<long>(d.risk.openOrders(account)));
    w.fieldNum("open_notional", d.risk.openNotional(account));
    w.fieldNum("gross_position", d.risk.grossPosition(account));
    w.fieldNum("pnl", d.risk.pnl(account));
    w.fieldNum("rate_tokens", d.risk.tokensFor(account));
    w.fieldInt("checks", d.risk.checksFor(account));
    w.fieldInt("rejects", d.risk.rejectsFor(account));
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

# Body: any subset of the limit fields; the rest keep their values.
frame omsSetLimitsHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    p.parseBody(4096);
    if (p.reject(res)) {
        return;
    }
    local d: *Desk = desk();
    local account: int = accountParam(req, res, d);
    if (account < 0) {
        return;
    }
    local l: AccountLimits = d.risk.limitsFor(account);
    l.max_order_qty = p.longInt("max_order_qty", l.max_order_qty, 1, 1000000000);
    l.max_order_notional = p.num("max_order_notional", l.max_order_notional, 1.0, 1000000000000.0);
    l.max_position = p.longInt("max_position", l.max_position, 1, 1000000000000);
    l.max_gross_notional = p.num("max_gross_notional", l.max_gross_notional, 1.0, 1000000000000000.0);
    l.max_open_orders = p.integer("max_open_orders", l.max_open_orders, 1, 1000000);
    l.rate_per_sec = p.num("rate_per_sec", l.rate_per_sec, 0.001, 1000000.0);
    l.burst = p.num("burst", l.burst, 1.0, 1000000.0);
    l.collar_bps = p.longInt("collar_bps", l.collar_bps, 0, 100000);
    l.max_loss = p.num("max_loss", l.max_loss, 0.0, 1000000000000.0);
    if (p.reject(res)) {
        return;
    }
    d.setLimits(account, l);
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    w.fieldStr("account", d.accountName(account));
    w.key("limits");
    writeLimits(&w, &l);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame omsKillHandler(req: *Request, res: *Response) {
    local d: *Desk = desk();
    local account: int = accountParam(req, res, d);
    if (account < 0) {
        return;
    }
    local n: int = d.kill(account);
    local w: JsonWriter = JsonWriter.new(128);
    w.beginObject().fieldStr("account", d.accountName(account)).fieldBool("killed", true).fieldInt("cancelled", cast<long>(n)).endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame omsReviveHandler(req: *Request, res: *Response) {
    local d: *Desk = desk();
    local account: int = accountParam(req, res, d);
    if (account < 0) {
        return;
    }
    d.risk.revive(account);
    local w: JsonWriter = JsonWriter.new(128);
    w.beginObject().fieldStr("account", d.accountName(account)).fieldBool("killed", false).endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame omsRestrictHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local d: *Desk = desk();
    local sym: int = d.symbolOf(p.path("symbol"));
    local on: bool = p.flag("restricted", true);
    if (p.reject(res)) {
        return;
    }
    if (sym < 0) {
        Reply.notFound(res, "unknown symbol");
        return;
    }
    d.risk.restrict(sym, on);
    local w: JsonWriter = JsonWriter.new(128);
    w.beginObject().fieldStr("symbol", d.venue.engine.symbolName(sym)).fieldBool("restricted", on).endObject();
    Reply.ok(res, &w);
    w.destroy();
}

global journal_fields: string[3] = ["seq", "type", "bytes"];

frame omsJournalHandler(req: *Request, res: *Response) {
    local d: *Desk = desk();
    local get: Lambda<FValue>(int, int) = |row: int, field: int| ret FValue {
        local t: int = 0;
        local seq: long = 0;
        local size: int = 0;
        d.venue.recordInfo(row, &t, &seq, &size);
        if (field == 0) {
            return FValue.number(cast<float>(seq));
        }
        if (field == 1) {
            return FValue.text(JournalCodes.recordName(t));
        }
        return FValue.number(cast<float>(size));
    };
    local q: Listing = Listing.run(req, d.venue.journal.offsets.len, &journal_fields[0], 3, get, 100, 1000);
    local owner: *Listing = &q;
    defer owner.destroy();
    if (q.reject(res)) {
        return;
    }
    local w: JsonWriter = JsonWriter.new(256 + (q.count * 60));
    w.beginObject();
    w.fieldInt("next_seq", d.venue.journal.next_seq);
    w.fieldInt("bytes", cast<long>(d.venue.journal.bytes()));
    q.writePaging(&w);
    w.key("records").beginArray();
    loop (local i: int = 0; i < q.count; i = i + 1) {
        Listing.writeRow(&w, &journal_fields[0], 3, q.rows[i], get);
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame omsSnapshotHandler(_req: *Request, res: *Response) {
    local d: *Desk = desk();
    local started: long = Clock.nowNs();
    local seq: long = d.takeSnapshot();
    local w: JsonWriter = JsonWriter.new(256);
    w.beginObject();
    w.fieldInt("seq", seq);
    w.fieldInt("bytes", cast<long>(d.snapshot.data.len));
    w.fieldInt("open_orders", cast<long>(d.venue.engine.openOrders()));
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    Reply.json(res, 201, &w);
    w.destroy();
}

frame omsRecoverHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local use_snapshot: bool = p.flag("snapshot", true);
    if (p.reject(res)) {
        return;
    }
    local d: *Desk = desk();
    local started: long = Clock.nowNs();
    local check: RecoveryCheck = d.verifyRecovery(use_snapshot);
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    w.fieldBool("matches", check.matches);
    w.fieldBool("used_snapshot", check.used_snapshot);
    w.fieldInt("snapshot_seq", check.report.snapshot_seq);
    w.fieldInt("replayed", check.report.replayed);
    w.fieldInt("skipped", check.report.skipped);
    w.fieldInt("last_seq", check.report.last_seq);
    w.fieldInt("torn_bytes", cast<long>(check.report.torn_bytes));
    if (check.report.error != nullptr) {
        w.fieldStr("error", check.report.error);
    }
    w.fieldInt("open_orders", cast<long>(check.open_orders));
    local hash: char[24];
    snprintf(cast<string>(&hash[0]), 24, "%016llx", check.live_hash);
    w.fieldStr("state_hash", cast<string>(&hash[0]));
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    Reply.json(res, check.matches ? 200 : 500, &w);
    w.destroy();
}

frame omsCompactHandler(_req: *Request, res: *Response) {
    local d: *Desk = desk();
    if (!d.has_snapshot) {
        Reply.error(res, 409, "take a snapshot first");
        return;
    }
    local dropped: int = d.compact();
    local w: JsonWriter = JsonWriter.new(128);
    w.beginObject().fieldInt("dropped", cast<long>(dropped)).fieldInt("kept", cast<long>(d.venue.journal.offsets.len)).fieldInt("bytes", cast<long>(d.venue.journal.bytes())).endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame omsStatsHandler(_req: *Request, res: *Response) {
    local d: *Desk = desk();
    local e: *Engine = &d.venue.engine;
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    w.fieldInt("open_orders", cast<long>(e.openOrders()));
    w.fieldInt("submitted", e.stats.submitted);
    w.fieldInt("trades", e.stats.trades);
    w.fieldInt("volume", e.stats.volume);
    w.fieldInt("journal_records", d.venue.journal.records);
    w.fieldInt("journal_bytes", cast<long>(d.venue.journal.bytes()));
    w.fieldBool("has_snapshot", d.has_snapshot);
    w.fieldInt("risk_breaches", d.risk.breach_total);
    w.fieldInt("fix_orders", d.gateway.stats.orders);
    w.fieldInt("fix_fills", d.gateway.stats.fills);
    w.fieldStr("fix_session", d.server.stateName());
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}
