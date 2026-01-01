import [Map], [Pair] from "std/map.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import write, strlen, sprintf, printf, close, strstr, strncmp, atoi, strchr, strcpy, strtok, strcmp, malloc, free from "./libc.bpl";

export [Request];
export [Response];
export [HttpMethod];

enum HttpMethod {
    GET,
    POST,
    PUT,
    DELETE,
    PATCH,
    OPTIONS,
    HEAD,
}

struct Request {
    method: HttpMethod,
    path: string,
    query: Map<string, string>,
    headers: Map<string, string>,
    body: string,
    params: Map<string, string>,
    frame new() ret Request {
        local req: Request;
        req.query = Map<string, string>.new(16);
        req.headers = Map<string, string>.new(16);
        req.params = Map<string, string>.new(16);
        return req;
    }

    frame getParam(this: *Request, key: string) ret Option<string> {
        local i: int = 0;
        local items = &this.params.items;
        loop (i < items.len()) {
            local p = items.get(i);
            if (strcmp(p.key, key) == 0) {
                return Option<string>.Some(p.value);
            }
            i = i + 1;
        }
        return Option<string>.None;
    }
}

struct Response {
    client_fd: int,
    status_code: int,
    headers: Map<string, string>,
    body_sent: bool,
    frame new(fd: int) ret Response {
        local res: Response;
        res.client_fd = fd;
        res.status_code = 200;
        res.headers = Map<string, string>.new(16);
        res.body_sent = false;
        return res;
    }

    frame status(this: *Response, code: int) ret *Response {
        this.status_code = code;
        return this;
    }

    frame setHeader(this: *Response, key: string, value: string) ret *Response {
        this.headers.set(key, value);
        return this;
    }

    frame send(this: *Response, body: string) {
        if (this.body_sent) {
            return;
        }
        local header_buffer = malloc(1024);
        local status_msg: string = "OK";

        local code = this.status_code;

        if (code == 404) {
            status_msg = "Not Found";
        }
        if (this.status_code == 500) {
            status_msg = "Internal Server Error";
        }
        if (this.status_code == 201) {
            status_msg = "Created";
        }
        if (this.status_code == 400) {
            status_msg = "Bad Request";
        }
        if (this.status_code == 204) {
            status_msg = "No Content";
        }
        local len = strlen(body);

        # Workaround for varargs crash: build string incrementally
        local offset = 0;
        local base_ptr = cast<long>(cast<*void>(header_buffer));

        offset = offset + sprintf(cast<string>(cast<*void>(base_ptr + cast<long>(offset))), "HTTP/1.1 %d ", code);
        offset = offset + sprintf(cast<string>(cast<*void>(base_ptr + cast<long>(offset))), "%s\r\n", status_msg);
        offset = offset + sprintf(cast<string>(cast<*void>(base_ptr + cast<long>(offset))), "Content-Length: %ld\r\n", len);

        write(this.client_fd, header_buffer, strlen(header_buffer));

        # Manually handle Content-Type to avoid MapIterator crash
        if (this.headers.has("Content-Type")) {
            local ct_opt = this.headers.get("Content-Type");
            match (ct_opt) {
                Option.Some(val) => {
                    sprintf(header_buffer, "Content-Type: %s\r\n", val);
                    write(this.client_fd, header_buffer, strlen(header_buffer));
                },
                Option.None => {
                },
            };
        }
        write(this.client_fd, "\r\n", 2);
        write(this.client_fd, body, len);

        free(header_buffer);
        this.body_sent = true;
    }

    frame json(this: *Response, body: string) {
        this.headers.set("Content-Type", "application/json");
        this.send(body);
    }

    frame text(this: *Response, body: string) {
        this.setHeader("Content-Type", "text/plain");
        this.send(body);
    }

    frame end(this: *Response) {
        this.send("");
    }
}
