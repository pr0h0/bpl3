import [Map], [MapNode] from "std/map.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [String] from "std/string.bpl";
import [JSON] from "std/json.bpl";
extern strlen(text: string) ret long;
extern strcmp(a: string, b: string) ret int;
export [Validator];

struct Validator {
    errors: Map<string, string>,
    frame new() ret Validator {
        local v: Validator;
        v.errors = Map<string, string>.new();
        return v;
    }
    frame fail(this: *Validator, field: string, reason: string) {
        if (!this.errors.has(field)) {
            this.errors.set(field, reason);
        }
    }
    frame required(this: *Validator, field: string, value: string) ret *Validator {
        if ((value == nullptr) || (value[0] == 0)) {
            this.fail(field, "required");
        }
        return this;
    }
    # Byte length, not Unicode code points.
    frame length(this: *Validator, field: string, value: string, min: int, max: int) ret *Validator {
        if ((min < 0) || (max < min)) {
            throw "Invalid validation length bounds";
        }
        if (value == nullptr) {
            this.fail(field, "required");
            return this;
        }
        local size: long = strlen(value);
        if ((size < cast<long>(min)) || (size > cast<long>(max))) {
            this.fail(field, "length");
        }
        return this;
    }
    # Strict decimal int32; no whitespace, plus sign, truncation, or overflow.
    frame integer(this: *Validator, field: string, value: string, min: int, max: int) ret Option<int> {
        if (max < min) {
            throw "Invalid validation numeric bounds";
        }
        if ((value == nullptr) || (value[0] == 0)) {
            this.fail(field, "integer");
            return Option<int>.None;
        }
        local negative: bool = value[0] == '-';
        local i: int = 0;
        if (negative) {
            i = 1;
        }
        if (value[i] == 0) {
            this.fail(field, "integer");
            return Option<int>.None;
        }
        local total: long = 0;
        loop (value[i] != 0) {
            if ((value[i] < '0') || (value[i] > '9')) {
                this.fail(field, "integer");
                return Option<int>.None;
            }
            total = (total * 10) + cast<long>(value[i] - '0');
            if (total > 2147483648) {
                this.fail(field, "integer");
                return Option<int>.None;
            }
            i = i + 1;
        }
        if (negative) {
            total = -total;
        }
        if ((total < cast<long>(min)) || (total > cast<long>(max))) {
            this.fail(field, "range");
            return Option<int>.None;
        }
        return Option<int>.Some(cast<int>(total));
    }
    frame oneOf(this: *Validator, field: string, value: string, allowed: *Array<string>) ret *Validator {
        if ((value == nullptr) || (allowed == nullptr)) {
            this.fail(field, "choice");
            return this;
        }
        # Prefer integer/length rules for untrusted numeric input.
        loop (local i: int = 0; i < allowed.len(); i = i + 1) {
            if (strcmp(allowed.get(i), value) == 0) {
                return this;
            }
        }
        this.fail(field, "choice");
        return this;
    }
    frame ok(this: *Validator) ret bool {
        return this.errors.count == 0;
    }
    frame json(this: *Validator) ret String {
        local sb: StringBuilder = StringBuilder.new(128);
        local owner: *StringBuilder = &sb;
        defer owner.destroy();
        sb.append("{\"errors\":{");
        local first: bool = true;
        loop (local i: int = 0; i < this.errors.buckets.len(); i = i + 1) {
            local node: *MapNode<string, string> = this.errors.buckets.get(i);
            loop (node != nullptr) {
                if (!first) {
                    sb.append(",");
                }
                first = false;
                local field: String = JSON.stringify<string>(&node.key);
                sb.append(field.data);
                field.destroy();
                sb.append(":");
                local reason: String = JSON.stringify<string>(&node.value);
                sb.append(reason.data);
                reason.destroy();
                node = node.next;
            }
        }
        sb.append("}}");
        return String.new(sb.toString());
    }
    # Field names/reasons are borrowed through destruction.
    frame destroy(this: *Validator) {
        this.errors.destroy();
    }
}
