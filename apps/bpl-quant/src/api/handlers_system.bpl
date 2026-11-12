# System endpoints: health, info, metrics, route catalogue.

import [Request], [Response] from "bpl-express";
import [StringBuilder] from "std/string_builder.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Clock] from "../core/clock.bpl";

export healthHandler;
export infoHandler;
export metricsHandler;
export metricsJsonHandler;
export routesHandler;
export registerRoute;
export routeCount;

global route_methods: string[256];
global route_paths: string[256];
global route_docs: string[256];
global route_total: int;

frame registerRoute(method: string, path: string, doc: string) {
    if (route_total < 256) {
        route_methods[route_total] = method;
        route_paths[route_total] = path;
        route_docs[route_total] = doc;
        route_total = route_total + 1;
    }
}

frame routeCount() ret int {
    return route_total;
}

frame healthHandler(_req: *Request, res: *Response) {
    local s: *AppState = appState();
    local w: JsonWriter = JsonWriter.new(128);
    w.beginObject();
    w.fieldStr("status", "ok");
    w.fieldInt("uptime_ms", s.uptimeMs());
    w.fieldInt("worker", cast<long>(s.worker_id));
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame infoHandler(_req: *Request, res: *Response) {
    local s: *AppState = appState();
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    w.fieldStr("name", "bpl-quant");
    w.fieldStr("version", "0.1.0");
    w.fieldStr("language", "BPL");
    w.fieldInt("symbols", cast<long>(s.engine.book_count));
    w.fieldInt("open_orders", cast<long>(s.engine.openOrders()));
    w.fieldInt("trades", s.engine.stats.trades);
    w.fieldInt("bars", s.series.totalBars());
    w.fieldInt("routes", cast<long>(route_total));
    w.fieldInt("workers", cast<long>(s.config.workers));
    w.fieldBool("persistence", s.config.persist);
    w.fieldInt("persisted_trades", s.persisted_trades);
    w.fieldInt("wall_ms", Clock.wallMs());
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame metricsHandler(_req: *Request, res: *Response) {
    local s: *AppState = appState();
    s.metrics.gauges_open_orders = cast<long>(s.engine.openOrders());
    local sb: StringBuilder = s.metrics.prometheus(s.uptimeMs());
    Reply.text(res, "text/plain; version=0.0.4", sb.toString());
    sb.destroy();
}

frame metricsJsonHandler(_req: *Request, res: *Response) {
    local s: *AppState = appState();
    local w: JsonWriter = JsonWriter.new(2048);
    s.metrics.writeJson(&w, s.uptimeMs());
    Reply.ok(res, &w);
    w.destroy();
}

frame routesHandler(_req: *Request, res: *Response) {
    local w: JsonWriter = JsonWriter.new(4096);
    w.beginObject();
    w.fieldInt("count", cast<long>(route_total));
    w.key("routes").beginArray();
    loop (local i: int = 0; i < route_total; i = i + 1) {
        w.beginObject();
        w.fieldStr("method", route_methods[i]);
        w.fieldStr("path", route_paths[i]);
        w.fieldStr("description", route_docs[i]);
        w.endObject();
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}
