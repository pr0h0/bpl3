# bpl-passport

Optional, synchronous named authentication strategies for `bpl-express`.
Install `bpl-passport-0.1.0.tgz` with `bpl install`; workspace imports use the
source package. This is a BPL API inspired by Passport's strategy pattern,
not a JavaScript Passport plugin adapter.

`Passport.new()` creates an owning registry. `use(name, handler, context)` copies
its name and borrows the context pointer. Names must contain 1–64 bytes; duplicate
names, null handlers, and unknown strategy names throw configuration errors.
Register strategies during worker initialization, before serving requests.

A `StrategyHandler` has type `Func<long>(*void, *Request, *Response)`. Return a
positive application user ID on success, or zero/negative on rejection. Call
`passport.authenticate("local", req, res)` from a route handler: it returns the
verified ID or sends generic JSON 401 and returns zero. A strategy may send its
own response (for example 400 or 429); that response is preserved and the result
is zero even if the strategy returned a positive ID. An already completed
response prevents invocation. Exceptions propagate to the application's error
handler; they never authenticate a user.

The caller must stop on zero and explicitly establish its session or handle the
verified identity. This package does not issue cookies, persist users, restore
sessions, or grant access based on client headers. Use
[bpl-auth](../bpl-auth/README.md) for the SQLite session implementation and
[bpl-passport-local](../bpl-passport-local/README.md) for username/password JSON.

Call `destroy()` exactly once when done (repeated destroy is harmless). Do not
copy an owning registry. Borrowed contexts must remain at stable addresses and
outlive every authentication call. A registry and its callbacks are synchronous;
there is no shared-thread synchronization. No SQLite or libsodium linking is
required by this package.
