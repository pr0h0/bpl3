# Market endpoints: symbols, orders, order book, trades, quotes, simulation.

import [Request], [Response] from "bpl-express";
import [StringBuilder] from "std/string_builder.bpl";
import [Array] from "std/array.bpl";
import [CSV] from "bpl-csv";
import malloc, free, snprintf from "std/c.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [Text], [ParsedLong] from "../core/text.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params], [Page] from "./params.bpl";
import [Filter], [FValue], [FilterSchema], [SortSpec] from "./filter.bpl";
import [Order], [Trade], [Side], [OrderType], [TimeInForce], [OrderStatus], [RejectReason], [Ticks] from "../market/order.bpl";
import [Engine], [OrderRequest], [ExecReport] from "../market/engine.bpl";
import [OrderBook], [DepthLevel] from "../market/book.bpl";
import [FlowSimulator], [SimSummary] from "../market/simulator.bpl";

export symbolsHandler;
export createSymbolHandler;
export submitOrderHandler;
export getOrderHandler;
export cancelOrderHandler;
export replaceOrderHandler;
export bookHandler;
export quoteHandler;
export tradesHandler;
export tradesCsvHandler;
export simulateHandler;
export engineStatsHandler;
export endOfDayHandler;
export validateBookHandler;
export writeTrade;
export tradeSchema;

global trade_field_names: string[8] = ["id", "symbol", "price", "qty", "side", "buyer", "seller", "time"];

frame tradeSchema() ret FilterSchema {
    return FilterSchema.new(&trade_field_names[0], 8);
}

frame tradeField(e: *Engine, t: *Trade, field: int) ret FValue {
    if (field == 0) {
        return FValue.number(cast<float>(t.id));
    }
    if (field == 1) {
        return FValue.text(e.symbolName(t.symbol));
    }
    if (field == 2) {
        return FValue.number(Ticks.toFloat(t.price));
    }
    if (field == 3) {
        return FValue.number(cast<float>(t.quantity));
    }
    if (field == 4) {
        return FValue.text(Ticks.sideName(t.aggressor));
    }
    if (field == 5) {
        return FValue.text(e.accounts.name(t.buy_account));
    }
    if (field == 6) {
        return FValue.text(e.accounts.name(t.sell_account));
    }
    return FValue.number(cast<float>(t.timestamp));
}

frame writeTrade(w: *JsonWriter, e: *Engine, t: *Trade) {
    w.beginObject();
    w.fieldInt("id", t.id);
    w.fieldStr("symbol", e.symbolName(t.symbol));
    w.fieldFixed("price", Ticks.toFloat(t.price), 4);
    w.fieldInt("qty", t.quantity);
    w.fieldStr("side", Ticks.sideName(t.aggressor));
    w.fieldInt("buy_order", t.buy_order);
    w.fieldInt("sell_order", t.sell_order);
    w.fieldStr("buyer", e.accounts.name(t.buy_account));
    w.fieldStr("seller", e.accounts.name(t.sell_account));
    w.fieldInt("time", t.timestamp);
    w.endObject();
}

frame writeOrder(w: *JsonWriter, e: *Engine, o: *Order) {
    w.beginObject();
    w.fieldInt("id", o.id);
    w.fieldStr("symbol", e.symbolName(o.symbol));
    w.fieldStr("account", e.accounts.name(o.account));
    w.fieldStr("side", Ticks.sideName(o.side));
    w.fieldStr("type", Ticks.typeName(o.kind));
    w.fieldStr("tif", Ticks.tifName(o.tif));
    w.fieldStr("status", Ticks.statusName(o.status));
    w.fieldFixed("price", Ticks.toFloat(o.price), 4);
    if (o.stop_price > 0) {
        w.fieldFixed("stop_price", Ticks.toFloat(o.stop_price), 4);
    }
    w.fieldInt("qty", o.quantity);
    w.fieldInt("remaining", o.remaining);
    w.fieldInt("filled", o.filled());
    w.fieldFixed("avg_price", o.averagePrice(), 4);
    w.endObject();
}

frame writeReport(w: *JsonWriter, e: *Engine, r: *ExecReport) {
    w.beginObject();
    w.fieldInt("order_id", r.order_id);
    w.fieldStr("status", Ticks.statusName(r.status));
    if (r.reason != RejectReason.None) {
        w.fieldStr("reason", Ticks.rejectName(r.reason));
    }
    w.fieldInt("filled", r.filled);
    w.fieldInt("remaining", r.remaining);
    w.fieldFixed("avg_price", r.averagePrice(), 4);
    w.fieldInt("trades", cast<long>(r.trades));
    w.fieldBool("resting", r.resting);
    if (r.trades > 0) {
        w.key("fills").beginArray();
        local shown: int = 0;
        local i: int = e.tape.count - 1;
        # Fills of this order are the newest r.trades entries with id >= first_trade.
        local stack: *Trade = cast<*Trade>(malloc(cast<long>(r.trades + 1) * sizeof(Trade)));
        loop ((i >= 0) && (shown < r.trades)) {
            local t: *Trade = e.tape.at(i);
            if (t.id < r.first_trade) {
                break;
            }
            if ((t.buy_order == r.order_id) || (t.sell_order == r.order_id)) {
                stack[shown] = *t;
                shown = shown + 1;
            }
            i = i - 1;
        }
        local k: int = shown - 1;
        loop (k >= 0) {
            writeTrade(w, e, stack + k);
            k = k - 1;
        }
        free(cast<*void>(stack));
        w.endArray();
    }
    w.endObject();
}

frame symbolsHandler(_req: *Request, res: *Response) {
    local s: *AppState = appState();
    local e: *Engine = &s.engine;
    local w: JsonWriter = JsonWriter.new(1024);
    w.beginObject();
    w.key("symbols").beginArray();
    loop (local i: int = 0; i < e.book_count; i = i + 1) {
        local b: *OrderBook = e.book(i);
        w.beginObject();
        w.fieldStr("symbol", e.symbolName(i));
        w.fieldFixed("reference", Ticks.toFloat(b.reference_price), 4);
        w.fieldFixed("last", Ticks.toFloat(b.last_price), 4);
        w.fieldFixed("bid", Ticks.toFloat(b.bestBid()), 4);
        w.fieldFixed("ask", Ticks.toFloat(b.bestAsk()), 4);
        w.fieldInt("volume", b.volume);
        w.fieldInt("trades", b.trade_count);
        w.endObject();
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame createSymbolHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    p.parseBody(4096);
    if (p.reject(res)) {
        return;
    }
    local symbol: string = p.symbol("symbol");
    local reference: float = p.requiredNum("reference", 0.0001, 1000000.0);
    local band: int = p.integer("band_bps", 0, 0, 10000);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    if (s.engine.symbolId(symbol) >= 0) {
        Reply.errorDetail(res, 409, "symbol exists", symbol);
        return;
    }
    local id: int = s.engine.addSymbol(symbol, Ticks.fromFloat(reference));
    s.engine.book(id).band_bps = cast<long>(band);
    local w: JsonWriter = JsonWriter.new(128);
    w.beginObject().fieldStr("symbol", symbol).fieldInt("id", cast<long>(id)).fieldFixed("reference", reference, 4).endObject();
    Reply.json(res, 201, &w);
    w.destroy();
}

frame submitOrderHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    p.parseBody(8192);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local symbol: string = p.symbol("symbol");
    local account: string = p.requiredStr("account", 64);
    local side_text: string = p.requiredStr("side", 8);
    local type_text: string = p.str("type", "limit");
    local tif_text: string = p.str("tif", "gtc");
    local qty: long = p.longInt("qty", 0, 1, 1000000000);
    if (!p.present("qty")) {
        p.fail("qty", "is required");
    }
    local req_order: OrderRequest = OrderRequest.limit(0, 0, Side.Buy, 0, qty);
    if (!Ticks.parseSide(side_text, &req_order.side)) {
        p.fail("side", "must be buy or sell");
    }
    if (!Ticks.parseType(type_text, &req_order.kind)) {
        p.fail("type", "must be limit, market, stop or stop_limit");
    }
    if (!Ticks.parseTif(tif_text, &req_order.tif)) {
        p.fail("tif", "must be gtc, ioc, fok or day");
    }
    local priced: bool = (req_order.kind == OrderType.Limit) || (req_order.kind == OrderType.StopLimit);
    if (priced) {
        req_order.price = Ticks.fromFloat(p.requiredNum("price", 0.0001, 10000000.0));
    }
    if ((req_order.kind == OrderType.Stop) || (req_order.kind == OrderType.StopLimit)) {
        req_order.stop_price = Ticks.fromFloat(p.requiredNum("stop_price", 0.0001, 10000000.0));
    }
    if (req_order.kind == OrderType.Market) {
        req_order.tif = TimeInForce.ImmediateOrCancel;
    }
    if (p.reject(res)) {
        return;
    }
    req_order.symbol = s.engine.symbolId(symbol);
    if (req_order.symbol < 0) {
        Reply.notFound(res, "unknown symbol");
        return;
    }
    req_order.account = s.engine.accountId(account);
    local r: ExecReport = s.engine.submit(&req_order);
    local w: JsonWriter = JsonWriter.new(512);
    writeReport(&w, &s.engine, &r);
    local status: int = r.status == OrderStatus.Rejected ? 422 : 201;
    Reply.json(res, status, &w);
    w.destroy();
}

frame orderIdParam(req: *Request, res: *Response, out: *long) ret bool {
    local p: Params = Params.of(req);
    local text: string = p.path("id");
    local parsed: ParsedLong = Text.parseLong(text);
    if (!parsed.ok || (parsed.value <= 0)) {
        Reply.error(res, 400, "order id must be a positive integer");
        return false;
    }
    *out = parsed.value;
    return true;
}

frame getOrderHandler(req: *Request, res: *Response) {
    local id: long = 0;
    if (!orderIdParam(req, res, &id)) {
        return;
    }
    local s: *AppState = appState();
    local o: *Order = s.engine.findOrder(id);
    if (o == nullptr) {
        Reply.notFound(res, "order is not open");
        return;
    }
    local w: JsonWriter = JsonWriter.new(256);
    writeOrder(&w, &s.engine, o);
    Reply.ok(res, &w);
    w.destroy();
}

frame cancelOrderHandler(req: *Request, res: *Response) {
    local id: long = 0;
    if (!orderIdParam(req, res, &id)) {
        return;
    }
    local s: *AppState = appState();
    if (!s.engine.cancel(id)) {
        Reply.notFound(res, "order is not open");
        return;
    }
    local w: JsonWriter = JsonWriter.new(64);
    w.beginObject().fieldInt("order_id", id).fieldStr("status", "cancelled").endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame replaceOrderHandler(req: *Request, res: *Response) {
    local id: long = 0;
    if (!orderIdParam(req, res, &id)) {
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
    local s: *AppState = appState();
    local r: ExecReport = s.engine.replace(id, Ticks.fromFloat(price), qty);
    if ((r.status == OrderStatus.Rejected) && (r.reason == RejectReason.UnknownOrder)) {
        Reply.notFound(res, "order is not open");
        return;
    }
    local w: JsonWriter = JsonWriter.new(256);
    writeReport(&w, &s.engine, &r);
    Reply.json(res, r.status == OrderStatus.Rejected ? 422 : 200, &w);
    w.destroy();
}

frame symbolBook(req: *Request, res: *Response) ret *OrderBook {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local s: *AppState = appState();
    local id: int = s.engine.symbolId(symbol);
    if (id < 0) {
        Reply.notFound(res, "unknown symbol");
        return nullptr;
    }
    return s.engine.book(id);
}

frame writeDepth(w: *JsonWriter, b: *OrderBook, side: Side, depth: int) {
    local levels: *DepthLevel = cast<*DepthLevel>(malloc(cast<long>(depth) * sizeof(DepthLevel)));
    local n: int = b.depth(side, levels, depth);
    w.beginArray();
    loop (local i: int = 0; i < n; i = i + 1) {
        w.beginArray();
        w.fixed(Ticks.toFloat(levels[i].price), 4);
        w.integer(levels[i].quantity);
        w.integer(cast<long>(levels[i].orders));
        w.endArray();
    }
    w.endArray();
    free(cast<*void>(levels));
}

frame bookHandler(req: *Request, res: *Response) {
    local b: *OrderBook = symbolBook(req, res);
    if (b == nullptr) {
        return;
    }
    local p: Params = Params.of(req);
    local depth: int = p.integer("depth", 10, 1, 500);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local w: JsonWriter = JsonWriter.new(2048);
    w.beginObject();
    w.fieldStr("symbol", s.engine.symbolName(b.symbol));
    w.key("bids");
    writeDepth(&w, b, Side.Buy, depth);
    w.key("asks");
    writeDepth(&w, b, Side.Sell, depth);
    w.fieldInt("bid_levels", cast<long>(b.bids.count));
    w.fieldInt("ask_levels", cast<long>(b.asks.count));
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame quoteHandler(req: *Request, res: *Response) {
    local b: *OrderBook = symbolBook(req, res);
    if (b == nullptr) {
        return;
    }
    local s: *AppState = appState();
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    w.fieldStr("symbol", s.engine.symbolName(b.symbol));
    w.fieldFixed("bid", Ticks.toFloat(b.bestBid()), 4);
    w.fieldFixed("ask", Ticks.toFloat(b.bestAsk()), 4);
    w.fieldFixed("spread", Ticks.toFloat(b.spread()), 4);
    w.fieldFixed("mid", b.mid() / 10000.0, 4);
    w.fieldFixed("microprice", b.microprice() / 10000.0, 4);
    w.fieldFixed("imbalance", b.imbalance(5), 4);
    w.fieldFixed("last", Ticks.toFloat(b.last_price), 4);
    w.fieldFixed("open", Ticks.toFloat(b.open_price), 4);
    w.fieldFixed("high", Ticks.toFloat(b.high_price), 4);
    w.fieldFixed("low", Ticks.toFloat(b.low_price), 4);
    w.fieldFixed("vwap", b.vwap() / 10000.0, 4);
    w.fieldInt("volume", b.volume);
    w.fieldInt("trades", b.trade_count);
    w.fieldFixed("impact_buy_1000", b.impactPrice(Side.Buy, 1000) / 10000.0, 4);
    w.fieldFixed("impact_sell_1000", b.impactPrice(Side.Sell, 1000) / 10000.0, 4);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

# Collects tape indexes matching the request's symbol/filter, sorted and paged.
struct TradeQuery {
    indexes: *int,
    count: int,
    total: int,
    page: Page,
    error: string,
    status: int,

    frame destroy(this: *TradeQuery) {
        if (this.indexes != nullptr) {
            free(cast<*void>(this.indexes));
            this.indexes = nullptr;
        }
    }
}

frame runTradeQuery(req: *Request, max_limit: int) ret TradeQuery {
    local s: *AppState = appState();
    local e: *Engine = &s.engine;
    local q: TradeQuery;
    q.indexes = nullptr;
    q.count = 0;
    q.total = 0;
    q.error = nullptr;
    q.status = 200;
    local p: Params = Params.of(req);
    q.page = p.page(100, max_limit);
    local symbol: string = p.str("symbol", nullptr);
    local filter_text: string = p.str("filter", nullptr);
    local sort_text: string = p.str("sort", nullptr);
    if (!p.ok()) {
        q.error = p.messages[0];
        q.status = 422;
        return q;
    }
    local symbol_id: int = -1;
    if (symbol != nullptr) {
        symbol_id = e.symbolId(symbol);
        if (symbol_id < 0) {
            q.error = "unknown symbol";
            q.status = 404;
            return q;
        }
    }
    local schema: FilterSchema = tradeSchema();
    local has_filter: bool = !Text.isEmpty(filter_text);
    local f: Filter = Filter.compile(has_filter ? filter_text : "true", schema);
    if (!f.ok()) {
        q.error = f.error;
        q.status = 400;
        f.destroy();
        return q;
    }
    local sort: SortSpec = SortSpec.parse(sort_text, &schema);
    if (sort.error != nullptr) {
        q.error = sort.error;
        q.status = 400;
        f.destroy();
        return q;
    }
    local all: *int = cast<*int>(malloc(cast<long>(e.tape.count + 1) * sizeof(int)));
    local matched: int = 0;
    # Newest first by default.
    local i: int = e.tape.count - 1;
    loop (i >= 0) {
        local t: *Trade = e.tape.at(i);
        if ((symbol_id < 0) || (t.symbol == symbol_id)) {
            local accept: bool = true;
            if (has_filter) {
                local get: Lambda<FValue>(int) = |field: int| ret FValue {
                    return tradeField(e, t, field);
                };
                accept = f.matches(get);
            }
            if (accept) {
                all[matched] = i;
                matched = matched + 1;
            }
        }
        i = i - 1;
    }
    if (sort.count > 0) {
        sortTrades(e, all, matched, &sort);
    }
    q.total = matched;
    local start: int = q.page.offset < matched ? q.page.offset : matched;
    local end: int = start + q.page.limit;
    if (end > matched) {
        end = matched;
    }
    q.count = end - start;
    q.indexes = cast<*int>(malloc(cast<long>(q.count + 1) * sizeof(int)));
    loop (local k: int = start; k < end; k = k + 1) {
        q.indexes[k - start] = all[k];
    }
    free(cast<*void>(all));
    f.destroy();
    return q;
}

# Stable merge sort of tape indexes by the requested keys.
frame sortTrades(e: *Engine, idx: *int, n: int, sort: *SortSpec) {
    local tmp: *int = cast<*int>(malloc(cast<long>(n + 1) * sizeof(int)));
    local width: int = 1;
    loop (width < n) {
        local left: int = 0;
        loop (left < n) {
            local mid: int = (left + width) < n ? left + width : n;
            local right: int = (left + (2 * width)) < n ? left + (2 * width) : n;
            local a: int = left;
            local b: int = mid;
            local k: int = left;
            loop ((a < mid) && (b < right)) {
                local ta: *Trade = e.tape.at(idx[a]);
                local tb: *Trade = e.tape.at(idx[b]);
                local ga: Lambda<FValue>(int) = |field: int| ret FValue {
                    return tradeField(e, ta, field);
                };
                local gb: Lambda<FValue>(int) = |field: int| ret FValue {
                    return tradeField(e, tb, field);
                };
                if (sort.compareRecords(gb, ga) < 0) {
                    tmp[k] = idx[b];
                    b = b + 1;
                } else {
                    tmp[k] = idx[a];
                    a = a + 1;
                }
                k = k + 1;
            }
            loop (a < mid) {
                tmp[k] = idx[a];
                a = a + 1;
                k = k + 1;
            }
            loop (b < right) {
                tmp[k] = idx[b];
                b = b + 1;
                k = k + 1;
            }
            left = left + (2 * width);
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            idx[i] = tmp[i];
        }
        width = width * 2;
    }
    free(cast<*void>(tmp));
}

frame tradesHandler(req: *Request, res: *Response) {
    local q: TradeQuery = runTradeQuery(req, 1000);
    local owner: *TradeQuery = &q;
    defer owner.destroy();
    if (q.error != nullptr) {
        Reply.error(res, q.status, q.error);
        return;
    }
    local s: *AppState = appState();
    local w: JsonWriter = JsonWriter.new(256 + (q.count * 200));
    w.beginObject();
    w.fieldInt("total", cast<long>(q.total));
    w.fieldInt("offset", cast<long>(q.page.offset));
    w.fieldInt("limit", cast<long>(q.page.limit));
    w.fieldInt("count", cast<long>(q.count));
    w.key("trades").beginArray();
    loop (local i: int = 0; i < q.count; i = i + 1) {
        writeTrade(&w, &s.engine, s.engine.tape.at(q.indexes[i]));
    }
    w.endArray();
    if ((q.page.offset + q.count) < q.total) {
        w.fieldInt("next_offset", cast<long>(q.page.offset + q.count));
    }
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame tradesCsvHandler(req: *Request, res: *Response) {
    local q: TradeQuery = runTradeQuery(req, 100000);
    local owner: *TradeQuery = &q;
    defer owner.destroy();
    if (q.error != nullptr) {
        Reply.error(res, q.status, q.error);
        return;
    }
    local s: *AppState = appState();
    local e: *Engine = &s.engine;
    local out: StringBuilder = StringBuilder.new(128 + (q.count * 64));
    local builder: *StringBuilder = &out;
    defer builder.destroy();
    local header: Array<string> = Array<string>.new(8);
    loop (local i: int = 0; i < 8; i = i + 1) {
        header.push(trade_field_names[i]);
    }
    CSV.row(&out, &header, false);
    header.destroy();
    local buf: char[64];
    loop (local i: int = 0; i < q.count; i = i + 1) {
        local t: *Trade = e.tape.at(q.indexes[i]);
        snprintf(cast<string>(&buf[0]), 64, "%lld", t.id);
        CSV.field(&out, cast<string>(&buf[0]), false);
        out.append(",");
        CSV.field(&out, e.symbolName(t.symbol), false);
        out.append(",");
        snprintf(cast<string>(&buf[0]), 64, "%.4f", Ticks.toFloat(t.price));
        CSV.field(&out, cast<string>(&buf[0]), false);
        out.append(",");
        snprintf(cast<string>(&buf[0]), 64, "%lld", t.quantity);
        CSV.field(&out, cast<string>(&buf[0]), false);
        out.append(",");
        CSV.field(&out, Ticks.sideName(t.aggressor), false);
        out.append(",");
        CSV.field(&out, e.accounts.name(t.buy_account), false);
        out.append(",");
        CSV.field(&out, e.accounts.name(t.sell_account), false);
        out.append(",");
        snprintf(cast<string>(&buf[0]), 64, "%lld", t.timestamp);
        CSV.field(&out, cast<string>(&buf[0]), false);
        out.append("\r\n");
    }
    Reply.csv(res, "trades.csv", &out);
}

frame simulateHandler(req: *Request, res: *Response) {
    local b: *OrderBook = symbolBook(req, res);
    if (b == nullptr) {
        return;
    }
    local p: Params = Params.of(req);
    local events: int = p.integer("events", 1000, 1, 200000);
    local seed: long = p.longInt("seed", 1, 0, 9223372036854775807);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local fair: float = Ticks.toFloat(b.last_price > 0 ? b.last_price : b.reference_price);
    local sim: FlowSimulator = FlowSimulator.new(cast<u64>(seed), b.symbol, fair);
    local before: long = s.engine.stats.trades;
    local sum: SimSummary = sim.run(&s.engine, events);
    sim.destroy();
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    w.fieldStr("symbol", s.engine.symbolName(b.symbol));
    w.fieldInt("events", cast<long>(events));
    w.fieldInt("orders", sum.orders);
    w.fieldInt("cancels", sum.cancels);
    w.fieldInt("replaces", sum.replaces);
    w.fieldInt("trades", s.engine.stats.trades - before);
    w.fieldInt("rejected", sum.rejected);
    w.fieldInt("resting", sum.resting);
    w.fieldFixed("final_fair", sum.final_fair, 4);
    w.fieldFixed("last", Ticks.toFloat(b.last_price), 4);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame engineStatsHandler(_req: *Request, res: *Response) {
    local s: *AppState = appState();
    local e: *Engine = &s.engine;
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    w.fieldInt("submitted", e.stats.submitted);
    w.fieldInt("rejected", e.stats.rejected);
    w.fieldInt("cancelled", e.stats.cancelled);
    w.fieldInt("replaced", e.stats.replaced);
    w.fieldInt("trades", e.stats.trades);
    w.fieldInt("volume", e.stats.volume);
    w.fieldInt("stops_triggered", e.stats.stops_triggered);
    w.fieldInt("self_trades_prevented", e.stats.self_trades_prevented);
    w.fieldInt("open_orders", cast<long>(e.openOrders()));
    w.fieldInt("pending_stops", cast<long>(e.stops.len));
    w.fieldInt("tape_retained", cast<long>(e.tape.count));
    w.fieldInt("accounts", cast<long>(e.accounts.count));
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame endOfDayHandler(_req: *Request, res: *Response) {
    local s: *AppState = appState();
    local n: int = s.engine.endOfDay();
    local w: JsonWriter = JsonWriter.new(64);
    w.beginObject().fieldInt("cancelled", cast<long>(n)).endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame validateBookHandler(_req: *Request, res: *Response) {
    local s: *AppState = appState();
    local err: string = s.engine.validate();
    local w: JsonWriter = JsonWriter.new(64);
    w.beginObject().fieldBool("valid", err == nullptr);
    if (err != nullptr) {
        w.fieldStr("error", err);
    }
    w.endObject();
    Reply.json(res, err == nullptr ? 200 : 500, &w);
    w.destroy();
}
