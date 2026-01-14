import [HttpHeaders] from "./headers.bpl";
import [Url] from "./url.bpl";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import socket, connect, htons, gethostbyname, sockaddr_in, hostent, write, read, close, malloc, free, memcpy, memset, sprintf, strlen, strstr, atoi, printf, strcpy, strcat, snprintf, strchr, strtol from "./libc.bpl";

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
    body: string,

    frame new(status: int, body: string) ret *HttpResponse {
        local r: *HttpResponse = cast<*HttpResponse>(malloc(sizeof<HttpResponse>()));
        r.status = status;
        r.body = body;
        r.headers = HttpHeaders.new();
        return r;
    }
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

    frame new(url: string) ret RequestBuilder {
        local rb: RequestBuilder;
        rb.url_str = url;
        rb.method = HttpMethod.GET;
        rb.headers = HttpHeaders.new();
        rb.body = "";
        rb.custom_method = "";
        return rb;
    }

    frame setMethod(this: *RequestBuilder, m: HttpMethod) ret *RequestBuilder {
        this.method = m;
        return this;
    }

    frame methodCustom(this: *RequestBuilder, m: string) ret *RequestBuilder {
        this.method = HttpMethod.CUSTOM;
        this.custom_method = m;
        return this;
    }

    frame header(this: *RequestBuilder, key: string, value: string) ret *RequestBuilder {
        this.headers.set(key, value);
        return this;
    }

    frame json(this: *RequestBuilder, body: string) ret *RequestBuilder {
        this.body = body;
        this.headers.set("Content-Type", "application/json");
        local len_buf: *char = malloc(32);
        sprintf(len_buf, "%lu", strlen(body));
        this.headers.set("Content-Length", len_buf);
        return this;
    }

    frame text(this: *RequestBuilder, body: string) ret *RequestBuilder {
        this.body = body;
        this.headers.set("Content-Type", "text/plain");
        local len_buf: *char = malloc(32);
        sprintf(len_buf, "%lu", strlen(body));
        this.headers.set("Content-Length", len_buf);
        return this;
    }

    frame build(this: *RequestBuilder) ret *RequestBuilder {
        return this;
    }

    frame send(this: *RequestBuilder) ret *HttpResponse {
        local client: HttpClient;
        return client.execute(this);
    }
}

frame decodeChunked(raw: string) ret string {
    local decoded: string = malloc(strlen(raw) + 1);
    local w_ptr: long = 0;
    local r_ptr: string = raw;
    local end_ptr: *char = nullptr;

    loop {
        local chunk_len: long = strtol(r_ptr, &end_ptr, 16);
        if (chunk_len == 0) {
            break;
        }
        # Skip \r\n after hex size (end_ptr points to \r)
        r_ptr = cast<string>(cast<*void>(cast<long>(end_ptr) + 2));

        # Copy chunk_len bytes
        memcpy(cast<*void>(cast<long>(decoded) + w_ptr), cast<*void>(r_ptr), cast<ulong>(chunk_len));
        w_ptr = w_ptr + chunk_len;

        # Advance read pointer past data + \r\n
        r_ptr = cast<string>(cast<*void>(cast<long>(r_ptr) + chunk_len + 2));
    }

    local decoder_term: *char = cast<*char>(cast<*void>(cast<long>(decoded) + w_ptr));
    decoder_term[0] = cast<char>(0);

    return decoded;
}

frame executeRequest(req: *RequestBuilder) ret *HttpResponse {
    local url: Url = Url.parse(req.url_str);

    local sockfd: int = socket(2, 1, 0); # AF_INET=2, SOCK_STREAM=1
    if (sockfd < 0) {
        printf("Error opening socket\n");
        return HttpResponse.new(500, "Socket Error");
    }
    local server: *hostent = gethostbyname(url.host);
    if (server == nullptr) {
        printf("Error resolving host: %s\n", url.host);
        close(sockfd);
        return HttpResponse.new(500, "DNS Error");
    }
    local serv_addr: sockaddr_in;
    memset(&serv_addr, 0, sizeof(sockaddr_in));
    serv_addr.sin_family = 2; # AF_INET

    local addr_list: **char = server.h_addr_list;
    local addr_ptr: *char = addr_list[0];
    memcpy(&serv_addr.sin_addr, addr_ptr, 4);

    serv_addr.sin_port = htons(cast<ushort>(url.port));

    if (connect(sockfd, &serv_addr, sizeof(sockaddr_in)) < 0) {
        printf("Error connecting\n");
        close(sockfd);
        return HttpResponse.new(500, "Connection Error");
    }
    # Build Request String
    local method_str: string = "GET";
    match (req.method) {
        HttpMethod.GET => method_str = "GET",
        HttpMethod.POST => method_str = "POST",
        HttpMethod.PUT => method_str = "PUT",
        HttpMethod.DELETE => method_str = "DELETE",
        HttpMethod.PATCH => method_str = "PATCH",
        HttpMethod.OPTIONS => method_str = "OPTIONS",
        HttpMethod.HEAD => method_str = "HEAD",
        HttpMethod.CUSTOM => method_str = req.custom_method,
    }; # Buffer for headers
    local req_buf: *char = malloc(4096);
    local offset: ulong = 0;

    # Request Line
    offset = offset + cast<ulong>(sprintf(cast<string>(cast<*void>(cast<long>(req_buf) + cast<long>(offset))), "%s %s HTTP/1.1\r\n", method_str, url.path));
    offset = offset + cast<ulong>(sprintf(cast<string>(cast<*void>(cast<long>(req_buf) + cast<long>(offset))), "Host: %s\r\n", url.host));
    offset = offset + cast<ulong>(sprintf(cast<string>(cast<*void>(cast<long>(req_buf) + cast<long>(offset))), "Connection: close\r\n"));

    # Headers
    if (req.headers.has("Content-Type")) {
        offset = offset + cast<ulong>(sprintf(cast<string>(cast<*void>(cast<long>(req_buf) + cast<long>(offset))), "Content-Type: %s\r\n", req.headers.get("Content-Type").unwrap()));
    }
    if (req.headers.has("Content-Length")) {
        offset = offset + cast<ulong>(sprintf(cast<string>(cast<*void>(cast<long>(req_buf) + cast<long>(offset))), "Content-Length: %s\r\n", req.headers.get("Content-Length").unwrap()));
    }
    offset = offset + cast<ulong>(sprintf(cast<string>(cast<*void>(cast<long>(req_buf) + cast<long>(offset))), "\r\n"));

    # Send Headers
    write(sockfd, req_buf, offset);

    # Send Body
    if (strlen(req.body) > 0) {
        write(sockfd, req.body, strlen(req.body));
    }
    # Read Response
    local resp_buf: *char = malloc(65536);
    local total_read: long = 0;
    local bytes_read: long = 0;

    loop {
        bytes_read = read(sockfd, cast<string>(cast<*void>(cast<long>(resp_buf) + total_read)), cast<ulong>(65535) - cast<ulong>(total_read));
        if (bytes_read <= 0) {
            break;
        }
        total_read = total_read + bytes_read;
    }
    local term_resp: *char = cast<*char>(cast<*void>(cast<long>(resp_buf) + total_read));
    term_resp[0] = cast<char>(0); # Null terminate

    close(sockfd);

    # Parse Response (Naive)
    local body_start: string = strstr(resp_buf, "\r\n\r\n");
    if (cast<long>(body_start) != 0) {
        body_start = cast<string>(cast<*void>(cast<long>(body_start) + 4));
    } else {
        body_start = "";
    }

    # Status code
    local space1: string = strchr(resp_buf, 32); # ' '
    local status_code: int = 0;
    if (cast<long>(space1) != 0) {
        status_code = atoi(cast<string>(cast<*void>(cast<long>(space1) + 1)));
    }
    # Check for Chunked Encoding (Simple check in headers)
    local is_chunked: bool = false;
    # We restrict search to headers mostly by using resp_buf,
    # but strstr searches everything. Since headers come first, if it's there it's likely a header.
    if (cast<long>(strstr(resp_buf, "Transfer-Encoding: chunked")) != 0) {
        is_chunked = true;
    }
    local final_body: string;
    if (is_chunked) {
        final_body = decodeChunked(body_start);
    } else {
        local body_len: ulong = strlen(body_start);
        final_body = malloc(body_len + 1);
        strcpy(final_body, body_start);
    }

    free(req_buf);

    return HttpResponse.new(status_code, final_body);
}
