import [Request], [Response], [HttpMethod] from "bpl-express";
import [HttpHeaders], [HttpParser] from "bpl-http-parser";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [Option] from "std/option.bpl";
import [StringBuilder] from "std/string_builder.bpl";
extern strlen(text: string) ret long;
extern strcmp(a: string, b: string) ret int;
extern strncmp(a: string, b: string, count: ulong) ret int;
extern free(ptr: string);
extern sprintf(out: string, fmt: string, ...) ret int;
export [Cors];
export cors;
export vary;
frame corsSlice(text: string, start: long, count: long) ret String {
    local result: String;
    result.data = HttpParser.copy(text, start, count);
    result.length = cast<int>(count);
    return result;
}
frame vary(res: *Response, name: string) {
    local existing: Option<string> = res.headers.get("vary");
    if (!existing.isSome()) {
        res.setHeader("Vary", name);
        return;
    }
    local value: string = existing.unwrap();
    local size: long = strlen(value);
    local pos: long = 0;
    loop (pos < size) {
        local end: long = pos;
        loop ((end < size) && (value[end] != ',')) {
            end = end + 1;
        }
        local start: long = pos;
        loop ((start < end) && ((value[start] == ' ') || (value[start] == '\t'))) {
            start = start + 1;
        }
        local finish: long = end;
        loop ((finish > start) && ((value[finish - 1] == ' ') || (value[finish - 1] == '\t'))) {
            finish = finish - 1;
        }
        local token: String = corsSlice(value, start, finish - start);
        local matches: bool = Response.equalHeader(token.data, name) || (strcmp(token.data, "*") == 0);
        token.destroy();
        if (matches) {
            return;
        }
        pos = end + 1;
    }
    local joined: StringBuilder = StringBuilder.new(64);
    local joinedOwner: *StringBuilder = &joined;
    defer joinedOwner.destroy();
    joined.append(value);
    joined.append(", ");
    joined.append(name);
    res.setHeader("Vary", joined.toString());
}
frame listJoin(values: *Array<String>) ret String {
    local result: StringBuilder = StringBuilder.new(64);
    local owner: *StringBuilder = &result;
    defer owner.destroy();
    loop (local i: int = 0; i < values.len(); i = i + 1) {
        if (i > 0) {
            result.append(", ");
        }
        local value: String = values.get(i);
        result.append(value.data);
    }
    return String.new(result.toString());
}
frame listDestroy(values: *Array<String>) {
    loop (local i: int = 0; i < values.len(); i = i + 1) {
        local value: String = values.get(i);
        value.destroy();
    }
    values.destroy();
}
frame listAdd(values: *Array<String>, value: string) {
    local item: String = String.new(value);
    try {
        values.push(item);
    } catch {
        item.destroy();
        throw "CORS allocation failed";
    }
}
frame listHas(values: *Array<String>, value: string) ret bool {
    loop (local i: int = 0; i < values.len(); i = i + 1) {
        local item: String = values.get(i);
        if (strcmp(item.data, value) == 0) {
            return true;
        }
    }
    return false;
}
struct Cors {
    origins: Array<String>,
    methods: Array<String>,
    allowed_headers: Array<String>,
    exposed_headers: Array<String>,
    credentials: bool,
    max_age: int,
    frame new(origin: string) ret Cors {
        local result: Cors;
        result.origins = Array<String>.new(0);
        result.methods = Array<String>.new(0);
        result.allowed_headers = Array<String>.new(0);
        result.exposed_headers = Array<String>.new(0);
        result.credentials = false;
        result.max_age = 600;
        local owner: *Cors = &result;
        local complete: bool = false;
        local ready: *bool = &complete;
        defer {
            if (!*ready) {
                owner.destroy();
            }
        }
        result.allowOrigin(origin);
        result.allowMethod("GET");
        result.allowMethod("HEAD");
        result.allowMethod("POST");
        result.allowMethod("PUT");
        result.allowMethod("PATCH");
        result.allowMethod("DELETE");
        result.allowMethod("OPTIONS");
        result.allowHeader("Content-Type");
        result.allowHeader("Authorization");
        result.allowHeader("X-CSRF-Token");
        complete = true;
        return result;
    }
    frame allowOrigin(this: *Cors, origin: string) {
        if ((origin == nullptr) || (strlen(origin) > 2048) || ((strncmp(origin, "http://", 7) != 0) && (strncmp(origin, "https://", 8) != 0))) {
            throw "CORS requires an explicit HTTP origin";
        }
        HttpHeaders.validate(origin);
        if (!listHas(&this.origins, origin)) {
            listAdd(&this.origins, origin);
        }
    }
    frame allowMethod(this: *Cors, method: string) {
        local lower: string = HttpHeaders.lower(method);
        free(lower);
        if (!listHas(&this.methods, method)) {
            listAdd(&this.methods, method);
        }
    }
    frame allowHeader(this: *Cors, name: string) {
        local lower: string = HttpHeaders.lower(name);
        defer free(lower);
        if (!listHas(&this.allowed_headers, lower)) {
            listAdd(&this.allowed_headers, lower);
        }
    }
    frame exposeHeader(this: *Cors, name: string) {
        local lower: string = HttpHeaders.lower(name);
        defer free(lower);
        if (!listHas(&this.exposed_headers, lower)) {
            listAdd(&this.exposed_headers, lower);
        }
    }
    frame apply(this: *Cors, req: *Request, res: *Response) {
        if ((this.max_age < 0) || (this.max_age > 86400)) {
            throw "CORS max age must be 0 to 86400 seconds";
        }
        vary(res, "Origin");
        local origin: Option<string> = req.header("origin");
        if (!origin.isSome()) {
            return;
        }
        if (!listHas(&this.origins, origin.unwrap())) {
            res.status(403).json("{\"error\":\"origin denied\"}");
            return;
        }
        local requested: Option<string> = req.header("access-control-request-method");
        if ((req.method == HttpMethod.OPTIONS) && requested.isSome()) {
            vary(res, "Access-Control-Request-Method");
            vary(res, "Access-Control-Request-Headers");
            if (!listHas(&this.methods, requested.unwrap())) {
                res.status(403).json("{\"error\":\"CORS method denied\"}");
                return;
            }
            local headers: Option<string> = req.header("access-control-request-headers");
            if (headers.isSome()) {
                local raw: string = headers.unwrap();
                local size: long = strlen(raw);
                local pos: long = 0;
                if (size == 0) {
                    res.status(403).json("{\"error\":\"CORS header denied\"}");
                    return;
                }
                loop (pos < size) {
                    local end: long = pos;
                    loop ((end < size) && (raw[end] != ',')) {
                        end = end + 1;
                    }
                    local start: long = pos;
                    loop ((start < end) && ((raw[start] == ' ') || (raw[start] == '\t'))) {
                        start = start + 1;
                    }
                    local finish: long = end;
                    loop ((finish > start) && ((raw[finish - 1] == ' ') || (raw[finish - 1] == '\t'))) {
                        finish = finish - 1;
                    }
                    local name: String = corsSlice(raw, start, finish - start);
                    local owner: *String = &name;
                    defer owner.destroy();
                    local allowed: bool = false;
                    try {
                        local lower: string = HttpHeaders.lower(name.data);
                        allowed = listHas(&this.allowed_headers, lower);
                        free(lower);
                    } catch {
                    }
                    name.destroy();
                    if (!allowed || (end == (size - 1))) {
                        res.status(403).json("{\"error\":\"CORS header denied\"}");
                        return;
                    }
                    pos = end + 1;
                }
            }
            res.setHeader("Access-Control-Allow-Origin", origin.unwrap());
            if (this.credentials) {
                res.setHeader("Access-Control-Allow-Credentials", "true");
            }
            local methods: String = listJoin(&this.methods);
            local methodsOwner: *String = &methods;
            defer methodsOwner.destroy();
            res.setHeader("Access-Control-Allow-Methods", methods.data);
            local allowHeaders: String = listJoin(&this.allowed_headers);
            local headersOwner: *String = &allowHeaders;
            defer headersOwner.destroy();
            res.setHeader("Access-Control-Allow-Headers", allowHeaders.data);
            local number: char[32];
            sprintf(cast<string>(&number[0]), "%d", this.max_age);
            res.setHeader("Access-Control-Max-Age", cast<string>(&number[0]));
            res.status(204).end();
            return;
        }
        res.setHeader("Access-Control-Allow-Origin", origin.unwrap());
        if (this.credentials) {
            res.setHeader("Access-Control-Allow-Credentials", "true");
        }
        if (this.exposed_headers.len() > 0) {
            local exposed: String = listJoin(&this.exposed_headers);
            local owner: *String = &exposed;
            defer owner.destroy();
            res.setHeader("Access-Control-Expose-Headers", exposed.data);
        }
    }
    frame destroy(this: *Cors) {
        listDestroy(&this.origins);
        listDestroy(&this.methods);
        listDestroy(&this.allowed_headers);
        listDestroy(&this.exposed_headers);
    }
}
frame cors(req: *Request, res: *Response, allowedOrigin: string) {
    local policy: Cors = Cors.new(allowedOrigin);
    local owner: *Cors = &policy;
    defer owner.destroy();
    policy.apply(req, res);
}
