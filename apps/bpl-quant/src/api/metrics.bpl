# Request metrics: per-route counters and latency histograms, exported as
# Prometheus text and JSON. Each worker process keeps its own registry.

import malloc, free, snprintf from "std/c.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [StrIndex] from "../core/hashmap.bpl";
import [LatencyHistogram] from "../core/latency.bpl";
import [JsonWriter] from "../core/json_writer.bpl";

export [Metrics];
export [RouteStats];

struct RouteStats {
    requests: long,
    status_2xx: long,
    status_3xx: long,
    status_4xx: long,
    status_5xx: long,
    bytes_out: long,
    latency: LatencyHistogram,
}

struct Metrics {
    names: StrIndex,
    routes: *RouteStats,
    cap: int,
    total: LatencyHistogram,
    requests: long,
    errors: long,
    rate_limited: long,
    started_ms: long,
    gauges_open_orders: long,

    frame new(started_ms: long) ret Metrics {
        local m: Metrics;
        m.names = StrIndex.new(64);
        m.cap = 64;
        m.routes = cast<*RouteStats>(malloc(cast<long>(m.cap) * sizeof(RouteStats)));
        m.total = LatencyHistogram.new();
        m.requests = 0;
        m.errors = 0;
        m.rate_limited = 0;
        m.started_ms = started_ms;
        m.gauges_open_orders = 0;
        return m;
    }

    frame destroy(this: *Metrics) {
        loop (local i: int = 0; i < this.names.count; i = i + 1) {
            this.routes[i].latency.destroy();
        }
        free(cast<*void>(this.routes));
        this.routes = nullptr;
        this.names.destroy();
        this.total.destroy();
    }

    frame route(this: *Metrics, name: string) ret *RouteStats {
        local id: int = this.names.find(name);
        if (id >= 0) {
            return this.routes + id;
        }
        id = this.names.intern(name);
        if (id >= this.cap) {
            local next_cap: int = this.cap * 2;
            local next: *RouteStats = cast<*RouteStats>(malloc(cast<long>(next_cap) * sizeof(RouteStats)));
            loop (local i: int = 0; i < id; i = i + 1) {
                next[i] = this.routes[i];
            }
            free(cast<*void>(this.routes));
            this.routes = next;
            this.cap = next_cap;
        }
        local r: *RouteStats = this.routes + id;
        r.requests = 0;
        r.status_2xx = 0;
        r.status_3xx = 0;
        r.status_4xx = 0;
        r.status_5xx = 0;
        r.bytes_out = 0;
        r.latency = LatencyHistogram.new();
        return r;
    }

    frame observe(this: *Metrics, name: string, status: int, micros: long, bytes: long) {
        local r: *RouteStats = this.route(name);
        r.requests = r.requests + 1;
        r.bytes_out = r.bytes_out + bytes;
        if (status >= 500) {
            r.status_5xx = r.status_5xx + 1;
            this.errors = this.errors + 1;
        } else if (status >= 400) {
            r.status_4xx = r.status_4xx + 1;
            if (status == 429) {
                this.rate_limited = this.rate_limited + 1;
            }
        } else if (status >= 300) {
            r.status_3xx = r.status_3xx + 1;
        } else {
            r.status_2xx = r.status_2xx + 1;
        }
        r.latency.record(micros);
        this.total.record(micros);
        this.requests = this.requests + 1;
    }

    frame appendLine(sb: *StringBuilder, metric: string, route: string, label: string, value: long) {
        sb.append(metric);
        sb.append("{route=\"");
        sb.append(route);
        if (label != nullptr) {
            sb.append("\",");
            sb.append(label);
        } else {
            sb.append("\"");
        }
        sb.append("} ");
        sb.appendLong(value);
        sb.append("\n");
    }

    frame prometheus(this: *Metrics, uptime_ms: long) ret StringBuilder {
        local sb: StringBuilder = StringBuilder.new(4096);
        sb.append("# HELP bplquant_requests_total Requests handled by this worker.\n");
        sb.append("# TYPE bplquant_requests_total counter\n");
        loop (local i: int = 0; i < this.names.count; i = i + 1) {
            local name: string = this.names.name(i);
            local r: *RouteStats = this.routes + i;
            Metrics.appendLine(&sb, "bplquant_requests_total", name, "class=\"2xx\"", r.status_2xx);
            Metrics.appendLine(&sb, "bplquant_requests_total", name, "class=\"4xx\"", r.status_4xx);
            Metrics.appendLine(&sb, "bplquant_requests_total", name, "class=\"5xx\"", r.status_5xx);
        }
        sb.append("# HELP bplquant_latency_us Request latency quantiles in microseconds.\n");
        sb.append("# TYPE bplquant_latency_us summary\n");
        loop (local i: int = 0; i < this.names.count; i = i + 1) {
            local name: string = this.names.name(i);
            local r: *RouteStats = this.routes + i;
            Metrics.appendLine(&sb, "bplquant_latency_us", name, "quantile=\"0.5\"", r.latency.percentile(50.0));
            Metrics.appendLine(&sb, "bplquant_latency_us", name, "quantile=\"0.99\"", r.latency.percentile(99.0));
            Metrics.appendLine(&sb, "bplquant_latency_us_count", name, nullptr, r.latency.total);
        }
        sb.append("# TYPE bplquant_uptime_ms gauge\nbplquant_uptime_ms ");
        sb.appendLong(uptime_ms);
        sb.append("\n# TYPE bplquant_open_orders gauge\nbplquant_open_orders ");
        sb.appendLong(this.gauges_open_orders);
        sb.append("\n# TYPE bplquant_rate_limited_total counter\nbplquant_rate_limited_total ");
        sb.appendLong(this.rate_limited);
        sb.append("\n");
        return sb;
    }

    frame writeJson(this: *Metrics, w: *JsonWriter, uptime_ms: long) {
        w.beginObject();
        w.fieldInt("uptime_ms", uptime_ms);
        w.fieldInt("requests", this.requests);
        w.fieldInt("errors", this.errors);
        w.fieldInt("rate_limited", this.rate_limited);
        w.key("latency_us").beginObject();
        w.fieldInt("p50", this.total.percentile(50.0));
        w.fieldInt("p90", this.total.percentile(90.0));
        w.fieldInt("p99", this.total.percentile(99.0));
        w.fieldInt("max", this.total.max);
        w.fieldFixed("mean", this.total.mean(), 1);
        w.endObject();
        w.key("routes").beginArray();
        loop (local i: int = 0; i < this.names.count; i = i + 1) {
            local r: *RouteStats = this.routes + i;
            w.beginObject();
            w.fieldStr("route", this.names.name(i));
            w.fieldInt("requests", r.requests);
            w.fieldInt("status_2xx", r.status_2xx);
            w.fieldInt("status_4xx", r.status_4xx);
            w.fieldInt("status_5xx", r.status_5xx);
            w.fieldInt("bytes_out", r.bytes_out);
            w.fieldInt("p50_us", r.latency.percentile(50.0));
            w.fieldInt("p99_us", r.latency.percentile(99.0));
            w.endObject();
        }
        w.endArray();
        w.endObject();
    }
}
