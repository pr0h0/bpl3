# HTTP load generator.
#
#   bpl-quant loadgen <port> [requests] [concurrency] [scenario]
#
# Forks `concurrency` client processes. Each opens one connection per request
# (the server closes after every response), measures wall latency in
# microseconds, and sends its histogram and status counts back through a
# pipe. The parent merges them and prints throughput and percentiles.
# Scenarios: mixed (default), read, write, compute.

import printf, malloc, free, memset, snprintf from "std/c.bpl";
import socket, close, read, write, htons, inet_addr, fork, waitpid, _exit, [sockaddr_in] from "bpl-express/src/libc.bpl";
import [Clock] from "../core/clock.bpl";
import [LatencyHistogram] from "../core/latency.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [Text] from "../core/text.bpl";

extern connect(fd: int, address: *sockaddr_in, size: uint) ret int;
extern pipe(fds: *int) ret int;

export runLoadgen;
export [LoadResult];

global const RESULT_SLOTS: int = 512;

struct LoadResult {
    requests: long,
    ok: long,
    client_errors: long,
    server_errors: long,
    failures: long,
    bytes: long,
    elapsed_ms: float,
}

# Wire format a child sends to the parent: summary then raw histogram counts.
struct ChildReport {
    requests: long,
    ok: long,
    client_errors: long,
    server_errors: long,
    failures: long,
    bytes: long,
    sum: float,
    min: long,
    max: long,
}

struct Target {
    method: string,
    path: string,
    body: string,
}

frame scenario(name: string, out: *Target) ret int {
    local n: int = 0;
    local read_only: bool = Text.equals(name, "read");
    local writes: bool = Text.equals(name, "write");
    local compute: bool = Text.equals(name, "compute");
    if (!writes && !compute) {
        out[n] = Target { method: "GET", path: "/api/health", body: nullptr };
        n = n + 1;
        out[n] = Target { method: "GET", path: "/api/quote/ACME", body: nullptr };
        n = n + 1;
        out[n] = Target { method: "GET", path: "/api/book/ACME?depth=5", body: nullptr };
        n = n + 1;
        out[n] = Target { method: "GET", path: "/api/bars/GLOBEX?limit=20", body: nullptr };
        n = n + 1;
        out[n] = Target { method: "GET", path: "/api/indicators/ACME?name=rsi&tail=5", body: nullptr };
        n = n + 1;
        out[n] = Target { method: "GET", path: "/api/trades?limit=20&filter=qty%20%3E%3D%20100", body: nullptr };
        n = n + 1;
    }
    if (!read_only && !compute) {
        out[n] = Target { method: "POST", path: "/api/orders", body: "{\"symbol\":\"ACME\",\"account\":\"lg1\",\"side\":\"buy\",\"price\":99.5,\"qty\":10}" };
        n = n + 1;
        out[n] = Target { method: "POST", path: "/api/orders", body: "{\"symbol\":\"ACME\",\"account\":\"lg2\",\"side\":\"sell\",\"price\":99.5,\"qty\":10}" };
        n = n + 1;
        out[n] = Target { method: "POST", path: "/api/orders", body: "{\"symbol\":\"ACME\",\"account\":\"lg3\",\"side\":\"buy\",\"type\":\"market\",\"qty\":5}" };
        n = n + 1;
    }
    if (!read_only && !writes) {
        out[n] = Target { method: "GET", path: "/api/price/greeks?spot=100&strike=105&rate=0.03&vol=0.25&expiry=0.5", body: nullptr };
        n = n + 1;
        out[n] = Target { method: "GET", path: "/api/price/tree?spot=100&strike=100&rate=0.05&vol=0.2&expiry=1&type=put&american=true&steps=200", body: nullptr };
        n = n + 1;
        out[n] = Target { method: "GET", path: "/api/price/iv?spot=100&strike=100&rate=0.05&expiry=1&price=12", body: nullptr };
        n = n + 1;
        out[n] = Target { method: "GET", path: "/api/risk/optimize?symbols=ACME,GLOBEX,HOOLI&method=min_variance", body: nullptr };
        n = n + 1;
    }
    return n;
}

# One request on a fresh connection; returns the HTTP status or -1.
frame request(addr: *sockaddr_in, t: *Target, buf: string, cap: int, bytes: *long) ret int {
    local fd: int = socket(2, 1, 0);
    if (fd < 0) {
        return -1;
    }
    if (connect(fd, addr, cast<uint>(sizeof(sockaddr_in))) != 0) {
        close(fd);
        return -1;
    }
    local head: char[1024];
    local body_len: int = t.body == nullptr ? 0 : Text.length(t.body);
    local n: int = 0;
    if (body_len > 0) {
        n = snprintf(cast<string>(&head[0]), 1024, "%s %s HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n%s", t.method, t.path, body_len, t.body);
    } else {
        n = snprintf(cast<string>(&head[0]), 1024, "%s %s HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n", t.method, t.path);
    }
    local sent: long = 0;
    loop (sent < cast<long>(n)) {
        local w: long = write(fd, cast<string>(cast<*char>(&head[0]) + sent), cast<ulong>(cast<long>(n) - sent));
        if (w <= 0) {
            close(fd);
            return -1;
        }
        sent = sent + w;
    }
    local total: long = 0;
    local status: int = -1;
    loop {
        local r: long = read(fd, buf, cast<ulong>(cap - 1));
        if (r <= 0) {
            break;
        }
        if ((total == 0) && (r >= 12)) {
            # "HTTP/1.1 200"
            status = (cast<int>(buf[9] - '0') * 100) + (cast<int>(buf[10] - '0') * 10) + cast<int>(buf[11] - '0');
        }
        total = total + r;
    }
    close(fd);
    *bytes = *bytes + total;
    return status;
}

frame writeAll(fd: int, data: *char, size: long) ret bool {
    local done: long = 0;
    loop (done < size) {
        local w: long = write(fd, cast<string>(data + done), cast<ulong>(size - done));
        if (w <= 0) {
            return false;
        }
        done = done + w;
    }
    return true;
}

frame readAll(fd: int, data: *char, size: long) ret bool {
    local done: long = 0;
    loop (done < size) {
        local r: long = read(fd, cast<string>(data + done), cast<ulong>(size - done));
        if (r <= 0) {
            return false;
        }
        done = done + r;
    }
    return true;
}

frame childMain(port: int, count: int, worker: int, targets: *Target, ntargets: int, out_fd: int) {
    local addr: sockaddr_in;
    memset(cast<*void>(&addr), 0, sizeof(sockaddr_in));
    addr.sin_family = 2;
    addr.sin_port = htons(cast<ushort>(port));
    addr.sin_addr = inet_addr("127.0.0.1");
    local hist: LatencyHistogram = LatencyHistogram.new();
    local rep: ChildReport = ChildReport { requests: 0, ok: 0, client_errors: 0, server_errors: 0, failures: 0, bytes: 0, sum: 0.0, min: 0, max: 0 };
    local buf: string = cast<string>(malloc(65536));
    local rng: Xoshiro = Xoshiro.new(cast<u64>(worker + 1));
    loop (local i: int = 0; i < count; i = i + 1) {
        local t: *Target = targets + rng.range(0, ntargets);
        local start: long = Clock.nowNs();
        local status: int = request(&addr, t, buf, 65536, &rep.bytes);
        local micros: long = (Clock.nowNs() - start) / 1000;
        rep.requests = rep.requests + 1;
        if (status < 0) {
            rep.failures = rep.failures + 1;
            continue;
        }
        hist.record(micros);
        if (status >= 500) {
            rep.server_errors = rep.server_errors + 1;
        } else if (status >= 400) {
            rep.client_errors = rep.client_errors + 1;
        } else {
            rep.ok = rep.ok + 1;
        }
    }
    rep.sum = hist.sum;
    rep.min = hist.min;
    rep.max = hist.max;
    writeAll(out_fd, cast<*char>(&rep), sizeof(ChildReport));
    writeAll(out_fd, cast<*char>(hist.counts), cast<long>(RESULT_SLOTS) * sizeof(long));
    close(out_fd);
    free(cast<*void>(buf));
}

frame runLoadgen(port: int, total: int, concurrency: int, scenario_name: string) ret int {
    local targets: Target[32];
    local ntargets: int = scenario(scenario_name, &targets[0]);
    if (ntargets == 0) {
        printf("loadgen: unknown scenario %s\n", scenario_name);
        return 2;
    }
    local pids: *int = cast<*int>(malloc(cast<long>(concurrency) * sizeof(int)));
    local fds: *int = cast<*int>(malloc(cast<long>(concurrency) * sizeof(int)));
    local per: int = total / concurrency;
    local extra: int = total % concurrency;
    local started: long = Clock.nowNs();
    loop (local c: int = 0; c < concurrency; c = c + 1) {
        local p: int[2] = [0, 0];
        if (pipe(&p[0]) != 0) {
            printf("loadgen: pipe failed\n");
            return 1;
        }
        local count: int = per + (c < extra ? 1 : 0);
        local pid: int = fork();
        if (pid == 0) {
            close(p[0]);
            childMain(port, count, c, &targets[0], ntargets, p[1]);
            _exit(0);
        }
        close(p[1]);
        pids[c] = pid;
        fds[c] = p[0];
    }
    local merged: LatencyHistogram = LatencyHistogram.new();
    local part: LatencyHistogram = LatencyHistogram.new();
    local result: LoadResult = LoadResult { requests: 0, ok: 0, client_errors: 0, server_errors: 0, failures: 0, bytes: 0, elapsed_ms: 0.0 };
    loop (local c: int = 0; c < concurrency; c = c + 1) {
        local rep: ChildReport;
        local good: bool = readAll(fds[c], cast<*char>(&rep), sizeof(ChildReport));
        good = good && readAll(fds[c], cast<*char>(part.counts), cast<long>(RESULT_SLOTS) * sizeof(long));
        close(fds[c]);
        local status: int = 0;
        waitpid(pids[c], &status, 0);
        if (!good) {
            result.failures = result.failures + cast<long>(per);
            continue;
        }
        local hits: long = rep.ok + rep.client_errors + rep.server_errors;
        part.total = hits;
        part.sum = rep.sum;
        part.min = rep.min;
        part.max = rep.max;
        merged.merge(&part);
        result.requests = result.requests + rep.requests;
        result.ok = result.ok + rep.ok;
        result.client_errors = result.client_errors + rep.client_errors;
        result.server_errors = result.server_errors + rep.server_errors;
        result.failures = result.failures + rep.failures;
        result.bytes = result.bytes + rep.bytes;
    }
    result.elapsed_ms = Clock.elapsedMs(started);
    local seconds: float = result.elapsed_ms / 1000.0;
    printf("loadgen: scenario=%s requests=%lld concurrency=%d elapsed=%.1fms\n", scenario_name, result.requests, concurrency, result.elapsed_ms);
    printf("  throughput   %.0f req/s, %.2f MB/s\n", cast<float>(result.requests) / seconds, cast<float>(result.bytes) / seconds / 1048576.0);
    printf("  status       2xx/3xx=%lld 4xx=%lld 5xx=%lld connect/read failures=%lld\n", result.ok, result.client_errors, result.server_errors, result.failures);
    printf("  latency us   min=%lld p50=%lld p90=%lld p99=%lld p99.9=%lld max=%lld mean=%.0f\n", merged.min, merged.percentile(50.0), merged.percentile(90.0), merged.percentile(99.0), merged.percentile(99.9), merged.max, merged.mean());
    merged.destroy();
    part.destroy();
    free(cast<*void>(pids));
    free(cast<*void>(fds));
    return (result.server_errors == 0) && (result.failures == 0) ? 0 : 1;
}
