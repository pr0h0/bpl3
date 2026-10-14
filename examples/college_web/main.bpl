import [App], [Router], [Request], [Response], [HttpMethod] from "bpl-express";
import [SQLite], [Statement] from "bpl-sqlite";
import [Validator] from "bpl-validation";
import securityHeaders, requireJson from "bpl-web-middleware";
import [JSON] from "std/json.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import [Env] from "std/env.bpl";
extern strlen(text: string) ret long;
extern sprintf(out: string, format: string, ...) ret int;

global database: *SQLite;
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
    local q: Statement = database.prepare("SELECT id,title,done FROM tasks ORDER BY id DESC LIMIT ? OFFSET ?");
    local owner: *Statement = &q;
    defer owner.close();
    q.bindInt(1, cast<long>(limit.unwrap())).bindInt(2, cast<long>((page.unwrap() - 1) * limit.unwrap()));
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
    local q: Statement = database.prepare("SELECT id,title,done FROM tasks WHERE id=?");
    local owner: *Statement = &q;
    defer owner.close();
    q.bindInt(1, cast<long>(id));
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
    local q: Statement = database.prepare("INSERT INTO tasks(title,done) VALUES (?,?)");
    local owner: *Statement = &q;
    defer owner.close();
    q.bindText(1, body.title).bindInt(2, cast<long>(body.done));
    q.step();
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
    local q: Statement = database.prepare("UPDATE tasks SET title=?,done=? WHERE id=?");
    local owner: *Statement = &q;
    defer owner.close();
    q.bindText(1, body.title).bindInt(2, cast<long>(body.done)).bindInt(3, cast<long>(id));
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
    local q: Statement = database.prepare("DELETE FROM tasks WHERE id=?");
    local owner: *Statement = &q;
    defer owner.close();
    q.bindInt(1, cast<long>(id));
    q.step();
    if (database.changes() == 0) {
        notFound(req, res);
        return;
    }
    res.status(204).end();
}
frame main() {
    local db: SQLite = SQLite.open(Env.getOr("BPL_WEB_DB", "college.sqlite"));
    database = &db;
    local dbOwner: *SQLite = &db;
    defer dbOwner.close();
    db.exec("CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY,title TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)))");
    local app: App = App.new();
    local appOwner: *App = &app;
    defer appOwner.destroy();
    app.use(securityHeaders);
    app.useStatic("/", "public");
    local api: Router = Router.new();
    local apiOwner: *Router = &api;
    defer apiOwner.destroy();
    api.addMiddleware(noCache);
    api.addMiddleware(jsonWrites);
    api.get("/health", health);
    api.get("/tasks", listTasks);
    api.get("/tasks/:id", getTask);
    api.post("/tasks", createTask);
    api.put("/tasks/:id", updateTask);
    api.delete("/tasks/:id", deleteTask);
    app.useRouter("/api", &api);
    app.router.useNotFound(notFound);
    local config: Validator = Validator.new();
    local port: Option<int> = config.integer("PORT", Env.getOr("PORT", "3000"), 1, 65535);
    if (!config.ok()) {
        config.destroy();
        throw "PORT must be an integer between 1 and 65535";
    }
    config.destroy();
    app.listen(port.unwrap());
}
