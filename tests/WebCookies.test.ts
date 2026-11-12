import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("cookies parse, serialize with validated attributes, clear and sign", () => {
  native(String.raw`
import [App], [Request], [Response], [Cookies], [CookieJar], [CookieOptions] from "bpl-express";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";
extern strcmp(a: string, b: string) ret int;
frame throws(name: string, value: string, options: *CookieOptions) ret bool {
    try {
        local header: String = Cookies.serialize(name, value, options);
        header.destroy();
    } catch {
        return true;
    }
    return false;
}
frame main() ret int {
    local jar: CookieJar = Cookies.parse(" a=1; b = \"two\" ;c=;bad name=x; d=x y; e=ok; a=dup;=nameless; f");
    if (jar.count() != 4) { return 1; }
    if (strcmp(jar.get("a").unwrap(), "1") != 0 || strcmp(jar.get("b").unwrap(), "two") != 0) { return 2; }
    if (strcmp(jar.get("c").unwrap(), "") != 0 || strcmp(jar.get("e").unwrap(), "ok") != 0 || jar.has("d") || jar.has("f")) { return 3; }
    jar.destroy();

    local app: App = App.new();
    local req: Request = app.parseRequest("GET / HTTP/1.1\r\nHost: x\r\nCookie: sid=abc; theme=dark\r\n\r\n");
    local theme: Option<String> = Cookies.get(&req, "theme");
    if (!theme.isSome()) { return 4; }
    local value: String = theme.unwrap();
    if (strcmp(value.data, "dark") != 0 || Cookies.get(&req, "missing").isSome()) { return 5; }
    value.destroy();
    req.destroy();

    local options: CookieOptions = CookieOptions.defaults();
    local header: String = Cookies.serialize("sid", "abc", &options);
    if (strcmp(header.data, "sid=abc; Path=/; HttpOnly; SameSite=Lax") != 0) { return 6; }
    header.destroy();
    options.domain = "example.org";
    options.max_age = 3600;
    options.secure = true;
    options.same_site = "None";
    options.path = "/app";
    header = Cookies.serialize("pref", "x.y-z_1", &options);
    if (strcmp(header.data, "pref=x.y-z_1; Path=/app; Domain=example.org; Max-Age=3600; Secure; HttpOnly; SameSite=None") != 0) { return 7; }
    header.destroy();

    local res: Response = Response.new(-1);
    Cookies.set(&res, "pref", "1", &options);
    Cookies.clear(&res, "old", &options);
    local lines: Array<string> = res.headers.getAll("set-cookie");
    if (lines.len() != 2 || strcmp(lines.get(1), "old=; Path=/app; Domain=example.org; Max-Age=0; Secure; HttpOnly; SameSite=None") != 0) { return 8; }
    lines.destroy();
    res.destroy();

    local strict: CookieOptions = CookieOptions.defaults();
    if (!throws("bad name", "v", &strict) || !throws("n", "a;b", &strict) || !throws("n", "a b", &strict) || !throws("n", "q\"", &strict) || !throws("", "v", &strict)) { return 9; }
    strict.same_site = "Sometimes";
    if (!throws("n", "v", &strict)) { return 10; }
    strict.same_site = "None";
    if (!throws("n", "v", &strict)) { return 11; }
    strict.same_site = "Strict";
    if (!throws("__Secure-id", "v", &strict) || !throws("__Host-id", "v", &strict)) { return 12; }
    strict.secure = true;
    strict.path = "/sub";
    if (!throws("__Host-id", "v", &strict) || throws("__Secure-id", "v", &strict)) { return 13; }
    strict.path = "/";
    strict.domain = "example.org";
    if (!throws("__Host-id", "v", &strict)) { return 14; }
    strict.domain = nullptr;
    if (throws("__Host-id", "v", &strict)) { return 15; }
    strict.path = "relative";
    if (!throws("n", "v", &strict)) { return 16; }
    strict.path = "/a;Secure";
    if (!throws("n", "v", &strict)) { return 17; }

    local secret: string = "0123456789abcdef0123456789abcdef";
    local signed: String = Cookies.sign("sid", "user-42", secret);
    local plain: Option<String> = Cookies.unsign("sid", signed.data, secret);
    if (!plain.isSome()) { return 18; }
    local original: String = plain.unwrap();
    if (strcmp(original.data, "user-42") != 0) { return 19; }
    original.destroy();
    # Another cookie name, another secret, or a changed value all fail.
    if (Cookies.unsign("other", signed.data, secret).isSome() || Cookies.unsign("sid", signed.data, "fedcba9876543210fedcba9876543210").isSome()) { return 20; }
    signed.data[0] = 'U';
    if (Cookies.unsign("sid", signed.data, secret).isSome() || Cookies.unsign("sid", "short", secret).isSome()) { return 21; }
    signed.destroy();
    local caught: bool = false;
    try { Cookies.sign("sid", "v", "short"); } catch { caught = true; }
    if (!caught) { return 22; }
    app.destroy();
    return 0;
}`);
}, 90000);

test("router captures wildcard remainders, registers all methods, and static files get types and caching", () => {
  native(String.raw`
import [App], [Router], [Request], [Response], [HttpMethod] from "bpl-express";
import releaseStrings from "bpl-http-parser";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import [FS] from "std/fs.bpl";
import [String] from "std/string.bpl";
extern strcmp(a: string, b: string) ret int;
global HITS: int = 0;
frame any(_req: *Request, res: *Response) {
    HITS = HITS + 1;
    res.text("ok");
}
frame main() ret int {
    local router: Router = Router.new();
    local params: Map<string, string> = Map<string, string>.new();
    if (!router.matchPath("/files/:dir/*", "/files/img/a%20b/c.png", &params)) { return 1; }
    if (strcmp(params.get("dir").unwrap(), "img") != 0 || strcmp(params.get("*").unwrap(), "a b/c.png") != 0) { return 2; }
    releaseStrings(&params);
    params = Map<string, string>.new();
    if (!router.matchPath("/static/*", "/static/", &params) || strcmp(params.get("*").unwrap(), "") != 0) { return 3; }
    if (router.matchPath("/static/*", "/static/%zz", &params)) { return 4; }
    releaseStrings(&params);
    router.destroy();

    local app: App = App.new();
    app.router.all("/any", any);
    local methods: string[7] = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];
    loop (local i: int = 0; i < 7; i = i + 1) {
        local raw: String = String.new(methods[i]);
        raw << " /any HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\n\r\n";
        local req: Request = app.parseRequest(raw.data);
        local res: Response = Response.new(-1);
        res.head_only = req.method == HttpMethod.HEAD;
        app.router.handle(&req, &res);
        if (res.status_code != 200) { return 10 + i; }
        req.destroy();
        res.destroy();
        raw.destroy();
    }
    if (HITS != 7) { return 20; }

    if (strcmp(App.mimeType("a/B.SVG"), "image/svg+xml") != 0 || strcmp(App.mimeType("x.woff2"), "font/woff2") != 0 || strcmp(App.mimeType("app.js"), "text/javascript; charset=utf-8") != 0 || strcmp(App.mimeType("README"), "application/octet-stream") != 0 || strcmp(App.mimeType("data.json"), "application/json") != 0) { return 21; }

    FS.mkdirp("static-root");
    FS.writeFile("static-root/logo.png", "png-bytes");
    app.useStatic("/assets", "static-root");
    local req: Request = app.parseRequest("GET /assets/logo.png HTTP/1.1\r\nHost: x\r\n\r\n");
    local res: Response = Response.new(-1);
    if (!app.tryServeStatic(&req, &res) || res.headers.has("cache-control") || strcmp(res.headers.get("content-type").unwrap(), "image/png") != 0) { return 22; }
    req.destroy();
    res.destroy();
    app.staticMaxAge(86400);
    req = app.parseRequest("GET /assets/logo.png HTTP/1.1\r\nHost: x\r\n\r\n");
    res = Response.new(-1);
    if (!app.tryServeStatic(&req, &res) || strcmp(res.headers.get("cache-control").unwrap(), "public, max-age=86400") != 0 || !res.headers.has("etag")) { return 23; }
    req.destroy();
    res.destroy();
    app.staticMaxAge(0);
    req = app.parseRequest("GET /assets/logo.png HTTP/1.1\r\nHost: x\r\n\r\n");
    res = Response.new(-1);
    if (!app.tryServeStatic(&req, &res) || strcmp(res.headers.get("cache-control").unwrap(), "no-cache") != 0) { return 24; }
    req.destroy();
    res.destroy();
    local caught: bool = false;
    try { app.staticMaxAge(-1); } catch { caught = true; }
    if (!caught) { return 25; }
    FS.remove("static-root/logo.png");
    FS.remove("static-root");
    app.destroy();
    return 0;
}`);
}, 90000);
