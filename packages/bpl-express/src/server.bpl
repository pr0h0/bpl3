import [Router] from "./router.bpl";
import [Request], [Response], [HttpMethod] from "./http.bpl";
import socket, bind, listen, accept, read, close, setsockopt, htons, printf, exit, memset, strncmp, strchr, strstr, strlen, open, lseek, malloc, free, strcpy, strcat, strcmp from "./libc.bpl";
import [sockaddr_in] from "./libc.bpl";
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
    frame new() ret App {
        local app: App;
        app.router = Router.new();
        app.port = 3000;
        app.static_url = "";
        app.static_dir = "";
        return app;
    }

    frame useStatic(this: *App, url: string, dir: string) {
        this.static_url = url;
        this.static_dir = dir;
    }

    frame listen(this: *App, port: int) {
        this.port = port;
        local server_fd: int = socket(2, 1, 0); # AF_INET, SOCK_STREAM
        if (server_fd < 0) {
            printf("Socket failed\n");
            exit(1);
        }
        local opt: int = 1;
        setsockopt(server_fd, 1, 2, cast<*void>(&opt), 4); # SO_REUSEADDR

        local address: sockaddr_in;
        address.sin_family = 2;
        address.sin_port = htons(cast<ushort>(port));
        address.sin_addr = 0;
        address.sin_zero = 0;

        if (bind(server_fd, &address, 16) < 0) {
            printf("Bind failed\n");
            exit(1);
        }
        if (listen(server_fd, 3) < 0) {
            printf("Listen failed\n");
            exit(1);
        }
        printf("Server listening on port %d\n", port);

        loop {
            local addrlen: uint = 16;
            local new_socket: int = accept(server_fd, &address, &addrlen);
            if (new_socket < 0) {
                continue;
            }
            local buffer: char[4096];
            memset(cast<*void>(&buffer[0]), 0, 4096);
            local valread: long = read(new_socket, cast<string>(&buffer[0]), 4095);

            if (valread > 0) {
                local req: Request = this.parseRequest(cast<string>(&buffer[0]));
                local res: Response = Response.new(new_socket);

                if (this.tryServeStatic(&req, &res)) {
                    close(new_socket);
                    continue;
                }
                this.router.handle(&req, &res);
            }
            close(new_socket);
        }
    }

    frame tryServeStatic(this: *App, req: *Request, res: *Response) ret bool {
        if (strlen(this.static_url) == 0) {
            return false;
        }
        if (req.method != HttpMethod.GET) {
            return false;
        }
        local url_len: int = strlen(this.static_url);
        if (strncmp(req.path, this.static_url, url_len) != 0) {
            return false;
        }
        local file_path: char[1024];
        local ptr: string = cast<string>(&file_path[0]);
        strcpy(ptr, this.static_dir);

        local rel_path: string = req.path + url_len;

        # Ensure slash
        local dir_len: int = strlen(this.static_dir);
        if (dir_len > 0) {
            if (ptr[dir_len - 1] != '/') {
                if (rel_path[0] != '/') {
                    strcat(ptr, "/");
                }
            }
        }
        strcat(ptr, rel_path);

        # If path ends with /, append index.html
        local path_len: int = strlen(ptr);
        if (path_len > 0) {
            if (ptr[path_len - 1] == '/') {
                strcat(ptr, "index.html");
            }
        }
        local fd: int = open(ptr, 0);
        if (fd < 0) {
            return false;
        }
        local size: long = lseek(fd, 0, 2);
        lseek(fd, 0, 0);

        local content: *char = malloc(cast<ulong>(size + 1));
        local bytes_read: long = read(fd, content, cast<ulong>(size));
        if (bytes_read < 0) {
            free(content);
            close(fd);
            return false;
        }
        content[bytes_read] = 0;
        close(fd);

        if (strstr(ptr, ".html") != nullptr) {
            res.setHeader("Content-Type", "text/html");
        } else if (strstr(ptr, ".css") != nullptr) {
            res.setHeader("Content-Type", "text/css");
        } else if (strstr(ptr, ".js") != nullptr) {
            res.setHeader("Content-Type", "application/javascript");
        }
        res.send(content);
        free(content);
        return true;
    }

    frame parseRequest(this: *App, raw: string) ret Request {
        local req: Request = Request.new();
        local parsed: ParsedRequest = HttpParser.parse(raw);

        req.path = parsed.path;
        req.body = parsed.body;

        # Method Mapping
        if (strcmp(parsed.method, "GET") == 0) {
            req.method = HttpMethod.GET;
        } else if (strcmp(parsed.method, "POST") == 0) {
            req.method = HttpMethod.POST;
        } else if (strcmp(parsed.method, "PUT") == 0) {
            req.method = HttpMethod.PUT;
        } else if (strcmp(parsed.method, "DELETE") == 0) {
            req.method = HttpMethod.DELETE;
        } else if (strcmp(parsed.method, "PATCH") == 0) {
            req.method = HttpMethod.PATCH;
        } else {
            req.method = HttpMethod.GET; # Default
        }

        # Transfer ownership of maps
        req.headers = parsed.headers;
        req.query = parsed.query;
        req.params = parsed.params;

        free(parsed.method);

        return req;
    }
}
