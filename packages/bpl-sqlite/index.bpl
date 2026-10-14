import [Time] from "std/time.bpl";
import [StringBuilder] from "std/string_builder.bpl";
export [Migrations];
extern strcmp(a: string, b: string) ret int;
extern strlen(text: string) ret long;
extern sqlite3_get_autocommit(db: *void) ret int;
extern sqlite3_backup_init(destination: *void, destinationName: string, source: *void, sourceName: string) ret *void;
extern sqlite3_backup_step(backup: *void, pages: int) ret int;
extern sqlite3_backup_finish(backup: *void) ret int;
extern mkstemp(template: string) ret int;
extern link(oldPath: string, newPath: string) ret int;
extern unlink(path: string) ret int;
extern close(fd: int) ret int;
extern fsync(fd: int) ret int;
extern openat(directory: int, path: string, flags: int, mode: uint) ret int;
extern usleep(time: uint) ret int;
export [SQLite];
export [Statement];
extern sqlite3_open_v2(path: string, db: **void, flags: int, vfs: string) ret int;
extern sqlite3_close_v2(db: *void) ret int;
extern sqlite3_busy_timeout(db: *void, ms: int) ret int;
extern sqlite3_errmsg(db: *void) ret string;
extern sqlite3_prepare_v2(db: *void, sql: string, bytes: int, stmt: **void, tail: **char) ret int;
extern sqlite3_finalize(stmt: *void) ret int;
extern sqlite3_step(stmt: *void) ret int;
extern sqlite3_reset(stmt: *void) ret int;
extern sqlite3_clear_bindings(stmt: *void) ret int;
extern sqlite3_bind_int64(stmt: *void, index: int, value: long) ret int;
extern sqlite3_bind_double(stmt: *void, index: int, value: double) ret int;
extern sqlite3_bind_text(stmt: *void, index: int, value: string, bytes: int, destructor: *void) ret int;
extern sqlite3_bind_blob(stmt: *void, index: int, value: *void, bytes: int, destructor: *void) ret int;
extern sqlite3_bind_null(stmt: *void, index: int) ret int;
extern sqlite3_column_count(stmt: *void) ret int;
extern sqlite3_column_type(stmt: *void, index: int) ret int;
extern sqlite3_column_int64(stmt: *void, index: int) ret long;
extern sqlite3_column_double(stmt: *void, index: int) ret double;
extern sqlite3_column_text(stmt: *void, index: int) ret string;
extern sqlite3_column_blob(stmt: *void, index: int) ret *void;
extern sqlite3_column_bytes(stmt: *void, index: int) ret int;
extern sqlite3_last_insert_rowid(db: *void) ret long;
extern sqlite3_changes(db: *void) ret int;

struct SQLite {
    handle: *void,
    busy_timeout_ms: int,
    migration_running: bool,
    frame open(path: string) ret SQLite {
        return SQLite.connect(path, 65542);
    }
    frame openReadOnly(path: string) ret SQLite {
        return SQLite.connect(path, 65537);
    }
    frame connect(path: string, flags: int) ret SQLite {
        if (path == nullptr) {
            throw "Invalid SQLite path";
        }
        local db: SQLite;
        db.handle = nullptr;
        db.busy_timeout_ms = 5000;
        db.migration_running = false;
        # READWRITE | CREATE | FULLMUTEX; no URI interpretation.
        local code: int = sqlite3_open_v2(path, &db.handle, flags, nullptr);
        if (code != 0) {
            if (db.handle != nullptr) {
                sqlite3_close_v2(db.handle);
            }
            throw "Cannot open SQLite database";
        }
        sqlite3_busy_timeout(db.handle, 5000);
        try {
            db.exec("PRAGMA foreign_keys = ON");
        } catch {
            db.close();
            throw "Cannot configure SQLite database";
        }
        return db;
    }
    frame check(this: *SQLite) {
        if (this.handle == nullptr) {
            throw "SQLite connection is closed";
        }
    }
    frame errorMessage(this: *SQLite) ret string {
        this.check();
        return sqlite3_errmsg(this.handle);
    }
    frame prepare(this: *SQLite, sql: string) ret Statement {
        this.check();
        if (sql == nullptr) {
            throw "Invalid SQL";
        }
        local s: Statement = Statement.new();
        local tail: *char = nullptr;
        local code: int = sqlite3_prepare_v2(this.handle, sql, -1, &s.handle, &tail);
        if ((code != 0) || (s.handle == nullptr)) {
            if (s.handle != nullptr) {
                sqlite3_finalize(s.handle);
            }
            throw "Cannot prepare SQL statement";
        }
        # Reject extra statements instead of silently ignoring them.
        loop ((tail[0] == ' ') || (tail[0] == '\t') || (tail[0] == '\r') || (tail[0] == '\n')) {
            tail = tail + 1;
        }
        if (tail[0] != 0) {
            s.close();
            throw "Expected exactly one SQL statement";
        }
        return s;
    }
    frame exec(this: *SQLite, sql: string) {
        local s: Statement = this.prepare(sql);
        local owner: *Statement = &s;
        defer owner.close();
        if (s.step()) {
            throw "Use prepared statements to read query rows";
        }
    }
    frame begin(this: *SQLite) {
        if (this.migration_running) {
            throw "Migrations manage their transaction";
        }
        this.exec("BEGIN IMMEDIATE");
    }
    frame commit(this: *SQLite) {
        if (this.migration_running) {
            throw "Migrations manage their transaction";
        }
        this.exec("COMMIT");
    }
    frame rollback(this: *SQLite) {
        if (this.migration_running) {
            throw "Migrations manage their transaction";
        }
        this.exec("ROLLBACK");
    }
    frame setBusyTimeout(this: *SQLite, milliseconds: int) {
        this.check();
        if ((milliseconds < 0) || (milliseconds > 300000)) {
            throw "SQLite busy timeout must be 0 to 300000 ms";
        }
        if (sqlite3_busy_timeout(this.handle, milliseconds) != 0) {
            throw "Cannot configure SQLite busy timeout";
        }
        this.busy_timeout_ms = milliseconds;
    }
    frame setWAL(this: *SQLite, enabled: bool) {
        this.check();
        if (sqlite3_get_autocommit(this.handle) == 0) {
            throw "Configure WAL outside transactions";
        }
        local sql: string = "PRAGMA journal_mode=DELETE";
        local expected: string = "delete";
        if (enabled) {
            sql = "PRAGMA journal_mode=WAL";
            expected = "wal";
        }
        local q: Statement = this.prepare(sql);
        local owner: *Statement = &q;
        defer owner.close();
        if (!q.step() || (q.text(0) == nullptr) || (strcmp(q.text(0), expected) != 0)) {
            throw "Requested SQLite journal mode is unavailable";
        }
    }
    frame integrityCheck(this: *SQLite) ret bool {
        local q: Statement = this.prepare("PRAGMA integrity_check");
        local owner: *Statement = &q;
        defer owner.close();
        if (!q.step() || (q.text(0) == nullptr) || (strcmp(q.text(0), "ok") != 0)) {
            return false;
        }
        return !q.step();
    }
    # POSIX online backup, atomically published without overwriting an existing path.
    frame backupTo(this: *SQLite, path: string, seconds: int) {
        this.check();
        if ((path == nullptr) || (path[0] == 0) || (seconds < 1) || (seconds > 300)) {
            throw "Invalid backup path or deadline";
        }
        if (sqlite3_get_autocommit(this.handle) == 0) {
            throw "Backup requires a connection outside transactions";
        }
        local temporary: StringBuilder = StringBuilder.new(128);
        local tempOwner: *StringBuilder = &temporary;
        defer tempOwner.destroy();
        temporary.append(path);
        temporary.append(".tmp.XXXXXX");
        local target: BackupTarget;
        target.fd = mkstemp(temporary.toString());
        target.path = temporary.toString();
        target.backup = nullptr;
        target.database.handle = nullptr;
        target.source = this;
        target.previous_timeout = this.busy_timeout_ms;
        if (target.fd < 0) {
            throw "Cannot create backup temporary file";
        }
        local targetOwner: *BackupTarget = &target;
        defer targetOwner.destroy();
        target.database = SQLite.open(target.path);
        target.database.setBusyTimeout(0);
        this.setBusyTimeout(0);
        target.backup = sqlite3_backup_init(target.database.handle, "main", this.handle, "main");
        if (target.backup == nullptr) {
            throw "Cannot initialize SQLite backup";
        }
        local start: long = backupMilliseconds();
        local attempts: int = 0;
        loop {
            local now: long = backupMilliseconds();
            if ((now < start) || ((now - start) >= (cast<long>(seconds) * 1000)) || (attempts >= (seconds * 100))) {
                throw "SQLite backup deadline exceeded";
            }
            local code: int = sqlite3_backup_step(target.backup, 128);
            if (code == 101) {
                break;
            }
            if ((code == 5) || (code == 6)) {
                attempts = attempts + 1;
                usleep(10000);
            } else if (code != 0) {
                throw "SQLite backup failed";
            }
        }
        local finished: int = sqlite3_backup_finish(target.backup);
        target.backup = nullptr;
        if (finished != 0) {
            throw "SQLite backup finalization failed";
        }
        target.database.close();
        if (fsync(target.fd) != 0) {
            throw "Cannot synchronize SQLite backup";
        }
        if (link(target.path, path) != 0) {
            throw "Backup destination exists or cannot be published";
        }
        # Flush the directory entry; a failure leaves a complete backup, never a partial file.
        local parent: StringBuilder = StringBuilder.new(64);
        local parentOwner: *StringBuilder = &parent;
        defer parentOwner.destroy();
        local slash: long = -1;
        loop (local i: long = 0; path[i] != 0; i = i + 1) {
            if (path[i] == '/') {
                slash = i;
            }
        }
        if (slash < 0) {
            parent.append(".");
        } else if (slash == 0) {
            parent.append("/");
        } else {
            loop (local i: long = 0; i < slash; i = i + 1) {
                parent.appendChar(path[i]);
            }
        }
        local directory: int = openat(-100, parent.toString(), 589824, 0);
        if (directory < 0) {
            throw "Backup published but directory synchronization failed";
        }
        local synced: int = fsync(directory);
        close(directory);
        if (synced != 0) {
            throw "Backup published but directory synchronization failed";
        }
    }
    frame lastInsertId(this: *SQLite) ret long {
        this.check();
        return sqlite3_last_insert_rowid(this.handle);
    }
    frame changes(this: *SQLite) ret int {
        this.check();
        return sqlite3_changes(this.handle);
    }
    # close_v2 lets already-prepared statements finish; no new statements may be created.
    frame close(this: *SQLite) {
        if (this.handle != nullptr) {
            sqlite3_close_v2(this.handle);
            this.handle = nullptr;
        }
    }
}
struct Statement {
    handle: *void,
    state: int,
    # 0 ready, 1 row, 2 done/error
    frame new() ret Statement {
        local s: Statement;
        s.handle = nullptr;
        s.state = 0;
        return s;
    }
    frame check(this: *Statement) {
        if (this.handle == nullptr) {
            throw "SQLite statement is closed";
        }
    }
    frame binding(this: *Statement) {
        this.check();
        if (this.state != 0) {
            throw "Reset statement before binding";
        }
    }
    frame bindInt(this: *Statement, index: int, value: long) ret *Statement {
        this.binding();
        if (sqlite3_bind_int64(this.handle, index, value) != 0) {
            throw "Cannot bind integer";
        }
        return this;
    }
    frame bindReal(this: *Statement, index: int, value: double) ret *Statement {
        this.binding();
        if (sqlite3_bind_double(this.handle, index, value) != 0) {
            throw "Cannot bind real";
        }
        return this;
    }
    # SQLITE_TRANSIENT (-1) copies caller bytes before returning.
    frame bindText(this: *Statement, index: int, value: string) ret *Statement {
        this.binding();
        if (sqlite3_bind_text(this.handle, index, value, -1, cast<*void>(cast<long>(-1))) != 0) {
            throw "Cannot bind text";
        }
        return this;
    }
    frame bindBlob(this: *Statement, index: int, value: *void, size: int) ret *Statement {
        this.binding();
        if ((size < 0) || ((size > 0) && (value == nullptr))) {
            throw "Invalid blob buffer";
        }
        if (sqlite3_bind_blob(this.handle, index, value, size, cast<*void>(cast<long>(-1))) != 0) {
            throw "Cannot bind blob";
        }
        return this;
    }
    frame bindNull(this: *Statement, index: int) ret *Statement {
        this.binding();
        if (sqlite3_bind_null(this.handle, index) != 0) {
            throw "Cannot bind null";
        }
        return this;
    }
    frame step(this: *Statement) ret bool {
        this.check();
        if (this.state == 2) {
            throw "Reset completed statement before stepping";
        }
        local code: int = sqlite3_step(this.handle);
        if (code == 100) {
            this.state = 1;
            return true;
        }
        this.state = 2;
        if (code == 101) {
            return false;
        }
        throw "SQLite statement execution failed";
    }
    frame column(this: *Statement, index: int) {
        this.check();
        if ((this.state != 1) || (index < 0) || (index >= sqlite3_column_count(this.handle))) {
            throw "Invalid SQLite row or column";
        }
    }
    frame integer(this: *Statement, index: int) ret long {
        this.column(index);
        return sqlite3_column_int64(this.handle, index);
    }
    frame real(this: *Statement, index: int) ret double {
        this.column(index);
        return sqlite3_column_double(this.handle, index);
    }
    frame text(this: *Statement, index: int) ret string {
        this.column(index);
        return sqlite3_column_text(this.handle, index);
    }
    frame blob(this: *Statement, index: int) ret *void {
        this.column(index);
        return sqlite3_column_blob(this.handle, index);
    }
    frame bytes(this: *Statement, index: int) ret int {
        this.column(index);
        return sqlite3_column_bytes(this.handle, index);
    }
    frame isNull(this: *Statement, index: int) ret bool {
        this.column(index);
        return sqlite3_column_type(this.handle, index) == 5;
    }
    # Resets execution and clears bindings, even after an execution error.
    frame reset(this: *Statement) {
        this.check();
        sqlite3_reset(this.handle);
        if (sqlite3_clear_bindings(this.handle) != 0) {
            throw "Cannot reset SQLite bindings";
        }
        this.state = 0;
    }
    frame close(this: *Statement) {
        if (this.handle != nullptr) {
            sqlite3_finalize(this.handle);
            this.handle = nullptr;
        }
        this.state = 2;
    }
}

# Monotonic deadline plus bounded lock retries.
frame backupMilliseconds() ret long {
    return Time.monotonicMs();
}
struct BackupTarget {
    fd: int,
    path: string,
    backup: *void,
    database: SQLite,
    source: *SQLite,
    previous_timeout: int,
    frame destroy(this: *BackupTarget) {
        if (this.backup != nullptr) {
            sqlite3_backup_finish(this.backup);
            this.backup = nullptr;
        }
        this.database.close();
        sqlite3_busy_timeout(this.source.handle, this.previous_timeout);
        this.source.busy_timeout_ms = this.previous_timeout;
        if (this.fd >= 0) {
            close(this.fd);
            this.fd = -1;
        }
        unlink(this.path);
    }
}
struct MigrationGuard {
    db: *SQLite,
    committed: bool,
    frame destroy(this: *MigrationGuard) {
        if (!this.committed) {
            this.db.migration_running = false;
            try {
                this.db.rollback();
            } catch {
            }
        }
    }
}
struct Migrations {
    # Fingerprints are caller-supplied immutable identifiers for migration contents.
    frame apply(db: *SQLite, version: int, name: string, fingerprint: string, change: Func<void>(*SQLite)) ret bool {
        if ((db == nullptr) || (version < 1) || (name == nullptr) || (fingerprint == nullptr) || (strlen(name) < 1) || (strlen(name) > 128) || (strlen(fingerprint) < 1) || (strlen(fingerprint) > 128)) {
            throw "Invalid migration metadata";
        }
        db.begin();
        local guard: MigrationGuard;
        guard.db = db;
        guard.committed = false;
        local owner: *MigrationGuard = &guard;
        defer owner.destroy();
        db.exec("CREATE TABLE IF NOT EXISTS bpl_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,fingerprint TEXT NOT NULL)");
        local q: Statement = db.prepare("SELECT name,fingerprint FROM bpl_migrations WHERE version=?");
        local qOwner: *Statement = &q;
        defer qOwner.close();
        q.bindInt(1, cast<long>(version));
        if (q.step()) {
            if ((strcmp(q.text(0), name) != 0) || (strcmp(q.text(1), fingerprint) != 0)) {
                throw "Applied migration identity changed";
            }
            q.close();
            db.commit();
            guard.committed = true;
            return false;
        }
        q.close();
        q = db.prepare("SELECT COALESCE(MAX(version),0) FROM bpl_migrations");
        if (!q.step() || (q.integer(0) != (cast<long>(version) - 1))) {
            throw "Migrations must be applied in consecutive order";
        }
        q.close();
        db.migration_running = true;
        change(db);
        db.migration_running = false;
        if (sqlite3_get_autocommit(db.handle) != 0) {
            throw "Migration changed its transaction";
        }
        q = db.prepare("INSERT INTO bpl_migrations VALUES(?,?,?)");
        q.bindInt(1, cast<long>(version)).bindText(2, name).bindText(3, fingerprint);
        q.step();
        q.close();
        db.commit();
        guard.committed = true;
        return true;
    }
}
