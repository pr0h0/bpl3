# Self-tests for the QQL query language.

import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Text] from "../core/text.bpl";
import [Engine], [OrderRequest] from "../market/engine.bpl";
import [Side], [Ticks] from "../market/order.bpl";
import [SeriesStore] from "../series/store.bpl";
import [BarSeries] from "../series/bars.bpl";
import [Qql], [QqlRun] from "../sql/qql.bpl";
import [Executor], [SqlValue], [SqlType] from "../sql/executor.bpl";

export runSqlTests;

frame px(units: float) ret long {
    return Ticks.fromFloat(units);
}

# Four trades: ACME 100@10 (buy), 50@11 (buy), ZED 10@5 (sell), ACME 25@12 (sell).
frame fixture(e: *Engine) {
    local acme: int = e.addSymbol("ACME", px(10.0));
    local zed: int = e.addSymbol("ZED", px(5.0));
    local mm: int = e.accountId("mm");
    local alice: int = e.accountId("alice");
    local bob: int = e.accountId("bob");
    local s1: OrderRequest = OrderRequest.limit(acme, mm, Side.Sell, px(10.0), 100);
    e.submit(&s1);
    local b1: OrderRequest = OrderRequest.limit(acme, alice, Side.Buy, px(10.0), 100);
    e.submit(&b1);
    local s2: OrderRequest = OrderRequest.limit(acme, mm, Side.Sell, px(11.0), 50);
    e.submit(&s2);
    local b2: OrderRequest = OrderRequest.limit(acme, bob, Side.Buy, px(11.0), 50);
    e.submit(&b2);
    local b3: OrderRequest = OrderRequest.limit(zed, mm, Side.Buy, px(5.0), 10);
    e.submit(&b3);
    local s3: OrderRequest = OrderRequest.limit(zed, alice, Side.Sell, px(5.0), 10);
    e.submit(&s3);
    local b4: OrderRequest = OrderRequest.limit(acme, mm, Side.Buy, px(12.0), 25);
    e.submit(&b4);
    local s4: OrderRequest = OrderRequest.limit(acme, bob, Side.Sell, px(12.0), 25);
    e.submit(&s4);
    # One resting order for the orders table.
    local rest: OrderRequest = OrderRequest.limit(acme, alice, Side.Buy, px(9.5), 40);
    e.submit(&rest);
}

frame scalar(c: *Check, label: string, e: *Engine, store: *SeriesStore, sql: string, expected: float) {
    local r: QqlRun;
    Qql.execute(&r, sql, e, store, 1000);
    if (!r.ok) {
        c.ok(label, false);
        c.text(label, r.error);
    } else if (r.result.rows < 1) {
        c.ok(label, false);
    } else {
        local v: SqlValue = r.result.at(0, 0);
        c.near(label, v.kind == SqlType.Null ? 0.0 / 0.0 : v.num, expected, 0.000000001);
    }
    r.destroy();
}

frame text(c: *Check, label: string, e: *Engine, store: *SeriesStore, sql: string, row: int, col: int, expected: string) {
    local r: QqlRun;
    Qql.execute(&r, sql, e, store, 1000);
    local ok: bool = r.ok && (r.result.rows > row);
    if (ok) {
        local v: SqlValue = r.result.at(row, col);
        ok = (v.kind == SqlType.Str) && Text.equals(v.str, expected);
    }
    c.ok(label, ok);
    if (!ok && (r.error != nullptr)) {
        c.text(label, r.error);
    }
    r.destroy();
}

frame rows(c: *Check, label: string, e: *Engine, store: *SeriesStore, sql: string, expected: int) {
    local r: QqlRun;
    Qql.execute(&r, sql, e, store, 1000);
    c.ok(label, r.ok && (r.result.rows == expected));
    if (!r.ok) {
        c.text(label, r.error);
    }
    r.destroy();
}

frame failure(c: *Check, label: string, e: *Engine, store: *SeriesStore, sql: string) {
    local r: QqlRun;
    Qql.execute(&r, sql, e, store, 1000);
    c.ok(label, !r.ok && (r.error != nullptr));
    r.destroy();
}

frame testQql(c: *Check) {
    c.begin("qql");
    local e: Engine = Engine.new(64);
    fixture(&e);
    local store: SeriesStore = SeriesStore.new(86400);
    store.load("ACME", BarSeries.synthetic(cast<u64>(3), 100, 50.0, 0.0, 0.2, 86400));
    scalar(c, "count_star", &e, &store, "SELECT COUNT(*) FROM trades", 4.0);
    scalar(c, "sum_qty", &e, &store, "select sum(qty) from trades where symbol = 'ACME'", 175.0);
    scalar(c, "avg_price", &e, &store, "SELECT AVG(price) FROM trades WHERE symbol = 'ACME'", 11.0);
    scalar(c, "vwap", &e, &store, "SELECT VWAP(price, qty) FROM trades WHERE symbol = 'ACME'", (1000.0 + 550.0 + 300.0) / 175.0);
    scalar(c, "arithmetic", &e, &store, "SELECT 1 + 2 * 3 - 10 / 4 FROM trades LIMIT 1", 4.5);
    scalar(c, "between", &e, &store, "SELECT COUNT(*) FROM trades WHERE price BETWEEN 10 AND 11", 2.0);
    scalar(c, "not_between", &e, &store, "SELECT COUNT(*) FROM trades WHERE price NOT BETWEEN 10 AND 11", 2.0);
    scalar(c, "in_list", &e, &store, "SELECT COUNT(*) FROM trades WHERE buyer IN ('alice', 'bob')", 2.0);
    scalar(c, "like", &e, &store, "SELECT COUNT(*) FROM trades WHERE seller LIKE 'a%'", 1.0);
    scalar(c, "like_underscore", &e, &store, "SELECT COUNT(*) FROM trades WHERE symbol LIKE 'A_ME'", 3.0);
    scalar(c, "case_when", &e, &store, "SELECT SUM(CASE WHEN side = 'buy' THEN qty ELSE -qty END) FROM trades", 150.0 - 35.0);
    scalar(c, "having", &e, &store, "SELECT COUNT(*) AS n FROM trades GROUP BY symbol HAVING COUNT(*) > 1", 3.0);
    scalar(c, "stddev", &e, &store, "SELECT STDDEV(price) FROM trades WHERE symbol = 'ACME'", 1.0);
    scalar(c, "min_max", &e, &store, "SELECT MAX(price) - MIN(price) FROM trades", 7.0);
    scalar(c, "coalesce_null", &e, &store, "SELECT COALESCE(NULL, 7) FROM trades LIMIT 1", 7.0);
    scalar(c, "round", &e, &store, "SELECT ROUND(2.345, 2) FROM trades LIMIT 1", 2.35);
    scalar(c, "bucket", &e, &store, "SELECT BUCKET(17, 5) FROM trades LIMIT 1", 15.0);
    scalar(c, "orders_table", &e, &store, "SELECT SUM(remaining) FROM orders WHERE side = 'buy'", 40.0);
    scalar(c, "bars_table", &e, &store, "SELECT COUNT(*) FROM bars('ACME') WHERE close > open OR close <= open", 100.0);
    scalar(c, "symbols_table", &e, &store, "SELECT COUNT(*) FROM symbols WHERE trades > 0", 2.0);
    scalar(c, "is_null", &e, &store, "SELECT COUNT(*) FROM bars('ACME') WHERE return IS NULL", 1.0);
    text(c, "group_order", &e, &store, "SELECT symbol, SUM(qty) AS volume FROM trades GROUP BY symbol ORDER BY volume DESC", 0, 0, "ACME");
    text(c, "group_order_second", &e, &store, "SELECT symbol, SUM(qty) AS volume FROM trades GROUP BY symbol ORDER BY volume DESC", 1, 0, "ZED");
    text(c, "order_by_multi", &e, &store, "SELECT seller, price FROM trades ORDER BY seller ASC, price DESC", 1, 0, "bob");
    text(c, "concat_lower", &e, &store, "SELECT LOWER(symbol) || '-' || side FROM trades ORDER BY id LIMIT 1", 0, 0, "acme-buy");
    text(c, "first_last", &e, &store, "SELECT LAST(seller) FROM trades WHERE symbol = 'ACME'", 0, 0, "bob");
    rows(c, "limit_offset", &e, &store, "SELECT * FROM trades ORDER BY id LIMIT 2 OFFSET 1", 2);
    rows(c, "offset_past_end", &e, &store, "SELECT id FROM trades OFFSET 10", 0);
    rows(c, "group_by_two", &e, &store, "SELECT symbol, side, COUNT(*) FROM trades GROUP BY symbol, side", 3);
    rows(c, "aggregate_empty", &e, &store, "SELECT COUNT(*) FROM trades WHERE qty > 1000", 1);
    scalar(c, "count_empty_zero", &e, &store, "SELECT COUNT(*) FROM trades WHERE qty > 1000", 0.0);
    rows(c, "quoted_identifier", &e, &store, "SELECT \"qty\" FROM trades WHERE \"qty\" = 50", 1);
    rows(c, "comment_and_semicolon", &e, &store, "SELECT id FROM trades -- all of them\n;", 4);
    failure(c, "unknown_table", &e, &store, "SELECT * FROM nope");
    failure(c, "unknown_column", &e, &store, "SELECT nope FROM trades");
    failure(c, "ungrouped_column", &e, &store, "SELECT symbol, COUNT(*) FROM trades");
    failure(c, "aggregate_in_where", &e, &store, "SELECT id FROM trades WHERE SUM(qty) > 1");
    failure(c, "having_without_group", &e, &store, "SELECT id FROM trades HAVING id > 1");
    failure(c, "syntax_error", &e, &store, "SELECT FROM trades");
    failure(c, "unterminated_string", &e, &store, "SELECT 'abc FROM trades");
    failure(c, "bad_limit", &e, &store, "SELECT id FROM trades LIMIT -1");
    failure(c, "unknown_function", &e, &store, "SELECT nope(1) FROM trades");
    failure(c, "star_with_group", &e, &store, "SELECT * FROM trades GROUP BY symbol");
    failure(c, "bars_without_symbol", &e, &store, "SELECT * FROM bars");
    store.destroy();
    e.destroy();
}

frame runSqlTests(c: *Check) {
    testQql(c);
}
