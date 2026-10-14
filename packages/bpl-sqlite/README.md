# bpl-sqlite

Optional thin SQLite integration: prepared statements, copied parameter bindings,
row access, transactions, foreign keys, and a five-second busy timeout.
No SQLite source is bundled. Link an installed native SQLite library:

```bash
bun index.ts build app.bpl -l sqlite3 -o app
# On Linux with only the versioned runtime library:
bun index.ts build app.bpl --clang-flag=-l:libsqlite3.so.0 -o app
```

```bpl
import [SQLite], [Statement] from "bpl-sqlite";
frame main() {
    local db: SQLite = SQLite.open("app.sqlite");
    db.exec("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT)");
    local insert: Statement = db.prepare("INSERT INTO users(name) VALUES (?)");
    insert.bindText(1, "Ada");
    insert.step();
    insert.close();
    db.close();
}
```

Parameter indices start at **1**; result column indices start at **0**. Bind
values with `bindInt` (64-bit), `bindReal`, `bindText`, `bindBlob`, or `bindNull`.
Text and blob bindings copy their inputs using SQLite's
[SQLITE_TRANSIENT contract](https://www.sqlite.org/c3ref/bind_blob.html), so caller
buffers can change or be freed after binding. Bind values instead of building
SQL from user strings. Identifiers and SQL syntax cannot be parameterized.

`step()` returns true for a row and false when execution is done; errors throw.
Read columns only while a row is active: `integer`, `real`, `text`, `blob`,
`bytes`, and `isNull`. Text/blob pointers are borrowed SQLite buffers and expire
on the next step/reset/close or relevant conversion. Copy them before retaining
or queueing them. `reset()` resets execution and clears all bindings; bind again
before reuse. Completed statements cannot step again without reset.

`prepare` accepts exactly one SQL statement (trailing whitespace is allowed,
trailing comments/additional statements are rejected). `exec` is for statements
that return no rows. Use prepared queries to inspect SELECT/PRAGMA results.
`lastInsertId()` and `changes()` read connection-local result counters.

`begin()` uses BEGIN IMMEDIATE; `commit()` and `rollback()` are explicit. On an
application exception, roll back in your catch block. There are no implicit
transactions or nested transactions. Foreign-key checking is enabled on open.
The library does not enable WAL or change durability pragmas automatically.

Statements and connections are owners, not independently copyable handles.
Close each owner, and do not close borrowed copies. Close is idempotent on the
same object. Connection close uses sqlite3_close_v2; already-prepared statements
can finish, but no new ones can be prepared. Prefer closing all statements before
closing the connection. Error exceptions use stable generic messages;
`errorMessage()` borrows SQLite's connection error message for diagnostics.

For deferred cleanup of mutable owners, defer through a pointer:
`local owner: *Statement = &stmt; defer owner.close();`.
The native regression runs when a Linux SQLite runtime is available; other
platforms require their own library/link configuration and validation.
