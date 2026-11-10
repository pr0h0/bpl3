# Columnar copies of the app's live data plus the shared result cache.
#
# The trades table follows the matching engine's tape incrementally (rows
# are appended for trade ids not seen yet); the bars table is rebuilt when
# the series store's bar count changes. Query results are rendered to JSON
# once and cached under (query text, table version).

import malloc from "std/c.bpl";
import [Text] from "../core/text.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [Engine] from "../market/engine.bpl";
import [Trade], [Ticks] from "../market/order.bpl";
import [SeriesStore], [SeriesEntry] from "../series/store.bpl";
import [ColumnTable], [ColumnKind], [ColQuery], [ColResult], [AggKind], [QueryCache] from "./columnar.bpl";

export [ColumnarCatalog];

struct ColumnarCatalog {
    trades: ColumnTable,
    bars: ColumnTable,
    cache: QueryCache,
    last_trade_id: long,
    bars_seen: long,
    refreshes: long,

    frame create() ret *ColumnarCatalog {
        local c: *ColumnarCatalog = cast<*ColumnarCatalog>(malloc(sizeof(ColumnarCatalog)));
        # init() stores the vtable word that malloc leaves unset (BUG-800).
        c.init();
        return c;
    }

    frame init(this: *ColumnarCatalog) {
        this.trades.init("trades");
        this.trades.addColumn("id", ColumnKind.I64);
        this.trades.addColumn("symbol", ColumnKind.Str);
        this.trades.addColumn("price", ColumnKind.F64);
        this.trades.addColumn("qty", ColumnKind.I64);
        this.trades.addColumn("side", ColumnKind.Str);
        this.trades.addColumn("buyer", ColumnKind.Str);
        this.trades.addColumn("seller", ColumnKind.Str);
        this.trades.addColumn("time", ColumnKind.I64);
        this.trades.addColumn("notional", ColumnKind.F64);
        ColumnarCatalog.barColumns(&this.bars);
        this.cache.init(64);
        this.last_trade_id = 0;
        this.bars_seen = -1;
        this.refreshes = 0;
    }

    frame barColumns(t: *ColumnTable) {
        t.init("bars");
        t.addColumn("symbol", ColumnKind.Str);
        t.addColumn("time", ColumnKind.I64);
        t.addColumn("open", ColumnKind.F64);
        t.addColumn("high", ColumnKind.F64);
        t.addColumn("low", ColumnKind.F64);
        t.addColumn("close", ColumnKind.F64);
        t.addColumn("volume", ColumnKind.F64);
        t.addColumn("range", ColumnKind.F64);
        t.addColumn("return", ColumnKind.F64);
    }

    frame appendTrade(t: *ColumnTable, e: *Engine, tr: *Trade) {
        local row: int = t.beginRow();
        t.setI(row, 0, tr.id);
        t.setS(row, 1, e.symbolName(tr.symbol));
        t.setF(row, 2, Ticks.toFloat(tr.price));
        t.setI(row, 3, tr.quantity);
        t.setS(row, 4, Ticks.sideName(tr.aggressor));
        t.setS(row, 5, e.accounts.name(tr.buy_account));
        t.setS(row, 6, e.accounts.name(tr.sell_account));
        t.setI(row, 7, tr.timestamp);
        t.setF(row, 8, Ticks.toFloat(tr.price) * cast<float>(tr.quantity));
        t.commit();
    }

    # Appends trades newer than the last one copied. The tape is a ring, so
    # trades that scrolled out before a refresh are skipped.
    frame refreshTrades(this: *ColumnarCatalog, e: *Engine) ret int {
        local n: int = e.tape.count;
        local first: int = n;
        loop ((first > 0) && (e.tape.at(first - 1).id > this.last_trade_id)) {
            first = first - 1;
        }
        loop (local i: int = first; i < n; i = i + 1) {
            local tr: *Trade = e.tape.at(i);
            ColumnarCatalog.appendTrade(&this.trades, e, tr);
            this.last_trade_id = tr.id;
        }
        return n - first;
    }

    frame refreshBars(this: *ColumnarCatalog, series: *SeriesStore) ret bool {
        local total: long = series.totalBars();
        if (total == this.bars_seen) {
            return false;
        }
        this.bars.clear();
        loop (local s: int = 0; s < series.count; s = s + 1) {
            local entry: *SeriesEntry = series.entries + s;
            local name: string = series.symbolAt(s);
            loop (local i: int = 0; i < entry.bars.len; i = i + 1) {
                local row: int = this.bars.beginRow();
                this.bars.setS(row, 0, name);
                this.bars.setI(row, 1, entry.bars.time[i]);
                this.bars.setF(row, 2, entry.bars.open[i]);
                this.bars.setF(row, 3, entry.bars.high[i]);
                this.bars.setF(row, 4, entry.bars.low[i]);
                this.bars.setF(row, 5, entry.bars.close[i]);
                this.bars.setF(row, 6, entry.bars.volume[i]);
                this.bars.setF(row, 7, entry.bars.high[i] - entry.bars.low[i]);
                this.bars.setF(row, 8, i == 0 ? 0.0 : (entry.bars.close[i] / entry.bars.close[i - 1]) - 1.0);
                this.bars.commit();
            }
        }
        this.bars_seen = total;
        this.refreshes = this.refreshes + 1;
        return true;
    }

    frame table(this: *ColumnarCatalog, name: string) ret *ColumnTable {
        if (Text.equalsIgnoreCase(name, "trades")) {
            return &this.trades;
        }
        if (Text.equalsIgnoreCase(name, "bars")) {
            return &this.bars;
        }
        return nullptr;
    }

    frame aggName(kind: AggKind) ret string {
        if (kind == AggKind.Count) {
            return "count";
        }
        if (kind == AggKind.Sum) {
            return "sum";
        }
        if (kind == AggKind.Min) {
            return "min";
        }
        if (kind == AggKind.Max) {
            return "max";
        }
        if (kind == AggKind.Avg) {
            return "avg";
        }
        if (kind == AggKind.First) {
            return "first";
        }
        if (kind == AggKind.Last) {
            return "last";
        }
        return "vwap";
    }

    # Writes groups as objects (group columns, then aggregate values).
    frame render(t: *ColumnTable, q: *ColQuery, r: *ColResult, w: *JsonWriter, limit: int) {
        w.beginObject();
        w.fieldStr("table", t.name);
        w.fieldInt("version", t.version);
        w.fieldInt("rows", cast<long>(t.rows));
        w.key("scan").beginObject();
        w.fieldInt("blocks", cast<long>(r.stats.blocks));
        w.fieldInt("pruned", cast<long>(r.stats.pruned));
        w.fieldInt("rows_scanned", r.stats.rows_scanned);
        w.fieldInt("rows_matched", r.stats.rows_matched);
        w.endObject();
        w.fieldInt("groups", cast<long>(r.groups));
        w.key("result").beginArray();
        local shown: int = r.groups < limit ? r.groups : limit;
        loop (local g: int = 0; g < shown; g = g + 1) {
            w.beginObject();
            loop (local k: int = 0; k < q.group_count; k = k + 1) {
                local c: int = q.group[k];
                local part: long = t.keyPart(q, r.keys[g], k);
                if (t.isString(c)) {
                    w.fieldStr(t.columnName(c), t.dictName(c, cast<int>(part)));
                } else {
                    w.fieldInt(t.columnName(c), part);
                }
            }
            loop (local a: int = 0; a < q.agg_count; a = a + 1) {
                local label: char[48];
                ColumnarCatalog.aggLabel(t, q, a, &label[0], 48);
                w.fieldNum(cast<string>(&label[0]), r.value(g, a));
            }
            w.endObject();
        }
        w.endArray();
        w.endObject();
    }

    frame aggLabel(t: *ColumnTable, q: *ColQuery, a: int, out: *char, cap: int) {
        local fname: string = ColumnarCatalog.aggName(q.agg_kind[a]);
        local o: int = 0;
        local k: int = 0;
        loop ((fname[k] != cast<char>(0)) && (o < (cap - 2))) {
            out[o] = fname[k];
            o = o + 1;
            k = k + 1;
        }
        if (q.agg_col[a] >= 0) {
            out[o] = '_';
            o = o + 1;
            local col: string = t.columnName(q.agg_col[a]);
            k = 0;
            loop ((col[k] != cast<char>(0)) && (o < (cap - 1))) {
                out[o] = col[k];
                o = o + 1;
                k = k + 1;
            }
        }
        out[o] = cast<char>(0);
    }
}
