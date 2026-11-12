# Self-tests for the position ledger, call auctions, execution algorithms
# and the market maker.

import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Engine], [OrderRequest], [ExecReport] from "../market/engine.bpl";
import [Side], [Ticks], [Trade] from "../market/order.bpl";
import [Ledger], [Position], [AccountSummary] from "../market/ledger.bpl";
import [Auction], [AuctionOrder], [AuctionResult] from "../market/auction.bpl";
import [ExecAlgo], [AlgoKind], [AlgoReport], [MarketMaker], [MakerReport] from "../market/algos.bpl";
import [FlowSimulator] from "../market/simulator.bpl";

export runMicroTests;

frame px(x: float) ret long {
    return Ticks.fromFloat(x);
}

frame testLedger(c: *Check) {
    c.begin("ledger");
    local e: Engine = Engine.new(256);
    local sym: int = e.addSymbol("LDG", px(100.0));
    local a: int = e.accountId("a");
    local b: int = e.accountId("b");
    # a buys 100 @ 100, then 50 @ 110; sells 120 @ 120.
    local s1: OrderRequest = OrderRequest.limit(sym, b, Side.Sell, px(100.0), 100);
    e.submit(&s1);
    local b1: OrderRequest = OrderRequest.limit(sym, a, Side.Buy, px(100.0), 100);
    e.submit(&b1);
    local s2: OrderRequest = OrderRequest.limit(sym, b, Side.Sell, px(110.0), 50);
    e.submit(&s2);
    local b2: OrderRequest = OrderRequest.limit(sym, a, Side.Buy, px(110.0), 50);
    e.submit(&b2);
    local b3: OrderRequest = OrderRequest.limit(sym, b, Side.Buy, px(120.0), 120);
    e.submit(&b3);
    local s3: OrderRequest = OrderRequest.limit(sym, a, Side.Sell, px(120.0), 120);
    e.submit(&s3);
    local l: Ledger = Ledger.new(0.0);
    c.equalInt("synced", cast<long>(l.sync(&e)), 3);
    local pa: *Position = l.position(a, sym);
    c.equalInt("a_quantity", pa.quantity, 30);
    # FIFO: 100 closed at +20 each, 20 of the 110 lot closed at +10 each.
    c.near("a_realized", pa.realized, 2000.0 + 200.0, 0.000000001);
    c.near("a_average_cost", l.averageCost(pa), 110.0, 0.000000001);
    local pb: *Position = l.position(b, sym);
    c.equalInt("b_quantity", pb.quantity, -30);
    c.near("b_realized", pb.realized, -2200.0, 0.000000001);
    c.equalInt("net_zero", l.netQuantity(sym), 0);
    c.near("zero_sum_pnl", l.grossPnl(&e), 0.0, 0.0000001);
    c.equalInt("no_double_sync", cast<long>(l.sync(&e)), 0);
    local sa: AccountSummary = l.summary(&e, a);
    c.near("a_unrealized", sa.unrealized, 30.0 * (120.0 - 110.0), 0.000000001);
    c.near("a_equity", sa.equity, 2500.0, 0.000000001);
    # FIFO leaves b short 30 from the 110 lot.
    c.near("b_average_cost", l.averageCost(pb), 110.0, 0.000000001);
    local fee_ledger: Ledger = Ledger.new(10.0);
    fee_ledger.sync(&e);
    local fa: *Position = fee_ledger.position(a, sym);
    c.near("fees", fa.fees, ((100.0 * 100.0) + (50.0 * 110.0) + (120.0 * 120.0)) * 0.001, 0.000000001);
    fee_ledger.destroy();
    # A simulated session keeps the ledger balanced.
    local sim: FlowSimulator = FlowSimulator.new(cast<u64>(17), sym, 120.0);
    sim.run(&e, 5000);
    sim.destroy();
    l.sync(&e);
    c.equalInt("sim_net_zero", l.netQuantity(sym), 0);
    c.near("sim_zero_sum", l.grossPnl(&e), 0.0, 0.0001);
    c.integer("sim_positions", cast<long>(l.count));
    l.destroy();
    e.destroy();
}

frame testAuction(c: *Check) {
    c.begin("auction");
    local a: Auction = Auction.new(px(10.0));
    a.add(1, Side.Buy, px(10.2), 300);
    a.add(2, Side.Buy, px(10.1), 200);
    a.add(3, Side.Buy, px(9.9), 400);
    a.add(4, Side.Buy, 0, 100);
    a.add(5, Side.Sell, px(9.8), 250);
    a.add(6, Side.Sell, px(10.0), 300);
    a.add(7, Side.Sell, px(10.1), 200);
    a.add(8, Side.Sell, 0, 50);
    local ind: AuctionResult = a.indicative();
    # At 10.1: demand 600, supply 800 -> 600. At 10.0: demand 600, supply 600 -> 600 with zero imbalance.
    c.equalInt("price", ind.price, px(10.0));
    c.equalInt("volume", ind.volume, 600);
    c.equalInt("imbalance", ind.imbalance, 0);
    local r: AuctionResult = a.uncross();
    c.equalInt("buy_filled", a.filledVolume(Side.Buy), 600);
    c.equalInt("sell_filled", a.filledVolume(Side.Sell), 600);
    c.equalInt("market_buy_first", a.orders[3].filled, 100);
    c.equalInt("worse_buy_unfilled", a.orders[2].filled, 0);
    c.equalInt("partial_priority", a.orders[1].filled, 200);
    c.ok("crossed", r.crossed);
    a.destroy();
    local none: Auction = Auction.new(px(10.0));
    none.add(1, Side.Buy, px(9.0), 100);
    none.add(2, Side.Sell, px(11.0), 100);
    local nr: AuctionResult = none.uncross();
    c.ok("no_cross", !nr.crossed && (nr.volume == 0));
    none.destroy();
    local tie: Auction = Auction.new(px(10.05));
    tie.add(1, Side.Buy, px(10.1), 100);
    tie.add(2, Side.Sell, px(10.0), 100);
    local tr: AuctionResult = tie.indicative();
    c.equalInt("equal_distance_takes_lower", tr.price, px(10.0));
}

frame testAlgos(c: *Check) {
    c.begin("exec_algos");
    local kinds: AlgoKind[3] = [AlgoKind.Twap, AlgoKind.Vwap, AlgoKind.Pov];
    loop (local k: int = 0; k < 3; k = k + 1) {
        local e: Engine = Engine.new(8192);
        local sym: int = e.addSymbol("ALG", px(50.0));
        local sim: FlowSimulator = FlowSimulator.new(cast<u64>(23), sym, 50.0);
        local acct: int = e.accountId("algo");
        local r: AlgoReport = ExecAlgo.run(&e, &sim, kinds[k], sym, acct, Side.Buy, 5000, 20, 500, 0.1, 20.0);
        c.equalInt("fully_filled", r.filled, 5000);
        c.value(ExecAlgo.kindName(kinds[k]), r.shortfall_bps, 4);
        c.ok("participation_sane", (r.participation > 0.0) && (r.participation < 1.0));
        c.ok("book_valid", e.validate() == nullptr);
        sim.destroy();
        e.destroy();
    }
}

frame testMarketMaker(c: *Check) {
    c.begin("market_maker");
    local mm: MarketMaker = MarketMaker { gamma: 0.1, sigma: 2.0, kappa: 1.5, horizon: 1.0, size: 50, max_inventory: 1000 };
    local bid: float = 0.0;
    local ask: float = 0.0;
    mm.quotes(100.0, 0, 1.0, &bid, &ask);
    c.near("symmetric_flat", 100.0 - bid, ask - 100.0, 0.0000000001);
    mm.quotes(100.0, 10, 1.0, &bid, &ask);
    c.ok("long_skews_down", ((bid + ask) / 2.0) < 100.0);
    local e: Engine = Engine.new(16384);
    local sym: int = e.addSymbol("MM", px(100.0));
    local sim: FlowSimulator = FlowSimulator.new(cast<u64>(29), sym, 100.0);
    local maker: MarketMaker = MarketMaker { gamma: 0.05, sigma: 0.05, kappa: 50.0, horizon: 1.0, size: 50, max_inventory: 500 };
    local r: MakerReport = maker.run(&e, &sim, sym, e.accountId("maker"), 200, 50);
    c.ok("maker_traded", r.fills > 0);
    c.ok("inventory_bounded", r.max_inventory <= (500 + (50 * 4)));
    c.integer("maker_fills", r.fills);
    c.value("maker_pnl", r.pnl, 4);
    c.value("maker_spread_bps", r.average_spread_bps, 4);
    c.ok("book_valid", e.validate() == nullptr);
    sim.destroy();
    e.destroy();
}

frame runMicroTests(c: *Check) {
    testLedger(c);
    testAuction(c);
    testAlgos(c);
    testMarketMaker(c);
}
