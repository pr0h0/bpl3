import [TlsContext], [TlsConnection] from "bpl-tls";
import [HttpHeaders] from "./headers.bpl";
import [Url] from "./url.bpl";
import [Map], [MapNode] from "std/map.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [HttpParser], [HeaderField], [ChunkDecoder], [ChunkedBody] from "bpl-http-parser";
import socket, connect, htons, gethostbyname, [sockaddr_in], [hostent], send, read, close, malloc, free, memcpy, memset, sprintf, strlen, strcmp, setsockopt, [timeval] from "./libc.bpl";
export [HttpMethod];
export [RequestBuilder];
export [HttpClient];
export [HttpResponse];
enum HttpMethod {
    GET,
    POST,
    PUT,
    DELETE,
    PATCH,
    OPTIONS,
    HEAD,
    CUSTOM,
}

struct HttpResponse {
    status: int,
    headers: HttpHeaders,
    trailers: HttpHeaders,
    body: string,
    body_length: long,
    error: string,
    frame new(status: int, body: string) ret *HttpResponse {
        local r: *HttpResponse = cast<*HttpResponse>(malloc(sizeof<HttpResponse>()));
        if (r == nullptr) {
            throw "HTTP response allocation failed";
        }
        r.status = status;
        r.headers = HttpHeaders.new();
        r.trailers = HttpHeaders.new();
        r.body_length = cast<long>(strlen(body));
        r.body = HttpParser.copy(body, 0, r.body_length);
        r.error = "";
        return r;
    }
    frame failure(error: string) ret *HttpResponse {
        local r: *HttpResponse = HttpResponse.new(0, "");
        r.error = error;
        return r;
    }
    # Destroys the heap response itself; do not call twice or use afterward.
    frame destroy(this: *HttpResponse) {
        this.headers.destroy();
        this.trailers.destroy();
        free(this.body);
        free(cast<string>(this));
    }
    frame parseBytes(raw: string, size: long, head: bool) ret *HttpResponse {
        if ((raw == nullptr) || (size < 12)) {
            return HttpResponse.failure("Invalid HTTP response");
        }
        local boundary: long = -1;
        local i: long = 0;
        loop (((i + 3) < size) && (i < 16384)) {
            if ((raw[i] == '\r') && (raw[i + 1] == '\n') && (raw[i + 2] == '\r') && (raw[i + 3] == '\n')) {
                boundary = i;
                break;
            }
            i = i + 1;
        }
        if ((boundary < 0) || ((boundary + 4) > 16384)) {
            return HttpResponse.failure("Invalid response headers");
        }
        if ((raw[0] != 'H') || (raw[1] != 'T') || (raw[2] != 'T') || (raw[3] != 'P') || (raw[4] != '/') || (raw[5] != '1') || (raw[6] != '.') || ((raw[7] != '0') && (raw[7] != '1')) || (raw[8] != ' ')) {
            return HttpResponse.failure("Invalid response version");
        }
        local status: int = 0;
        loop (i = 9; i < 12; i = i + 1) {
            if ((raw[i] < '0') || (raw[i] > '9')) {
                return HttpResponse.failure("Invalid response status");
            }
            status = (status * 10) + cast<int>(raw[i] - '0');
        }
        if ((status < 200) || (status > 599) || ((raw[12] != ' ') && (raw[12] != '\r'))) {
            return HttpResponse.failure("Unsupported response status");
        }
        local r: *HttpResponse = HttpResponse.new(status, "");
        i = 12;
        loop ((i < boundary) && (raw[i] != '\r')) {
            i = i + 1;
        }
        i = i + 2;
        loop (i < boundary) {
            local end: long = i;
            loop ((end < boundary) && (raw[end] != '\r')) {
                end = end + 1;
            }
            if (raw[end + 1] != '\n') {
                r.destroy();
                return HttpResponse.failure("Malformed response header");
            }
            local colon: long = i;
            loop ((colon < end) && HttpParser.token(raw[colon])) {
                colon = colon + 1;
            }
            if ((colon == i) || (colon == end) || (raw[colon] != ':')) {
                r.destroy();
                return HttpResponse.failure("Malformed response header");
            }
            local start: long = colon + 1;
            loop ((start < end) && ((raw[start] == ' ') || (raw[start] == '\t'))) {
                start = start + 1;
            }
            local finish: long = end;
            loop ((finish > start) && ((raw[finish - 1] == ' ') || (raw[finish - 1] == '\t'))) {
                finish = finish - 1;
            }
            local name: string = HttpParser.copy(raw, i, colon - i);
            local value: string = HttpParser.copy(raw, start, finish - start);
            if (ResponseHeaderDuplicate(&r.headers, name)) {
                free(name);
                free(value);
                r.destroy();
                return HttpResponse.failure("Duplicate response framing header");
            }
            try {
                r.headers.append(name, value);
            } catch {
                free(name);
                free(value);
                r.destroy();
                return HttpResponse.failure("Invalid response header");
            }
            free(name);
            free(value);
            i = end + 2;
        }
        local data: string = raw + boundary + 4;
        local available: long = size - boundary - 4;
        if (head || (status == 204) || (status == 304)) {
            return r;
        }
        local length: long = available;
        if (r.headers.has("transfer-encoding")) {
            local encoding: string = HttpHeaders.copy(r.headers.get("transfer-encoding").unwrap());
            loop (local n: long = 0; encoding[n] != 0; n = n + 1) {
                if ((encoding[n] >= 'A') && (encoding[n] <= 'Z')) {
                    encoding[n] = encoding[n] + cast<char>(32);
                }
            }
            local supported: bool = strcmp(encoding, "chunked") == 0;
            free(encoding);
            if (!supported || r.headers.has("content-length")) {
                r.destroy();
                return HttpResponse.failure("Unsupported response framing");
            }
            local decoded: ChunkedBody = ChunkDecoder.parse(data, available);
            if (!decoded.valid) {
                decoded.destroy();
                r.destroy();
                return HttpResponse.failure("Invalid chunked response");
            }
            free(r.body);
            r.body = decoded.body;
            decoded.body = nullptr;
            r.body_length = decoded.body_length;
            r.trailers.destroy();
            r.trailers = decoded.trailers;
            return r;
        }
        if (r.headers.has("content-length")) {
            local value: string = r.headers.get("content-length").unwrap();
            length = 0;
            local n: long = cast<long>(strlen(value));
            if (n == 0) {
                r.destroy();
                return HttpResponse.failure("Invalid response length");
            }
            loop (local j: long = 0; j < n; j = j + 1) {
                if ((value[j] < '0') || (value[j] > '9')) {
                    r.destroy();
                    return HttpResponse.failure("Invalid response length");
                }
                length = (length * 10) + cast<long>(value[j] - '0');
                if (length > 1048576) {
                    r.destroy();
                    return HttpResponse.failure("Response too large");
                }
            }
            if (length > available) {
                r.destroy();
                return HttpResponse.failure("Truncated response");
            }
        }
        if (length > 1048576) {
            r.destroy();
            return HttpResponse.failure("Response too large");
        }
        free(r.body);
        r.body = HttpParser.copy(data, 0, length);
        r.body_length = length;
        return r;
    }
}
frame ResponseHeaderDuplicate(headers: *HttpHeaders, name: string) ret bool {
    local key: string = HttpHeaders.lower(name);
    defer free(key);
    return ((strcmp(key, "content-length") == 0) || (strcmp(key, "transfer-encoding") == 0)) && headers.has(key);
}
struct HttpClient {
    dummy: int,
    frame execute(this: *HttpClient, req: *RequestBuilder) ret *HttpResponse {
        return executeRequest(req);
    }
}
struct RequestBuilder {
    method: HttpMethod,
    custom_method: string,
    url_str: string,
    headers: HttpHeaders,
    body: string,
    timeout_seconds: long,
    ca_file: string,
    frame new(url: string) ret RequestBuilder {
        local r: RequestBuilder;
        r.url_str = url;
        r.method = HttpMethod.GET;
        r.headers = HttpHeaders.new();
        r.body = "";
        r.custom_method = "";
        r.timeout_seconds = 5;
        r.ca_file = nullptr;
        return r;
    }
    # Borrowed PEM CA bundle path; null uses the system certificate trust store.
    frame caBundle(this: *RequestBuilder, path: string) ret *RequestBuilder {
        this.ca_file = path;
        return this;
    }
    frame setMethod(this: *RequestBuilder, m: HttpMethod) ret *RequestBuilder {
        this.method = m;
        return this;
    }
    frame methodCustom(this: *RequestBuilder, m: string) ret *RequestBuilder {
        if ((m == nullptr) || (m[0] == 0)) {
            throw "Invalid method";
        }
        loop (local i: int = 0; m[i] != 0; i = i + 1) {
            if (!HttpParser.token(m[i])) {
                throw "Invalid method";
            }
        }
        this.method = HttpMethod.CUSTOM;
        this.custom_method = m;
        return this;
    }
    frame header(this: *RequestBuilder, key: string, value: string) ret *RequestBuilder {
        local name: string = HttpHeaders.lower(key);
        defer free(name);
        if ((strcmp(name, "content-length") == 0) || (strcmp(name, "transfer-encoding") == 0) || (strcmp(name, "connection") == 0) || (strcmp(name, "host") == 0)) {
            throw "Request framing headers are managed by client";
        }
        this.headers.set(key, value);
        return this;
    }
    frame json(this: *RequestBuilder, body: string) ret *RequestBuilder {
        this.body = body;
        this.headers.set("content-type", "application/json");
        return this;
    }
    frame text(this: *RequestBuilder, body: string) ret *RequestBuilder {
        this.body = body;
        this.headers.set("content-type", "text/plain");
        return this;
    }
    frame build(this: *RequestBuilder) ret *RequestBuilder {
        return this;
    }
    frame send(this: *RequestBuilder) ret *HttpResponse {
        return executeRequest(this);
    }
    frame destroy(this: *RequestBuilder) {
        this.headers.destroy();
    }
}
frame clientWrite(fd: int, tls: *TlsConnection, data: string, size: long, deadline: long) ret bool {
    if (tls.ssl != nullptr) {
        return tls.writeAll(data, size, deadline);
    }
    local used: long = 0;
    loop (used < size) {
        if (!tls.wait(4, deadline)) {
            return false;
        }
        local n: long = send(fd, data + used, cast<ulong>(size - used), 16448);
        if (n <= 0) {
            return false;
        }
        used = used + n;
    }
    return true;
}
frame executeRequest(req: *RequestBuilder) ret *HttpResponse {
    if ((req.timeout_seconds < 1) || (req.timeout_seconds > 300)) {
        return HttpResponse.failure("HTTP deadline must be 1 to 300 seconds");
    }
    local url: Url = Url.parse(req.url_str);
    defer url.destroy();
    if (!url.valid) {
        return HttpResponse.failure("Unsupported or invalid HTTP/HTTPS URL");
    }
    local server: *hostent = gethostbyname(url.host);
    if ((server == nullptr) || (server.h_addrtype != 2) || (server.h_length != 4)) {
        return HttpResponse.failure("DNS resolution failed");
    }
    local deadline: long = TlsConnection.deadline(req.timeout_seconds);
    local fd: int = socket(2, 1, 0);
    if (fd < 0) {
        return HttpResponse.failure("Socket creation failed");
    }
    defer close(fd);
    local timeout: timeval;
    timeout.tv_sec = req.timeout_seconds;
    timeout.tv_usec = 0;
    setsockopt(fd, 1, 20, &timeout, cast<uint>(sizeof<timeval>()));
    setsockopt(fd, 1, 21, &timeout, cast<uint>(sizeof<timeval>()));
    local addr: sockaddr_in;
    memset(&addr, 0, sizeof<sockaddr_in>());
    addr.sin_family = 2;
    addr.sin_port = htons(cast<ushort>(url.port));
    memcpy(&addr.sin_addr, server.h_addr_list[0], 4);
    if (connect(fd, &addr, 16) < 0) {
        return HttpResponse.failure("Connection failed");
    }
    local context: TlsContext = TlsContext.empty();
    local cleanup_context: *TlsContext = &context;
    defer cleanup_context.destroy();
    local tls: TlsConnection = TlsConnection.empty();
    local cleanup_tls: *TlsConnection = &tls;
    defer cleanup_tls.destroy();
    tls.fd = fd;
    if (url.secure) {
        try {
            context.initialize(false, nullptr, nullptr, req.ca_file);
        } catch {
            return HttpResponse.failure("TLS context or certificate trust store configuration failed");
        }
        if (!tls.open(&context, fd, url.host, deadline)) {
            return HttpResponse.failure("TLS handshake failed (certificate verification, connection, or deadline)");
        }
    }
    defer tls.shutdown(deadline);
    local method: string = "GET";
    match (req.method) {
        HttpMethod.GET => {
        },
        HttpMethod.POST => method = "POST",
        HttpMethod.PUT => method = "PUT",
        HttpMethod.DELETE => method = "DELETE",
        HttpMethod.PATCH => method = "PATCH",
        HttpMethod.OPTIONS => method = "OPTIONS",
        HttpMethod.HEAD => method = "HEAD",
        HttpMethod.CUSTOM => method = req.custom_method,
    };
    local sb: StringBuilder = StringBuilder.new(256);
    local cleanup_sb: *StringBuilder = &sb;
    defer cleanup_sb.destroy();
    local number: char[32];
    sb.append(method);
    sb.append(" ");
    sb.append(url.path);
    sb.append(" HTTP/1.1\r\nHost: ");
    sb.append(url.host);
    if ((!url.secure && (url.port != 80)) || (url.secure && (url.port != 443))) {
        sprintf(cast<string>(&number[0]), ":%d", url.port);
        sb.append(cast<string>(&number[0]));
    }
    sb.append("\r\nConnection: close\r\n");
    loop (local i: int = 0; i < req.headers.lines.len(); i = i + 1) {
        local line: HeaderField = req.headers.lines.get(i);
        sb.append(line.name);
        sb.append(": ");
        sb.append(line.value);
        sb.append("\r\n");
    }
    local length: long = 0;
    if (req.body != nullptr) {
        length = cast<long>(strlen(req.body));
    }
    sprintf(cast<string>(&number[0]), "%ld", length);
    sb.append("Content-Length: ");
    sb.append(cast<string>(&number[0]));
    sb.append("\r\n\r\n");
    if ((sb.length > 16384) || (length > 1048576)) {
        return HttpResponse.failure("Request too large");
    }
    if (!clientWrite(fd, &tls, sb.toString(), cast<long>(sb.length), deadline) || !clientWrite(fd, &tls, req.body, length, deadline)) {
        return HttpResponse.failure("Request write failed");
    }
    local buffer: string = malloc(2113537);
    if (buffer == nullptr) {
        throw "HTTP allocation failed";
    }
    defer free(buffer);
    local used: long = 0;
    loop (used < 2113536) {
        local n: long = 0;
        if (url.secure) {
            n = tls.read(buffer + used, 2113536 - used, deadline);
        } else {
            if (!tls.wait(1, deadline)) {
                return HttpResponse.failure("Response read timed out");
            }
            n = read(fd, buffer + used, cast<ulong>(2113536 - used));
        }
        if (n < 0) {
            return HttpResponse.failure("Response read failed or timed out");
        }
        if (n == 0) {
            buffer[used] = 0;
            return HttpResponse.parseBytes(buffer, used, strcmp(method, "HEAD") == 0);
        }
        used = used + n;
    }
    return HttpResponse.failure("Response too large");
}
