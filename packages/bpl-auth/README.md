# bpl-auth

Optional authentication for the Linux BPL web stack. Passwords use libsodium
Argon2id with its interactive settings (currently 64 MiB per hash); random
256-bit session tokens use libsodium's random generator. No cryptographic
algorithms are implemented in BPL. See the
[libsodium password API](https://doc.libsodium.org/password_hashing/default_phf).

Link SQLite and libsodium when building an app that uses this package:

```bash
bun index.ts build app.bpl -l sqlite3 -l sodium -o app
# Linux versioned runtime libraries, when development symlinks are absent:
bun index.ts build app.bpl --clang-flag=-l:libsqlite3.so.0 --clang-flag=-l:libsodium.so.23 -o app
```

`Auth.new(&database, "https://your-app.example", true)` initializes the schema
and returns an owner. The database must outlive Auth. Destroy Auth before closing
its database. Create services separately in each process worker after fork;
never inherit a live SQLite connection. This package is tested on Linux x86-64.

Call `register(req,res)`, `login(req,res)`, `me(req,res)`, and `logout(req,res)`
from normal handlers. Add a JSON media-type middleware for writes. Registration
accepts `{username,password}`: usernames use 3–32 lowercase ASCII letters,
digits, or underscores; passwords require 12–256 bytes. Login accepts passwords
of 1–256 bytes and uses the same generic failure for unknown/wrong credentials.
Registration is public and duplicate usernames return 409. There is no email
verification, password reset, MFA, invitation flow, or account administration.

`require(req,res)` validates a session and returns false after sending a rejection.
On success it copies `auth.id`, `auth.username`, and `auth.csrf` into `req.state`.
`Auth.userId(req)` reads this server-created identity. Ownership checks must still
bind this identity in every application query. Client headers/query/body fields
cannot initialize request state.

Cookies are `bpl_session`, HttpOnly, SameSite=Strict, Path=/, with a two-hour
Max-Age. Set `secure=true` for HTTPS; false is for local HTTP development only.
The configured origin must exactly match the browser's origin, including port.
Login/register require an Origin header matching it. Authenticated mutations
(including logout) also require `X-CSRF-Token` matching the session's random
CSRF value. `me` returns the current user and CSRF value, so a browser can recover
a session after reload without reading the HttpOnly cookie. Keep CSRF in memory.
Do not enable permissive credentialed CORS around these routes.

Only SHA-256 token digests are stored in SQLite. Password verification strings
contain their salts and hashing parameters. CSRF values are stored in plaintext
in session rows, so database files/backups remain private. Expiry is enforced
by the server on every request. Login creates a fresh token and atomically
replaces the user's previous session; there is one active session per account.
Logout deletes the session and expires the cookie. Invalid/duplicate session
cookies are rejected.

Limits are persisted in SQLite and shared across workers: 40 login/register
attempts per minute across the app and 10 login attempts per username per minute,
including successful attempts. They return 429 with Retry-After. These simple
fixed-window limits can deny legitimate users during abuse; they are not a full
traffic management system. Rate limits per client/network should be enforced
at a trusted reverse proxy for a public deployment. Never trust arbitrary
forwarded-IP headers. Request credentials are bounded to 2 KiB. Recognized
password buffers are overwritten before release; this is not a guarantee that
all allocator/browser copies are erased, and memory is not locked.

The app example shows registration, login, logout, expiry, CSRF, and task ownership:
[College web app](../../examples/college_web/README.md). HTTPS and deployment
configuration are still required before handling private data publicly.
