# Self-tests for SQLite persistence (in-memory database).

import [Check] from "./check.bpl";
import [Statement] from "bpl-sqlite";
import [Store], [StoreStats] from "../store/db.bpl";
import [Engine], [OrderRequest] from "../market/engine.bpl";
import [Ticks], [Side] from "../market/order.bpl";
import [FlowSimulator], [SimSummary] from "../market/simulator.bpl";
import [BarSeries] from "../series/bars.bpl";

export runStoreTests;

frame testStore(c: *Check) {
    c.begin("store");
    local store: Store;
    c.ok("connect", store.connect(":memory:", 7));
    local e: Engine = Engine.new(4096);
    local sym: int = e.addSymbol("PERS", Ticks.fromFloat(50.0));
    local sim: FlowSimulator = FlowSimulator.new(cast<u64>(5), sym, 50.0);
    sim.run(&e, 3000);
    sim.destroy();
    local first: int = store.persistTrades(&e);
    c.equalInt("first_flush_all", cast<long>(first), cast<long>(e.tape.count));
    c.equalInt("second_flush_none", cast<long>(store.persistTrades(&e)), 0);
    local more: OrderRequest = OrderRequest.limit(sym, e.accountId("x"), Side.Buy, Ticks.fromFloat(60.0), 10);
    e.submit(&more);
    local st: StoreStats = store.stats();
    c.equalInt("rows_match_tape", st.trades, cast<long>(e.tape.count) - cast<long>(e.stats.trades - cast<long>(first)));
    c.equalInt("max_id", st.max_trade_id, store.last_trade_id);
    # SQL aggregates agree with the engine's counters.
    local q: Statement = store.db.prepare("SELECT SUM(qty), COUNT(DISTINCT symbol) FROM trades WHERE worker=?");
    q.bindInt(1, 7);
    q.step();
    local volume: long = q.integer(0);
    local symbols: long = q.integer(1);
    q.close();
    local tape_volume: long = 0;
    loop (local i: int = 0; i < first; i = i + 1) {
        tape_volume = tape_volume + e.tape.at(i).quantity;
    }
    c.equalInt("sql_volume", volume, tape_volume);
    c.equalInt("sql_symbols", symbols, 1);
    local bars: BarSeries = BarSeries.synthetic(cast<u64>(9), 120, 30.0, 0.0, 0.3, 86400);
    c.equalInt("bars_saved", cast<long>(store.saveBars("PERS", &bars)), 120);
    c.equalInt("bars_resaved", cast<long>(store.saveBars("PERS", &bars)), 120);
    local loaded: BarSeries;
    c.ok("bars_loaded", store.loadBars("PERS", 86400, &loaded));
    c.equalInt("bars_count", cast<long>(loaded.len), 120);
    c.near("bars_close_roundtrip", loaded.close[119], bars.close[119], 0.0);
    c.near("bars_vwap_roundtrip", loaded.vwap[3], bars.vwap[3], 0.0);
    loaded.destroy();
    local missing: BarSeries;
    c.ok("missing_symbol", !store.loadBars("NOPE", 86400, &missing));
    missing.destroy();
    c.ok("integrity", store.integrity());
    local snap: long = store.snapshot("test", "{\"ok\":true}", 1);
    c.equalInt("snapshot_id", snap, 1);
    local stats2: StoreStats = store.stats();
    c.equalInt("bar_rows", stats2.bars, 120);
    bars.destroy();
    e.destroy();
    store.close();
}

frame runStoreTests(c: *Check) {
    testStore(c);
}
