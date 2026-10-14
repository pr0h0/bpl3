import [Router], [RouteHandler] from "./router.bpl";
import [Request], [Response], [HttpMethod] from "./http.bpl";
import socket, bind, listen, accept, read, close, setsockopt, htons, printf, memset, strncmp, strlen, open, lseek, malloc, free, strcmp, realpath, inet_addr from "./libc.bpl";
import [sockaddr_in], [timeval] from "./libc.bpl";
import [HttpParser], [ParsedRequest] from "bpl-http-parser";
export [App];
export [Request];
export [Response];
export [Router];

struct App {
    router: Router,
    port: int,
    static_url: string,
    static_dir: string,
    timeout_seconds: long,
    frame new() ret App {
        local app: App;
        app.router = Router.new(); app.port = 3000;
        app.static_url = ""; app.static_dir = ""; app.timeout_seconds = 5;
        return app;
    }
    frame useStatic(this: *App, url: string, dir: string) { this.static_url = url; this.static_dir = dir; }
    frame use(this: *App, handler: RouteHandler) { this.router.addMiddleware(handler); }
    frame useRouter(this: *App, path: string, router: *Router) { this.router.useRouter(path, router); }
    # Linux IPv4 server. Loopback is the default; use listenOn for public binding.
    frame open(this: *App, port: int, host: string) ret int {
        if (port < 0 || port > 65535) { throw "Invalid listen port"; }
        local fd: int = socket(2, 1, 0);
        if (fd < 0) { throw "Socket creation failed"; }
        local opt: int = 1;
        setsockopt(fd, 1, 2, cast<*void>(&opt), 4);
        local address: sockaddr_in;
        memset(&address, 0, sizeof<sockaddr_in>());
        address.sin_family = 2; address.sin_port = htons(cast<ushort>(port)); address.sin_addr = inet_addr(host);
        if (address.sin_addr == 4294967295 || bind(fd, &address, 16) < 0 || listen(fd, 128) < 0) { close(fd); throw "Cannot bind HTTP listener"; }
        this.port = port; return fd;
    }
    frame listen(this: *App, port: int) { this.listenOn(port, "127.0.0.1"); }
    frame listenOn(this: *App, port: int, host: string) {
        local fd: int = this.open(port, host);
        defer close(fd);
        printf("HTTP listening on %s:%d\n", host, port);
        loop {
            local client: int = accept(fd, nullptr, nullptr);
            if (client >= 0) { this.serveConnection(client); close(client); }
        }
    }
    # One bounded request per connection, with Connection: close.
    frame serveConnection(this: *App, fd: int) {
        local timeout: timeval;
        timeout.tv_sec = this.timeout_seconds; timeout.tv_usec = 0;
        setsockopt(fd, 1, 20, &timeout, cast<uint>(sizeof<timeval>()));
        setsockopt(fd, 1, 21, &timeout, cast<uint>(sizeof<timeval>()));
        local buffer: string = malloc(1064961);
        if (buffer == nullptr) { return; }
        defer free(buffer);
        local used: long = 0;
        local res: Response = Response.new(fd);
        defer res.destroy();
        loop {
            local count: long = read(fd, buffer + used, cast<ulong>(1064960 - used));
            if (count <= 0) { res.status(400).text("Incomplete request"); return; }
            used = used + count; buffer[used] = 0;
            local parsed: ParsedRequest = HttpParser.parseBytes(buffer, used);
            if (!parsed.valid) {
                local code: int = parsed.error_code;
                parsed.destroy();
                if (code != 0) { res.status(code).text("Invalid request"); return; }
                if (used >= 1064960) { res.status(413).text("Request too large"); return; }
                continue;
            }
            local req: Request = this.fromParsed(&parsed);
            defer req.destroy();
            res.head_only = req.method == HttpMethod.HEAD;
            try {
                if (req.method == HttpMethod.UNKNOWN) { res.status(405).text("Unsupported method"); }
                else if (!this.tryServeStatic(&req, &res)) { this.router.handle(&req, &res); }
                res.end();
            } catch {
                if (!res.headers_sent) { res.status(500).text("Internal server error"); }
                else { res.end(); }
            }
            return;
        }
    }
    frame tryServeStatic(this: *App, req: *Request, res: *Response) ret bool {
        local prefix: long = cast<long>(strlen(this.static_url));
        if (prefix == 0 || (req.method != HttpMethod.GET && req.method != HttpMethod.HEAD)) { return false; }
        local len: long = cast<long>(strlen(req.path));
        if (len < prefix || strncmp(req.path, this.static_url, cast<ulong>(prefix)) != 0) { return false; }
        if (len > prefix && req.path[prefix] != '/' && this.static_url[prefix-1] != '/') { return false; }
        local root: string = realpath(this.static_dir, nullptr);
        if (root == nullptr) { return false; }
        defer free(root);
        local relative: string = HttpParser.decode(req.path + prefix, len - prefix);
        if (relative == nullptr) { res.status(400).text("Invalid path"); return true; }
        defer free(relative);
        local root_len: long = cast<long>(strlen(root));
        local rel_len: long = cast<long>(strlen(relative));
        local candidate: string = malloc(cast<ulong>(root_len + rel_len + 14));
        if (candidate == nullptr) { throw "Static path allocation failed"; }
        defer free(candidate);
        local i: long = 0;
        loop (i < root_len) { candidate[i] = root[i]; i = i + 1; }
        candidate[i] = '/'; i = i + 1;
        loop (local j: long = 0; j < rel_len; j = j + 1) { candidate[i] = relative[j]; i = i + 1; }
        if (rel_len == 0 || candidate[i-1] == '/') {
            local index: string = "index.html";
            loop (local j: int = 0; j < 10; j = j + 1) { candidate[i] = index[j]; i = i + 1; }
        }
        candidate[i] = 0;
        local path: string = realpath(candidate, nullptr);
        if (path == nullptr) { return false; }
        defer free(path);
        # Canonical containment prevents escaping the configured asset root.
        if (strncmp(path, root, cast<ulong>(root_len)) != 0 || (root_len > 1 && path[root_len] != '/')) { res.status(403).text("Forbidden"); return true; }
        local file: int = open(path, 131072); # Linux O_NOFOLLOW
        if (file < 0) { return false; }
        defer close(file);
        local size: long = lseek(file, 0, 2);
        if (size < 0 || size > 8388608 || lseek(file, 0, 0) < 0) { res.status(413).text("Static file too large"); return true; }
        local content: string = malloc(cast<ulong>(size + 1));
        if (content == nullptr) { throw "Static file allocation failed"; }
        defer free(content);
        local got: long = 0;
        loop (got < size) { local n: long = read(file, content + got, cast<ulong>(size - got)); if (n <= 0) { res.status(500).text("File read failed"); return true; } got = got + n; }
        res.setHeader("Content-Type", "application/octet-stream");
        local path_len: long = cast<long>(strlen(path));
        if (path_len >= 5 && strcmp(path + path_len - 5, ".html") == 0) { res.setHeader("Content-Type", "text/html; charset=utf-8"); }
        else if (path_len >= 4 && strcmp(path + path_len - 4, ".css") == 0) { res.setHeader("Content-Type", "text/css"); }
        else if (path_len >= 3 && strcmp(path + path_len - 3, ".js") == 0) { res.setHeader("Content-Type", "application/javascript"); }
        res.setHeader("X-Content-Type-Options", "nosniff"); res.sendBytes(content, size); return true;
    }
    # Moves allocations from parsed into Request. Do not destroy parsed afterward.
    frame fromParsed(this: *App, parsed: *ParsedRequest) ret Request {
        local req: Request;
        req.path = parsed.path; req.body = parsed.body; req.body_length = parsed.body_length;
        req.headers = parsed.headers; req.query = parsed.query; req.params = parsed.params;
        req.method = HttpMethod.UNKNOWN;
        if (strcmp(parsed.method, "GET") == 0) { req.method = HttpMethod.GET; }
        else if (strcmp(parsed.method, "POST") == 0) { req.method = HttpMethod.POST; }
        else if (strcmp(parsed.method, "PUT") == 0) { req.method = HttpMethod.PUT; }
        else if (strcmp(parsed.method, "DELETE") == 0) { req.method = HttpMethod.DELETE; }
        else if (strcmp(parsed.method, "PATCH") == 0) { req.method = HttpMethod.PATCH; }
        else if (strcmp(parsed.method, "OPTIONS") == 0) { req.method = HttpMethod.OPTIONS; }
        else if (strcmp(parsed.method, "HEAD") == 0) { req.method = HttpMethod.HEAD; }
        free(parsed.method); parsed.method = nullptr;
        return req;
    }
    frame parseRequest(this: *App, raw: string) ret Request {
        local parsed: ParsedRequest = HttpParser.parse(raw);
        if (!parsed.valid) { parsed.destroy(); throw "Invalid request"; }
        return this.fromParsed(&parsed);
    }
    frame destroy(this: *App) { this.router.destroy(); }
}
