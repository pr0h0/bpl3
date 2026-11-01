import [Passport] from "bpl-passport";
import [LocalStrategy], [LocalCredentials] from "bpl-passport-local";
import [RateLimiter], [RateDecision] from "bpl-rate-limit";
import [AuthCrypto] from "./crypto.bpl";
import [SQLite], [Statement] from "bpl-sqlite";
import [Request], [Response], [HttpMethod] from "bpl-express";
import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [JSON] from "std/json.bpl";
extern strlen(text: string) ret ulong;
extern strcmp(a: string, b: string) ret int;
extern strncmp(a: string, b: string, count: ulong) ret int;
extern sprintf(out: string, fmt: string, ...) ret int;
extern time(out: *long) ret long;
extern strtoll(text: string, end: **char, base: int) ret long;
export [Auth];
export [AuthCrypto];
struct AuthUser {
    id: long,
    username: string,
}
struct AuthReply {
    user: AuthUser,
    csrf: string,
}
frame verifyLocalAuth(context: *void, req: *Request, res: *Response, username: string, password: string) ret long {
    local auth: *Auth = cast<*Auth>(context);
    return auth.verifyLocal(req, res, username, password);
}
struct Auth {
    db: *SQLite,
    limiter: RateLimiter,
    origin: string,
    secure: bool,
    dummy: String,
    frame new(db: *SQLite, origin: string, secure: bool) ret Auth {
        AuthCrypto.init();
        if ((origin == nullptr) || (origin[0] == 0)) {
            throw "Authentication requires an explicit origin";
        }
        local auth: Auth;
        auth.db = db;
        auth.limiter = RateLimiter.new(db);
        auth.origin = origin;
        auth.secure = secure || (strncmp(origin, "https://", 8) == 0);
        db.exec("CREATE TABLE IF NOT EXISTS auth_users(id INTEGER PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL)");
        db.exec("CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL)");
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id)");
        db.exec("CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at)");
        auth.dummy = AuthCrypto.passwordHash("invalid-user-dummy-password");
        return auth;
    }
    frame destroy(this: *Auth) {
        this.dummy.destroy();
    }
    frame usernameValid(name: string) ret bool {
        if ((name == nullptr) || (strlen(name) < 3) || (strlen(name) > 32)) {
            return false;
        }
        loop (local i: int = 0; name[i] != 0; i = i + 1) {
            if (!(((name[i] >= 'a') && (name[i] <= 'z')) || ((name[i] >= '0') && (name[i] <= '9')) || (name[i] == '_'))) {
                return false;
            }
        }
        return true;
    }
    frame sameOrigin(this: *Auth, req: *Request, res: *Response) ret bool {
        local value: Option<string> = req.header("origin");
        if (!value.isSome() || (strcmp(value.unwrap(), this.origin) != 0)) {
            res.status(403).json("{\"error\":\"origin denied\"}");
            return false;
        }
        return true;
    }
    frame limited(this: *Auth, key: string, maximum: int) ret bool {
        local decision: RateDecision = this.limiter.check("auth.login", key, maximum, 60);
        return !decision.allowed;
    }
    frame budget(this: *Auth, req: *Request, res: *Response) ret bool {
        return this.limiter.apply(req, res, "auth.peer", 40, 60);
    }
    frame credentials(req: *Request, res: *Response) ret *LocalCredentials {
        local body: *LocalCredentials = LocalCredentials.parse(req, res);
        if (body == nullptr) {
            return nullptr;
        }
        if (!Auth.usernameValid(body.username)) {
            body.destroy(req);
            res.status(422).json("{\"error\":\"invalid credentials\"}");
            return nullptr;
        }
        return body;
    }
    frame cookie(this: *Auth, res: *Response, token: string, age: string) {
        local sb: StringBuilder = StringBuilder.new(128);
        sb.append("bpl_session=");
        sb.append(token);
        sb.append("; Path=/; HttpOnly; SameSite=Strict; Max-Age=");
        sb.append(age);
        if (this.secure) {
            sb.append("; Secure");
        }
        res.appendHeader("Set-Cookie", sb.toString());
        sb.destroy();
    }
    frame issue(this: *Auth, user: long, name: string, res: *Response) {
        local token: String = AuthCrypto.token();
        local tokenOwner: *String = &token;
        defer tokenOwner.destroy();
        local hash: String = AuthCrypto.digest(token.data);
        local hashOwner: *String = &hash;
        defer hashOwner.destroy();
        local csrf: String = AuthCrypto.token();
        local csrfOwner: *String = &csrf;
        defer csrfOwner.destroy();
        local q: Statement = this.db.prepare("DELETE FROM auth_sessions WHERE expires_at<=?");
        local qOwner: *Statement = &q;
        defer qOwner.close();
        q.bindInt(1, time(nullptr));
        q.step();
        q.close();
        q = this.db.prepare("INSERT INTO auth_sessions(token_hash,user_id,csrf,expires_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,csrf=excluded.csrf,expires_at=excluded.expires_at");
        q.bindText(1, hash.data).bindInt(2, user).bindText(3, csrf.data).bindInt(4, time(nullptr) + 7200);
        q.step();
        q.close();
        this.cookie(res, token.data, "7200");
        local reply: AuthReply;
        reply.user.id = user;
        reply.user.username = name;
        reply.csrf = csrf.data;
        local json: String = JSON.stringify<AuthReply>(&reply);
        res.json(json.data);
        json.destroy();
    }
    frame register(this: *Auth, req: *Request, res: *Response) {
        defer LocalCredentials.wipe(req);
        if (!this.sameOrigin(req, res) || !this.budget(req, res)) {
            return;
        }
        local body: *LocalCredentials = Auth.credentials(req, res);
        if (body == nullptr) {
            return;
        }
        defer body.destroy(req);
        if (strlen(body.password) < 12) {
            res.status(422).json("{\"error\":\"password requires at least 12 bytes\"}");
            return;
        }
        local hash: String = AuthCrypto.passwordHash(body.password);
        local hashOwner: *String = &hash;
        defer hashOwner.destroy();
        local q: Statement = this.db.prepare("INSERT INTO auth_users(username,password_hash) VALUES (?,?) ON CONFLICT(username) DO NOTHING");
        local qOwner: *Statement = &q;
        defer qOwner.close();
        q.bindText(1, body.username).bindText(2, hash.data);
        q.step();
        q.close();
        if (this.db.changes() == 0) {
            res.status(409).json("{\"error\":\"username unavailable\"}");
            return;
        }
        res.status(201);
        this.issue(this.db.lastInsertId(), body.username, res);
    }
    frame login(this: *Auth, req: *Request, res: *Response) {
        defer LocalCredentials.wipe(req);
        if (!this.sameOrigin(req, res) || !this.budget(req, res)) {
            return;
        }
        local passport: Passport = Passport.new();
        local passportOwner: *Passport = &passport;
        defer passportOwner.destroy();
        local strategy: LocalStrategy = LocalStrategy.new(cast<*void>(this), verifyLocalAuth);
        strategy.install(&passport, "local");
        local user: long = passport.authenticate("local", req, res);
        if (user > 0) {
            this.issue(user, req.state.get("auth.login.username").unwrap(), res);
        }
    }
    frame verifyLocal(this: *Auth, req: *Request, res: *Response, username: string, password: string) ret long {
        if (!Auth.usernameValid(username)) {
            res.status(422).json("{\"error\":\"invalid credentials\"}");
            return 0;
        }
        local key: StringBuilder = StringBuilder.new(48);
        local keyOwner: *StringBuilder = &key;
        defer keyOwner.destroy();
        key.append(req.peerAddress());
        key.append("/");
        key.append(username);
        local denied: bool = this.limited(key.toString(), 10);
        key.destroy();
        if (denied) {
            res.status(429).setHeader("Retry-After", "60").json("{\"error\":\"try again later\"}");
            return 0;
        }
        local q: Statement = this.db.prepare("SELECT id,password_hash FROM auth_users WHERE username=?");
        local qOwner: *Statement = &q;
        defer qOwner.close();
        q.bindText(1, username);
        local user: long = 0;
        local hash: String = String.new(this.dummy.data);
        local hashOwner: *String = &hash;
        defer hashOwner.destroy();
        if (q.step()) {
            user = q.integer(0);
            hash.destroy();
            hash = String.new(q.text(1));
        }
        q.close();
        local valid: bool = AuthCrypto.verify(hash.data, password);
        hash.destroy();
        if (!valid || (user == 0)) {
            return 0;
        }
        req.setState("auth.login.username", username);
        return user;
    }
    frame token(req: *Request) ret String {
        local result: String = String.new("");
        local cookie: Option<string> = req.header("cookie");
        if (!cookie.isSome()) {
            return result;
        }
        local raw: string = cookie.unwrap();
        local size: long = cast<long>(strlen(raw));
        local pos: long = 0;
        local found: bool = false;
        loop (pos < size) {
            loop ((pos < size) && ((raw[pos] == ' ') || (raw[pos] == '\t') || (raw[pos] == ';'))) {
                pos = pos + 1;
            }
            local end: long = pos;
            loop ((end < size) && (raw[end] != ';')) {
                end = end + 1;
            }
            if (((end - pos) >= 12) && (strncmp(raw + pos, "bpl_session=", 12) == 0)) {
                if (found || ((end - pos) != 76)) {
                    result.destroy();
                    return String.new("");
                }
                found = true;
                local bytes: char[65];
                loop (local i: int = 0; i < 64; i = i + 1) {
                    bytes[i] = raw[pos + 12 + cast<long>(i)];
                }
                bytes[64] = 0;
                if (!AuthCrypto.tokenValid(cast<string>(&bytes[0]))) {
                    result.destroy();
                    return String.new("");
                }
                result.destroy();
                result = String.new(cast<string>(&bytes[0]));
            }
            pos = end + 1;
        }
        return result;
    }
    frame require(this: *Auth, req: *Request, res: *Response) ret bool {
        local token: String = Auth.token(req);
        local tokenOwner: *String = &token;
        defer tokenOwner.destroy();
        if (token.length == 0) {
            res.status(401).json("{\"error\":\"authentication required\"}");
            return false;
        }
        local hash: String = AuthCrypto.digest(token.data);
        local hashOwner: *String = &hash;
        defer hashOwner.destroy();
        local q: Statement = this.db.prepare("SELECT u.id,u.username,s.csrf FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?");
        local owner: *Statement = &q;
        defer owner.close();
        q.bindText(1, hash.data).bindInt(2, time(nullptr));
        if (!q.step()) {
            res.status(401).json("{\"error\":\"authentication required\"}");
            return false;
        }
        if ((req.method != HttpMethod.GET) && (req.method != HttpMethod.HEAD)) {
            if (!this.sameOrigin(req, res)) {
                return false;
            }
            local csrf: Option<string> = req.header("x-csrf-token");
            if (!csrf.isSome() || !AuthCrypto.equalToken(csrf.unwrap(), q.text(2))) {
                res.status(403).json("{\"error\":\"CSRF token required\"}");
                return false;
            }
        }
        local id: char[32];
        sprintf(cast<string>(&id[0]), "%ld", q.integer(0));
        req.setState("auth.id", cast<string>(&id[0]));
        req.setState("auth.username", q.text(1));
        req.setState("auth.csrf", q.text(2));
        return true;
    }
    frame userId(req: *Request) ret long {
        local value: Option<string> = req.state.get("auth.id");
        if (!value.isSome()) {
            throw "Missing authenticated identity";
        }
        return strtoll(value.unwrap(), nullptr, 10);
    }
    frame me(this: *Auth, req: *Request, res: *Response) {
        if (!this.require(req, res)) {
            return;
        }
        local reply: AuthReply;
        reply.user.id = Auth.userId(req);
        reply.user.username = req.state.get("auth.username").unwrap();
        reply.csrf = req.state.get("auth.csrf").unwrap();
        local json: String = JSON.stringify<AuthReply>(&reply);
        res.json(json.data);
        json.destroy();
    }
    frame logout(this: *Auth, req: *Request, res: *Response) {
        if (!this.require(req, res)) {
            return;
        }
        local token: String = Auth.token(req);
        local hash: String = AuthCrypto.digest(token.data);
        token.destroy();
        local q: Statement = this.db.prepare("DELETE FROM auth_sessions WHERE token_hash=?");
        local qOwner: *Statement = &q;
        defer qOwner.close();
        q.bindText(1, hash.data);
        hash.destroy();
        q.step();
        q.close();
        this.cookie(res, "", "0");
        res.status(204).end();
    }
}
