import [App], [Router], [Request], [Response] from "bpl-express";
import sprintf, printf, atoi, strcpy, strcat, strlen, strcmp from "bpl-express";
import [Database], [Table], [Row], [Value], [DataType] from "bpl-db";
import [Array] from "std/array.bpl";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";

global db: *Database;
global todos: *Table;

frame main() {
    local app = App.new();

    # Serve static files
    app.useStatic("/", "./public");

    # Init DB
    local _db = Database.new();
    db = &_db;

    # Create Table
    todos = db.create_table("todos");
    todos.add_column("title", DataType.Str);
    todos.add_column("completed", DataType.Bool);

    # Routes
    app.router.get("/todos", getTodos);
    app.router.post("/todos", createTodo);
    app.router.get("/todos/:id", getTodo);
    app.router.put("/todos/:id", updateTodo);
    app.router.delete("/todos/:id", deleteTodo);
    app.router.get("/greet/:name", greetUser);
    app.router.useNotFound(notFound);

    app.listen(8080);
}

frame notFound(_req: *Request, res: *Response) {
    res.status(404).json("{\"error\": \"Route not found\"}");
}

frame greetUser(req: *Request, res: *Response) {
    local name_opt = req.getParam("name");
    match (name_opt) {
        Option.Some(name) => {
            local json_buf: char[256];
            sprintf(cast<string>(&json_buf[0]), "{\"message\": \"Hello, %s!\"}", name);
            res.json(cast<string>(&json_buf[0]));
        },
        Option.None => {
            res.status(400).json("{\"error\": \"Missing name\"}");
        },
    };
}

frame getTodos(_req: *Request, res: *Response) {
    local json_buf: char[4096];
    local ptr: string = cast<string>(&json_buf[0]);

    strcpy(ptr, "[");

    local i: int = 0;
    loop (i < todos.rows.len()) {
        if (i > 0) {
            strcat(ptr, ",");
        }
        local row = todos.rows.get(i);
        local title_val = row.values.get(0);
        local completed_val = row.values.get(1);

        local row_json: char[256];

        local title_s: string = "unknown";
        match (title_val) {
            Value.Str(s) => {
                title_s = s;
            },
            _ => {
            },
        };
        local completed_b: bool = false;
        match (completed_val) {
            Value.Bool(b) => {
                completed_b = b;
            },
            _ => {
            },
        };
        sprintf(cast<string>(&row_json[0]), "{\"id\": %d, \"title\": \"%s\", \"completed\": %s}", row.id, title_s, completed_b ? "true" : "false");
        strcat(ptr, cast<string>(&row_json[0]));

        i = i + 1;
    }

    strcat(ptr, "]");
    res.json(ptr);
}

frame createTodo(req: *Request, res: *Response) {
    local title = req.body;
    if (strlen(title) == 0) {
        title = "New Todo";
    }
    local values = Array<Value>.new(2);
    values.push(Value.Str(title));
    values.push(Value.Bool(false));

    local id = todos.insert(&values);

    local json_buf: char[128];
    sprintf(cast<string>(&json_buf[0]), "{\"id\": %d, \"status\": \"created\"}", id);
    res.status(201).json(cast<string>(&json_buf[0]));
}

frame getTodo(req: *Request, res: *Response) {
    local id_opt = req.getParam("id");
    match (id_opt) {
        Option.Some(id_str) => {
            local id = atoi(id_str);

            local i: int = 0;
            loop (i < todos.rows.len()) {
                local row = todos.rows.get(i);
                if (row.id == id) {
                    local title_val = row.values.get(0);
                    local completed_val = row.values.get(1);

                    local title_s: string = "unknown";
                    match (title_val) {
                        Value.Str(s) => {
                            title_s = s;
                        },
                        _ => {
                        },
                    };
                    local completed_b: bool = false;
                    match (completed_val) {
                        Value.Bool(b) => {
                            completed_b = b;
                        },
                        _ => {
                        },
                    };
                    local json_buf: char[256];
                    sprintf(cast<string>(&json_buf[0]), "{\"id\": %d, \"title\": \"%s\", \"completed\": %s}", row.id, title_s, completed_b ? "true" : "false");
                    res.json(cast<string>(&json_buf[0]));
                    return;
                }
                i = i + 1;
            }
            res.status(404).json("{\"error\": \"Not found\"}");
        },
        Option.None => {
            res.status(400).json("{\"error\": \"Missing ID\"}");
        },
    };
}

frame updateTodo(req: *Request, res: *Response) {
    local id_opt = req.getParam("id");
    match (id_opt) {
        Option.Some(id_str) => {
            local id = atoi(id_str);
            local completed_str = req.body;
            local completed = false;
            if (strcmp(completed_str, "true") == 0) {
                completed = true;
            }
            local i: int = 0;
            loop (i < todos.rows.len()) {
                local row = todos.rows.get(i);
                if (row.id == id) {
                    row.values.set(1, Value.Bool(completed));
                    todos.rows.set(i, row);
                    res.status(200).json("{\"status\": \"updated\"}");
                    return;
                }
                i = i + 1;
            }
            res.status(404).json("{\"error\": \"Not found\"}");
        },
        Option.None => {
            res.status(400).json("{\"error\": \"Missing ID\"}");
        },
    };
}

frame deleteTodo(req: *Request, res: *Response) {
    local id_opt = req.getParam("id");
    match (id_opt) {
        Option.Some(id_str) => {
            local id = atoi(id_str);

            local i: int = 0;
            loop (i < todos.rows.len()) {
                local row = todos.rows.get(i);
                if (row.id == id) {
                    todos.rows.removeAt(i);
                    res.status(200).json("{\"status\": \"deleted\"}");
                    return;
                }
                i = i + 1;
            }
            res.status(404).json("{\"error\": \"Not found\"}");
        },
        Option.None => {
            res.status(400).json("{\"error\": \"Missing ID\"}");
        },
    };
}
