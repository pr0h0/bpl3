import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { native } from "./helpers/webPackages";
import { makeRepoTempDir } from "./helpers/repoTempDir";

test("bpl-metrics renders the Prometheus text exposition format", () => {
  const dir = makeRepoTempDir("metrics-test-");
  const outDir = mkdtempSync(join(tmpdir(), "bpl-metrics-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(
      file,
      String.raw`
    import [Registry], [MetricFamily], [Series] from "bpl-metrics";
    import [Array] from "std/array.bpl";
    import [String] from "std/string.bpl";
    extern printf(fmt: string, ...) ret int;
    frame main() ret int {
        local registry: Registry = Registry.new();
        local requests: *MetricFamily = registry.counter("http_requests_total", "Requests served.\nBy method \\ status.", "method,status");
        local ok: *Series = requests.labels("GET", "200");
        ok.inc();
        ok.add(2.0);
        requests.labels("POST", "quote\"and\\slash\nnewline").inc();
        local up: *MetricFamily = registry.gauge("app_up", "Whether the app is up.", "");
        up.set(1.0);
        local temp: *MetricFamily = registry.gauge("room_temperature_celsius", "Temperature.", "room");
        temp.labels("lab").set(21.5);
        temp.labels("lab").sub(0.25);
        temp.labels("lab").dec();
        local bounds: Array<double> = Array<double>.new(3);
        bounds.push(0.1);
        bounds.push(0.5);
        bounds.push(2.0);
        local latency: *MetricFamily = registry.histogram("http_request_duration_seconds", "Latency.", "route", &bounds);
        bounds.destroy();
        latency.labels("/").observe(0.1);
        latency.labels("/").observe(0.3);
        latency.labels("/").observe(7.0);
        latency.labels("/api").observe(0.01);
        local empty: *MetricFamily = registry.counter("jobs_total", "Jobs.", "");
        if (registry.get("jobs_total") != empty || registry.get("nope") != nullptr) { return 1; }
        local text: String = registry.render();
        printf("%s", text.data);
        text.destroy();
        registry.destroy();
        return 0;
    }`,
    );
    const exe = join(outDir, "main");
    const build = spawnSync(
      "bun",
      [resolve("index.ts"), "build", file, "-o", exe],
      { encoding: "utf8", timeout: 60000 },
    );
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const run = spawnSync(exe, [], { encoding: "utf8", timeout: 10000 });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toBe(
      [
        "# HELP http_requests_total Requests served.\\nBy method \\\\ status.",
        "# TYPE http_requests_total counter",
        'http_requests_total{method="GET",status="200"} 3',
        'http_requests_total{method="POST",status="quote\\"and\\\\slash\\nnewline"} 1',
        "# HELP app_up Whether the app is up.",
        "# TYPE app_up gauge",
        "app_up 1",
        "# HELP room_temperature_celsius Temperature.",
        "# TYPE room_temperature_celsius gauge",
        'room_temperature_celsius{room="lab"} 20.25',
        "# HELP http_request_duration_seconds Latency.",
        "# TYPE http_request_duration_seconds histogram",
        'http_request_duration_seconds_bucket{route="/",le="0.1"} 1',
        'http_request_duration_seconds_bucket{route="/",le="0.5"} 2',
        'http_request_duration_seconds_bucket{route="/",le="2"} 2',
        'http_request_duration_seconds_bucket{route="/",le="+Inf"} 3',
        'http_request_duration_seconds_sum{route="/"} 7.4',
        'http_request_duration_seconds_count{route="/"} 3',
        'http_request_duration_seconds_bucket{route="/api",le="0.1"} 1',
        'http_request_duration_seconds_bucket{route="/api",le="0.5"} 1',
        'http_request_duration_seconds_bucket{route="/api",le="2"} 1',
        'http_request_duration_seconds_bucket{route="/api",le="+Inf"} 1',
        'http_request_duration_seconds_sum{route="/api"} 0.01',
        'http_request_duration_seconds_count{route="/api"} 1',
        "# HELP jobs_total Jobs.",
        "# TYPE jobs_total counter",
        "",
      ].join("\n"),
    );
  } finally {
    rmSync(dir, { force: true, recursive: true });
    rmSync(outDir, { force: true, recursive: true });
  }
}, 90000);

test("bpl-metrics rejects invalid names, labels and updates", () => {
  native(String.raw`
    import [Registry], [MetricFamily] from "bpl-metrics";
    import [Array] from "std/array.bpl";
    frame fails(registry: *Registry, name: string, labels: string) ret bool {
        try {
            registry.counter(name, "help", labels);
        } catch {
            return true;
        }
        return false;
    }
    frame main() ret int {
        local registry: Registry = Registry.new();
        if (!fails(&registry, "1abc", "")) { return 1; }
        if (!fails(&registry, "a-b", "")) { return 2; }
        if (!fails(&registry, "ok_total", "__reserved")) { return 3; }
        if (!fails(&registry, "ok_total", "a,a")) { return 4; }
        if (!fails(&registry, "ok_total", "a:b")) { return 5; }
        if (!fails(&registry, "ok_total", "a,")) { return 6; }
        local counter: *MetricFamily = registry.counter("ns:ok_total", "help", "a");
        if (!fails(&registry, "ns:ok_total", "")) { return 7; }
        local caught: int = 0;
        try { counter.labels("x").add(-1.0); } catch { caught = caught + 1; }
        try { counter.labels("x").set(1.0); } catch { caught = caught + 1; }
        try { counter.labels("x").dec(); } catch { caught = caught + 1; }
        try { counter.labels("x", "y"); } catch { caught = caught + 1; }
        try { counter.labels(); } catch { caught = caught + 1; }
        try { counter.labels("x").observe(1.0); } catch { caught = caught + 1; }
        local bounds: Array<double> = Array<double>.new(2);
        bounds.push(1.0);
        bounds.push(1.0);
        try { registry.histogram("h", "help", "", &bounds); } catch { caught = caught + 1; }
        bounds.clear();
        bounds.push(1.0);
        try { registry.histogram("h2", "help", "le", &bounds); } catch { caught = caught + 1; }
        local histogram: *MetricFamily = registry.histogram("h3", "help", "", &bounds);
        try { histogram.inc(); } catch { caught = caught + 1; }
        local zero: double = 0.0;
        try { histogram.observe(zero / zero); } catch { caught = caught + 1; }
        if (caught != 10) { return 10 + caught; }
        if (counter.labels("x").get() != 0.0) { return 30; }
        local defaults: Array<double> = Registry.defaultBuckets();
        if (defaults.len() != 11 || defaults.get(10) != 10.0) { return 31; }
        defaults.destroy();
        bounds.destroy();
        registry.destroy();
        return 0;
    }
  `);
}, 90000);
