# Self-tests for the columnar store and the query-result cache.

import [Math] from "std/math.bpl";
import [Check] from "./check.bpl";
import [Text] from "../core/text.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [ColumnTable], [ColumnKind], [ColQuery], [ColResult], [QueryCache] from "../cache/columnar.bpl";
import [ColumnarCatalog] from "../cache/catalog.bpl";
import [Engine], [OrderRequest] from "../market/engine.bpl";
import [Ticks], [Side] from "../market/order.bpl";

export runDataTests;

frame fillTable(t: *ColumnTable, rows: int) {
    t.init("t");
    t.addColumn("time", ColumnKind.I64);
    t.addColumn("symbol", ColumnKind.Str);
    t.addColumn("price", ColumnKind.F64);
    t.addColumn("qty", ColumnKind.I64);
    t.addColumn("side", ColumnKind.Str);
    local names: string[4] = ["AAA", "BBB", "CCC", "DDD"];
    local rng: Xoshiro = Xoshiro.new(cast<u64>(21));
    loop (local i: int = 0; i < rows; i = i + 1) {
        local row: int = t.beginRow();
        t.setI(row, 0, cast<long>(1000 + (i * 10)));
        local s: int = rng.range(0, 4);
        t.setS(row, 1, names[s]);
        t.setF(row, 2, (50.0 * cast<float>(s + 1)) + rng.uniform(-5.0, 5.0));
        t.setI(row, 3, cast<long>(rng.range(1, 100)));
        t.setS(row, 4, rng.chance(0.5) ? "buy" : "sell");
        t.commit();
    }
}

frame testColumnar(c: *Check) {
    c.begin("columnar");
    local t: ColumnTable;
    fillTable(&t, 10000);
    c.equalInt("rows", cast<long>(t.rows), 10000);
    c.equalInt("blocks", cast<long>(t.blocks()), 10);
    local raw: long = 0;
    local enc: long = t.encodedBytes(&raw);
    c.integer("raw_bytes", raw);
    c.integer("encoded_bytes", enc);
    c.ok("compresses", enc < raw);
    # Grouped aggregates against a brute-force pass.
    local q: ColQuery;
    c.ok("parse", t.parseQuery("side = 'buy' and qty >= 10", "symbol", "count(*), sum(qty), avg(price), min(price), max(price), vwap(price, qty)", &q));
    local r: ColResult = t.run(&q);
    c.equalInt("groups", cast<long>(r.groups), 4);
    local sym: int = t.find("symbol");
    local bbb: int = t.columns[sym].dict.find("BBB");
    local count: float = 0.0;
    local sum_qty: float = 0.0;
    local sum_px: float = 0.0;
    local notional: float = 0.0;
    local lo: float = 1000000.0;
    local hi: float = -1000000.0;
    loop (local i: int = 0; i < t.rows; i = i + 1) {
        local is_buy: bool = Text.equals(t.stringAt(4, i), "buy");
        if (is_buy && (t.numberAt(3, i) >= 10.0) && (t.columns[sym].codes[i] == bbb)) {
            count = count + 1.0;
            sum_qty = sum_qty + t.numberAt(3, i);
            sum_px = sum_px + t.numberAt(2, i);
            notional = notional + (t.numberAt(2, i) * t.numberAt(3, i));
            lo = Math.min(lo, t.numberAt(2, i));
            hi = Math.max(hi, t.numberAt(2, i));
        }
    }
    local g: int = cast<int>(r.index.getOr(cast<long>(bbb), -1));
    c.ok("group_found", g >= 0);
    c.near("count", r.value(g, 0), count, 0.0);
    c.near("sum", r.value(g, 1), sum_qty, 0.0);
    c.near("avg", r.value(g, 2), sum_px / count, 0.000000001);
    c.near("min", r.value(g, 3), lo, 0.0);
    c.near("max", r.value(g, 4), hi, 0.0);
    c.near("vwap", r.value(g, 5), notional / sum_qty, 0.000000001);
    c.integer("matched", r.stats.rows_matched);
    r.destroy();
    # Zone maps prune blocks on the sorted time column.
    local qt: ColQuery;
    t.parseQuery("time >= 95000", "", "count(*)", &qt);
    local rt: ColResult = t.run(&qt);
    c.equalInt("pruned_blocks", cast<long>(rt.stats.pruned), 9);
    c.near("time_count", rt.value(0, 0), 600.0, 0.0);
    rt.destroy();
    # A string absent from the dictionary prunes everything.
    local qn: ColQuery;
    t.parseQuery("symbol = 'ZZZ'", "", "count(*)", &qn);
    local rn: ColResult = t.run(&qn);
    c.equalInt("absent_pruned", cast<long>(rn.stats.pruned), 10);
    c.equalInt("absent_groups", cast<long>(rn.groups), 0);
    rn.destroy();
    # Two-column grouping.
    local q2: ColQuery;
    t.parseQuery("", "symbol, side", "count(*)", &q2);
    local r2: ColResult = t.run(&q2);
    c.equalInt("pair_groups", cast<long>(r2.groups), 8);
    local total: float = 0.0;
    loop (local k: int = 0; k < r2.groups; k = k + 1) {
        total = total + r2.value(k, 0);
    }
    c.near("pair_total", total, 10000.0, 0.0);
    r2.destroy();
    # Parse errors.
    local bad: ColQuery;
    c.ok("bad_column", !t.parseQuery("nope > 1", "", "", &bad));
    c.text("bad_column_error", bad.error);
    c.ok("bad_op", !t.parseQuery("price ~ 1", "", "", &bad));
    c.ok("bad_string_op", !t.parseQuery("symbol > 'A'", "", "", &bad));
    c.ok("bad_number", !t.parseQuery("price > abc", "", "", &bad));
    c.ok("bad_agg", !t.parseQuery("", "", "median(price)", &bad));
    c.ok("bad_vwap", !t.parseQuery("", "", "vwap(price)", &bad));
    c.ok("string_agg", !t.parseQuery("", "", "sum(symbol)", &bad));
    c.ok("quoted_and", t.parseQuery("symbol = 'A and B'", "", "count(*)", &bad) && (bad.pred_count == 1));
    t.destroy();
}

frame testQueryCache(c: *Check) {
    c.begin("query_cache");
    local cache: QueryCache;
    cache.init(2);
    local k1: u64 = QueryCache.normalise("SELECT  sum(qty)\tFROM trades");
    c.ok("normalised", k1 == QueryCache.normalise("select sum(QTY) from   trades"));
    c.ok("miss", cache.get(k1, 1) == nullptr);
    cache.put(k1, 1, "{\"a\":1}");
    c.ok("hit", Text.equals(cache.get(k1, 1), "{\"a\":1}"));
    c.ok("stale", cache.get(k1, 2) == nullptr);
    c.equalInt("stale_count", cache.stale, 1);
    cache.put(1, 1, "x");
    cache.put(2, 1, "y");
    cache.get(1, 1);
    cache.put(3, 1, "z");
    c.equalInt("evictions", cache.evictions, 1);
    c.ok("lru_kept", cache.get(1, 1) != nullptr);
    c.ok("lru_evicted", cache.get(2, 1) == nullptr);
    c.value("hit_rate", cache.hitRate(), 4);
    cache.destroy();
    # Catalog over a live engine: appending trades bumps the version.
    local cat: *ColumnarCatalog = ColumnarCatalog.create();
    local e: Engine = Engine.new(1024);
    local sym: int = e.addSymbol("ACME", Ticks.fromFloat(100.0));
    local a: int = e.accountId("a");
    local b: int = e.accountId("b");
    loop (local i: int = 0; i < 50; i = i + 1) {
        local ask: OrderRequest = OrderRequest.limit(sym, a, Side.Sell, Ticks.fromFloat(100.0 + cast<float>(i % 5)), 10);
        local bid: OrderRequest = OrderRequest.limit(sym, b, Side.Buy, Ticks.fromFloat(104.0), 10);
        e.submit(&ask);
        e.submit(&bid);
    }
    c.equalInt("copied", cast<long>(cat.refreshTrades(&e)), 50);
    c.equalInt("incremental", cast<long>(cat.refreshTrades(&e)), 0);
    local q: ColQuery;
    cat.trades.parseQuery("price >= 102", "symbol", "count(*), sum(notional)", &q);
    local r: ColResult = cat.trades.run(&q);
    local w: JsonWriter = JsonWriter.new(512);
    ColumnarCatalog.render(&cat.trades, &q, &r, &w, 100);
    c.text("render", w.toString());
    w.destroy();
    r.destroy();
    e.destroy();
}

frame runDataTests(c: *Check) {
    testColumnar(c);
    testQueryCache(c);
}
