import strlen, malloc, free, strncmp from "./libc.bpl";
export [Url];
struct Url {
    host: string,
    port: int,
    path: string,
    valid: bool,
    secure: bool,
    owned: bool,
    frame new(host: string, port: int, path: string) ret Url {
        local u: Url;
        u.host = host;
        u.port = port;
        u.path = path;
        u.valid = (port > 0) && (port <= 65535);
        u.owned = false;
        u.secure = false;
        return u;
    }
    # HTTP and HTTPS; TLS failures never fall back to plaintext.
    frame parse(raw: string) ret Url {
        local u: Url = Url.new(nullptr, 80, nullptr);
        u.valid = false;
        if (raw == nullptr) {
            return u;
        }
        local start: long = 7;
        if (strncmp(raw, "https://", 8) == 0) {
            start = 8;
            u.secure = true;
            u.port = 443;
        } else if (strncmp(raw, "http://", 7) != 0) {
            return u;
        }
        local len: long = cast<long>(strlen(raw));
        loop (local i: long = 0; i < len; i = i + 1) {
            if ((raw[i] <= 32) || (raw[i] == 127)) {
                return u;
            }
        }
        local end: long = start;
        loop ((end < len) && (raw[end] != '/') && (raw[end] != '?') && (raw[end] != '#')) {
            end = end + 1;
        }
        if (end == start) {
            return u;
        }
        local colon: long = start;
        loop ((colon < end) && (raw[colon] != ':')) {
            if ((raw[colon] == '@') || (raw[colon] == '[') || (raw[colon] == ']')) {
                return u;
            }
            colon = colon + 1;
        }
        if (colon == start) {
            return u;
        }
        if (colon < end) {
            local port: long = 0;
            local i: long = colon + 1;
            if (i == end) {
                return u;
            }
            loop (i < end) {
                if ((raw[i] < '0') || (raw[i] > '9')) {
                    return u;
                }
                port = (port * 10) + cast<long>(raw[i] - '0');
                if (port > 65535) {
                    return u;
                }
                i = i + 1;
            }
            if (port == 0) {
                return u;
            }
            u.port = cast<int>(port);
        }
        u.host = malloc(cast<ulong>((colon - start) + 1));
        if (u.host == nullptr) {
            throw "URL allocation failed";
        }
        loop (local i: long = start; i < colon; i = i + 1) {
            u.host[i - start] = raw[i];
        }
        u.host[colon - start] = 0;
        local finish: long = end;
        loop ((finish < len) && (raw[finish] != '#')) {
            finish = finish + 1;
        }
        local slash: long = 0;
        if ((end == finish) || (raw[end] != '/')) {
            slash = 1;
        }
        u.path = malloc(cast<ulong>((finish - end) + slash + 1));
        if (u.path == nullptr) {
            free(u.host);
            throw "URL allocation failed";
        }
        if (slash == 1) {
            u.path[0] = '/';
        }
        loop (local i: long = end; i < finish; i = i + 1) {
            u.path[(i - end) + slash] = raw[i];
        }
        u.path[(finish - end) + slash] = 0;
        u.valid = true;
        u.owned = true;
        return u;
    }
    frame destroy(this: *Url) {
        if (this.owned) {
            free(this.host);
            free(this.path);
        }
        this.host = nullptr;
        this.path = nullptr;
        this.owned = false;
        this.valid = false;
    }
}
