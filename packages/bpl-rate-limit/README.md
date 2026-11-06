# bpl-rate-limit

Optional SQLite-backed throttling middleware for Linux web servers. SQLite 3.35+
is required for RETURNING. The application owns the database connection; use one
connection per process worker. A single admission statement makes concurrent
requests share the same budget without allowing extra admissions.

```bpl
import [RateLimiter] from "bpl-rate-limit";
# initialize limiter = RateLimiter.new(&workerDatabase) after fork.
frame throttle(req:*Request,res:*Response) {
    limiter.apply(req,res,"api",240,60);
}
# app.beforeRequest(throttle); or router.addMiddleware(throttle).
```

`apply` uses the real IPv4 socket peer from Request.peerAddress, never forwarding
headers. It sets informational RateLimit-Limit and RateLimit-Remaining headers;
a denied request gets JSON 429 and an integer Retry-After. A missing socket peer
in a synthetic request produces 500. Use `check(scope, identity, maximum, seconds)`
for explicit trusted identities such as a server-derived user ID. It returns
RateDecision {allowed, remaining, retry_after}; it does not write a response.

Scopes are 1–64 bytes, identities 1–128, maximum is 1–1000000, and windows are
1–86400 seconds. Use consistent settings for each scope. SQL values are bound;
identities are stored as application data, not evaluated as SQL. Expired entries
are pruned. `max_keys` defaults to 10000 (1–1000000) identities per scope;
when a scope is full it rejects new identities while existing identities can
continue within their budgets. Tracked identities are never evicted to make
room, so cycling identities cannot reset another client's counter, and a full
scope does not affect other scopes. Denied
requests do not grow counters. Rate checks reject an active transaction so
rolling back application work cannot undo admission counters. Use a dedicated
connection outside user-managed transactions.

Windows use wall-clock seconds and allow a burst at window boundaries. Clock
changes and peers sharing NAT can affect fairness. Behind a proxy the peer is the
proxy itself; do not deploy this IP policy there without a separately configured
trusted identity policy. Limits protect application operations, not network
bandwidth or the TLS handshake. SQLite lock/storage failures fail the request;
there is no fallback that silently admits requests. This is not a distributed
traffic filter or a replacement for deployment-specific capacity planning.
