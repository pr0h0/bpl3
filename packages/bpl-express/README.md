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
