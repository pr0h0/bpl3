import [HttpHeaders] from "./headers.bpl";
extern malloc(size: long) ret *void;
extern free(ptr: string);
extern memcpy(dest: *void, src: *void, count: long) ret *void;
extern strcmp(a: string, b: string) ret int;
export [ChunkedBody];
export [ChunkDecoder];
struct ChunkedBody {
    valid: bool,
    error_code: int,
    body: string,
    body_length: long,
    message_length: long,
    trailers: HttpHeaders,
    frame new() ret ChunkedBody {
        local result: ChunkedBody;
        result.valid = false;
        result.error_code = 0;
        result.body = nullptr;
        result.body_length = 0;
        result.message_length = 0;
        result.trailers = HttpHeaders.new();
        return result;
    }
    frame destroy(this: *ChunkedBody) {
        free(this.body);
        this.body = nullptr;
        this.trailers.destroy();
    }
}
struct ChunkDecoder {
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
    # Returns -1 for invalid syntax and -2 for an oversized chunk.
    frame length(raw: string, start: long, end: long) ret long {
        local pos: long = start;
        local size: long = 0;
        local digits: int = 0;
        loop (pos < end) {
            local digit: int = ChunkDecoder.hex(raw[pos]);
            if (digit < 0) {
                break;
            }
            size = (size * 16) + cast<long>(digit);
            if (size > 1048576) {
                return -2;
            }
            digits = digits + 1;
            pos = pos + 1;
        }
        if (digits == 0) {
            return -1;
        }
        loop (pos < end) {
            loop ((pos < end) && ((raw[pos] == ' ') || (raw[pos] == '\t'))) {
                pos = pos + 1;
            }
            if (pos == end) {
                return -1;
            }
            if (raw[pos] != ';') {
                return -1;
            }
            pos = pos + 1;
            loop ((pos < end) && ((raw[pos] == ' ') || (raw[pos] == '\t'))) {
                pos = pos + 1;
            }
            local name: long = pos;
            loop ((pos < end) && HttpHeaders.token(raw[pos])) {
                pos = pos + 1;
            }
            if (pos == name) {
                return -1;
            }
            loop ((pos < end) && ((raw[pos] == ' ') || (raw[pos] == '\t'))) {
                pos = pos + 1;
            }
            if ((pos < end) && (raw[pos] == '=')) {
                pos = pos + 1;
                loop ((pos < end) && ((raw[pos] == ' ') || (raw[pos] == '\t'))) {
                    pos = pos + 1;
                }
                if (pos == end) {
                    return -1;
                }
                if (raw[pos] == '"') {
                    pos = pos + 1;
                    local closed: bool = false;
                    loop (pos < end) {
                        local c: char = raw[pos];
                        pos = pos + 1;
                        if (c == '"') {
                            closed = true;
                            break;
                        }
                        if (c == '\\') {
                            if (pos == end) {
                                return -1;
                            }
                            c = raw[pos];
                            pos = pos + 1;
                        }
                        if (((cast<u8>(c) < cast<u8>(32)) && (c != '\t')) || (c == 127)) {
                            return -1;
                        }
                    }
                    if (!closed) {
                        return -1;
                    }
                } else {
                    local value: long = pos;
                    loop ((pos < end) && HttpHeaders.token(raw[pos])) {
                        pos = pos + 1;
                    }
                    if (pos == value) {
                        return -1;
                    }
                }
            }
        }
        return size;
    }
    frame parse(raw: string, size: long) ret ChunkedBody {
        local result: ChunkedBody = ChunkedBody.new();
        if ((raw == nullptr) || (size < 0)) {
            result.error_code = 400;
            return result;
        }
        local pos: long = 0;
        local used: long = 0;
        local overhead: long = 0;
        local trailerStart: long = 0;
        loop {
            local end: long = pos;
            loop ((end < size) && (raw[end] != '\r')) {
                if (raw[end] == '\n') {
                    result.error_code = 400;
                    return result;
                }
                end = end + 1;
                if ((end - pos) > 1024) {
                    result.error_code = 400;
                    return result;
                }
            }
            if ((end + 1) >= size) {
                return result;
            }
            if (raw[end + 1] != '\n') {
                result.error_code = 400;
                return result;
            }
            local chunk: long = ChunkDecoder.length(raw, pos, end);
            if (chunk < 0) {
                if (chunk == -2) {
                    result.error_code = 413;
                } else {
                    result.error_code = 400;
                }
                return result;
            }
            overhead = ((overhead + end) - pos) + 2;
            if (overhead > 65536) {
                result.error_code = 413;
                return result;
            }
            pos = end + 2;
            if (chunk == 0) {
                trailerStart = pos;
                break;
            }
            if ((used + chunk) > 1048576) {
                result.error_code = 413;
                return result;
            }
            if ((chunk + 2) > (size - pos)) {
                return result;
            }
            if ((raw[pos + chunk] != '\r') || (raw[pos + chunk + 1] != '\n')) {
                result.error_code = 400;
                return result;
            }
            used = used + chunk;
            pos = pos + chunk + 2;
            overhead = overhead + 2;
        }
        loop {
            if ((pos + 1) >= size) {
                return result;
            }
            if ((raw[pos] == '\r') && (raw[pos + 1] == '\n')) {
                pos = pos + 2;
                break;
            }
            local end: long = pos;
            loop ((end < size) && (raw[end] != '\r')) {
                end = end + 1;
                if ((end - trailerStart) > 16384) {
                    result.error_code = 431;
                    return result;
                }
            }
            if ((end + 1) >= size) {
                return result;
            }
            if (raw[end + 1] != '\n') {
                result.error_code = 400;
                return result;
            }
            if (((end + 2) - trailerStart) > 16384) {
                result.error_code = 431;
                return result;
            }
            local colon: long = pos;
            loop ((colon < end) && HttpHeaders.token(raw[colon])) {
                colon = colon + 1;
            }
            if ((colon == pos) || (colon >= end) || (raw[colon] != ':')) {
                result.error_code = 400;
                return result;
            }
            # Validate and copy only after the complete message is present.
            local value: long = colon + 1;
            loop (value < end) {
                if (((cast<u8>(raw[value]) < cast<u8>(32)) && (raw[value] != '\t')) || (raw[value] == 127)) {
                    result.error_code = 400;
                    return result;
                }
                value = value + 1;
            }
            pos = end + 2;
        }
        if (((overhead + pos) - trailerStart) > 65536) {
            result.error_code = 413;
            return result;
        }
        local output: string = cast<string>(malloc(used + 1));
        if (output == nullptr) {
            result.destroy();
            throw "Chunked body allocation failed";
        }
        result.body = output;
        result.body_length = used;
        result.message_length = pos;
        local cursor: long = 0;
        local copied: long = 0;
        loop (cursor < trailerStart) {
            local end: long = cursor;
            loop (raw[end] != '\r') {
                end = end + 1;
            }
            local chunk: long = ChunkDecoder.length(raw, cursor, end);
            cursor = end + 2;
            if (chunk == 0) {
                break;
            }
            memcpy(cast<*void>(output + copied), cast<*void>(raw + cursor), chunk);
            copied = copied + chunk;
            cursor = cursor + chunk + 2;
        }
        output[used] = 0;
        cursor = trailerStart;
        loop ((cursor + 2) < pos) {
            local end: long = cursor;
            loop (raw[end] != '\r') {
                end = end + 1;
            }
            local colon: long = cursor;
            loop (raw[colon] != ':') {
                colon = colon + 1;
            }
            local key: string = cast<string>(malloc((colon - cursor) + 1));
            if (key == nullptr) {
                result.destroy();
                throw "Trailer allocation failed";
            }
            memcpy(cast<*void>(key), cast<*void>(raw + cursor), colon - cursor);
            key[colon - cursor] = 0;
            local lowered: string = HttpHeaders.lower(key);
            free(key);
            # Trailers cannot introduce framing, authentication, routing or representation metadata.
            if ((strcmp(lowered, "content-length") == 0) || (strcmp(lowered, "transfer-encoding") == 0) || (strcmp(lowered, "host") == 0) || (strcmp(lowered, "cookie") == 0) || (strcmp(lowered, "authorization") == 0) || (strcmp(lowered, "origin") == 0) || (strcmp(lowered, "x-csrf-token") == 0) || (strcmp(lowered, "content-type") == 0) || (strcmp(lowered, "content-encoding") == 0) || (strcmp(lowered, "connection") == 0) || (strcmp(lowered, "trailer") == 0) || (strcmp(lowered, "expect") == 0) || (strcmp(lowered, "set-cookie") == 0) || (strcmp(lowered, "www-authenticate") == 0) || (strcmp(lowered, "proxy-authenticate") == 0) || (strcmp(lowered, "proxy-authorization") == 0) || (strcmp(lowered, "authentication-info") == 0) || (strcmp(lowered, "content-range") == 0) || (strcmp(lowered, "content-location") == 0) || (strcmp(lowered, "content-language") == 0) || (strcmp(lowered, "content-disposition") == 0) || (strcmp(lowered, "cache-control") == 0) || (strcmp(lowered, "vary") == 0) || (strcmp(lowered, "range") == 0) || (strcmp(lowered, "if-match") == 0) || (strcmp(lowered, "if-none-match") == 0) || (strcmp(lowered, "if-modified-since") == 0) || (strcmp(lowered, "if-unmodified-since") == 0) || (strcmp(lowered, "if-range") == 0) || (strcmp(lowered, "te") == 0) || (strcmp(lowered, "keep-alive") == 0) || (strcmp(lowered, "upgrade") == 0)) {
                free(lowered);
                result.error_code = 400;
                return result;
            }
            local start: long = colon + 1;
            loop ((start < end) && ((raw[start] == ' ') || (raw[start] == '\t'))) {
                start = start + 1;
            }
            local finish: long = end;
            loop ((finish > start) && ((raw[finish - 1] == ' ') || (raw[finish - 1] == '\t'))) {
                finish = finish - 1;
            }
            local value: string = cast<string>(malloc((finish - start) + 1));
            if (value == nullptr) {
                free(lowered);
                result.destroy();
                throw "Trailer allocation failed";
            }
            memcpy(cast<*void>(value), cast<*void>(raw + start), finish - start);
            value[finish - start] = 0;
            try {
                result.trailers.append(lowered, value);
            } catch {
                free(lowered);
                free(value);
                result.destroy();
                throw "Trailer allocation failed";
            }
            free(lowered);
            free(value);
            cursor = end + 2;
        }
        result.valid = true;
        return result;
    }
}
