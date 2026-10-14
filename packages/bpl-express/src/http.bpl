import [TlsConnection] from "bpl-tls";
import [Map], [MapNode] from "std/map.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [HttpParser] from "bpl-http-parser";
import releaseStrings from "bpl-http-parser";
import send, strlen, sprintf, strcmp, free from "./libc.bpl";
export [Request];
export [Response];
export [HttpMethod];
export writeAll;

enum HttpMethod {
    GET,
    POST,
    PUT,
    DELETE,
    PATCH,
    OPTIONS,
    HEAD,
    UNKNOWN,
}

# Linux MSG_NOSIGNAL prevents a disconnected client from terminating the process.
frame writeAll(fd: int, data: string, size: long) ret bool {
    local offset: long = 0;
    loop (offset < size) {
        local written: long = send(fd, data + offset, cast<ulong>(size - offset), 16384);
        if (written <= 0) {
            return false;
        }
        offset = offset + written;
    }
    return true;
}

struct Request {
    method: HttpMethod,
    path: string,
    query: Map<string, string>,
    headers: Map<string, string>,
    body: string,
    body_length: long,
    params: Map<string, string>,
    state: Map<string, string>,
    frame new() ret Request {
        local req: Request;
        req.method = HttpMethod.UNKNOWN;
        req.path = nullptr;
        req.body = nullptr;
        req.body_length = 0;
        req.query = Map<string, string>.new();
        req.headers = Map<string, string>.new();
        req.params = Map<string, string>.new();
        req.state = Map<string, string>.new();
        return req;
    }
    frame getParam(this: *Request, key: string) ret Option<string> {
        return this.params.get(key);
    }
    # Header keys are lowercase after parsing.
    frame header(this: *Request, key: string) ret Option<string> {
        return this.headers.get(key);
    }
    # Private application state, separate from client headers/query/path parameters.
    frame setState(this: *Request, key: string, value: string) {
        HttpParser.put(&this.state, HttpParser.copy(key, 0, cast<long>(strlen(key))), HttpParser.copy(value, 0, cast<long>(strlen(value))));
    }
    frame destroy(this: *Request) {
        releaseStrings(&this.query);
        releaseStrings(&this.headers);
        releaseStrings(&this.params);
        releaseStrings(&this.state);
        free(this.path);
        free(this.body);
        this.path = nullptr;
        this.body = nullptr;
    }
}

struct Response {
    client_fd: int,
    tls: *TlsConnection,
    write_timeout_seconds: long,
    status_code: int,
    headers: Map<string, string>,
    body_sent: bool,
    headers_sent: bool,
    is_chunked: bool,
    head_only: bool,
    io_failed: bool,
    frame new(fd: int) ret Response {
        local res: Response;
        res.client_fd = fd;
        res.tls = nullptr;
        res.write_timeout_seconds = 5;
        res.status_code = 200;
        res.headers = Map<string, string>.new();
        res.body_sent = false;
        res.headers_sent = false;
        res.is_chunked = false;
        res.head_only = false;
        res.io_failed = false;
        return res;
    }
    frame status(this: *Response, code: int) ret *Response {
        if (this.headers_sent) {
            throw "Response headers already sent";
        }
        if ((code < 200) || (code > 599)) {
            throw "Invalid response status";
        }
        this.status_code = code;
        return this;
    }
    frame equalHeader(a: string, b: string) ret bool {
        local i: int = 0;
        loop ((a[i] != 0) && (b[i] != 0)) {
            local ac: char = a[i];
            local bc: char = b[i];
            if ((ac >= 'A') && (ac <= 'Z')) {
                ac = ac + cast<char>(32);
            }
            if ((bc >= 'A') && (bc <= 'Z')) {
                bc = bc + cast<char>(32);
            }
            if (ac != bc) {
                return false;
            }
            i = i + 1;
        }
        return a[i] == b[i];
    }
    frame setHeader(this: *Response, key: string, value: string) ret *Response {
        if (this.headers_sent) {
            throw "Response headers already sent";
        }
        if ((key == nullptr) || (value == nullptr) || (key[0] == 0)) {
            throw "Invalid response header";
        }
        local i: int = 0;
        loop (key[i] != 0) {
            if (!HttpParser.token(key[i])) {
                throw "Invalid response header name";
            }
            i = i + 1;
        }
        i = 0;
        loop (value[i] != 0) {
            if (((value[i] < 32) && (value[i] != '\t')) || (value[i] == 127)) {
                throw "Invalid response header value";
            }
            i = i + 1;
        }
        if (Response.equalHeader(key, "content-length") || Response.equalHeader(key, "transfer-encoding") || Response.equalHeader(key, "connection")) {
            throw "Response framing headers are managed by the framework";
        }
        loop (local b: int = 0; b < this.headers.buckets.len(); b = b + 1) {
            local node: *MapNode<string, string> = this.headers.buckets.get(b);
            loop (node != nullptr) {
                if (Response.equalHeader(node.key, key)) {
                    local copy: string = HttpParser.copy(value, 0, cast<long>(strlen(value)));
                    free(node.value);
                    node.value = copy;
                    return this;
                }
                node = node.next;
            }
        }
        local name: string = HttpParser.copy(key, 0, cast<long>(strlen(key)));
        local copy: string = HttpParser.copy(value, 0, cast<long>(strlen(value)));
        this.headers.set(name, copy);
        return this;
    }
    frame _output(this: *Response, data: string, size: long) {
        if (!this.io_failed) {
            local ok: bool = false;
            if (this.tls == nullptr) {
                ok = writeAll(this.client_fd, data, size);
            } else {
                ok = this.tls.writeAll(data, size, TlsConnection.deadline(this.write_timeout_seconds));
            }
            if (!ok) {
                this.io_failed = true;
            }
        }
    }
    frame _writeHeaders(this: *Response, size: long) {
        if (this.headers_sent) {
            return;
        }
        local sb: StringBuilder = StringBuilder.new(256);
        local number: char[32];
        sprintf(cast<string>(&number[0]), "%d", this.status_code);
        sb.append("HTTP/1.1 ");
        sb.append(cast<string>(&number[0]));
        sb.append(" Response\r\nConnection: close\r\n");
        if ((this.status_code != 204) && (this.status_code != 304)) {
            if ((size < 0) && !this.head_only) {
                sb.append("Transfer-Encoding: chunked\r\n");
                this.is_chunked = true;
            } else {
                if (size < 0) {
                    size = 0;
                }
                sprintf(cast<string>(&number[0]), "%ld", size);
                sb.append("Content-Length: ");
                sb.append(cast<string>(&number[0]));
                sb.append("\r\n");
            }
        }
        loop (local i: int = 0; i < this.headers.buckets.len(); i = i + 1) {
            local node: *MapNode<string, string> = this.headers.buckets.get(i);
            loop (node != nullptr) {
                sb.append(node.key);
                sb.append(": ");
                sb.append(node.value);
                sb.append("\r\n");
                node = node.next;
            }
        }
        sb.append("\r\n");
        this._output(sb.toString(), cast<long>(sb.length));
        sb.destroy();
        this.headers_sent = true;
    }
    # Terminal Express-style send. Streaming uses write(), followed by end().
    frame send(this: *Response, body: string) {
        local size: long = 0;
        if (body != nullptr) {
            size = cast<long>(strlen(body));
        }
        this.sendBytes(body, size);
    }
    frame sendBytes(this: *Response, body: string, size: long) {
        if (this.body_sent) {
            return;
        }
        if ((size < 0) || ((size > 0) && (body == nullptr))) {
            throw "Invalid response buffer";
        }
        if (this.headers_sent) {
            throw "Cannot send after streaming has started";
        }
        this._writeHeaders(size);
        if (!this.head_only && (this.status_code != 204) && (this.status_code != 304) && (size > 0)) {
            this._output(body, size);
        }
        this.body_sent = true;
    }
    frame write(this: *Response, body: string) {
        if (this.body_sent) {
            return;
        }
        this._writeHeaders(-1);
        if (this.head_only || (this.status_code == 204) || (this.status_code == 304) || (body == nullptr)) {
            return;
        }
        local size: long = cast<long>(strlen(body));
        if (size > 0) {
            local number: char[32];
            sprintf(cast<string>(&number[0]), "%lx\r\n", size);
            this._output(cast<string>(&number[0]), cast<long>(strlen(cast<string>(&number[0]))));
            this._output(body, size);
            this._output("\r\n", 2);
        }
    }
    frame end(this: *Response) {
        if (this.body_sent) {
            return;
        }
        this._writeHeaders(0);
        if (this.is_chunked) {
            this._output("0\r\n\r\n", 5);
        }
        this.body_sent = true;
    }
    frame json(this: *Response, body: string) {
        this.setHeader("Content-Type", "application/json; charset=utf-8");
        this.send(body);
    }
    frame text(this: *Response, body: string) {
        this.setHeader("Content-Type", "text/plain; charset=utf-8");
        this.send(body);
    }
    frame html(this: *Response, body: string) {
        this.setHeader("Content-Type", "text/html; charset=utf-8");
        this.send(body);
    }
    frame redirect(this: *Response, location: string) {
        this.status(302).setHeader("Location", location).end();
    }
    # Header strings are copied and owned by the response.
    frame destroy(this: *Response) {
        releaseStrings(&this.headers);
    }
}
