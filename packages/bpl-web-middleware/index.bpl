import [Request], [Response], [HttpMethod] from "bpl-express";
import [HttpParser], releaseStrings from "bpl-http-parser";
import [Map], [MapNode] from "std/map.bpl";
import [Array] from "std/array.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [Option] from "std/option.bpl";
extern strcmp(a: string, b: string) ret int;
extern strlen(text: string) ret long;
export securityHeaders;
export requireJson;
export cors;
export [Form];

frame securityHeaders(_req: *Request, res: *Response) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
}
frame requireJson(req: *Request, res: *Response) {
    local media: Option<string> = req.header("content-type");
    if (!media.isSome()) {
        res.status(415).json("{\"error\":\"application/json required\"}");
        return;
    }
    local value: string = media.unwrap();
    local len: long = strlen(value);
    local matches: bool = true;
    local expected: string = "application/json";
    loop (local i: int = 0; (i < 16) && (cast<long>(i) < len); i = i + 1) {
        local c: char = value[i];
        if ((c >= 'A') && (c <= 'Z')) {
            c = c + cast<char>(32);
        }
        if (c != expected[i]) {
            matches = false;
        }
    }
    if ((len < 16) || !matches) {
        res.status(415).json("{\"error\":\"application/json required\"}");
        return;
    }
    local end: long = 16;
    loop ((end < len) && ((value[end] == ' ') || (value[end] == '\t'))) {
        end = end + 1;
    }
    if ((end < len) && (value[end] != ';')) {
        res.status(415).json("{\"error\":\"application/json required\"}");
    }
}
import [Cors], cors, vary from "./cors.bpl";
export [Cors];
export vary;

struct Form {
    fields: Map<string, string>,
    frame parse(body: string, bytes: long) ret Form {
        if ((body == nullptr) || (bytes < 0) || (bytes > 1048576) || (strlen(body) != bytes)) {
            throw "Form requires a bounded text body";
        }
        local form: Form;
        form.fields = Map<string, string>.new();
        if (!HttpParser.parseQuery(body, &form.fields)) {
            form.destroy();
            throw "Invalid form encoding";
        }
        return form;
    }
    frame get(this: *Form, key: string) ret Option<string> {
        return this.fields.get(key);
    }
    frame destroy(this: *Form) {
        releaseStrings(&this.fields);
    }
}

import [AccessLog], requestId, accessLog from "./logging.bpl";
export [AccessLog];
export requestId;
export accessLog;
