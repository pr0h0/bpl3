# Columnar analytics over the live trade tape and bar history, with a
# version-checked result cache.
#
#   GET /api/columnar/:table?where=&group=&aggs=&limit=&cache=
#   GET /api/columnar/stats

import [Request], [Response] from "bpl-express";
import [JsonWriter] from "../core/json_writer.bpl";
import [CharBuf] from "../core/strlist.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [ColumnTable], [ColQuery], [ColResult], [QueryCache] from "../cache/columnar.bpl";
import [ColumnarCatalog] from "../cache/catalog.bpl";

export columnarQueryHandler;
export columnarStatsHandler;

frame refresh(s: *AppState) {
    s.columnar.refreshTrades(&s.engine);
    s.columnar.refreshBars(&s.series);
}

frame columnarQueryHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local name: string = p.path("table");
    local where: string = p.str("where", "");
    local group: string = p.str("group", "");
    local aggs: string = p.str("aggs", "count(*)");
    local limit: int = p.integer("limit", 100, 1, 10000);
    local use_cache: bool = p.flag("cache", true);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    refresh(s);
    local t: *ColumnTable = s.columnar.table(name);
    if (t == nullptr) {
        Reply.notFound(res, "table must be trades or bars");
        return;
    }
    local key_text: CharBuf = CharBuf.new(128);
    key_text.str(name);
    key_text.ch('|');
    key_text.str(where);
    key_text.ch('|');
    key_text.str(group);
    key_text.ch('|');
    key_text.str(aggs);
    key_text.ch('|');
    key_text.integer(cast<long>(limit));
    local key: u64 = QueryCache.normalise(key_text.text());
    key_text.destroy();
    if (use_cache) {
        local hit: string = s.columnar.cache.get(key, t.version);
        if (hit != nullptr) {
            res.setHeader("X-Cache", "hit");
            Reply.text(res, "application/json", hit);
            return;
        }
    }
    local q: ColQuery;
    if (!t.parseQuery(where, group, aggs, &q)) {
        Reply.error(res, 400, q.error);
        return;
    }
    local r: ColResult = t.run(&q);
    local w: JsonWriter = JsonWriter.new(1024 + (r.groups * 120));
    w.precision = 10;
    ColumnarCatalog.render(t, &q, &r, &w, limit);
    r.destroy();
    if (use_cache) {
        s.columnar.cache.put(key, t.version, w.toString());
    }
    res.setHeader("X-Cache", use_cache ? "miss" : "bypass");
    Reply.text(res, "application/json", w.toString());
    w.destroy();
}

frame columnarStatsHandler(_req: *Request, res: *Response) {
    local s: *AppState = appState();
    refresh(s);
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    local tables: string[2] = ["trades", "bars"];
    w.key("tables").beginArray();
    loop (local i: int = 0; i < 2; i = i + 1) {
        local t: *ColumnTable = s.columnar.table(tables[i]);
        local raw: long = 0;
        local enc: long = t.encodedBytes(&raw);
        w.beginObject();
        w.fieldStr("name", t.name);
        w.fieldInt("rows", cast<long>(t.rows));
        w.fieldInt("columns", cast<long>(t.column_count));
        w.fieldInt("blocks", cast<long>(t.blocks()));
        w.fieldInt("version", t.version);
        w.fieldInt("raw_bytes", raw);
        w.fieldInt("encoded_bytes", enc);
        w.key("column_names").beginArray();
        loop (local c: int = 0; c < t.column_count; c = c + 1) {
            w.str(t.columnName(c));
        }
        w.endArray();
        w.endObject();
    }
    w.endArray();
    local cache: *QueryCache = &s.columnar.cache;
    w.key("cache").beginObject();
    w.fieldInt("entries", cast<long>(cache.count));
    w.fieldInt("capacity", cast<long>(cache.cap));
    w.fieldInt("hits", cache.hits);
    w.fieldInt("misses", cache.misses);
    w.fieldInt("stale", cache.stale);
    w.fieldInt("evictions", cache.evictions);
    w.fieldInt("bytes", cache.bytes);
    w.fieldFixed("hit_rate", cache.hitRate(), 4);
    w.endObject();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}
