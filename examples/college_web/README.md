# Authenticated college web application

A Linux BPL task board with private accounts, a browser UI, SQLite persistence,
validated JSON APIs, and bounded process workers. It demonstrates a project
foundation; it is not a complete public deployment or account-management system.

From the repository root:

```bash
bun index.ts build examples/college_web/main.bpl -l sqlite3 -l sodium -o examples/college_web/college-web
cd examples/college_web
./college-web
```

If only Linux runtime libraries are available, replace the two `-l` options with
`--clang-flag=-l:libsqlite3.so.0 --clang-flag=-l:libsodium.so.23`. No host packages
are installed by the app. It requires native SQLite and libsodium libraries.

Open **http://127.0.0.1:3000**, create an account, and sign in. Usernames use 3–32
lowercase letters/digits/underscores; registration passwords require 12–256 UTF-8
bytes. The UI uses an HttpOnly cookie for the session and keeps CSRF in memory.
Each account sees and modifies only its own tasks. Signing in again revokes the
previous session for that account; signing out revokes the current session.

| Configuration | Default / behavior |
| --- | --- |
| PORT | 3000, integer 1–65535 |
| BPL_WEB_DB | college.sqlite in the working directory |
| BPL_WEB_WORKERS | 2, integer 1–8 |
| BPL_WEB_WAL | 0 leaves journal mode unchanged; 1 enables WAL before migrations |
| BPL_WEB_COMPRESSION | 0; 1 enables optional gzip for public assets using libz.so.1 |
| BPL_WEB_ACCESS_LOG | 0; 1 enables JSON completion logs; request IDs are always generated |
| BPL_WEB_API_LIMIT | 240 API requests per socket peer per minute, health excluded |
| BPL_WEB_ORIGIN | http://127.0.0.1:PORT, or https with native TLS; must exactly match the browser origin |
| BPL_WEB_TLS_CERT | Unset; PEM certificate chain path enables native HTTPS with the key |
| BPL_WEB_TLS_KEY | Unset; matching unencrypted PEM private key path |
| BPL_WEB_SECURE_COOKIES | 0 for local HTTP; 1 forces Secure; HTTPS origins also enable it |

Run from this directory so public assets resolve. If you use `localhost` instead
of `127.0.0.1`, explicitly set BPL_WEB_ORIGIN to that origin. Native HTTPS is
available inside the app:

```bash
BPL_WEB_TLS_CERT=/absolute/path/fullchain.pem \
BPL_WEB_TLS_KEY=/absolute/path/key.pem \
BPL_WEB_ORIGIN=https://127.0.0.1:3000 ./college-web
```

Native TLS additionally needs the OpenSSL 3 runtime (`libssl.so.3`). Both paths
must be configured; a partial configuration fails instead of falling back to
HTTP. Native TLS defaults the origin to HTTPS and automatically enables Secure
session cookies. An explicitly configured HTTP origin is rejected in TLS mode.
The certificate must cover the hostname/IP you open. Issue and renew public
certificates externally and restart to reload them. The listener remains
loopback; edit the listen host when exposing the app directly. A reverse proxy
remains an alternative deployment option. Forwarded-origin/IP headers are not
trusted automatically.

| Endpoint | Behavior |
| --- | --- |
| POST /auth/register | Public registration; JSON username/password; returns 201 |
| POST /auth/login | Fresh cookie session; JSON username/password |
| GET /auth/me | Current user and CSRF token, or 401 |
| POST /auth/logout | CSRF-protected revocation; returns 204 |
| GET /api/health | Public health JSON |
| GET /api/tasks?page=1&limit=20 | Current user's tasks, newest first |
| GET /api/tasks/:id | Owned task or 404 |
| POST /api/tasks | Create owned task; 201 with Location |
| PUT /api/tasks/:id | Replace owned title/done or 404 |
| DELETE /api/tasks/:id | Delete owned task; empty 204 or 404 |

Task POST/PUT use application/json with `{"title":"Homework","done":false}`.
Titles contain 1–120 UTF-8 bytes, page is 1–10000, and limit is 1–100.
Task JSON bodies are limited to 4 KiB and accounts to 1000 tasks; the task quota
is enforced by a single SQLite insert so concurrent workers cannot exceed it. Invalid input
returns 422; malformed JSON returns 400; wrong media types return 415.
Authenticated mutations require the configured Origin and X-CSRF-Token. Login
and registration require the matching Origin even before a session exists.
New files use a private umask, and the app requires the database file to be mode
0600 (including existing anonymous databases). Use a trusted, private database
directory; file permissions do not encrypt its contents.

Tokens expire after two hours; only their SHA-256 digests are stored. Passwords
use salted Argon2id. Login/registration limits are shared across workers in SQLite.
See [bpl-auth](../../packages/bpl-auth/README.md) for exact policy and limitations.

On startup, existing anonymous task databases gain an owner_id column. Old rows
are preserved with no owner and hidden from all accounts. They are **not** claimed
by the first registering user. Assign them only through an explicit application
migration policy after deciding who owns them.

Two processes can handle different connections concurrently. Each opens its own
SQLite connection after fork; no live connection is inherited. This uses POSIX
FFI, not language-level async or threads. Worker memory is private, so shared
application data must live in an external store. Requests have inactivity and
total assembly deadlines. The supervisor restarts exited workers; shutdown does
not drain in-flight requests. Test workload capacity before public deployment.

There is no email verification, password reset, MFA, roles/admin UI, file upload,
or background job system. Public sign-up and the fixed-window rate limits may
need a different policy for your project. Protect database files/backups and add
reverse-proxy traffic limits and operational monitoring for deployment.

## Tests

```bash
bun test tests/WebCollegeExample.test.ts tests/WebAuthCrypto.test.ts tests/WebWorkerPool.test.ts tests/WebJsonInputLimits.test.ts
```

These use real native BPL programs and synthetic accounts. Coverage includes
cross-user read/update/delete denial, CSRF/origin rejection, cookies, expiry,
rotation/revocation, restart persistence, worker replacement, input/task limits,
anonymous-data migration, password
hash storage, rate limits, concurrent requests, and slow-client deadlines.
The test client requests Connection: close, matching the server's protocol.

For real browser checks, first run the app on port 31947 with a disposable DB:

```bash
PORT=31947 BPL_WEB_DB=/tmp/bpl-browser-test.sqlite ./college-web
```

Then from the repository root, run Chromium and Firefox in the pinned Docker
image. Browser packages stay inside the container; evidence stays locally ignored:

```bash
mkdir -p docs/audits/college-web-auth
docker run --rm --init --network host --shm-size=256m --memory=1g \
  -v "$PWD/tools/test_college_web_browser.cjs:/work/browser.cjs:ro" \
  -v "$PWD/docs/audits/college-web-auth:/evidence" \
  -e BPL_BROWSER_EVIDENCE=/evidence \
  mcr.microsoft.com/playwright:v1.64.0-noble bash -lc \
  'npm install --prefix /tmp/browser --no-save playwright@1.64.0 >/tmp/npm.log 2>&1 && NODE_PATH=/tmp/browser/node_modules node /work/browser.cjs'
```

The script is limited to loopback origins and synthetic users. It checks sign-up,
login/logout, reload sessions, task changes, literal markup display, HttpOnly
cookies, UTF-8 byte validation, mobile width, and browser page errors. It does
not automate broad scanning or prove that every browser/security case is covered.

For the browser regression, `BPL_BROWSER_ORIGIN=https://127.0.0.1:PORT` tests
native HTTPS and asserts Secure session cookies. A disposable self-signed local
fixture can use `BPL_BROWSER_SELF_SIGNED=1` to bypass browser certificate trust
for that test only. Default browser tests enforce certificate trust. Native TLS
regressions separately verify trusted chains, DNS/IP matching, and expiry.

## Operational helpers

Task schema changes use versioned Migrations.apply before workers start. Existing
anonymous rows remain preserved and hidden. BPL_WEB_WAL=1 opts into SQLite WAL;
its shared-memory/journal files must stay with the live database. Login throttles
are per socket peer and peer/username pair. API limits are also per real socket
peer; forwarding headers cannot evade them. Behind a proxy, peers share the proxy
address, so configure a validated identity policy before using these defaults.

SIGTERM/SIGINT drain active worker requests for up to ten seconds. Worker cleanup
closes authentication and database services. Stuck workers are killed after the
grace period; an unexpected supervisor death also terminates workers. Optional
completion logs omit request secrets and include generated IDs, route patterns,
status, timing, and handler/I/O failure flags. Configure a reliable log sink;
blocking log collection can delay a worker.

Build the separate backup helper from the repository root:

```bash
bun index.ts build examples/college_web/backup.bpl --clang-flag=-l:libsqlite3.so.0 -o /tmp/college-backup
/tmp/college-backup /absolute/path/college.sqlite /absolute/path/new-snapshot.sqlite
```

It opens the source read-only, checks integrity, backs up live committed data
(including WAL), and verifies the resulting snapshot. Existing destinations are
never overwritten. Keep backups private. For restore, stop all workers, validate
a snapshot in an isolated directory, replace the database offline, and exercise
app reads/writes before serving traffic. Do not copy only the main file of a live
WAL database. See [SQLite package](../../packages/bpl-sqlite/README.md) for contracts.

Login is implemented by `bpl-auth` through the `bpl-passport` registry and
`bpl-passport-local` username/password strategy. The browser API remains
`POST /auth/login` with JSON credentials; successful verification rotates the
server-side session and returns the user and CSRF token. See the
[local strategy package](../../packages/bpl-passport-local/README.md) for a custom
user-store integration.

Public assets now support conditional caching and single byte ranges. Their
middleware checks Accept and adds Vary: Accept. `BPL_WEB_COMPRESSION=1` enables
negotiated gzip for buffered public assets, with Vary: Accept-Encoding. Range
responses remain uncompressed. Authentication and private API responses are not
attached to compression; their session/CSRF and no-store behavior is retained.
No zlib linker flags are required: the runtime library loads only on compression.
