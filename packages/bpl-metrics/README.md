# bpl-metrics

Counters, gauges and histograms rendered in the Prometheus text exposition
format (0.0.4), ready to serve from a `/metrics` route. It has no
dependencies; the example wires it into [bpl-express](../bpl-express/README.md).

```bpl
import [Registry], [MetricFamily] from "bpl-metrics";
import [App], [Request], [Response] from "bpl-express";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";
import snprintf from "std/c.bpl";

global METRICS: Registry;
global REQUESTS: *MetricFamily;
global LATENCY: *MetricFamily;

frame record(req: *Request, res: *Response) {
    local route: Option<string> = req.state.get("request.route");
    local name: string = "[unmatched]";
    if (route.isSome()) {
        name = route.unwrap();
    }
    local status: char[8];
    snprintf(cast<string>(&status[0]), 8, "%d", res.status_code);
    REQUESTS.labels(name, cast<string>(&status[0])).inc();
    LATENCY.labels(name).observeSince(req.started_at);
}

frame metrics(_req: *Request, res: *Response) {
    local text: String = METRICS.render();
    res.setHeader("Content-Type", Registry.contentType());
    res.send(text.data);
    text.destroy();
}

frame main() {
    METRICS = Registry.new();
    REQUESTS = METRICS.counter("http_requests_total", "HTTP requests by route and status.", "route,status");
    local buckets: Array<double> = Registry.defaultBuckets();
    LATENCY = METRICS.histogram("http_request_duration_seconds", "Request latency.", "route", &buckets);
    buckets.destroy();
    local app: App = App.new();
    app.afterRequest(record);
    app.router.get("/metrics", metrics);
    app.listen(3000);
}
```

## API

- `Registry.new()`, `render()` (an owned `String`), `get(name)`,
  `destroy()`, and `Registry.contentType()` for the response header.
- `counter(name, help, labelNames)`, `gauge(...)` and
  `histogram(name, help, labelNames, &bounds)` register a family and return a
  `*MetricFamily` owned by the registry. `labelNames` is comma-separated
  (`"method,status"`) or `""`. Names must match `[a-zA-Z_:][a-zA-Z0-9_:]*`,
  label names `[a-zA-Z_][a-zA-Z0-9_]*`; `__`-prefixed labels, duplicate
  labels, `le` on histograms and duplicate metric names throw.
- `family.labels()`, `labels(a)`, `labels(a, b)`, `labels(a, b, c)` and
  `labelsArray(&values)` return the series for those label values, creating
  it on first use. Passing the wrong number of values throws. Series live as
  long as the registry, so the pointer can be kept and reused. Unlabelled
  families also have `inc`, `add`, `set` and `observe` shortcuts.
- `Series`: counters `inc()` / `add(n)` (negative or NaN throws); gauges
  also `set(v)`, `dec()`, `sub(n)`; histograms `observe(v)` and
  `observeSince(startMs)` (seconds since a monotonic millisecond timestamp
  such as `Registry.now()` or `Request.started_at`). `get()` reads the value.
- `Registry.defaultBuckets()` returns the usual latency buckets from 5 ms to
  10 s; custom bounds must be finite and strictly increasing, and `+Inf` is
  always added.

Output follows the exposition format: `# HELP` (with `\\` and `\n` escaped)
and `# TYPE` lines, label values escaping `\\`, `"` and newlines, cumulative
`_bucket` series with an `le` label, then `_sum` and `_count`. Values print in
the shortest form that round-trips (`3`, `0.25`), and `+Inf`, `-Inf` and
`NaN` as Prometheus spells them. Families render in registration order and
series in creation order.

Each registry is plain process memory. With `listenWorkers`, every worker
process has its own counters, so scrape each worker separately or aggregate
elsewhere. Keep label values bounded (route templates, not raw paths or user
ids): every distinct combination is a new series that is never removed.
