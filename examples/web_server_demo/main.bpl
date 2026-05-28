import [App], [Request], [Response], [Router] from "../../packages/bpl-express/src/server.bpl";
import [JSON] from "../../lib/json.bpl";
import [Home] from "./views/home.bpl";
import [String] from "std/string.bpl";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import [IO] from "std/io.bpl";
import [Env] from "std/env.bpl";

extern strcmp(s1: string, s2: string) ret int;
extern printf(fmt: string, ...) ret int;

struct LoginData {
    username: string,
    password: string,
}

struct TokenResponse {
    token: string,
    message: string,
}

struct SearchResult {
    query: string,
    count: int,
    items: string[3],
}

frame handleLogin(req: *Request, res: *Response) {
    printf("Login handler called\n");
    if (req.body == nullptr) {
        res.status(400).send("{\"error\":\"Missing body\"}");
        return;
    }
    local login: *LoginData = JSON.parse<LoginData>(req.body);
    if (login == nullptr) {
        res.status(400).send("{\"error\":\"Invalid JSON\"}");
        return;
    }
    printf("User: %s\n", login.username);

    local resp: TokenResponse;
    if ((strcmp(login.username, "admin") == 0) && (strcmp(login.password, "1234") == 0)) {
        resp.message = "Success";
        resp.token = "admin_super_secret";

        local s: String = JSON.stringify<TokenResponse>(&resp);
        res.setHeader("Content-Type", "application/json");
        res.send(s.cstr());
        s.destroy();
    } else {
        res.status(401).send("{\"error\":\"Invalid credentials\"}");
    }

    JSON.free<LoginData>(login);
}

frame handleHome(req: *Request, res: *Response) {
    printf("Home handler: %s\n", req.path);
    local html: string = Home.render("World");
    res.setHeader("Content-Type", "text/html");
    res.send(html);
    # TODO: free html if needed
}

frame handleSearch(req: *Request, res: *Response) {
    local q_opt: Option<string> = req.query.get("q");
    local q: string = "";
    if (q_opt.isSome()) {
        q = q_opt.unwrap();
    }
    local result: SearchResult;
    result.query = q;
    result.count = 3;
    result.items[0] = "Item A";
    result.items[1] = "Item B";
    result.items[2] = "Item C";

    local s: String = JSON.stringify<SearchResult>(&result);
    res.setHeader("Content-Type", "application/json");
    res.send(s.cstr());
    s.destroy();
}

frame handleProtected(req: *Request, res: *Response) {
    local auth_opt: Option<string> = req.headers.get("Authorization");
    if (auth_opt.isNone()) {
        res.status(401).send("{\"error\":\"No token\"}");
        return;
    }
    local token: string = auth_opt.unwrap();
    if (strcmp(token, "admin_super_secret") == 0) {
        res.send("{\"message\":\"Protected action executed!\"}");
    } else {
        res.status(403).send("{\"error\":\"Forbidden\"}");
    }
}

frame main() {
    local app: App = App.new();

    # Static files
    app.useStatic("/static", "./public");
    # Current simplistic server static serving might need explicit index.html for root?
    # server.bpl logic: if req.path starts with static_url (e.g. /static), it serves.
    # To serve root index.html as /, I might need a handler or configure static to /
    # Let's configure static to "/" to serve public.
    app.useStatic("/", "examples/web_server_demo/public");

    app.router.get("/", handleHome);
    app.router.post("/login", handleLogin);
    app.router.get("/search", handleSearch);
    app.router.get("/protected", handleProtected);

    # Log requests
    printf("Starting BPL Web Server on port 8080...\n");
    if (Env.has("BPL_WEB_SERVER_DEMO_SMOKE")) {
        printf("Web server demo smoke test configured\n");
        return;
    }
    app.listen(8080);
}
