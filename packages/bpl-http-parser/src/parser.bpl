import [ChunkDecoder], [ChunkedBody] from "./chunked.bpl";
import [HttpHeaders] from "./headers.bpl";
import [Array] from "std/array.bpl";
import [ParsedRequest] from "./types.bpl";
import [Map], [MapNode] from "std/map.bpl";
import strlen, malloc, free, memcpy, strcmp from "./libc.bpl";
export [HttpParser];

struct HttpParser {
    frame copy(raw: string, start: long, count: long) ret string {
        local result: string = malloc(count + 1);
        if (result == nullptr) {
            throw "HTTP allocation failed";
        }
        memcpy(result, raw + start, count);
        result[count] = 0;
        return result;
    }

    frame token(c: char) ret bool {
        return ((c >= 'a') && (c <= 'z')) || ((c >= 'A') && (c <= 'Z')) || ((c >= '0') && (c <= '9')) || (c == '!') || (c == '#') || (c == '$') || (c == '%') || (c == '&') || (c == '\'') || (c == '*') || (c == '+') || (c == '-') || (c == '.') || (c == '^') || (c == '_') || (c == '`') || (c == '|') || (c == '~');
    }

    frame hex(c: char) ret int {
        if ((c >= '0') && (c <= '9')) {
            return cast<int>(c - '0');
        }
        if ((c >= 'a') && (c <= 'f')) {
            return cast<int>(c - 'a') + 10;
        }
        if ((c >= 'A') && (c <= 'F')) {
            return cast<int>(c - 'A') + 10;
        }
        return -1;
    }

    # Owned result; malformed escapes and decoded NUL are rejected.
    frame decode(raw: string, count: long) ret string {
        return HttpParser.decode(raw, count, true);
    }
    frame decode(raw: string, count: long, plusAsSpace: bool) ret string {
        local result: string = malloc(count + 1);
        if (result == nullptr) {
            throw "HTTP allocation failed";
        }
        local i: long = 0;
        local j: long = 0;
        loop (i < count) {
            local c: char = raw[i];
            if ((c == '+') && plusAsSpace) {
                c = ' ';
            } else if (c == '%') {
                if ((i + 2) >= count) {
                    free(result);
                    return nullptr;
                }
                local a: int = HttpParser.hex(raw[i + 1]);
                local b: int = HttpParser.hex(raw[i + 2]);
                if ((a < 0) || (b < 0) || ((a == 0) && (b == 0))) {
                    free(result);
                    return nullptr;
                }
                c = cast<char>((a * 16) + b);
                i = i + 2;
            }
            result[j] = c;
            j = j + 1;
            i = i + 1;
        }
        result[j] = 0;
        return result;
    }

    frame put(map: *Map<string, string>, key: string, value: string) {
        # Maps borrow strings. Keep the existing key on replacement.
        local i: int = 0;
        loop (i < map.buckets.len()) {
            local node: *MapNode<string, string> = map.buckets.get(i);
            loop (node != nullptr) {
                if (strcmp(node.key, key) == 0) {
                    free(key);
                    free(node.value);
                    node.value = value;
                    return;
                }
                node = node.next;
            }
            i = i + 1;
        }
        map.set(key, value);
    }

    frame parseQuery(qs: string, map: *Map<string, string>) ret bool {
        if (qs == nullptr) {
            return true;
        }
        local len: long = strlen(qs);
        local start: long = 0;
        loop (start < len) {
            local end: long = start;
            loop ((end < len) && (qs[end] != '&')) {
                end = end + 1;
            }
            local eq: long = start;
            loop ((eq < end) && (qs[eq] != '=')) {
                eq = eq + 1;
            }
            local key: string = HttpParser.decode(qs + start, eq - start);
            local value_start: long = eq;
            if (eq < end) {
                value_start = eq + 1;
            }
            local value: string = HttpParser.decode(qs + value_start, end - value_start);
            if ((key == nullptr) || (value == nullptr)) {
                free(key);
                free(value);
                return false;
            }
            HttpParser.put(map, key, value);
            start = end + 1;
        }
        return true;
    }

    frame parse(raw: string) ret ParsedRequest {
        if (raw == nullptr) {
            return ParsedRequest.new();
        }
        return HttpParser.parseBytes(raw, strlen(raw));
    }

    # At most 16 KiB headers / 1 MiB body. Incomplete input has error_code=0.
    # Unsupported transfer codings are explicitly rejected (501).
    frame parseBytes(raw: string, size: long) ret ParsedRequest {
        local p: ParsedRequest = ParsedRequest.new();
        if ((raw == nullptr) || (size < 0)) {
            p.error_code = 400;
            return p;
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
        if (boundary < 0) {
            if (size >= 16384) {
                p.error_code = 431;
            }
            return p;
        }
        if ((boundary + 4) > 16384) {
            p.error_code = 431;
            return p;
        }
        p.error_code = 400;
        local line: long = 0;
        loop ((line < boundary) && (raw[line] != '\r')) {
            line = line + 1;
        }
        if ((raw[line] != '\r') || (raw[line + 1] != '\n')) {
            return p;
        }
        local m: long = 0;
        loop ((m < line) && HttpParser.token(raw[m])) {
            m = m + 1;
        }
        if ((m == 0) || (m >= line) || (raw[m] != ' ')) {
            return p;
        }
        local target: long = m + 1;
        local end: long = target;
        loop ((end < line) && (raw[end] != ' ')) {
            if ((cast<u8>(raw[end]) <= 32) || (raw[end] == 127) || (raw[end] == '#')) {
                return p;
            }
            end = end + 1;
        }
        if ((end == target) || (raw[target] != '/') || ((end + 9) != line)) {
            return p;
        }
        local version: string = HttpParser.copy(raw, end + 1, 8);
        local version_ok: bool = (strcmp(version, "HTTP/1.1") == 0) || (strcmp(version, "HTTP/1.0") == 0);
        free(version);
        if (!version_ok) {
            return p;
        }
        p.method = HttpParser.copy(raw, 0, m);
        local q: long = target;
        loop ((q < end) && (raw[q] != '?')) {
            q = q + 1;
        }
        p.path = HttpParser.copy(raw, target, q - target);
        if (q < end) {
            local query: string = HttpParser.copy(raw, q + 1, end - q - 1);
            local ok: bool = HttpParser.parseQuery(query, &p.query);
            free(query);
            if (!ok) {
                return p;
            }
        }
        i = line + 2;
        local length: long = 0;
        local has_length: bool = false;
        local chunked: bool = false;
        local has_host: bool = false;
        loop (i < boundary) {
            local e: long = i;
            loop ((e < boundary) && (raw[e] != '\r')) {
                e = e + 1;
            }
            if ((e > boundary) || (raw[e + 1] != '\n')) {
                return p;
            }
            local colon: long = i;
            loop ((colon < e) && HttpParser.token(raw[colon])) {
                colon = colon + 1;
            }
            if ((colon == i) || (colon >= e) || (raw[colon] != ':')) {
                return p;
            }
            local key: string = HttpParser.copy(raw, i, colon - i);
            local k: long = 0;
            loop (k < (colon - i)) {
                if ((key[k] >= 'A') && (key[k] <= 'Z')) {
                    key[k] = key[k] + cast<char>(32);
                }
                k = k + 1;
            }
            local vs: long = colon + 1;
            loop ((vs < e) && ((raw[vs] == ' ') || (raw[vs] == '\t'))) {
                vs = vs + 1;
            }
            local ve: long = e;
            loop ((ve > vs) && ((raw[ve - 1] == ' ') || (raw[ve - 1] == '\t'))) {
                ve = ve - 1;
            }
            k = vs;
            loop (k < ve) {
                if (((cast<u8>(raw[k]) < cast<u8>(32)) && (raw[k] != '\t')) || (raw[k] == 127)) {
                    free(key);
                    return p;
                }
                k = k + 1;
            }
            local value: string = HttpParser.copy(raw, vs, ve - vs);
            if (strcmp(key, "content-length") == 0) {
                if (has_length || (ve == vs)) {
                    free(key);
                    free(value);
                    return p;
                }
                has_length = true;
                k = vs;
                loop (k < ve) {
                    if ((raw[k] < '0') || (raw[k] > '9')) {
                        free(key);
                        free(value);
                        return p;
                    }
                    length = (length * 10) + cast<long>(raw[k] - '0');
                    if (length > 1048576) {
                        free(key);
                        free(value);
                        p.error_code = 413;
                        return p;
                    }
                    k = k + 1;
                }
            }
            if (strcmp(key, "host") == 0) {
                if (has_host || (ve == vs)) {
                    free(key);
                    free(value);
                    return p;
                }
                has_host = true;
            }
            if (strcmp(key, "transfer-encoding") == 0) {
                if (chunked) {
                    free(key);
                    free(value);
                    return p;
                }
                local encoding: string = HttpHeaders.copy(value);
                loop (local n: long = 0; encoding[n] != 0; n = n + 1) {
                    if ((encoding[n] >= 'A') && (encoding[n] <= 'Z')) {
                        encoding[n] = encoding[n] + cast<char>(32);
                    }
                }
                local supported: bool = strcmp(encoding, "chunked") == 0;
                free(encoding);
                if (!supported) {
                    free(key);
                    free(value);
                    p.error_code = 501;
                    return p;
                }
                chunked = true;
            }
            if (((strcmp(key, "cookie") == 0) || (strcmp(key, "origin") == 0) || (strcmp(key, "authorization") == 0) || (strcmp(key, "x-csrf-token") == 0) || (strcmp(key, "content-type") == 0) || (strcmp(key, "expect") == 0) || (strcmp(key, "access-control-request-method") == 0)) && p.headers.has(key)) {
                free(key);
                free(value);
                return p;
            }
            p.headers.append(key, value);
            free(key);
            free(value);
            i = e + 2;
        }
        # HTTP/1.1 requires exactly one Host header.
        if (version_ok && (raw[end + 8] == '1') && !has_host) {
            return p;
        }
        if (chunked) {
            if (has_length || (raw[end + 8] != '1')) {
                return p;
            }
            local decoded: ChunkedBody = ChunkDecoder.parse(raw + boundary + 4, size - boundary - 4);
            if (!decoded.valid) {
                p.error_code = decoded.error_code;
                decoded.destroy();
                return p;
            }
            p.body = decoded.body;
            decoded.body = nullptr;
            p.body_length = decoded.body_length;
            p.message_length = boundary + 4 + decoded.message_length;
            p.trailers.destroy();
            p.trailers = decoded.trailers;
            p.valid = true;
            p.error_code = 0;
            return p;
        }
        if ((size - boundary - 4) < length) {
            p.error_code = 0;
            return p;
        }
        p.body = HttpParser.copy(raw, boundary + 4, length);
        p.body_length = length;
        p.message_length = boundary + 4 + length;
        p.valid = true;
        p.error_code = 0;
        return p;
    }
}
