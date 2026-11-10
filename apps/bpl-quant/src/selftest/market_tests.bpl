# Self-tests for the order book and matching engine.

import [Check] from "./check.bpl";
import [Side], [OrderType], [TimeInForce], [OrderStatus], [RejectReason], [Trade], [Ticks], [Order] from "../market/order.bpl";
import [Engine], [OrderRequest], [ExecReport] from "../market/engine.bpl";
import [OrderBook], [DepthLevel] from "../market/book.bpl";
import [FlowSimulator], [SimSummary] from "../market/simulator.bpl";
import [LongMap], [StrIndex] from "../core/hashmap.bpl";
import [Xoshiro] from "../core/prng.bpl";

export runMarketTests;

frame px(units: long) ret long {
    return units * Ticks.perUnit();
}

frame testHashMaps(c: *Check) {
    c.begin("hashmap");
    local m: LongMap = LongMap.new(4);
    loop (local i: long = 0; i < 5000; i = i + 1) {
        m.put(i * 7919, i);
    }
    c.equalInt("count", cast<long>(m.count), 5000);
    c.equalInt("lookup", m.getOr(4999 * 7919, -1), 4999);
    loop (local i: long = 0; i < 5000; i = i + 2) {
        m.remove(i * 7919);
    }
    c.equalInt("after_remove", cast<long>(m.count), 2500);
    local ok: bool = true;
    loop (local i: long = 0; i < 5000; i = i + 1) {
        local expected: long = (i % 2) == 0 ? -1 : i;
        if (m.getOr(i * 7919, -1) != expected) {
            ok = false;
        }
    }
    c.ok("backward_shift_consistent", ok);
    # Random insert/delete churn against a reference array.
    local rng: Xoshiro = Xoshiro.new(cast<u64>(31));
    local ref: long[512];
    loop (local i: int = 0; i < 512; i = i + 1) {
        ref[i] = -1;
    }
    local churn: LongMap = LongMap.new(8);
    loop (local step: int = 0; step < 20000; step = step + 1) {
        local k: int = rng.range(0, 512);
        if (rng.chance(0.6)) {
            churn.put(cast<long>(k), cast<long>(step));
            ref[k] = cast<long>(step);
        } else {
            churn.remove(cast<long>(k));
            ref[k] = -1;
        }
    }
    local agree: bool = true;
    local live: int = 0;
    loop (local i: int = 0; i < 512; i = i + 1) {
        if (churn.getOr(cast<long>(i), -1) != ref[i]) {
            agree = false;
        }
        if (ref[i] >= 0) {
            live = live + 1;
        }
    }
    c.ok("churn_agrees", agree);
    c.equalInt("churn_count", cast<long>(churn.count), cast<long>(live));
    m.destroy();
    churn.destroy();
    local names: StrIndex = StrIndex.new(2);
    local a: int = names.intern("AAPL");
    local b: int = names.intern("MSFT");
    c.equalInt("intern_stable", cast<long>(names.intern("AAPL")), cast<long>(a));
    c.ok("intern_distinct", a != b);
    loop (local i: int = 0; i < 100; i = i + 1) {
        local buf: char[16];
        buf[0] = 'S';
        buf[1] = cast<char>(65 + (i / 26));
        buf[2] = cast<char>(65 + (i % 26));
        buf[3] = cast<char>(0);
        names.intern(cast<string>(&buf[0]));
    }
    c.equalInt("intern_count", cast<long>(names.count), 102);
    c.equalInt("intern_find", cast<long>(names.find("MSFT")), cast<long>(b));
    names.destroy();
}

frame testBasicMatching(c: *Check) {
    c.begin("matching");
    local e: Engine = Engine.new(1024);
    local sym: int = e.addSymbol("ACME", px(100));
    local alice: int = e.accountId("alice");
    local bob: int = e.accountId("bob");
    local carol: int = e.accountId("carol");
    local s1: OrderRequest = OrderRequest.limit(sym, alice, Side.Sell, px(101), 100);
    local s2: OrderRequest = OrderRequest.limit(sym, bob, Side.Sell, px(101), 50);
    local s3: OrderRequest = OrderRequest.limit(sym, alice, Side.Sell, px(102), 200);
    local r1: ExecReport = e.submit(&s1);
    local r2: ExecReport = e.submit(&s2);
    e.submit(&s3);
    c.ok("resting_new", (r1.status == OrderStatus.New) && r1.resting);
    local book: *OrderBook = e.book(sym);
    c.equalInt("best_ask", book.bestAsk(), px(101));
    c.equalInt("ask_levels", cast<long>(book.asks.count), 2);
    # A buy for 120 at 101 takes alice's 100 first (time priority) then 20 of bob's.
    local b1: OrderRequest = OrderRequest.limit(sym, carol, Side.Buy, px(101), 120);
    local rb: ExecReport = e.submit(&b1);
    c.ok("buy_filled", rb.status == OrderStatus.Filled);
    c.equalInt("buy_trades", cast<long>(rb.trades), 2);
    c.equalInt("buy_filled_qty", rb.filled, 120);
    local trades: Trade[4];
    local n: int = e.tape.recent(sym, 4, &trades[0]);
    c.equalInt("tape_count", cast<long>(n), 2);
    c.equalInt("first_maker_alice", cast<long>(trades[1].sell_account), cast<long>(alice));
    c.equalInt("second_maker_bob", cast<long>(trades[0].sell_account), cast<long>(bob));
    c.equalInt("second_qty", trades[0].quantity, 20);
    local bob_order: *Order = e.findOrder(r2.order_id);
    c.ok("bob_partial", (bob_order != nullptr) && (bob_order.remaining == 30));
    c.ok("alice_gone", e.findOrder(r1.order_id) == nullptr);
    # Market buy sweeps 30 @101 and 170 @102.
    local m1: OrderRequest = OrderRequest.market(sym, carol, Side.Buy, 200);
    local rm: ExecReport = e.submit(&m1);
    c.equalInt("market_filled", rm.filled, 200);
    c.near("market_avg", rm.averagePrice(), ((30.0 * 101.0) + (170.0 * 102.0)) / 200.0, 0.0000001);
    c.equalInt("remaining_ask", book.asks.levels[0].total, 30);
    c.equalInt("last_price", book.last_price, px(102));
    c.equalInt("volume", book.volume, 320);
    # Market order into an empty side is cancelled with no liquidity.
    local m2: OrderRequest = OrderRequest.market(sym, carol, Side.Sell, 10);
    local rm2: ExecReport = e.submit(&m2);
    c.ok("market_no_liquidity", (rm2.status == OrderStatus.Cancelled) && (rm2.reason == RejectReason.NoLiquidity));
    # IOC partially fills and cancels the rest.
    local ioc: OrderRequest = OrderRequest.limit(sym, bob, Side.Buy, px(102), 100);
    ioc.tif = TimeInForce.ImmediateOrCancel;
    local ri: ExecReport = e.submit(&ioc);
    c.ok("ioc_partial", (ri.status == OrderStatus.PartiallyFilled) && (ri.filled == 30) && !ri.resting);
    c.equalInt("ask_side_empty", cast<long>(book.asks.count), 0);
    # FOK rejects when the book cannot fill it completely.
    local rest_ask: OrderRequest = OrderRequest.limit(sym, alice, Side.Sell, px(103), 40);
    e.submit(&rest_ask);
    local fok: OrderRequest = OrderRequest.limit(sym, bob, Side.Buy, px(103), 50);
    fok.tif = TimeInForce.FillOrKill;
    local rf: ExecReport = e.submit(&fok);
    c.ok("fok_rejected", (rf.status == OrderStatus.Rejected) && (rf.reason == RejectReason.FillOrKillUnfilled));
    c.equalInt("fok_no_trade", book.asks.levels[0].total, 40);
    fok.quantity = 40;
    local rf2: ExecReport = e.submit(&fok);
    c.ok("fok_filled", rf2.status == OrderStatus.Filled);
    # Validation errors.
    local bad: OrderRequest = OrderRequest.limit(sym, bob, Side.Buy, 0, 10);
    c.ok("reject_price", e.submit(&bad).reason == RejectReason.InvalidPrice);
    bad.price = px(100);
    bad.quantity = 0;
    c.ok("reject_qty", e.submit(&bad).reason == RejectReason.InvalidQuantity);
    bad.symbol = 99;
    bad.quantity = 5;
    c.ok("reject_symbol", e.submit(&bad).reason == RejectReason.UnknownSymbol);
    c.ok("book_valid", e.validate() == nullptr);
    e.destroy();
}

frame testCancelReplace(c: *Check) {
    c.begin("cancel_replace");
    local e: Engine = Engine.new(256);
    local sym: int = e.addSymbol("XYZ", px(50));
    local a: int = e.accountId("a");
    local b: int = e.accountId("b");
    local o1: OrderRequest = OrderRequest.limit(sym, a, Side.Buy, px(49), 100);
    local o2: OrderRequest = OrderRequest.limit(sym, b, Side.Buy, px(49), 100);
    local r1: ExecReport = e.submit(&o1);
    local r2: ExecReport = e.submit(&o2);
    # Reducing size keeps time priority.
    local rr: ExecReport = e.replace(r1.order_id, px(49), 60);
    c.equalInt("reduce_same_id", rr.order_id, r1.order_id);
    local book: *OrderBook = e.book(sym);
    c.equalInt("level_total", book.bids.levels[0].total, 160);
    local sell: OrderRequest = OrderRequest.limit(sym, b, Side.Sell, px(49), 60);
    sell.account = e.accountId("c");
    local rs: ExecReport = e.submit(&sell);
    local t: Trade[1];
    e.tape.recent(sym, 1, &t[0]);
    c.equalInt("priority_kept", t[0].buy_order, r1.order_id);
    c.equalInt("sell_filled", rs.filled, 60);
    # Increasing size loses priority and gets a new id.
    local rr2: ExecReport = e.replace(r2.order_id, px(49), 150);
    c.ok("increase_new_id", rr2.order_id != r2.order_id);
    c.ok("old_id_gone", e.findOrder(r2.order_id) == nullptr);
    c.ok("cancel_unknown", !e.cancel(424242));
    c.ok("cancel_live", e.cancel(rr2.order_id));
    c.equalInt("book_empty", cast<long>(book.bids.count), 0);
    c.ok("replace_unknown", e.replace(777, px(1), 1).reason == RejectReason.UnknownOrder);
    # Self-trade prevention cancels the resting order.
    local own_buy: OrderRequest = OrderRequest.limit(sym, a, Side.Buy, px(48), 10);
    local rob: ExecReport = e.submit(&own_buy);
    local own_sell: OrderRequest = OrderRequest.limit(sym, a, Side.Sell, px(48), 10);
    local ros: ExecReport = e.submit(&own_sell);
    c.equalInt("self_trade_no_fill", ros.filled, 0);
    c.ok("self_trade_resting_cancelled", e.findOrder(rob.order_id) == nullptr);
    c.equalInt("self_trade_counter", e.stats.self_trades_prevented, 1);
    # Day orders are cancelled at end of day, GTC orders survive.
    local day: OrderRequest = OrderRequest.limit(sym, b, Side.Buy, px(40), 10);
    day.tif = TimeInForce.Day;
    e.submit(&day);
    local gtc: OrderRequest = OrderRequest.limit(sym, b, Side.Buy, px(41), 10);
    local rg: ExecReport = e.submit(&gtc);
    c.equalInt("eod_cancelled", cast<long>(e.endOfDay()), 1);
    c.ok("gtc_survives", e.findOrder(rg.order_id) != nullptr);
    # Price band rejects far-away limits.
    book.band_bps = 1000;
    local far: OrderRequest = OrderRequest.limit(sym, b, Side.Buy, px(30), 10);
    c.ok("price_band", e.submit(&far).reason == RejectReason.PriceBand);
    c.ok("valid", e.validate() == nullptr);
    e.destroy();
}

frame testStops(c: *Check) {
    c.begin("stops");
    local e: Engine = Engine.new(256);
    local sym: int = e.addSymbol("STP", px(100));
    local mm: int = e.accountId("maker");
    local t1: int = e.accountId("t1");
    local t2: int = e.accountId("t2");
    loop (local i: int = 0; i < 5; i = i + 1) {
        local ask: OrderRequest = OrderRequest.limit(sym, mm, Side.Sell, px(101 + cast<long>(i)), 100);
        e.submit(&ask);
        local bid: OrderRequest = OrderRequest.limit(sym, mm, Side.Buy, px(99 - cast<long>(i)), 100);
        e.submit(&bid);
    }
    local stop: OrderRequest = OrderRequest.limit(sym, t1, Side.Buy, 0, 150);
    stop.kind = OrderType.Stop;
    stop.stop_price = px(102);
    local rs: ExecReport = e.submit(&stop);
    c.ok("stop_pending", rs.status == OrderStatus.Pending);
    local stop_limit: OrderRequest = OrderRequest.limit(sym, t2, Side.Sell, px(97), 500);
    stop_limit.kind = OrderType.StopLimit;
    stop_limit.stop_price = px(98);
    e.submit(&stop_limit);
    c.equalInt("stops_parked", cast<long>(e.stops.len), 2);
    # Lifting 101 and half of 102 triggers the buy stop, which takes the rest of 102 and all of 103.
    local lift: OrderRequest = OrderRequest.limit(sym, t2, Side.Buy, px(102), 150);
    e.submit(&lift);
    c.equalInt("buy_stop_triggered", e.stats.stops_triggered, 1);
    local book: *OrderBook = e.book(sym);
    c.equalInt("after_stop_best_ask", book.bestAsk(), px(104));
    c.equalInt("after_stop_ask_qty", book.asks.levels[0].total, 100);
    # Hitting the bids down to 98 triggers the sell stop-limit at 97.
    local hit: OrderRequest = OrderRequest.limit(sym, t1, Side.Sell, px(98), 200);
    e.submit(&hit);
    c.equalInt("sell_stop_triggered", e.stats.stops_triggered, 2);
    c.equalInt("stop_limit_rests_at", book.bestAsk(), px(97));
    c.equalInt("stop_limit_residual", book.asks.levels[0].total, 400);
    c.equalInt("best_bid_after", book.bestBid(), px(96));
    c.ok("valid", e.validate() == nullptr);
    # Cancelling a pending stop removes it.
    local s3: OrderRequest = OrderRequest.limit(sym, t1, Side.Buy, 0, 10);
    s3.kind = OrderType.Stop;
    s3.stop_price = px(200);
    local r3: ExecReport = e.submit(&s3);
    c.ok("cancel_pending_stop", e.cancel(r3.order_id));
    c.equalInt("no_stops_left", cast<long>(e.stops.len), 0);
    e.destroy();
}

frame testSimulation(c: *Check) {
    c.begin("simulation");
    local e: Engine = Engine.new(4096);
    local sym: int = e.addSymbol("SIM", px(100));
    local sim: FlowSimulator = FlowSimulator.new(cast<u64>(12345), sym, 100.0);
    local s: SimSummary = sim.run(&e, 50000);
    c.integer("orders", s.orders);
    c.integer("cancels", s.cancels);
    c.integer("replaces", s.replaces);
    c.integer("trades", e.stats.trades);
    c.integer("volume", e.stats.volume);
    c.integer("rejected", e.stats.rejected);
    c.integer("stops_triggered", e.stats.stops_triggered);
    c.integer("self_trades_prevented", e.stats.self_trades_prevented);
    c.integer("open_orders", cast<long>(e.openOrders()));
    c.integer("tape_total", e.tape.total);
    local book: *OrderBook = e.book(sym);
    c.integer("bid_levels", cast<long>(book.bids.count));
    c.integer("ask_levels", cast<long>(book.asks.count));
    c.integer("best_bid", book.bestBid());
    c.integer("best_ask", book.bestAsk());
    c.value("vwap", book.vwap() / 10000.0, 6);
    c.value("microprice", book.microprice() / 10000.0, 6);
    c.value("imbalance", book.imbalance(5), 6);
    c.value("final_fair", s.final_fair, 6);
    c.integer("order_flow", e.tape.orderFlow(sym));
    local err: string = e.validate();
    c.ok("book_valid", err == nullptr);
    if (err != nullptr) {
        c.text("book_error", err);
    }
    c.equalInt("tape_volume_consistent", e.tape.total_volume, e.stats.volume);
    c.ok("not_crossed", book.bestBid() < book.bestAsk());
    local depth: DepthLevel[5];
    local n: int = book.depth(Side.Buy, &depth[0], 5);
    c.ok("depth_sorted", (n < 2) || (depth[0].price > depth[1].price));
    c.value("impact_buy_1000", book.impactPrice(Side.Buy, 1000) / 10000.0, 6);
    sim.destroy();
    e.destroy();
}

frame runMarketTests(c: *Check) {
    testHashMaps(c);
    testBasicMatching(c);
    testCancelReplace(c);
    testStops(c);
    testSimulation(c);
}
