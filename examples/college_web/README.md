# College web application starter

A working Linux BPL task board with a browser UI, persistent SQLite storage,
JSON REST handlers, validation, pagination, and public static assets. It is a
starting point you can adapt to your project domain, not a finished production
framework or an authenticated multi-user application.

From the repository root:

```bash
bun index.ts build examples/college_web/main.bpl -l sqlite3 -o examples/college_web/college-web
cd examples/college_web
./college-web
```

Open http://127.0.0.1:3000. You need a native SQLite library; if Linux has only
`libsqlite3.so.0` without the development linker symlink, replace `-l sqlite3`
with `--clang-flag=-l:libsqlite3.so.0`. The compiler uses the repository's BPL
packages directly. No JavaScript server runtime or frontend build is required.
The native server binary serves plain HTML, CSS, and JavaScript.

`PORT` selects a port (1–65535). `BPL_WEB_DB` selects a database file (default
`college.sqlite` in the working directory). Run from this directory so `public`
resolves correctly. Database files and the compiled app are locally ignored.
The server binds loopback; change the BPL listen call explicitly for public
binding and add HTTPS through a reverse proxy for deployment.

| Endpoint | Behavior |
| --- | --- |
| GET /api/health | Health JSON |
| GET /api/tasks?page=1&limit=20 | Paginated tasks, newest first |
| GET /api/tasks/:id | One task or 404 |
| POST /api/tasks | Create; returns 201 with Location |
| PUT /api/tasks/:id | Replace title/done or 404 |
| DELETE /api/tasks/:id | Delete; returns empty 204 or 404 |

POST and PUT use `application/json` with `{"title":"Homework","done":false}`.
Titles must contain 1–120 UTF-8 bytes; page is 1–10000 and limit is 1–100.
Validation failures return 422 with field codes; malformed JSON returns 400;
wrong media types return 415. The API disables caching. SQLite bindings separate
user values from SQL. The UI writes task titles through textContent.

Modules stay optional: bpl-express routes, bpl-sqlite persists, bpl-validation
checks input, and bpl-web-middleware supplies JSON checks and response headers.
The sample has no users, passwords, sessions, permission rules, uploads, or
background jobs. All callers reaching the API can modify all tasks. Add your
application's ownership and authentication design before exposing private data.
The current server handles connections sequentially; test your workload before
using it for a larger service.

Native integration test (Linux with SQLite):

```bash
bun test tests/WebCollegeExample.test.ts
```

It covers CRUD, escaped/UTF-8 input, validation, pagination, public assets, and
persistence after restarting the process.
