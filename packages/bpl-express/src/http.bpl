import [Map], [Pair] from "std/map.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [StringBuilder] from "std/string_builder.bpl";
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
        return this.params.get(key);
    }
}

struct Response {
    client_fd: int,
    status_code: int,
    headers: Map<string, string>,
    body_sent: bool,
    headers_sent: bool,
    is_chunked: bool,
    location: string,
    set_cookie: string,
    frame new(fd: int) ret Response {
        local res: Response;
        res.client_fd = fd;
        res.status_code = 200;
        res.headers = Map<string, string>.new(16);
        res.body_sent = false;
        res.headers_sent = false;
        res.is_chunked = false;
        res.location = nullptr;
        res.set_cookie = nullptr;
        return res;
    }

    frame status(this: *Response, code: int) ret *Response {
        this.status_code = code;
        return this;
    }

    frame setHeader(this: *Response, key: string, value: string) ret *Response {
        # printf("DEBUG: setHeader key=%s val=%s\n", key, value);
        if (strcmp(key, "Location") == 0) {
            this.location = value;
            return this;
        }
        if (strcmp(key, "Set-Cookie") == 0) {
            this.set_cookie = value;
            return this;
        }
        this.headers.set(key, value);
        return this;
    }

    frame _writeHeaders(this: *Response, content_length: int) {
        if (this.headers_sent) {
            return;
        }
        local header_buffer: *char = malloc(1024);
        local status_msg: string = "OK";
        local code: int = this.status_code;

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
        if (this.status_code == 301) {
            status_msg = "Moved Permanently";
        }
        if (this.status_code == 302) {
            status_msg = "Found";
        }
        if (this.status_code == 401) {
            status_msg = "Unauthorized";
        }
        if (this.status_code == 403) {
            status_msg = "Forbidden";
        }
        local offset: int = 0;
        local base_ptr: long = cast<long>(cast<*void>(header_buffer));
        offset = offset + sprintf(cast<string>(cast<*void>(base_ptr + cast<long>(offset))), "HTTP/1.1 %d ", code);
        offset = offset + sprintf(cast<string>(cast<*void>(base_ptr + cast<long>(offset))), "%s\r\n", status_msg);

        if (content_length < 0) {
            offset = offset + sprintf(cast<string>(cast<*void>(base_ptr + cast<long>(offset))), "Transfer-Encoding: chunked\r\n");
            this.is_chunked = true;
        } else {
            offset = offset + sprintf(cast<string>(cast<*void>(base_ptr + cast<long>(offset))), "Content-Length: %d\r\n", content_length);
            this.is_chunked = false;
        }

        write(this.client_fd, header_buffer, strlen(header_buffer));

        if (this.location != nullptr) {
            sprintf(header_buffer, "Location: %s\r\n", this.location);
            write(this.client_fd, header_buffer, strlen(header_buffer));
        }
        if (this.set_cookie != nullptr) {
            sprintf(header_buffer, "Set-Cookie: %s\r\n", this.set_cookie);
            write(this.client_fd, header_buffer, strlen(header_buffer));
        }
        if (this.headers.has("Content-Type")) {
            local ct_opt: Option<string> = this.headers.get("Content-Type");
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
        free(header_buffer);
        this.headers_sent = true;
    }

    frame _sendWithLength(this: *Response, body: string) {
        if (this.body_sent) {
            return;
        }
        local len: int = 0;
        if (body != nullptr) {
            len = strlen(body);
        }
        this._writeHeaders(len);
        if (len > 0) {
            write(this.client_fd, body, len);
        }
        this.body_sent = true;
    }

    frame send(this: *Response, body: string) {
        if (this.body_sent) {
            return;
        }
        if (!this.headers_sent) {
            this._writeHeaders(-1); # Start chunked
        }
        if (body != nullptr) {
            local len: int = strlen(body);
            if (len > 0) {
                local chunk_header: *char = malloc(32);
                sprintf(chunk_header, "%x\r\n", len);
                write(this.client_fd, chunk_header, strlen(chunk_header));
                write(this.client_fd, body, len);
                write(this.client_fd, "\r\n", 2);
                free(chunk_header);
            }
        }
    }

    frame end(this: *Response) {
        if (this.body_sent) {
            return;
        }
        if (!this.headers_sent) {
            # No body sent, end() called directly. Send empty Content-Length.
            this._writeHeaders(0);
            this.body_sent = true;
            return;
        }
        if (this.is_chunked) {
            # End chunk
            write(this.client_fd, "0\r\n\r\n", 5);
        }
        this.body_sent = true;
    }

    frame json(this: *Response, body: string) {
        if (!this.headers_sent) {
            this.headers.set("Content-Type", "application/json");
        }
        this._sendWithLength(body);
    }

    frame text(this: *Response, body: string) {
        if (!this.headers_sent) {
            this.setHeader("Content-Type", "text/plain");
        }
        this._sendWithLength(body);
    }

    frame html(this: *Response, body: string) {
        if (!this.headers_sent) {
            this.setHeader("Content-Type", "text/html");
        }
        this._sendWithLength(body);
    }
}
