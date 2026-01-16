# bpl-express

A lightweight web framework for BPL, inspired by Express.js.

## Features

- **Routing**: Support for GET, POST, PUT, DELETE methods.
- **Parameters**: URL parameter extraction (e.g., `/users/:id`).
- **Middleware**: Global and router-level middleware support.
- **Sub-routers**: Mountable routers for modular API design.
- **Static Files**: Serve static assets.

## Installation

```bash
bpl install bpl-express
# or via relative path in development
```

## Usage

### Basic Server

```bpl
import [App], [Request], [Response] from "bpl-express";

frame main() {
    local app: App = App.new();

    app.router.get("/", |req: *Request, res: *Response| {
        res.send("Hello World");
    });

    app.listen(3000);
}
```

### Middleware

Middleware functions are executed in order before route handlers. They can modify the request/response or handle cross-cutting concerns like logging.

```bpl
frame logger(req: *Request, res: *Response) {
    printf("Request: %s\n", req.path);
}

app.use(cast<RouteHandler>(logger));
```

### Sub-Routers

You can create modular routers and mount them at specific paths.

```bpl
local api: Router = Router.new();
api.get("/users", list_users);

# Mounts at /api/users
app.useRouter("/api", &api);
```

### Wildcard Routes

The router supports wildcard matching using `*`. Matches are checked in registration order.

```bpl
# Matches /files/a.txt, /files/images/b.png, etc.
app.router.get("/files/*", file_handler);
```

### View Engine

BPL Express works seamlessly with **bpl-templ**, a compiled template engine for BPL. `bpl-templ` compiles HTML templates into type-safe BPL structs.

**Installation:**

```bash
bpl install bpl-templ
```

**Example (`views/home.bte`):**

```html
@args name: string
<h1>Hello, {{ name }}!</h1>
```

**Controller:**

```bpl
import [Home] from "./views/home.bpl";

app.router.get("/", |req: *Request, res: *Response| {
    local html: string = Home.render("World");
    res.html(html);
});
```

See [bpl-templ](../bpl-templ/README.md) for full documentation.
