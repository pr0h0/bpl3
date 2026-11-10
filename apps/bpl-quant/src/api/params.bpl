# Request parameter parsing and validation.
#
# Params collects field errors instead of stopping at the first one, so a
# client gets every problem in one 422 response:
#   {"error":"validation failed","fields":[{"field":"vol","message":"..."}]}

import [Request], [Response] from "bpl-express";
import [Validator] from "bpl-validation";
import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";
import [Text], [ParsedFloat], [ParsedLong] from "../core/text.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonDoc], [JsonKind] from "../core/json_doc.bpl";

export [Params];
export [Page];

global const MAX_FIELD_ERRORS: int = 16;

struct Page {
    offset: int,
    limit: int,
}

struct Params {
    req: *Request,
    fields: string[16],
    messages: string[16],
    count: int,
    body: JsonDoc,
    has_body: bool,

    frame of(req: *Request) ret Params {
        local p: Params;
        p.req = req;
        p.count = 0;
        p.has_body = false;
        return p;
    }

    frame destroy(this: *Params) {
        if (this.has_body) {
            this.body.destroy();
            this.has_body = false;
        }
    }

    frame fail(this: *Params, field: string, message: string) {
        if (this.count < MAX_FIELD_ERRORS) {
            this.fields[this.count] = field;
            this.messages[this.count] = message;
            this.count = this.count + 1;
        }
    }

    frame ok(this: *Params) ret bool {
        return this.count == 0;
    }

    frame raw(this: *Params, name: string) ret string {
        local v: Option<string> = this.req.query.get(name);
        if (v.isSome()) {
            return v.unwrap();
        }
        if (this.has_body) {
            local node: int = this.body.get(this.body.root(), name);
            if (this.body.isKind(node, JsonKind.String)) {
                return this.body.str(node);
            }
        }
        return nullptr;
    }

    frame present(this: *Params, name: string) ret bool {
        if (this.req.query.get(name).isSome()) {
            return true;
        }
        return this.has_body && this.body.has(this.body.root(), name);
    }

    frame path(this: *Params, name: string) ret string {
        local v: Option<string> = this.req.getParam(name);
        if (v.isSome()) {
            return v.unwrap();
        }
        this.fail(name, "missing path parameter");
        return "";
    }

    frame str(this: *Params, name: string, fallback: string) ret string {
        local v: string = this.raw(name);
        return v == nullptr ? fallback : v;
    }

    frame requiredStr(this: *Params, name: string, max_len: int) ret string {
        local v: string = this.raw(name);
        if (Text.isEmpty(v)) {
            this.fail(name, "is required");
            return "";
        }
        if (Text.length(v) > max_len) {
            this.fail(name, "is too long");
        }
        return v;
    }

    # Number from the query string or a JSON body (numbers or numeric strings).
    frame num(this: *Params, name: string, fallback: float, lo: float, hi: float) ret float {
        local value: float = fallback;
        local found: bool = false;
        local q: Option<string> = this.req.query.get(name);
        if (q.isSome()) {
            local p: ParsedFloat = Text.parseFloat(q.unwrap());
            if (!p.ok) {
                this.fail(name, "must be a number");
                return fallback;
            }
            value = p.value;
            found = true;
        } else if (this.has_body) {
            local node: int = this.body.get(this.body.root(), name);
            if (node >= 0) {
                if (this.body.isKind(node, JsonKind.Number)) {
                    value = this.body.num(node, fallback);
                    found = true;
                } else {
                    this.fail(name, "must be a number");
                    return fallback;
                }
            }
        }
        if (found && !((value >= lo) && (value <= hi))) {
            this.fail(name, "is out of range");
        }
        return value;
    }

    frame requiredNum(this: *Params, name: string, lo: float, hi: float) ret float {
        if (!this.present(name)) {
            this.fail(name, "is required");
            return lo;
        }
        return this.num(name, lo, lo, hi);
    }

    # Integers go through bpl-validation so its error vocabulary is exercised.
    frame integer(this: *Params, name: string, fallback: int, lo: int, hi: int) ret int {
        local q: Option<string> = this.req.query.get(name);
        if (q.isSome()) {
            local v: Validator = Validator.new();
            local parsed: Option<int> = v.integer(name, q.unwrap(), lo, hi);
            local good: bool = v.ok();
            v.destroy();
            if (!good) {
                this.fail(name, "must be an integer in range");
                return fallback;
            }
            return parsed.unwrap();
        }
        if (this.has_body) {
            local node: int = this.body.get(this.body.root(), name);
            if (node >= 0) {
                local out: long = 0;
                if (!this.body.integer(node, &out) || (out < cast<long>(lo)) || (out > cast<long>(hi))) {
                    this.fail(name, "must be an integer in range");
                    return fallback;
                }
                return cast<int>(out);
            }
        }
        return fallback;
    }

    frame longInt(this: *Params, name: string, fallback: long, lo: long, hi: long) ret long {
        local q: Option<string> = this.req.query.get(name);
        if (q.isSome()) {
            local p: ParsedLong = Text.parseLong(q.unwrap());
            if (!p.ok || (p.value < lo) || (p.value > hi)) {
                this.fail(name, "must be an integer in range");
                return fallback;
            }
            return p.value;
        }
        if (this.has_body) {
            local node: int = this.body.get(this.body.root(), name);
            if (node >= 0) {
                local out: long = 0;
                if (!this.body.integer(node, &out) || (out < lo) || (out > hi)) {
                    this.fail(name, "must be an integer in range");
                    return fallback;
                }
                return out;
            }
        }
        return fallback;
    }

    frame flag(this: *Params, name: string, fallback: bool) ret bool {
        local q: Option<string> = this.req.query.get(name);
        if (q.isSome()) {
            local s: string = q.unwrap();
            if (Text.equals(s, "1") || Text.equalsIgnoreCase(s, "true") || Text.equalsIgnoreCase(s, "yes")) {
                return true;
            }
            if (Text.equals(s, "0") || Text.equalsIgnoreCase(s, "false") || Text.equalsIgnoreCase(s, "no")) {
                return false;
            }
            this.fail(name, "must be a boolean");
            return fallback;
        }
        if (this.has_body) {
            local node: int = this.body.get(this.body.root(), name);
            if (node >= 0) {
                if (!this.body.isKind(node, JsonKind.Bool)) {
                    this.fail(name, "must be a boolean");
                    return fallback;
                }
                return this.body.boolean(node, fallback);
            }
        }
        return fallback;
    }

    frame symbol(this: *Params, name: string) ret string {
        local v: string = this.raw(name);
        if (v == nullptr) {
            this.fail(name, "is required");
            return "";
        }
        if (!Text.isSymbol(v)) {
            this.fail(name, "must be 1-12 uppercase letters, digits, '.' or '-'");
        }
        return v;
    }

    frame oneOf(this: *Params, name: string, fallback: string, options: *string, count: int) ret string {
        local v: string = this.raw(name);
        if (v == nullptr) {
            return fallback;
        }
        loop (local i: int = 0; i < count; i = i + 1) {
            if (Text.equalsIgnoreCase(v, options[i])) {
                return options[i];
            }
        }
        this.fail(name, "has an unsupported value");
        return fallback;
    }

    frame page(this: *Params, default_limit: int, max_limit: int) ret Page {
        local limit: int = this.integer("limit", default_limit, 1, max_limit);
        local offset: int = this.integer("offset", 0, 0, 100000000);
        return Page { offset: offset, limit: limit };
    }

    # Parses a JSON body; records an error for non-JSON or non-object bodies.
    frame parseBody(this: *Params, max_bytes: long) ret bool {
        if ((this.req.body == nullptr) || (this.req.body_length == 0)) {
            this.fail("body", "JSON object required");
            return false;
        }
        if (this.req.body_length > max_bytes) {
            this.fail("body", "too large");
            return false;
        }
        if (Text.length(this.req.body) != cast<int>(this.req.body_length)) {
            this.fail("body", "must be text JSON");
            return false;
        }
        this.body = JsonDoc.parse(this.req.body);
        this.has_body = true;
        if (!this.body.ok()) {
            this.fail("body", this.body.error);
            return false;
        }
        if (!this.body.isKind(this.body.root(), JsonKind.Object)) {
            this.fail("body", "must be a JSON object");
            return false;
        }
        return true;
    }

    frame writeErrors(this: *Params, w: *JsonWriter) {
        w.beginObject();
        w.fieldStr("error", "validation failed");
        w.key("fields").beginArray();
        loop (local i: int = 0; i < this.count; i = i + 1) {
            w.beginObject();
            w.fieldStr("field", this.fields[i]);
            w.fieldStr("message", this.messages[i]);
            w.endObject();
        }
        w.endArray();
        w.endObject();
    }

    # Sends 422 (or 400 for body errors) and returns true when validation failed.
    frame reject(this: *Params, res: *Response) ret bool {
        if (this.ok()) {
            return false;
        }
        local w: JsonWriter = JsonWriter.new(256);
        this.writeErrors(&w);
        local status: int = Text.equals(this.fields[0], "body") ? 400 : 422;
        res.status(status).json(w.toString());
        w.destroy();
        return true;
    }
}
