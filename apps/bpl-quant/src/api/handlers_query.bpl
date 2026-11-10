# QQL endpoints: /api/query (JSON) and /api/query.csv.

import [Request], [Response] from "bpl-express";
import [StringBuilder] from "std/string_builder.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [Qql], [QqlRun] from "../sql/qql.bpl";

export queryHandler;
export queryCsvHandler;

# Reads the query from ?q= or a JSON body {"q": "..."}; replies on error.
frame readQuery(req: *Request, res: *Response, p: *Params) ret string {
    if ((req.body_length > 0) && !p.parseBody(65536)) {
        p.reject(res);
        return nullptr;
    }
    local q: string = p.requiredStr("q", 20000);
    if (p.reject(res)) {
        return nullptr;
    }
    return q;
}

frame queryHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local q: string = readQuery(req, res, &p);
    if (q == nullptr) {
        return;
    }
    local max_rows: int = p.integer("max_rows", 10000, 1, 100000);
    local s: *AppState = appState();
    local r: QqlRun;
    Qql.execute(&r, q, &s.engine, &s.series, max_rows);
    local w: JsonWriter = JsonWriter.new(4096);
    w.precision = 12;
    w.beginObject();
    Qql.writeJson(&r, &w);
    w.endObject();
    local status: int = r.ok ? 200 : 400;
    r.destroy();
    Reply.json(res, status, &w);
    w.destroy();
}

frame queryCsvHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local q: string = readQuery(req, res, &p);
    if (q == nullptr) {
        return;
    }
    local s: *AppState = appState();
    local r: QqlRun;
    Qql.execute(&r, q, &s.engine, &s.series, 100000);
    if (!r.ok) {
        Reply.errorDetail(res, 400, "query failed", r.error);
        r.destroy();
        return;
    }
    local out: StringBuilder = StringBuilder.new(4096);
    Qql.writeCsv(&r, &out);
    Reply.csv(res, "query.csv", &out);
    out.destroy();
    r.destroy();
}
