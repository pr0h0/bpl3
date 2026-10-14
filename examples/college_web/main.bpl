import [App], [Router], [Request], [Response], [HttpMethod] from "bpl-express";
import [Auth] from "bpl-auth";
import [SQLite], [Statement], [Migrations] from "bpl-sqlite";
import [Validator] from "bpl-validation";
import securityHeaders, requireJson, requestId, accessLog from "bpl-web-middleware";
import [JSON] from "std/json.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import [Env] from "std/env.bpl";
extern umask(mask: uint) ret uint;
extern chmod(path: string, mode: uint) ret int;
import malloc, free, strcmp, strlen, strncmp, sprintf from "std/c.bpl";

global database: *SQLite;
global authentication: *Auth;
global allowedOrigin: string;
global secureCookies: bool;
global apiMaximum: int;
struct TaskInput {
    title: string,
    done: bool,
}
struct Task {
    id: long,
    title: string,
    done: bool,
}

frame queryOr(req: *Request, key: string, fallback: string) ret string {
    local value: Option<string> = req.query.get(key);
    if (value.isSome()) {
        return value.unwrap();
    }
    return fallback;
}
frame validationError(v: *Validator, res: *Response) {
    local errors: String = v.json();
    res.status(422).json(errors.data);
    errors.destroy();
}
frame taskId(req: *Request, res: *Response) ret int {
    local v: Validator = Validator.new();
    local value: Option<string> = req.getParam("id");
    local id: Option<int> = v.integer("id", value.unwrapOr(""), 1, 2147483647);
    if (!v.ok()) {
        validationError(&v, res);
        v.destroy();
        return 0;
    }
    local result: int = id.unwrap();
    v.destroy();
    return result;
}
frame input(req: *Request, res: *Response) ret *TaskInput {
    if (req.body_length > 4096) {
        res.status(413).json("{\"error\":\"task input too large\"}");
        return nullptr;
    }
    if (strlen(req.body) != req.body_length) {
        res.status(400).json("{\"error\":\"text JSON required\"}");
        return nullptr;
    }
    local body: *TaskInput = JSON.parse<TaskInput>(req.body);
    if (body == nullptr) {
        res.status(400).json("{\"error\":\"invalid JSON\"}");
        return nullptr;
    }
    local v: Validator = Validator.new();
    v.required("title", body.title).length("title", body.title, 1, 120);
    if (!v.ok()) {
        validationError(&v, res);
        v.destroy();
        JSON.free<TaskInput>(body);
        return nullptr;
    }
    v.destroy();
    return body;
}
frame jsonWrites(req: *Request, res: *Response) {
    if ((req.method == HttpMethod.POST) || (req.method == HttpMethod.PUT) || (req.method == HttpMethod.PATCH)) {
        requireJson(req, res);
    }
}
frame noCache(_req: *Request, res: *Response) {
    res.setHeader("Cache-Control", "no-store");
}
frame webHeaders(req: *Request, res: *Response) {
    securityHeaders(req, res);
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}
frame notFound(_req: *Request, res: *Response) {
    res.status(404).json("{\"error\":\"not found\"}");
}
frame health(_req: *Request, res: *Response) {
    res.json("{\"status\":\"ok\"}");
}
frame listTasks(req: *Request, res: *Response) {
    local v: Validator = Validator.new();
    local page: Option<int> = v.integer("page", queryOr(req, "page", "1"), 1, 10000);
    local limit: Option<int> = v.integer("limit", queryOr(req, "limit", "20"), 1, 100);
    if (!v.ok()) {
        validationError(&v, res);
        v.destroy();
        return;
    }
    v.destroy();
    local q: Statement = database.prepare("SELECT id,title,done FROM tasks WHERE owner_id=? ORDER BY id DESC LIMIT ? OFFSET ?");
    local owner: *Statement = &q;
    defer owner.close();
    q.bindInt(1, Auth.userId(req)).bindInt(2, cast<long>(limit.unwrap())).bindInt(3, cast<long>((page.unwrap() - 1) * limit.unwrap()));
    local sb: StringBuilder = StringBuilder.new(256);
    local builder: *StringBuilder = &sb;
    defer builder.destroy();
    sb.append("{\"items\":[");
    local first: bool = true;
    loop (q.step()) {
        if (!first) {
            sb.append(",");
        }
        first = false;
        local task: Task;
        task.id = q.integer(0);
        task.title = q.text(1);
        task.done = q.integer(2) != 0;
        local text: String = JSON.stringify<Task>(&task);
        sb.append(text.data);
        text.destroy();
    }
    local numbers: char[96];
    sprintf(cast<string>(&numbers[0]), "],\"page\":%d,\"limit\":%d}", page.unwrap(), limit.unwrap());
    sb.append(cast<string>(&numbers[0]));
    res.json(sb.toString());
}
frame getTask(req: *Request, res: *Response) {
    local id: int = taskId(req, res);
    if (id == 0) {
        return;
    }
    local q: Statement = database.prepare("SELECT id,title,done FROM tasks WHERE id=? AND owner_id=?");
    local owner: *Statement = &q;
    defer owner.close();
    q.bindInt(1, cast<long>(id)).bindInt(2, Auth.userId(req));
    if (!q.step()) {
        notFound(req, res);
        return;
    }
    local task: Task;
    task.id = q.integer(0);
    task.title = q.text(1);
    task.done = q.integer(2) != 0;
    local text: String = JSON.stringify<Task>(&task);
    res.json(text.data);
    text.destroy();
}
frame createTask(req: *Request, res: *Response) {
    local body: *TaskInput = input(req, res);
    if (body == nullptr) {
        return;
    }
    defer JSON.free<TaskInput>(body);
    local q: Statement = database.prepare("INSERT INTO tasks(title,done,owner_id) SELECT ?,?,? WHERE (SELECT count(*) FROM tasks WHERE owner_id=?)<1000");
    local owner: *Statement = &q;
    defer owner.close();
    q.bindText(1, body.title).bindInt(2, cast<long>(body.done)).bindInt(3, Auth.userId(req)).bindInt(4, Auth.userId(req));
    q.step();
    if (database.changes() == 0) {
        res.status(409).json("{\"error\":\"task limit reached\"}");
        return;
    }
    local task: Task;
    task.id = database.lastInsertId();
    task.title = body.title;
    task.done = body.done;
    local location: char[64];
    sprintf(cast<string>(&location[0]), "/api/tasks/%ld", task.id);
    local text: String = JSON.stringify<Task>(&task);
    res.status(201).setHeader("Location", cast<string>(&location[0])).json(text.data);
    text.destroy();
}
frame updateTask(req: *Request, res: *Response) {
    local id: int = taskId(req, res);
    if (id == 0) {
        return;
    }
    local body: *TaskInput = input(req, res);
    if (body == nullptr) {
        return;
    }
    defer JSON.free<TaskInput>(body);
    local q: Statement = database.prepare("UPDATE tasks SET title=?,done=? WHERE id=? AND owner_id=?");
    local owner: *Statement = &q;
    defer owner.close();
    q.bindText(1, body.title).bindInt(2, cast<long>(body.done)).bindInt(3, cast<long>(id)).bindInt(4, Auth.userId(req));
    q.step();
    if (database.changes() == 0) {
        notFound(req, res);
        return;
    }
    local task: Task;
    task.id = cast<long>(id);
    task.title = body.title;
    task.done = body.done;
    local text: String = JSON.stringify<Task>(&task);
    res.json(text.data);
    text.destroy();
}
frame deleteTask(req: *Request, res: *Response) {
    local id: int = taskId(req, res);
    if (id == 0) {
        return;
    }
    local q: Statement = database.prepare("DELETE FROM tasks WHERE id=? AND owner_id=?");
    local owner: *Statement = &q;
    defer owner.close();
    q.bindInt(1, cast<long>(id)).bindInt(2, Auth.userId(req));
    q.step();
    if (database.changes() == 0) {
        notFound(req, res);
        return;
    }
    res.status(204).end();
}
frame apiBudget(req: *Request, res: *Response) {
    if ((strncmp(req.path, "/api/", 5) == 0) && (strcmp(req.path, "/api/health") != 0)) {
        authentication.limiter.apply(req, res, "api.peer", apiMaximum, 60);
    }
}
frame requireAuth(req: *Request, res: *Response) {
    if (strcmp(req.path, "/health") != 0) {
        authentication.require(req, res);
    }
}
frame register(req: *Request, res: *Response) {
    authentication.register(req, res);
}
frame login(req: *Request, res: *Response) {
    authentication.login(req, res);
}
frame me(req: *Request, res: *Response) {
    authentication.me(req, res);
}
frame logout(req: *Request, res: *Response) {
    authentication.logout(req, res);
}
frame initializeWorker() {
    database = cast<*SQLite>(malloc(sizeof<SQLite>()));
    authentication = cast<*Auth>(malloc(sizeof<Auth>()));
    if ((database == nullptr) || (authentication == nullptr)) {
        throw "Cannot allocate worker services";
    }
    local path: string = Env.getOr("BPL_WEB_DB", "college.sqlite");
    if ((path[0] == 0) || (strcmp(path, ":memory:") == 0)) {
        throw "Process workers require a persistent database file";
    }
    *database = SQLite.open(path);
    if ((strcmp(path, ":memory:") != 0) && (chmod(path, 384) != 0)) {
        database.close();
        throw "Cannot protect database file permissions";
    }
    *authentication = Auth.new(database, allowedOrigin, secureCookies);
}
frame tasksSchema(db: *SQLite) {
    db.exec("CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY,title TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),owner_id INTEGER REFERENCES auth_users(id))");
    local columns: Statement = db.prepare("PRAGMA table_info(tasks)");
    local hasOwner: bool = false;
    loop (columns.step()) {
        if (strcmp(columns.text(1), "owner_id") == 0) {
            hasOwner = true;
        }
    }
    columns.close();
    if (!hasOwner) {
        db.exec("ALTER TABLE tasks ADD COLUMN owner_id INTEGER REFERENCES auth_users(id)");
    }
    db.exec("CREATE INDEX IF NOT EXISTS tasks_owner ON tasks(owner_id,id)");
}
frame migrate() {
    Migrations.apply(database, 1, "tasks-ownership", "tasks-ownership-v1", tasksSchema);
}
frame cleanupWorker() {
    if (authentication != nullptr) {
        authentication.destroy();
        free(authentication);
        authentication = nullptr;
    }
    if (database != nullptr) {
        database.close();
        free(database);
        database = nullptr;
    }
}
frame main() {
    umask(63);
    local config: Validator = Validator.new();
    local port: Option<int> = config.integer("PORT", Env.getOr("PORT", "3000"), 1, 65535);
    local workers: Option<int> = config.integer("BPL_WEB_WORKERS", Env.getOr("BPL_WEB_WORKERS", "2"), 1, 8);
    local apiLimit: Option<int> = config.integer("BPL_WEB_API_LIMIT", Env.getOr("BPL_WEB_API_LIMIT", "240"), 1, 1000000);
    if (!config.ok()) {
        config.destroy();
        throw "Invalid PORT, BPL_WEB_WORKERS or BPL_WEB_API_LIMIT";
    }
    apiMaximum = apiLimit.unwrap();
    config.destroy();
    local certificateFile: string = Env.getOr("BPL_WEB_TLS_CERT", "");
    local keyFile: string = Env.getOr("BPL_WEB_TLS_KEY", "");
    if ((certificateFile[0] == 0) != (keyFile[0] == 0)) {
        throw "Native HTTPS requires both BPL_WEB_TLS_CERT and BPL_WEB_TLS_KEY";
    }
    local nativeTLS: bool = certificateFile[0] != 0;
    local scheme: string = "http";
    if (nativeTLS) {
        scheme = "https";
    }
    local origin: char[128];
    sprintf(cast<string>(&origin[0]), "%s://127.0.0.1:%d", scheme, port.unwrap());
    allowedOrigin = Env.getOr("BPL_WEB_ORIGIN", cast<string>(&origin[0]));
    if (nativeTLS && (strncmp(allowedOrigin, "https://", 8) != 0)) {
        throw "Native HTTPS requires an HTTPS BPL_WEB_ORIGIN";
    }
    secureCookies = strcmp(Env.getOr("BPL_WEB_SECURE_COOKIES", "0"), "1") == 0;
    local wal: string = Env.getOr("BPL_WEB_WAL", "0");
    if ((strcmp(wal, "0") != 0) && (strcmp(wal, "1") != 0)) {
        throw "Invalid BPL_WEB_WAL";
    }
    initializeWorker();
    if (strcmp(wal, "1") == 0) {
        database.setWAL(true);
    }
    migrate();
    authentication.destroy();
    free(authentication);
    database.close();
    free(database);
    # No live SQLite connection is inherited by the workers.
    database = nullptr;
    authentication = nullptr;
    local app: App = App.new();
    local appOwner: *App = &app;
    defer appOwner.destroy();
    app.onWorkerShutdown(cleanupWorker);
    app.beforeRequest(requestId);
    app.beforeRequest(apiBudget);
    if (strcmp(Env.getOr("BPL_WEB_ACCESS_LOG", "0"), "1") == 0) {
        app.afterRequest(accessLog);
    }
    app.use(webHeaders);
    app.useStaticMiddleware(webHeaders);
    app.useStatic("/", "public");
    local api: Router = Router.new();
    local apiOwner: *Router = &api;
    defer apiOwner.destroy();
    api.addMiddleware(noCache);
    api.addMiddleware(requireAuth);
    api.addMiddleware(jsonWrites);
    api.get("/health", health);
    api.get("/tasks", listTasks);
    api.get("/tasks/:id", getTask);
    api.post("/tasks", createTask);
    api.put("/tasks/:id", updateTask);
    api.delete("/tasks/:id", deleteTask);
    app.useRouter("/api", &api);
    app.router.useNotFound(notFound);
    local authRoutes: Router = Router.new();
    local authOwner: *Router = &authRoutes;
    defer authOwner.destroy();
    authRoutes.addMiddleware(noCache);
    authRoutes.addMiddleware(jsonWrites);
    authRoutes.post("/register", register);
    authRoutes.post("/login", login);
    authRoutes.get("/me", me);
    authRoutes.post("/logout", logout);
    app.useRouter("/auth", &authRoutes);
    if (nativeTLS) {
        app.listenTLSWorkers(port.unwrap(), "127.0.0.1", workers.unwrap(), initializeWorker, certificateFile, keyFile);
    } else {
        app.listenWorkers(port.unwrap(), "127.0.0.1", workers.unwrap(), initializeWorker);
    }
}
