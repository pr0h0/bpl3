# FIX order-entry gateway in front of the matching engine.
#
# NewOrderSingle (D), OrderCancelRequest (F), OrderCancelReplaceRequest (G)
# and OrderStatusRequest (H) are translated into engine calls; results come
# back as ExecutionReports (8) or OrderCancelReject (9). Fills are reported
# for every gateway order on either side of a trade, so a resting order hears
# about passive fills caused by another client's aggressive order. A
# pre-trade check can veto any new or replacing order before it reaches the
# engine.

import malloc, free from "std/c.bpl";
import [Text] from "../core/text.bpl";
import [StrIndex], [LongMap] from "../core/hashmap.bpl";
import [CharBuf] from "../core/strlist.bpl";
import [Engine], [OrderRequest], [ExecReport] from "../market/engine.bpl";
import [Order], [Trade], [Side], [OrderType], [TimeInForce], [OrderStatus], [RejectReason], [Ticks] from "../market/order.bpl";
import [FixMessage], [FixBuilder] from "./fix.bpl";
import [FixSession] from "./fix_session.bpl";

export [FixGateway];
export [GwOrder];
export [GatewayStats];

global const PRICE_SCALE: int = 4;

# One client order; `order_id` follows the engine id across replaces.
struct GwOrder {
    clid: int,
    order_id: long,
    symbol: int,
    side: Side,
    kind: OrderType,
    quantity: long,
    cum: long,
    notional: long,
    price: long,
    open: bool,
    status: OrderStatus,
}

struct GatewayStats {
    orders: long,
    cancels: long,
    replaces: long,
    rejects: long,
    risk_rejects: long,
    fills: long,
    reports: long,
    cancel_rejects: long,
}

struct FixGateway {
    engine: *Engine,
    account: int,
    clids: StrIndex,
    orders: *GwOrder,
    count: int,
    cap: int,
    # clid index -> gateway order index (-1 when the id is unused).
    by_clid: LongMap,
    by_order: LongMap,
    last_trade_id: long,
    exec_counter: long,
    stats: GatewayStats,

    frame init(this: *FixGateway, engine: *Engine, account_name: string) {
        this.engine = engine;
        this.account = engine.accountId(account_name);
        this.clids = StrIndex.new(64);
        this.cap = 64;
        this.orders = cast<*GwOrder>(malloc(cast<long>(this.cap) * sizeof(GwOrder)));
        this.count = 0;
        this.by_clid = LongMap.new(64);
        this.by_order = LongMap.new(64);
        local latest: *Trade = engine.tape.latest();
        this.last_trade_id = latest == nullptr ? 0 : latest.id;
        this.exec_counter = 0;
        this.stats = GatewayStats { orders: 0, cancels: 0, replaces: 0, rejects: 0, risk_rejects: 0, fills: 0, reports: 0, cancel_rejects: 0 };
    }

    frame destroy(this: *FixGateway) {
        this.clids.destroy();
        free(cast<*void>(this.orders));
        this.orders = nullptr;
        this.by_clid.destroy();
        this.by_order.destroy();
    }

    frame addOrder(this: *FixGateway, o: GwOrder) ret int {
        if (this.count == this.cap) {
            local next: *GwOrder = cast<*GwOrder>(malloc(cast<long>(this.cap * 2) * sizeof(GwOrder)));
            loop (local i: int = 0; i < this.count; i = i + 1) {
                next[i] = this.orders[i];
            }
            free(cast<*void>(this.orders));
            this.orders = next;
            this.cap = this.cap * 2;
        }
        this.orders[this.count] = o;
        this.count = this.count + 1;
        return this.count - 1;
    }

    frame findClid(this: *FixGateway, clid: string) ret int {
        local id: int = this.clids.find(clid);
        if (id < 0) {
            return -1;
        }
        return cast<int>(this.by_clid.getOr(cast<long>(id), -1));
    }

    frame nextExecId(this: *FixGateway, out: *CharBuf) {
        this.exec_counter = this.exec_counter + 1;
        out.str("E");
        out.integer(this.exec_counter);
    }

    frame statusChar(status: OrderStatus) ret string {
        if (status == OrderStatus.New) {
            return "0";
        }
        if (status == OrderStatus.PartiallyFilled) {
            return "1";
        }
        if (status == OrderStatus.Filled) {
            return "2";
        }
        if (status == OrderStatus.Cancelled) {
            return "4";
        }
        if (status == OrderStatus.Pending) {
            return "A";
        }
        return "8";
    }

    frame rejectCode(reason: RejectReason) ret long {
        if (reason == RejectReason.UnknownSymbol) {
            return 1;
        }
        if (reason == RejectReason.InvalidQuantity) {
            return 13;
        }
        if (reason == RejectReason.UnknownOrder) {
            return 5;
        }
        if ((reason == RejectReason.PriceBand) || (reason == RejectReason.InvalidPrice)) {
            return 16;
        }
        return 99;
    }

    # Writes an ExecutionReport for gateway order `gi`.
    frame report(this: *FixGateway, s: *FixSession, gi: int, exec_type: string, last_px: long, last_qty: long, text: string) {
        local g: *GwOrder = this.orders + gi;
        local b: *FixBuilder = s.start("8");
        local oid: CharBuf = CharBuf.new(24);
        oid.integer(g.order_id);
        b.field(37, oid.text());
        oid.destroy();
        b.field(11, this.clids.name(g.clid));
        local eid: CharBuf = CharBuf.new(24);
        this.nextExecId(&eid);
        b.field(17, eid.text());
        eid.destroy();
        b.field(150, exec_type);
        b.field(39, FixGateway.statusChar(g.status));
        b.field(55, this.engine.symbolName(g.symbol));
        b.field(54, g.side == Side.Buy ? "1" : "2");
        b.fieldLong(38, g.quantity);
        if (g.price > 0) {
            b.fieldTicks(44, g.price, PRICE_SCALE);
        }
        local leaves: long = g.open ? g.quantity - g.cum : 0;
        b.fieldLong(151, leaves);
        b.fieldLong(14, g.cum);
        local avg: long = g.cum > 0 ? g.notional / g.cum : 0;
        b.fieldTicks(6, avg, PRICE_SCALE);
        if (last_qty > 0) {
            b.fieldTicks(31, last_px, PRICE_SCALE);
            b.fieldLong(32, last_qty);
        }
        if (text != nullptr) {
            b.field(58, text);
        }
        s.send(false);
        this.stats.reports = this.stats.reports + 1;
    }

    frame rejectNew(this: *FixGateway, s: *FixSession, m: *FixMessage, code: long, text: string) {
        local b: *FixBuilder = s.start("8");
        b.field(37, "NONE");
        b.field(11, m.getOr(11, "?"));
        local eid: CharBuf = CharBuf.new(24);
        this.nextExecId(&eid);
        b.field(17, eid.text());
        eid.destroy();
        b.field(150, "8");
        b.field(39, "8");
        b.field(55, m.getOr(55, "?"));
        b.field(54, m.getOr(54, "1"));
        b.fieldLong(151, 0);
        b.fieldLong(14, 0);
        b.fieldLong(6, 0);
        b.fieldLong(103, code);
        b.field(58, text);
        s.send(false);
        this.stats.rejects = this.stats.rejects + 1;
        this.stats.reports = this.stats.reports + 1;
    }

    frame cancelReject(this: *FixGateway, s: *FixSession, m: *FixMessage, response_to: string, text: string) {
        local b: *FixBuilder = s.start("9");
        b.field(37, "NONE");
        b.field(11, m.getOr(11, "?"));
        b.field(41, m.getOr(41, "?"));
        b.field(39, "8");
        b.field(434, response_to);
        b.field(58, text);
        s.send(false);
        this.stats.cancel_rejects = this.stats.cancel_rejects + 1;
    }

    # Parses the order fields shared by D and G. Returns nullptr on success
    # or a reject text.
    frame parseOrder(this: *FixGateway, m: *FixMessage, req: *OrderRequest) ret string {
        local symbol: int = this.engine.symbolId(m.getOr(55, ""));
        if (symbol < 0) {
            return "unknown symbol";
        }
        local side_text: string = m.getOr(54, "");
        local side: Side = Side.Buy;
        if (Text.equals(side_text, "2") || Text.equals(side_text, "5")) {
            side = Side.Sell;
        } else if (!Text.equals(side_text, "1")) {
            return "unsupported Side";
        }
        local qty: long = m.getLong(38, -1);
        if (qty <= 0) {
            return "OrderQty must be a positive integer";
        }
        local type_text: string = m.getOr(40, "2");
        local kind: OrderType = OrderType.Limit;
        if (Text.equals(type_text, "1")) {
            kind = OrderType.Market;
        } else if (Text.equals(type_text, "3")) {
            kind = OrderType.Stop;
        } else if (Text.equals(type_text, "4")) {
            kind = OrderType.StopLimit;
        } else if (!Text.equals(type_text, "2")) {
            return "unsupported OrdType";
        }
        local tif_text: string = m.getOr(59, "1");
        local tif: TimeInForce = TimeInForce.GoodTillCancel;
        if (Text.equals(tif_text, "0")) {
            tif = TimeInForce.Day;
        } else if (Text.equals(tif_text, "3")) {
            tif = TimeInForce.ImmediateOrCancel;
        } else if (Text.equals(tif_text, "4")) {
            tif = TimeInForce.FillOrKill;
        } else if (!Text.equals(tif_text, "1")) {
            return "unsupported TimeInForce";
        }
        local ok: bool = true;
        local price: long = 0;
        if ((kind == OrderType.Limit) || (kind == OrderType.StopLimit)) {
            price = m.getTicks(44, PRICE_SCALE, &ok);
            if (!ok || (price <= 0)) {
                return "Price required";
            }
        }
        local stop: long = 0;
        if ((kind == OrderType.Stop) || (kind == OrderType.StopLimit)) {
            stop = m.getTicks(99, PRICE_SCALE, &ok);
            if (!ok || (stop <= 0)) {
                return "StopPx required";
            }
        }
        req.symbol = symbol;
        req.account = this.account;
        req.side = side;
        req.kind = kind;
        req.tif = tif;
        req.price = price;
        req.stop_price = stop;
        req.quantity = qty;
        req.timestamp = 0;
        return nullptr;
    }

    # Emits fill reports for trades the engine produced since the last call.
    frame reportFills(this: *FixGateway, s: *FixSession) {
        local tape_count: int = this.engine.tape.count;
        local first: int = tape_count;
        loop ((first > 0) && (this.engine.tape.at(first - 1).id > this.last_trade_id)) {
            first = first - 1;
        }
        loop (local i: int = first; i < tape_count; i = i + 1) {
            local t: *Trade = this.engine.tape.at(i);
            this.fillSide(s, t, t.buy_order);
            this.fillSide(s, t, t.sell_order);
            this.last_trade_id = t.id;
        }
    }

    frame fillSide(this: *FixGateway, s: *FixSession, t: *Trade, order_id: long) {
        local gi: long = this.by_order.getOr(order_id, -1);
        if (gi < 0) {
            return;
        }
        local g: *GwOrder = this.orders + cast<int>(gi);
        g.cum = g.cum + t.quantity;
        g.notional = g.notional + (t.price * t.quantity);
        if (g.cum >= g.quantity) {
            g.status = OrderStatus.Filled;
            g.open = false;
        } else {
            g.status = OrderStatus.PartiallyFilled;
        }
        this.stats.fills = this.stats.fills + 1;
        this.report(s, cast<int>(gi), "F", t.price, t.quantity, nullptr);
    }

    frame onNew(this: *FixGateway, s: *FixSession, m: *FixMessage, check: Lambda<string>(*OrderRequest)) {
        local clid: string = m.get(11);
        if ((clid == nullptr) || (Text.length(clid) > 64)) {
            this.rejectNew(s, m, 99, "ClOrdID required (max 64 chars)");
            return;
        }
        if (this.findClid(clid) >= 0) {
            this.rejectNew(s, m, 6, "duplicate ClOrdID");
            return;
        }
        local req: OrderRequest;
        local problem: string = this.parseOrder(m, &req);
        if (problem != nullptr) {
            this.rejectNew(s, m, 99, problem);
            return;
        }
        local veto: string = check(&req);
        if (veto != nullptr) {
            this.stats.risk_rejects = this.stats.risk_rejects + 1;
            this.rejectNew(s, m, 3, veto);
            return;
        }
        this.stats.orders = this.stats.orders + 1;
        local r: ExecReport = this.engine.submit(&req);
        if ((r.status == OrderStatus.Rejected) && (r.order_id == 0)) {
            this.rejectNew(s, m, FixGateway.rejectCode(r.reason), Ticks.rejectName(r.reason));
            return;
        }
        local id: int = this.clids.intern(clid);
        local gi: int = this.addOrder(GwOrder { clid: id, order_id: r.order_id, symbol: req.symbol, side: req.side, kind: req.kind, quantity: req.quantity, cum: 0, notional: 0, price: req.price, open: true, status: OrderStatus.New });
        this.by_clid.put(cast<long>(id), cast<long>(gi));
        this.by_order.put(r.order_id, cast<long>(gi));
        local g: *GwOrder = this.orders + gi;
        if (r.status == OrderStatus.Rejected) {
            g.open = false;
            g.status = OrderStatus.Rejected;
            this.report(s, gi, "8", 0, 0, Ticks.rejectName(r.reason));
            this.stats.rejects = this.stats.rejects + 1;
            return;
        }
        g.status = r.status == OrderStatus.Pending ? OrderStatus.Pending : OrderStatus.New;
        this.report(s, gi, "0", 0, 0, nullptr);
        this.reportFills(s);
        if (!r.resting && g.open) {
            # IOC/market remainder or no-liquidity cancel.
            g.open = false;
            if (r.status != OrderStatus.Pending) {
                g.status = OrderStatus.Cancelled;
                this.report(s, gi, "4", 0, 0, r.reason == RejectReason.None ? "unfilled remainder cancelled" : Ticks.rejectName(r.reason));
            } else {
                g.open = true;
            }
        }
        this.reconcile(s);
    }

    frame onCancel(this: *FixGateway, s: *FixSession, m: *FixMessage) {
        local gi: int = this.findClid(m.getOr(41, ""));
        if (gi < 0) {
            this.cancelReject(s, m, "1", "unknown OrigClOrdID");
            return;
        }
        local g: *GwOrder = this.orders + gi;
        if (!g.open || !this.engine.cancel(g.order_id)) {
            this.cancelReject(s, m, "1", "order not open");
            return;
        }
        g.open = false;
        g.status = OrderStatus.Cancelled;
        this.stats.cancels = this.stats.cancels + 1;
        this.report(s, gi, "4", 0, 0, nullptr);
    }

    frame onReplace(this: *FixGateway, s: *FixSession, m: *FixMessage, check: Lambda<string>(*OrderRequest)) {
        local gi: int = this.findClid(m.getOr(41, ""));
        local clid: string = m.get(11);
        if ((gi < 0) || (clid == nullptr) || (this.findClid(clid) >= 0)) {
            this.cancelReject(s, m, "2", "unknown OrigClOrdID or reused ClOrdID");
            return;
        }
        local g: *GwOrder = this.orders + gi;
        local ok: bool = true;
        local price: long = m.getTicks(44, PRICE_SCALE, &ok);
        local qty: long = m.getLong(38, -1);
        if (!g.open || !ok || (price <= 0) || (qty <= 0)) {
            this.cancelReject(s, m, "2", "order not open or bad price/quantity");
            return;
        }
        local req: OrderRequest = OrderRequest { symbol: g.symbol, account: this.account, side: g.side, kind: OrderType.Limit, tif: TimeInForce.GoodTillCancel, price: price, stop_price: 0, quantity: qty - g.cum, timestamp: 0 };
        local veto: string = check(&req);
        if (veto != nullptr) {
            this.stats.risk_rejects = this.stats.risk_rejects + 1;
            this.cancelReject(s, m, "2", veto);
            return;
        }
        local r: ExecReport = this.engine.replace(g.order_id, price, qty);
        if (r.status == OrderStatus.Rejected) {
            this.cancelReject(s, m, "2", Ticks.rejectName(r.reason));
            return;
        }
        this.stats.replaces = this.stats.replaces + 1;
        local id: int = this.clids.intern(clid);
        this.by_clid.put(cast<long>(id), cast<long>(gi));
        if (r.order_id != g.order_id) {
            this.by_order.remove(g.order_id);
            this.by_order.put(r.order_id, cast<long>(gi));
            g.order_id = r.order_id;
        }
        g.clid = id;
        g.quantity = qty;
        g.price = price;
        g.status = g.cum > 0 ? OrderStatus.PartiallyFilled : OrderStatus.New;
        this.report(s, gi, "5", 0, 0, nullptr);
        this.reportFills(s);
        if (!r.resting && g.open && (g.cum < g.quantity)) {
            g.open = false;
            g.status = OrderStatus.Cancelled;
            this.report(s, gi, "4", 0, 0, nullptr);
        }
        this.reconcile(s);
    }

    frame onStatus(this: *FixGateway, s: *FixSession, m: *FixMessage) {
        local gi: int = this.findClid(m.getOr(11, ""));
        if (gi < 0) {
            this.rejectNew(s, m, 5, "unknown ClOrdID");
            return;
        }
        this.report(s, gi, "I", 0, 0, nullptr);
    }

    # Dispatches one application message.
    frame handle(this: *FixGateway, s: *FixSession, m: *FixMessage, check: Lambda<string>(*OrderRequest)) {
        if (m.isType("D")) {
            this.onNew(s, m, check);
        } else if (m.isType("F")) {
            this.onCancel(s, m);
        } else if (m.isType("G")) {
            this.onReplace(s, m, check);
        } else if (m.isType("H")) {
            this.onStatus(s, m);
        } else {
            local b: *FixBuilder = s.start("j");
            b.fieldLong(45, m.seqNum());
            b.field(372, m.msgType());
            b.fieldLong(380, 3);
            b.field(58, "unsupported message type");
            s.send(false);
        }
    }

    # Reports passive fills caused by orders that did not come through this
    # gateway (call after other engine activity), then reconciles.
    frame sync(this: *FixGateway, s: *FixSession) {
        this.reportFills(s);
        this.reconcile(s);
    }

    # Orders the engine closed on its own (self-trade prevention, end of day)
    # are reported as cancelled.
    frame reconcile(this: *FixGateway, s: *FixSession) {
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local g: *GwOrder = this.orders + i;
            if (!g.open) {
                continue;
            }
            local o: *Order = this.engine.findOrder(g.order_id);
            if ((o == nullptr) || (o.id != g.order_id) || (o.status == OrderStatus.Cancelled)) {
                g.open = false;
                g.status = OrderStatus.Cancelled;
                this.report(s, i, "4", 0, 0, "cancelled by the engine");
            }
        }
    }

    frame openCount(this: *FixGateway) ret int {
        local n: int = 0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            if (this.orders[i].open) {
                n = n + 1;
            }
        }
        return n;
    }
}
