import [SQLite], [Statement] from "bpl-sqlite";
import [Request], [Response] from "bpl-express";
extern sqlite3_libversion_number() ret int;
extern sqlite3_get_autocommit(db: *void) ret int;
extern time(out: *long) ret long;
extern strlen(text: string) ret long;
extern sprintf(out: string, format: string, ...) ret int;
export [RateLimiter];
export [RateDecision];
struct RateDecision {
    allowed: bool,
    remaining: int,
    retry_after: int,
}
struct RateLimiter {
    db: *SQLite,
    max_keys: int,
    frame new(db: *SQLite) ret RateLimiter {
        if (db == nullptr) {
            throw "Rate limiter needs a SQLite connection";
        }
        if (sqlite3_libversion_number() < 3035000) {
            throw "Rate limiter requires SQLite 3.35 or newer";
        }
        db.exec("CREATE TABLE IF NOT EXISTS bpl_rate_limits(scope TEXT NOT NULL,identity TEXT NOT NULL,count INTEGER NOT NULL,reset_at INTEGER NOT NULL,PRIMARY KEY(scope,identity))");
        db.exec("CREATE INDEX IF NOT EXISTS bpl_rate_limits_expiry ON bpl_rate_limits(reset_at)");
        local limiter: RateLimiter;
        limiter.db = db;
        limiter.max_keys = 10000;
        return limiter;
    }
    # A single INSERT/UPSERT/RETURNING decides admission atomically across workers.
    frame check(this: *RateLimiter, scope: string, identity: string, maximum: int, seconds: int) ret RateDecision {
        if ((scope == nullptr) || (identity == nullptr) || (strlen(scope) < 1) || (strlen(scope) > 64) || (strlen(identity) < 1) || (strlen(identity) > 128) || (maximum < 1) || (maximum > 1000000) || (seconds < 1) || (seconds > 86400) || (this.max_keys < 1) || (this.max_keys > 1000000)) {
            throw "Invalid rate limit configuration";
        }
        this.db.check();
        if (sqlite3_get_autocommit(this.db.handle) == 0) {
            throw "Rate limits require a connection outside transactions";
        }
        local now: long = time(nullptr);
        if (now < 0) {
            throw "Cannot read rate limit clock";
        }
        local q: Statement = this.db.prepare("DELETE FROM bpl_rate_limits WHERE reset_at<=?");
        local owner: *Statement = &q;
        defer owner.close();
        q.bindInt(1, now);
        q.step();
        q.close();
        local result: RateDecision;
        result.allowed = false;
        result.remaining = 0;
        result.retry_after = 1;
        q = this.db.prepare("INSERT INTO bpl_rate_limits(scope,identity,count,reset_at) SELECT ?,?,1,? WHERE (SELECT count(*) FROM bpl_rate_limits)<? OR EXISTS(SELECT 1 FROM bpl_rate_limits WHERE scope=? AND identity=?) ON CONFLICT(scope,identity) DO UPDATE SET count=count+1 WHERE count<? RETURNING count,reset_at");
        q.bindText(1, scope).bindText(2, identity).bindInt(3, now + cast<long>(seconds)).bindInt(4, cast<long>(this.max_keys)).bindText(5, scope).bindText(6, identity).bindInt(7, cast<long>(maximum));
        if (q.step()) {
            result.allowed = true;
            result.remaining = maximum - cast<int>(q.integer(0));
            result.retry_after = cast<int>(q.integer(1) - now);
            if (result.retry_after < 1) {
                result.retry_after = 1;
            }
        }
        if (result.allowed && q.step()) {
            throw "Unexpected rate limit result";
        }
        q.close();
        if (!result.allowed) {
            q = this.db.prepare("SELECT reset_at FROM bpl_rate_limits WHERE scope=? AND identity=?");
            q.bindText(1, scope).bindText(2, identity);
            if (q.step()) {
                local retry: long = q.integer(0) - now;
                if (retry > cast<long>(seconds)) {
                    retry = cast<long>(seconds);
                }
                if (retry > 0) {
                    result.retry_after = cast<int>(retry);
                }
            }
            q.close();
        }
        return result;
    }
    frame apply(this: *RateLimiter, req: *Request, res: *Response, scope: string, maximum: int, seconds: int) ret bool {
        local peer: string = req.peerAddress();
        if (peer[0] == 0) {
            res.status(500).json("{\"error\":\"socket peer unavailable\"}");
            return false;
        }
        local decision: RateDecision = this.check(scope, peer, maximum, seconds);
        local number: char[32];
        sprintf(cast<string>(&number[0]), "%d", maximum);
        res.setHeader("RateLimit-Limit", cast<string>(&number[0]));
        sprintf(cast<string>(&number[0]), "%d", decision.remaining);
        res.setHeader("RateLimit-Remaining", cast<string>(&number[0]));
        if (!decision.allowed) {
            sprintf(cast<string>(&number[0]), "%d", decision.retry_after);
            res.status(429).setHeader("Retry-After", cast<string>(&number[0])).json("{\"error\":\"try again later\"}");
            return false;
        }
        return true;
    }
}
