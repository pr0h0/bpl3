# QQL entry point: parse, materialize the table, execute, serialize.

import [StringBuilder] from "std/string_builder.bpl";
import [CSV] from "bpl-csv";
import [JsonWriter] from "../core/json_writer.bpl";
import [Clock] from "../core/clock.bpl";
import [Text] from "../core/text.bpl";
import [Engine] from "../market/engine.bpl";
import [SeriesStore], [SeriesEntry] from "../series/store.bpl";
import [SqlParser] from "./parser.bpl";
import [Table], [Tables] from "./table.bpl";
import [Executor], [ResultSet], [SqlValue], [SqlType] from "./executor.bpl";

export [Qql];
export [QqlRun];

struct QqlRun {
    parser: SqlParser,
    table: Table,
    exec: Executor,
    result: ResultSet,
    ok: bool,
    stage: string,
    error: string,
    error_pos: int,
    elapsed_ms: float,
    has_table: bool,
    has_exec: bool,
    has_result: bool,

    frame destroy(this: *QqlRun) {
        if (this.has_result) {
            this.result.destroy();
        }
        if (this.has_exec) {
            this.exec.destroy();
        }
        if (this.has_table) {
            this.table.destroy();
        }
        this.parser.destroy();
    }
}

struct Qql {
    # Runs `sql` into *r (in place: the executor points at r.parser and r.table).
    frame execute(r: *QqlRun, sql: string, engine: *Engine, series: *SeriesStore, max_rows: int) {
        local started: long = Clock.nowNs();
        r.ok = false;
        r.stage = "parse";
        r.error = nullptr;
        r.error_pos = 0;
        r.has_table = false;
        r.has_exec = false;
        r.has_result = false;
        if (!r.parser.parse(sql)) {
            r.error = r.parser.error;
            r.error_pos = r.parser.error_pos;
            r.elapsed_ms = Clock.elapsedMs(started);
            return;
        }
        r.stage = "plan";
        local name: string = r.parser.sel.table;
        if (Text.equals(name, "trades")) {
            Tables.trades(engine, &r.table);
        } else if (Text.equals(name, "orders")) {
            Tables.orders(engine, &r.table);
        } else if (Text.equals(name, "symbols")) {
            Tables.symbols(engine, series, &r.table);
        } else if (Text.equals(name, "bars")) {
            if (r.parser.sel.table_arg == nullptr) {
                r.error = "bars needs a symbol: FROM bars('ACME')";
                r.elapsed_ms = Clock.elapsedMs(started);
                return;
            }
            local e: *SeriesEntry = series.find(r.parser.sel.table_arg);
            if (e == nullptr) {
                r.error = "no bar series for that symbol";
                r.elapsed_ms = Clock.elapsedMs(started);
                return;
            }
            Tables.bars(&e.bars, &r.table);
        } else {
            r.error = "unknown table (trades, bars('SYMBOL'), orders, symbols)";
            r.elapsed_ms = Clock.elapsedMs(started);
            return;
        }
        r.has_table = true;
        r.stage = "execute";
        r.exec.create(&r.parser, &r.table);
        r.exec.max_rows = max_rows;
        r.has_exec = true;
        r.has_result = true;
        if (!r.exec.run(&r.result)) {
            r.error = r.exec.error;
            r.elapsed_ms = Clock.elapsedMs(started);
            return;
        }
        r.ok = true;
        r.stage = "done";
        r.elapsed_ms = Clock.elapsedMs(started);
    }

    frame writeJson(r: *QqlRun, w: *JsonWriter) {
        w.fieldBool("ok", r.ok);
        if (!r.ok) {
            w.key("error").beginObject();
            w.fieldStr("stage", r.stage);
            w.fieldStr("message", r.error);
            w.fieldInt("position", cast<long>(r.error_pos));
            w.endObject();
            return;
        }
        w.key("columns").beginArray();
        loop (local c: int = 0; c < r.result.column_count; c = c + 1) {
            w.str(r.result.columns[c]);
        }
        w.endArray();
        w.key("rows").beginArray();
        loop (local i: int = 0; i < r.result.rows; i = i + 1) {
            w.beginArray();
            loop (local c: int = 0; c < r.result.column_count; c = c + 1) {
                Executor.writeValue(w, r.result.at(i, c));
            }
            w.endArray();
        }
        w.endArray();
        w.fieldInt("row_count", cast<long>(r.result.rows));
        w.fieldInt("scanned", cast<long>(r.result.scanned));
        w.fieldInt("matched", cast<long>(r.result.matched));
        w.fieldInt("groups", cast<long>(r.result.groups));
        w.fieldFixed("elapsed_ms", r.elapsed_ms, 3);
    }

    frame writeCsv(r: *QqlRun, out: *StringBuilder) {
        loop (local c: int = 0; c < r.result.column_count; c = c + 1) {
            if (c > 0) {
                out.append(",");
            }
            CSV.field(out, r.result.columns[c], false);
        }
        out.append("\r\n");
        loop (local i: int = 0; i < r.result.rows; i = i + 1) {
            loop (local c: int = 0; c < r.result.column_count; c = c + 1) {
                if (c > 0) {
                    out.append(",");
                }
                local v: SqlValue = r.result.at(i, c);
                CSV.field(out, v.kind == SqlType.Null ? "" : r.exec.format(v), false);
            }
            out.append("\r\n");
        }
    }
}
