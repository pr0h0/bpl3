# bpl-express

A small Express-inspired HTTP framework. The current socket backend targets
**Linux IPv4** and handles one connection at a time in `listen` mode. The optional process
worker mode handles connections concurrently. It is suitable for local
projects and small services; it does not provide an asynchronous event loop,
TLS, HTTP/2, keep-alive, multipart parsing, or production load guarantees.
Use a reverse proxy for HTTPS and deployment controls.

```bpl
import [App], [Request], [Response] from "bpl-express";
frame hello(_req: *Request, res: *Response) { res.text("Hello BPL"); }
frame main() {
    local app: App = App.new();
    app.router.get("/", hello);
    app.listen(3000);
}
```

Run from this repository with `bun index.ts run your-app.bpl`. Workspace imports
resolve packages directly. For another project, install the packaged archives:
`bpl install /path/to/bpl-express-0.1.0.tgz` (its parser dependency is included
through the manifest's local archive reference).

`listen(port)` binds **127.0.0.1**. Use `listenOn(port, "0.0.0.0")` to bind all
IPv4 interfaces. `open(port, host)` returns a listener descriptor for embedding;
`serveConnection(fd)` handles an accepted descriptor without closing it. The
caller closes both descriptors. Accepted connections have five-second read/write inactivity deadlines
(`app.timeout_seconds`) and a ten-second total request assembly deadline
(`app.request_timeout_seconds`). Each deadline accepts 1–300 seconds. Requests are bounded
to 16 KiB headers and 1 MiB bodies. Fragmented requests are assembled; unsupported
request transfer codings return 501. Every response closes the connection.

Routes support `get`, `post`, `put`, `delete`, `patch`, `options`, `head`, and
`on(method, path, handler)`. Parameters use `/users/:id`; a final `*` matches
remaining path characters. `req.getParam("id")` returns `Option<string>`.
`req.state` holds application-owned strings separately from client data.
`req.setState(key, value)` copies strings for middleware identity/context; the
request destroys them after handling. Client headers/query parameters cannot
set these values.

Query parameters decode percent escapes and `+`; header keys are lowercase.
`req.header("content-type")` returns an option. `body_length` counts bytes,
including embedded NULs; `body` is also NUL-terminated for text APIs.

`app.use(handler)` runs middleware before routing. A terminal response stops
processing. `app.useRouter("/api", &router)` mounts a borrowed router: keep it
alive through `listen`. Subrouters run before parent routes. Each router owns
its arrays; `destroy()` does not destroy mounted routers or borrowed route paths.

Responses:

- `status(code)` and `setHeader(name, value)` are chainable before headers start.
- `send(text)`, `text(text)`, `html(text)`, and `json(text)` end the response.
  `json` sets the media type; the caller supplies valid JSON.
- `sendBytes(buffer, length)` sends binary data.
- `write(text)` streams chunks; call `end()` afterward. The server also ends
  unfinished responses when a handler returns. **Migration:** older multi-call
  `send` handlers must use `write` for intermediate chunks.
- `redirect(location)` sends a 302 redirect. HEAD suppresses bodies; GET routes
  are available to HEAD requests. 204 and 304 suppress bodies and framing.

Custom headers are emitted. Invalid names, control characters in values, and
manual framing headers are rejected. Header strings are copied and owned by the response. A handler exception before headers produces a generic 500; after
headers it ends the existing response. Requests own parsed allocations and are
cleaned up after handling; do not retain their pointers in application state.

`useStatic("/assets", "./public")` serves bounded files (8 MiB maximum), including
binary files. Canonical paths must remain inside the configured directory;
symlinks that escape it are rejected. Keep the asset tree trusted and immutable
while serving: canonicalization is not an atomic filesystem sandbox. Static
files run before router middleware, so use it for public assets only.
`useStaticMiddleware(handler)` supplies an optional handler immediately before
static content is sent; use it to apply CSP/frame/referrer headers to HTML as
well as API responses. It may send a terminal response instead of the file.

Optional middleware and validation are separate packages. Templates can use
`bpl-templ`; database integrations can use `bpl-db` or `bpl-sqlite`.

## Process worker mode

`app.listenWorkers(port, host, workers, initialize)` starts a supervisor with
1–8 Linux process workers sharing the listener. Each worker handles requests
sequentially; different workers handle connections concurrently. `initialize`
is an ordinary `Func<void>()` BPL frame called after fork. Open SQLite and other
worker-local services there. Never inherit a live database connection into a
worker or use this mode after starting host threads. Route configuration must
be ready before calling listenWorkers.

Workers have private memory: updates to in-memory globals/caches are not shared.
Use SQLite or another external store for shared application state. The supervisor
reaps and restarts workers that exit, with a brief backoff; Linux parent-death
signals stop workers when the supervisor exits. Shutdown does not drain active
requests. This is process concurrency through POSIX FFI, not language-level async
or a thread API. Resource use is bounded by the configured worker count.

## Native HTTPS

TLS is handled inside the BPL process by the optional `bpl-tls` transport.
Install OpenSSL 3's runtime (`libssl.so.3`) on Linux; no TLS linker flags are
needed with glibc 2.34 or newer. Plain HTTP never loads OpenSSL.

```bpl
# Replace listenOn with:
app.listenTLS(8443, "127.0.0.1", "fullchain.pem", "key.pem");
# Or use bounded process workers (initialize opens worker-local services):
app.listenTLSWorkers(8443, "127.0.0.1", 2, initialize, "fullchain.pem", "key.pem");
```

Provide a PEM leaf certificate followed by intermediate certificates, and its
matching unencrypted PEM key. Startup rejects unreadable or mismatched files.
Certificates are loaded at listener startup; renew them externally and restart
the service to reload. The TLS handshake and request assembly share the total
`request_timeout_seconds` deadline. Subsequent reads also obey the inactivity
limit; response writes use `timeout_seconds` per output operation.

TLS 1.2 and TLS 1.3 are supported. HTTP routing, middleware, static files, binary
responses, HEAD, and streaming retain their existing APIs. This remains HTTP/1.1
with one request per connection, without HTTP/2, mutual TLS, or automatic issuance.
Configure authentication with the exact HTTPS origin and Secure cookies.

## Graceful shutdown

SIGTERM and SIGINT stop accepting new requests and allow active requests to
finish. Process-worker listeners share a `shutdown_timeout_seconds` grace period
(default 10, configurable 1–300); remaining workers are killed and reaped when
it expires. `app.onWorkerShutdown(cleanup)` registers a worker-local cleanup
frame, called after a normal drain, before that worker exits. It is not called
for SIGKILL or a worker that exceeds the grace period. Single-process listeners
return after their active handler finishes; an arbitrary blocking handler cannot
be forcibly drained in that mode. Transport deadlines still apply.

Signal handling uses Linux signalfd and restores the calling thread's previous
signal mask when the listener returns. This assumes a single-threaded server
entry point. Unexpected supervisor death kills its workers, including stuck ones.
The supervisor reaps only its own pool; application child processes remain the
application's responsibility. Listener sockets are nonblocking to avoid workers
blocking in accept after another worker consumes a ready connection.

Run `bun tools/benchmark_web.ts` for a disposable local HTTP/HTTPS + SQLite
benchmark across 1/2/4 workers and 1/8/32 concurrent requests. It reports status
counts, validated database update counts, latency percentiles, throughput, and
supervisor/worker PSS and summed RSS. Set `BPL_BENCH_REQUESTS` (20–20000),
`BPL_BENCH_WAL=1`, and optionally `BPL_BENCH_OUTPUT=/path/report.json`.
It requires Linux, Python 3, OpenSSL 3, and the native SQLite runtime. These
machine-specific measurements are not a production capacity guarantee.
