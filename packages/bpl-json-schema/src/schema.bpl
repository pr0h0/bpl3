# JSON Schema (draft 2020-12 subset) validation over bpl-json values.

import [Json], [JsonValue], [JsonKind], [JsonError] from "bpl-json";
import [Array] from "std/array.bpl";
import [Regex] from "std/regex.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;
extern strcmp(a: string, b: string) ret int;
extern strncmp(a: string, b: string, n: ulong) ret int;
extern fmod(a: double, b: double) ret double;
extern fabs(a: double) ret double;

export [JsonSchema];
export [SchemaError];
export [SchemaResult];

frame schemaCopy(text: string) ret string {
    local length: long = strlen(text);
    local copy: string = cast<string>(malloc(length + 1));
    if (copy == nullptr) {
        throw "JSON schema allocation failed";
    }
    loop (local i: long = 0; i <= length; i = i + 1) {
        copy[i] = text[i];
    }
    return copy;
}

struct SchemaError {
    # JSON Pointer to the failing instance location ("" is the root); owned.
    path: string,
    # Schema keyword that failed (static).
    keyword: string,
    # Human-readable description; owned.
    message: string,
}

struct SchemaResult {
    errors: Array<SchemaError>,
    frame new() ret SchemaResult {
        local result: SchemaResult;
        result.errors = Array<SchemaError>.new(0);
        return result;
    }
    frame ok(this: *SchemaResult) ret bool {
        return this.errors.len() == 0;
    }
    frame count(this: *SchemaResult) ret int {
        return this.errors.len();
    }
    frame get(this: *SchemaResult, index: int) ret SchemaError {
        return this.errors.get(index);
    }
    # True when some error is reported at `path` (exact JSON Pointer).
    frame hasErrorAt(this: *SchemaResult, path: string, keyword: string) ret bool {
        loop (local i: int = 0; i < this.errors.len(); i = i + 1) {
            local error: SchemaError = this.errors.get(i);
            if ((strcmp(error.path, path) == 0) && ((keyword == nullptr) || (strcmp(error.keyword, keyword) == 0))) {
                return true;
            }
        }
        return false;
    }
    # {"errors":[{"path":"/a","keyword":"type","message":"..."}]}
    frame json(this: *SchemaResult) ret String {
        local list: *JsonValue = JsonValue.newArray();
        loop (local i: int = 0; i < this.errors.len(); i = i + 1) {
            local error: SchemaError = this.errors.get(i);
            local item: *JsonValue = JsonValue.newObject();
            item.setString("path", error.path).setString("keyword", error.keyword).setString("message", error.message);
            list.push(item);
        }
        local root: *JsonValue = JsonValue.newObject();
        root.set("errors", list);
        local text: String = root.stringify();
        root.destroy();
        return text;
    }
    frame destroy(this: *SchemaResult) {
        loop (local i: int = 0; i < this.errors.len(); i = i + 1) {
            local error: SchemaError = this.errors.get(i);
            free(error.path);
            free(error.message);
        }
        this.errors.destroy();
    }
}

struct CompiledPattern {
    node: *JsonValue,
    regex: Regex,
}

struct JsonSchema {
    # Owned schema document.
    root: *JsonValue,
    # Owned compile problem, or nullptr when the schema is usable.
    problem: string,
    patterns: Array<CompiledPattern>,
    max_errors: int,

    # Parses and checks a schema. Inspect valid()/problem before validating.
    frame compile(text: string) ret JsonSchema {
        local error: JsonError = JsonError.none();
        local root: *JsonValue = Json.parseChecked(text, &error);
        if (root == nullptr) {
            local schema: JsonSchema = JsonSchema.empty();
            local message: StringBuilder = StringBuilder.new(64);
            message.append("schema is not valid JSON: ");
            message.append(error.message);
            schema.problem = schemaCopy(message.toString());
            message.destroy();
            return schema;
        }
        return JsonSchema.adopt(root);
    }
    # Takes ownership of an already parsed schema document.
    frame adopt(root: *JsonValue) ret JsonSchema {
        local schema: JsonSchema = JsonSchema.empty();
        schema.root = root;
        local path: StringBuilder = StringBuilder.new(32);
        local owner: *StringBuilder = &path;
        defer owner.destroy();
        local problem: string = schema.check(root, &path, 0);
        if (problem != nullptr) {
            local message: StringBuilder = StringBuilder.new(64);
            message.append(problem);
            message.append(" at #");
            message.append(path.toString());
            schema.problem = schemaCopy(message.toString());
            message.destroy();
        }
        return schema;
    }
    frame empty() ret JsonSchema {
        local schema: JsonSchema;
        schema.root = nullptr;
        schema.problem = nullptr;
        schema.patterns = Array<CompiledPattern>.new(0);
        schema.max_errors = 100;
        return schema;
    }
    frame valid(this: *JsonSchema) ret bool {
        return (this.problem == nullptr) && (this.root != nullptr);
    }
    # Stop collecting after `limit` errors (1 to 10000; default 100).
    frame setMaxErrors(this: *JsonSchema, limit: int) {
        if ((limit < 1) || (limit > 10000)) {
            throw "Schema error limit must be 1 to 10000";
        }
        this.max_errors = limit;
    }
    frame destroy(this: *JsonSchema) {
        loop (local i: int = 0; i < this.patterns.len(); i = i + 1) {
            local compiled: *CompiledPattern = this.patterns.getRef(i);
            compiled.regex.destroy();
        }
        this.patterns.destroy();
        if (this.root != nullptr) {
            this.root.destroy();
        }
        this.root = nullptr;
        free(this.problem);
        this.problem = nullptr;
    }

    # ---- schema checking -------------------------------------------------

    frame isNonNegativeInteger(value: *JsonValue) ret bool {
        return (value != nullptr) && value.isInteger() && (value.asNumber(-1.0) >= 0.0);
    }
    frame knownType(name: string) ret bool {
        local names: string[7] = ["null", "boolean", "object", "array", "number", "string", "integer"];
        loop (local i: int = 0; i < 7; i = i + 1) {
            if (strcmp(names[i], name) == 0) {
                return true;
            }
        }
        return false;
    }
    frame pushSegment(path: *StringBuilder, segment: string) {
        path.appendChar('/');
        loop (local i: int = 0; segment[i] != 0; i = i + 1) {
            if (segment[i] == '~') {
                path.append("~0");
            } else if (segment[i] == '/') {
                path.append("~1");
            } else {
                path.appendChar(segment[i]);
            }
        }
    }
    frame truncate(path: *StringBuilder, length: int) {
        path.length = length;
        path.buffer[length] = 0;
    }
    frame checkChild(this: *JsonSchema, child: *JsonValue, path: *StringBuilder, segment: string, depth: int) ret string {
        local mark: int = path.len();
        JsonSchema.pushSegment(path, segment);
        local problem: string = this.check(child, path, depth + 1);
        if (problem == nullptr) {
            JsonSchema.truncate(path, mark);
        }
        return problem;
    }
    frame checkSchemaList(this: *JsonSchema, list: *JsonValue, path: *StringBuilder, depth: int) ret string {
        if (!list.isArray() || (list.len() == 0)) {
            return "expected a non-empty array of schemas";
        }
        loop (local i: int = 0; i < list.len(); i = i + 1) {
            local mark: int = path.len();
            path.appendChar('/');
            path.appendInt(i);
            local problem: string = this.check(list.at(i), path, depth + 1);
            if (problem != nullptr) {
                return problem;
            }
            JsonSchema.truncate(path, mark);
        }
        return nullptr;
    }
    frame checkSchemaMap(this: *JsonSchema, map: *JsonValue, path: *StringBuilder, depth: int) ret string {
        if (!map.isObject()) {
            return "expected an object of schemas";
        }
        loop (local i: int = 0; i < map.len(); i = i + 1) {
            local problem: string = this.checkChild(map.at(i), path, map.keyAt(i), depth);
            if (problem != nullptr) {
                return problem;
            }
        }
        return nullptr;
    }
    # Returns a static problem description (and leaves `path` at the
    # offending keyword), or nullptr when the schema is supported.
    frame check(this: *JsonSchema, node: *JsonValue, path: *StringBuilder, depth: int) ret string {
        if (depth > 64) {
            return "schema nesting too deep";
        }
        if (node.isBool()) {
            return nullptr;
        }
        if (!node.isObject()) {
            return "schema must be an object or boolean";
        }
        loop (local i: int = 0; i < node.len(); i = i + 1) {
            local key: string = node.keyAt(i);
            local value: *JsonValue = node.at(i);
            local mark: int = path.len();
            JsonSchema.pushSegment(path, key);
            local problem: string = this.checkKeyword(key, value, path, depth);
            if (problem != nullptr) {
                return problem;
            }
            JsonSchema.truncate(path, mark);
        }
        return nullptr;
    }
    frame checkKeyword(this: *JsonSchema, key: string, value: *JsonValue, path: *StringBuilder, depth: int) ret string {
        local annotations: string[12] = ["$schema", "$id", "$comment", "$anchor", "title", "description", "default", "examples", "deprecated", "readOnly", "writeOnly", "contentMediaType"];
        loop (local i: int = 0; i < 12; i = i + 1) {
            if (strcmp(annotations[i], key) == 0) {
                return nullptr;
            }
        }
        if (strcmp(key, "type") == 0) {
            if (value.isString()) {
                if (!JsonSchema.knownType(value.text)) {
                    return "unknown type name";
                }
                return nullptr;
            }
            if (!value.isArray() || (value.len() == 0)) {
                return "type must be a name or a non-empty array of names";
            }
            loop (local i: int = 0; i < value.len(); i = i + 1) {
                local name: *JsonValue = value.at(i);
                if (!name.isString() || !JsonSchema.knownType(name.text)) {
                    return "unknown type name";
                }
            }
            return nullptr;
        }
        if (strcmp(key, "enum") == 0) {
            if (!value.isArray() || (value.len() == 0)) {
                return "enum must be a non-empty array";
            }
            return nullptr;
        }
        if (strcmp(key, "const") == 0) {
            return nullptr;
        }
        if ((strcmp(key, "properties") == 0) || (strcmp(key, "$defs") == 0) || (strcmp(key, "definitions") == 0) || (strcmp(key, "patternProperties") == 0)) {
            local problem: string = this.checkSchemaMap(value, path, depth);
            if ((problem == nullptr) && (strcmp(key, "patternProperties") == 0)) {
                loop (local i: int = 0; i < value.len(); i = i + 1) {
                    if (!this.compilePattern(value.at(i), value.keyAt(i))) {
                        return "invalid regular expression";
                    }
                }
            }
            return problem;
        }
        if ((strcmp(key, "additionalProperties") == 0) || (strcmp(key, "items") == 0) || (strcmp(key, "not") == 0) || (strcmp(key, "if") == 0) || (strcmp(key, "then") == 0) || (strcmp(key, "else") == 0) || (strcmp(key, "contains") == 0) || (strcmp(key, "propertyNames") == 0)) {
            return this.check(value, path, depth + 1);
        }
        if ((strcmp(key, "allOf") == 0) || (strcmp(key, "anyOf") == 0) || (strcmp(key, "oneOf") == 0) || (strcmp(key, "prefixItems") == 0)) {
            return this.checkSchemaList(value, path, depth);
        }
        if (strcmp(key, "required") == 0) {
            if (!value.isArray()) {
                return "required must be an array of strings";
            }
            loop (local i: int = 0; i < value.len(); i = i + 1) {
                if (!value.at(i).isString()) {
                    return "required must be an array of strings";
                }
            }
            return nullptr;
        }
        if (strcmp(key, "dependentRequired") == 0) {
            if (!value.isObject()) {
                return "dependentRequired must be an object of string arrays";
            }
            loop (local i: int = 0; i < value.len(); i = i + 1) {
                local names: *JsonValue = value.at(i);
                if (!names.isArray()) {
                    return "dependentRequired must be an object of string arrays";
                }
                loop (local j: int = 0; j < names.len(); j = j + 1) {
                    if (!names.at(j).isString()) {
                        return "dependentRequired must be an object of string arrays";
                    }
                }
            }
            return nullptr;
        }
        local counts: string[8] = ["minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties", "minContains", "maxContains"];
        loop (local i: int = 0; i < 8; i = i + 1) {
            if (strcmp(counts[i], key) == 0) {
                if (!JsonSchema.isNonNegativeInteger(value)) {
                    return "expected a non-negative integer";
                }
                return nullptr;
            }
        }
        local bounds: string[4] = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"];
        loop (local i: int = 0; i < 4; i = i + 1) {
            if (strcmp(bounds[i], key) == 0) {
                if (!value.isNumber()) {
                    return "expected a number";
                }
                return nullptr;
            }
        }
        if (strcmp(key, "multipleOf") == 0) {
            if (!value.isNumber() || (value.number <= 0.0)) {
                return "multipleOf must be a positive number";
            }
            return nullptr;
        }
        if (strcmp(key, "uniqueItems") == 0) {
            if (!value.isBool()) {
                return "uniqueItems must be a boolean";
            }
            return nullptr;
        }
        if (strcmp(key, "pattern") == 0) {
            if (!value.isString()) {
                return "pattern must be a string";
            }
            if (!this.compilePattern(value, value.text)) {
                return "invalid regular expression";
            }
            return nullptr;
        }
        if (strcmp(key, "format") == 0) {
            if (!value.isString()) {
                return "format must be a string";
            }
            local formats: string[6] = ["email", "date", "date-time", "uuid", "ipv4", "uri"];
            loop (local i: int = 0; i < 6; i = i + 1) {
                if (strcmp(formats[i], value.text) == 0) {
                    return nullptr;
                }
            }
            return "unsupported format";
        }
        if (strcmp(key, "$ref") == 0) {
            if (!value.isString()) {
                return "$ref must be a string";
            }
            if (this.resolve(value.text) == nullptr) {
                return "$ref must point inside this document (#, #/$defs/name)";
            }
            return nullptr;
        }
        return "unsupported schema keyword";
    }
    frame compilePattern(this: *JsonSchema, node: *JsonValue, pattern: string) ret bool {
        local compiled: CompiledPattern;
        compiled.node = node;
        try {
            compiled.regex = Regex.compile(pattern);
        } catch {
            return false;
        }
        this.patterns.push(compiled);
        return true;
    }
    frame patternFor(this: *JsonSchema, node: *JsonValue) ret *Regex {
        loop (local i: int = 0; i < this.patterns.len(); i = i + 1) {
            local compiled: *CompiledPattern = this.patterns.getRef(i);
            if (compiled.node == node) {
                return &compiled.regex;
            }
        }
        throw "JSON schema pattern was not compiled";
        return nullptr;
    }
    # Resolves "#" or a "#/a/b" JSON Pointer against the root.
    frame resolve(this: *JsonSchema, reference: string) ret *JsonValue {
        if ((reference[0] != '#') || ((reference[1] != 0) && (reference[1] != '/'))) {
            return nullptr;
        }
        local current: *JsonValue = this.root;
        local i: long = 1;
        loop ((current != nullptr) && (reference[i] == '/')) {
            i = i + 1;
            local segment: StringBuilder = StringBuilder.new(16);
            loop ((reference[i] != 0) && (reference[i] != '/')) {
                if ((reference[i] == '~') && (reference[i + 1] == '0')) {
                    segment.appendChar('~');
                    i = i + 2;
                } else if ((reference[i] == '~') && (reference[i + 1] == '1')) {
                    segment.appendChar('/');
                    i = i + 2;
                } else {
                    segment.appendChar(reference[i]);
                    i = i + 1;
                }
            }
            if (current.isArray()) {
                local index: int = 0;
                local text: string = segment.toString();
                local valid: bool = text[0] != 0;
                loop (local j: int = 0; text[j] != 0; j = j + 1) {
                    if ((text[j] < '0') || (text[j] > '9') || (index > 100000)) {
                        valid = false;
                        break;
                    }
                    index = (index * 10) + cast<int>(text[j] - '0');
                }
                if (valid) {
                    current = current.at(index);
                } else {
                    current = nullptr;
                }
            } else {
                current = current.get(segment.toString());
            }
            segment.destroy();
        }
        if ((current == nullptr) || (reference[i] != 0)) {
            return nullptr;
        }
        if (!current.isObject() && !current.isBool()) {
            return nullptr;
        }
        return current;
    }

    # ---- validation ------------------------------------------------------

    frame validate(this: *JsonSchema, instance: *JsonValue) ret SchemaResult {
        if (!this.valid()) {
            throw "Cannot validate with an invalid JSON schema";
        }
        if (instance == nullptr) {
            throw "Cannot validate a missing JSON value";
        }
        local result: SchemaResult = SchemaResult.new();
        local path: StringBuilder = StringBuilder.new(32);
        local owner: *StringBuilder = &path;
        defer owner.destroy();
        this.run(this.root, instance, &path, &result, 0);
        return result;
    }
    # Parses and validates text; a parse failure is reported as keyword "json".
    frame validateText(this: *JsonSchema, text: string) ret SchemaResult {
        local error: JsonError = JsonError.none();
        local instance: *JsonValue = Json.parseChecked(text, &error);
        if (instance == nullptr) {
            local result: SchemaResult = SchemaResult.new();
            JsonSchema.addError(&result, "", "json", error.message);
            return result;
        }
        local result: SchemaResult = this.validate(instance);
        instance.destroy();
        return result;
    }
    frame isValid(this: *JsonSchema, instance: *JsonValue) ret bool {
        local result: SchemaResult = this.validate(instance);
        local ok: bool = result.ok();
        result.destroy();
        return ok;
    }
    frame addError(result: *SchemaResult, path: string, keyword: string, message: string) {
        local error: SchemaError;
        error.path = schemaCopy(path);
        error.keyword = keyword;
        error.message = schemaCopy(message);
        result.errors.push(error);
    }
    frame report(this: *JsonSchema, result: *SchemaResult, path: *StringBuilder, keyword: string, message: string) {
        if (result.errors.len() < this.max_errors) {
            JsonSchema.addError(result, path.toString(), keyword, message);
        }
    }
    # Validates against `schema` into a scratch result; true when it matched.
    frame matches(this: *JsonSchema, schema: *JsonValue, instance: *JsonValue, path: *StringBuilder, depth: int) ret bool {
        local scratch: SchemaResult = SchemaResult.new();
        local mark: int = path.len();
        this.run(schema, instance, path, &scratch, depth + 1);
        JsonSchema.truncate(path, mark);
        local ok: bool = scratch.ok();
        scratch.destroy();
        return ok;
    }
    frame typeMatches(name: string, instance: *JsonValue) ret bool {
        if (strcmp(name, "integer") == 0) {
            return instance.isInteger();
        }
        if (strcmp(name, "number") == 0) {
            return instance.isNumber();
        }
        if (strcmp(name, "boolean") == 0) {
            return instance.isBool();
        }
        return strcmp(name, instance.kindName()) == 0;
    }
    frame codepoints(text: string) ret long {
        local count: long = 0;
        loop (local i: long = 0; text[i] != 0; i = i + 1) {
            if ((cast<u8>(text[i]) & cast<u8>(0xC0)) != cast<u8>(0x80)) {
                count = count + 1;
            }
        }
        return count;
    }
    frame run(this: *JsonSchema, schema: *JsonValue, instance: *JsonValue, path: *StringBuilder, result: *SchemaResult, depth: int) {
        if (depth > 128) {
            this.report(result, path, "$ref", "schema recursion too deep");
            return;
        }
        if (schema.isBool()) {
            if (!schema.boolean) {
                this.report(result, path, "false", "no value is allowed here");
            }
            return;
        }
        local reference: *JsonValue = schema.get("$ref");
        if (reference != nullptr) {
            this.run(this.resolve(reference.text), instance, path, result, depth + 1);
        }
        local typeNode: *JsonValue = schema.get("type");
        if (typeNode != nullptr) {
            local matched: bool = false;
            if (typeNode.isString()) {
                matched = JsonSchema.typeMatches(typeNode.text, instance);
            } else {
                loop (local i: int = 0; i < typeNode.len(); i = i + 1) {
                    if (JsonSchema.typeMatches(typeNode.at(i).text, instance)) {
                        matched = true;
                    }
                }
            }
            if (!matched) {
                this.report(result, path, "type", "value has the wrong type");
                # Further keywords would only repeat the mismatch.
                return;
            }
        }
        local enumNode: *JsonValue = schema.get("enum");
        if (enumNode != nullptr) {
            local found: bool = false;
            loop (local i: int = 0; i < enumNode.len(); i = i + 1) {
                if (enumNode.at(i).equals(instance)) {
                    found = true;
                }
            }
            if (!found) {
                this.report(result, path, "enum", "value is not one of the allowed values");
            }
        }
        local constNode: *JsonValue = schema.get("const");
        if ((constNode != nullptr) && !constNode.equals(instance)) {
            this.report(result, path, "const", "value does not equal the constant");
        }
        if (instance.isString()) {
            this.runString(schema, instance, path, result);
        } else if (instance.isNumber()) {
            this.runNumber(schema, instance, path, result);
        } else if (instance.isObject()) {
            this.runObject(schema, instance, path, result, depth);
        } else if (instance.isArray()) {
            this.runArray(schema, instance, path, result, depth);
        }
        local allOf: *JsonValue = schema.get("allOf");
        if (allOf != nullptr) {
            loop (local i: int = 0; i < allOf.len(); i = i + 1) {
                local mark: int = path.len();
                this.run(allOf.at(i), instance, path, result, depth + 1);
                JsonSchema.truncate(path, mark);
            }
        }
        local anyOf: *JsonValue = schema.get("anyOf");
        if (anyOf != nullptr) {
            local any: bool = false;
            loop (local i: int = 0; (i < anyOf.len()) && !any; i = i + 1) {
                any = this.matches(anyOf.at(i), instance, path, depth);
            }
            if (!any) {
                this.report(result, path, "anyOf", "value matches none of the alternatives");
            }
        }
        local oneOf: *JsonValue = schema.get("oneOf");
        if (oneOf != nullptr) {
            local count: int = 0;
            loop (local i: int = 0; i < oneOf.len(); i = i + 1) {
                if (this.matches(oneOf.at(i), instance, path, depth)) {
                    count = count + 1;
                }
            }
            if (count != 1) {
                this.report(result, path, "oneOf", "value must match exactly one alternative");
            }
        }
        local notNode: *JsonValue = schema.get("not");
        if ((notNode != nullptr) && this.matches(notNode, instance, path, depth)) {
            this.report(result, path, "not", "value matches a forbidden schema");
        }
        local ifNode: *JsonValue = schema.get("if");
        if (ifNode != nullptr) {
            local branch: *JsonValue = schema.get("else");
            if (this.matches(ifNode, instance, path, depth)) {
                branch = schema.get("then");
            }
            if (branch != nullptr) {
                local mark: int = path.len();
                this.run(branch, instance, path, result, depth + 1);
                JsonSchema.truncate(path, mark);
            }
        }
    }
    frame runString(this: *JsonSchema, schema: *JsonValue, instance: *JsonValue, path: *StringBuilder, result: *SchemaResult) {
        local length: long = JsonSchema.codepoints(instance.text);
        local minLength: *JsonValue = schema.get("minLength");
        if ((minLength != nullptr) && (length < minLength.asLong(0))) {
            this.report(result, path, "minLength", "string is too short");
        }
        local maxLength: *JsonValue = schema.get("maxLength");
        if ((maxLength != nullptr) && (length > maxLength.asLong(0))) {
            this.report(result, path, "maxLength", "string is too long");
        }
        local pattern: *JsonValue = schema.get("pattern");
        if (pattern != nullptr) {
            local regex: *Regex = this.patternFor(pattern);
            if (!regex.contains(instance.text)) {
                this.report(result, path, "pattern", "string does not match the pattern");
            }
        }
        local format: *JsonValue = schema.get("format");
        if ((format != nullptr) && !JsonSchema.formatMatches(format.text, instance.text)) {
            this.report(result, path, "format", "string does not match the format");
        }
    }
    frame runNumber(this: *JsonSchema, schema: *JsonValue, instance: *JsonValue, path: *StringBuilder, result: *SchemaResult) {
        local n: double = instance.number;
        local minimum: *JsonValue = schema.get("minimum");
        if ((minimum != nullptr) && (JsonSchema.compare(instance, minimum) < 0)) {
            this.report(result, path, "minimum", "number is below the minimum");
        }
        local maximum: *JsonValue = schema.get("maximum");
        if ((maximum != nullptr) && (JsonSchema.compare(instance, maximum) > 0)) {
            this.report(result, path, "maximum", "number is above the maximum");
        }
        local exclusiveMinimum: *JsonValue = schema.get("exclusiveMinimum");
        if ((exclusiveMinimum != nullptr) && (JsonSchema.compare(instance, exclusiveMinimum) <= 0)) {
            this.report(result, path, "exclusiveMinimum", "number must be above the exclusive minimum");
        }
        local exclusiveMaximum: *JsonValue = schema.get("exclusiveMaximum");
        if ((exclusiveMaximum != nullptr) && (JsonSchema.compare(instance, exclusiveMaximum) >= 0)) {
            this.report(result, path, "exclusiveMaximum", "number must be below the exclusive maximum");
        }
        local multipleOf: *JsonValue = schema.get("multipleOf");
        if (multipleOf != nullptr) {
            local multiple: bool = false;
            if (instance.exact && multipleOf.exact) {
                multiple = (instance.integer % multipleOf.integer) == 0;
            } else {
                local quotient: double = n / multipleOf.number;
                local rest: double = fmod(n, multipleOf.number);
                multiple = (rest == 0.0) || (fabs(quotient - cast<double>(cast<long>(quotient + 0.5))) < 0.000000001);
                if ((quotient > 9000000000000000000.0) || (quotient < -9000000000000000000.0)) {
                    multiple = rest == 0.0;
                }
            }
            if (!multiple) {
                this.report(result, path, "multipleOf", "number is not a multiple of the divisor");
            }
        }
    }
    # Compares two numbers, exactly when both are 64-bit integers.
    frame compare(a: *JsonValue, b: *JsonValue) ret int {
        if (a.exact && b.exact) {
            if (a.integer < b.integer) {
                return -1;
            }
            if (a.integer > b.integer) {
                return 1;
            }
            return 0;
        }
        if (a.number < b.number) {
            return -1;
        }
        if (a.number > b.number) {
            return 1;
        }
        return 0;
    }
    frame runObject(this: *JsonSchema, schema: *JsonValue, instance: *JsonValue, path: *StringBuilder, result: *SchemaResult, depth: int) {
        local required: *JsonValue = schema.get("required");
        if (required != nullptr) {
            loop (local i: int = 0; i < required.len(); i = i + 1) {
                local name: string = required.at(i).text;
                if (!instance.has(name)) {
                    local mark: int = path.len();
                    JsonSchema.pushSegment(path, name);
                    this.report(result, path, "required", "required property is missing");
                    JsonSchema.truncate(path, mark);
                }
            }
        }
        local dependent: *JsonValue = schema.get("dependentRequired");
        if (dependent != nullptr) {
            loop (local i: int = 0; i < dependent.len(); i = i + 1) {
                if (instance.has(dependent.keyAt(i))) {
                    local names: *JsonValue = dependent.at(i);
                    loop (local j: int = 0; j < names.len(); j = j + 1) {
                        if (!instance.has(names.at(j).text)) {
                            local mark: int = path.len();
                            JsonSchema.pushSegment(path, names.at(j).text);
                            this.report(result, path, "dependentRequired", "property is required by another property");
                            JsonSchema.truncate(path, mark);
                        }
                    }
                }
            }
        }
        local count: long = cast<long>(instance.uniqueKeyCount());
        local minProperties: *JsonValue = schema.get("minProperties");
        if ((minProperties != nullptr) && (count < minProperties.asLong(0))) {
            this.report(result, path, "minProperties", "object has too few properties");
        }
        local maxProperties: *JsonValue = schema.get("maxProperties");
        if ((maxProperties != nullptr) && (count > maxProperties.asLong(0))) {
            this.report(result, path, "maxProperties", "object has too many properties");
        }
        local properties: *JsonValue = schema.get("properties");
        local patternProperties: *JsonValue = schema.get("patternProperties");
        local additional: *JsonValue = schema.get("additionalProperties");
        local names: *JsonValue = schema.get("propertyNames");
        loop (local i: int = 0; i < instance.len(); i = i + 1) {
            local key: string = instance.keyAt(i);
            if (instance.indexOf(key) != i) {
                # An earlier duplicate; only the effective (last) member counts.
                continue;
            }
            local member: *JsonValue = instance.at(i);
            local mark: int = path.len();
            JsonSchema.pushSegment(path, key);
            local covered: bool = false;
            if (properties != nullptr) {
                local sub: *JsonValue = properties.get(key);
                if (sub != nullptr) {
                    covered = true;
                    this.run(sub, member, path, result, depth + 1);
                    JsonSchema.truncate(path, mark);
                    JsonSchema.pushSegment(path, key);
                }
            }
            if (patternProperties != nullptr) {
                loop (local j: int = 0; j < patternProperties.len(); j = j + 1) {
                    local sub: *JsonValue = patternProperties.at(j);
                    local regex: *Regex = this.patternFor(sub);
                    if (regex.contains(key)) {
                        covered = true;
                        this.run(sub, member, path, result, depth + 1);
                        JsonSchema.truncate(path, mark);
                        JsonSchema.pushSegment(path, key);
                    }
                }
            }
            if (!covered && (additional != nullptr)) {
                if (additional.isBool() && !additional.boolean) {
                    this.report(result, path, "additionalProperties", "property is not allowed");
                } else {
                    this.run(additional, member, path, result, depth + 1);
                }
            }
            if (names != nullptr) {
                local keyValue: *JsonValue = JsonValue.newString(key);
                if (!this.matches(names, keyValue, path, depth)) {
                    this.report(result, path, "propertyNames", "property name is not allowed");
                }
                keyValue.destroy();
            }
            JsonSchema.truncate(path, mark);
        }
    }
    frame runArray(this: *JsonSchema, schema: *JsonValue, instance: *JsonValue, path: *StringBuilder, result: *SchemaResult, depth: int) {
        local count: long = cast<long>(instance.len());
        local minItems: *JsonValue = schema.get("minItems");
        if ((minItems != nullptr) && (count < minItems.asLong(0))) {
            this.report(result, path, "minItems", "array has too few items");
        }
        local maxItems: *JsonValue = schema.get("maxItems");
        if ((maxItems != nullptr) && (count > maxItems.asLong(0))) {
            this.report(result, path, "maxItems", "array has too many items");
        }
        local unique: *JsonValue = schema.get("uniqueItems");
        if ((unique != nullptr) && unique.boolean) {
            local duplicate: bool = false;
            loop (local i: int = 0; (i < instance.len()) && !duplicate; i = i + 1) {
                loop (local j: int = i + 1; j < instance.len(); j = j + 1) {
                    if (instance.at(i).equals(instance.at(j))) {
                        duplicate = true;
                        break;
                    }
                }
            }
            if (duplicate) {
                this.report(result, path, "uniqueItems", "array items are not unique");
            }
        }
        local prefix: *JsonValue = schema.get("prefixItems");
        local prefixCount: int = 0;
        if (prefix != nullptr) {
            prefixCount = prefix.len();
        }
        local items: *JsonValue = schema.get("items");
        loop (local i: int = 0; i < instance.len(); i = i + 1) {
            local sub: *JsonValue = items;
            if (i < prefixCount) {
                sub = prefix.at(i);
            }
            if (sub != nullptr) {
                local mark: int = path.len();
                path.appendChar('/');
                path.appendInt(i);
                this.run(sub, instance.at(i), path, result, depth + 1);
                JsonSchema.truncate(path, mark);
            }
        }
        local contains: *JsonValue = schema.get("contains");
        if (contains != nullptr) {
            local found: long = 0;
            loop (local i: int = 0; i < instance.len(); i = i + 1) {
                if (this.matches(contains, instance.at(i), path, depth)) {
                    found = found + 1;
                }
            }
            local minContains: long = schema.getLong("minContains", 1);
            local maxContains: *JsonValue = schema.get("maxContains");
            if (found < minContains) {
                this.report(result, path, "contains", "array does not contain enough matching items");
            }
            if ((maxContains != nullptr) && (found > maxContains.asLong(0))) {
                this.report(result, path, "maxContains", "array contains too many matching items");
            }
        }
    }

    # ---- formats ---------------------------------------------------------

    frame digitsAt(text: string, start: int, count: int) ret int {
        local value: int = 0;
        loop (local i: int = 0; i < count; i = i + 1) {
            local c: char = text[start + i];
            if ((c < '0') || (c > '9')) {
                return -1;
            }
            value = (value * 10) + cast<int>(c - '0');
        }
        return value;
    }
    frame dateAt(text: string, start: int) ret bool {
        local year: int = JsonSchema.digitsAt(text, start, 4);
        local month: int = JsonSchema.digitsAt(text, start + 5, 2);
        local day: int = JsonSchema.digitsAt(text, start + 8, 2);
        if ((year < 0) || (text[start + 4] != '-') || (text[start + 7] != '-') || (month < 1) || (month > 12) || (day < 1)) {
            return false;
        }
        local days: int[12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        local limit: int = days[month - 1];
        if ((month == 2) && ((((year % 4) == 0) && ((year % 100) != 0)) || ((year % 400) == 0))) {
            limit = 29;
        }
        return day <= limit;
    }
    frame formatMatches(format: string, text: string) ret bool {
        local length: long = strlen(text);
        if (strcmp(format, "date") == 0) {
            return (length == 10) && JsonSchema.dateAt(text, 0);
        }
        if (strcmp(format, "date-time") == 0) {
            # RFC 3339: YYYY-MM-DDTHH:MM:SS[.frac](Z|+HH:MM|-HH:MM)
            if ((length < 20) || !JsonSchema.dateAt(text, 0) || ((text[10] != 'T') && (text[10] != 't'))) {
                return false;
            }
            local hour: int = JsonSchema.digitsAt(text, 11, 2);
            local minute: int = JsonSchema.digitsAt(text, 14, 2);
            local second: int = JsonSchema.digitsAt(text, 17, 2);
            if ((hour < 0) || (hour > 23) || (text[13] != ':') || (minute < 0) || (minute > 59) || (text[16] != ':') || (second < 0) || (second > 60)) {
                return false;
            }
            local i: int = 19;
            if (text[i] == '.') {
                i = i + 1;
                local start: int = i;
                loop ((text[i] >= '0') && (text[i] <= '9')) {
                    i = i + 1;
                }
                if (i == start) {
                    return false;
                }
            }
            if (((text[i] == 'Z') || (text[i] == 'z')) && (text[i + 1] == 0)) {
                return true;
            }
            if ((text[i] != '+') && (text[i] != '-')) {
                return false;
            }
            local offsetHour: int = JsonSchema.digitsAt(text, i + 1, 2);
            local offsetMinute: int = JsonSchema.digitsAt(text, i + 4, 2);
            return (offsetHour >= 0) && (offsetHour <= 23) && (text[i + 3] == ':') && (offsetMinute >= 0) && (offsetMinute <= 59) && (text[i + 6] == 0);
        }
        if (strcmp(format, "uuid") == 0) {
            if (length != 36) {
                return false;
            }
            loop (local i: int = 0; i < 36; i = i + 1) {
                local c: char = text[i];
                if ((i == 8) || (i == 13) || (i == 18) || (i == 23)) {
                    if (c != '-') {
                        return false;
                    }
                } else if (!(((c >= '0') && (c <= '9')) || ((c >= 'a') && (c <= 'f')) || ((c >= 'A') && (c <= 'F')))) {
                    return false;
                }
            }
            return true;
        }
        if (strcmp(format, "ipv4") == 0) {
            local parts: int = 0;
            local i: int = 0;
            loop (parts < 4) {
                local start: int = i;
                local value: int = 0;
                loop ((text[i] >= '0') && (text[i] <= '9') && ((i - start) < 3)) {
                    value = (value * 10) + cast<int>(text[i] - '0');
                    i = i + 1;
                }
                local size: int = i - start;
                if ((size == 0) || (value > 255) || ((size > 1) && (text[start] == '0'))) {
                    return false;
                }
                parts = parts + 1;
                if (parts < 4) {
                    if (text[i] != '.') {
                        return false;
                    }
                    i = i + 1;
                }
            }
            return text[i] == 0;
        }
        if (strcmp(format, "email") == 0) {
            # Pragmatic check: one '@', non-empty local part, dotted domain
            # labels of letters, digits and hyphens, no whitespace.
            local at: long = -1;
            loop (local i: long = 0; i < length; i = i + 1) {
                local c: char = text[i];
                if ((cast<u8>(c) <= cast<u8>(32)) || (c == 127)) {
                    return false;
                }
                if (c == '@') {
                    if (at >= 0) {
                        return false;
                    }
                    at = i;
                }
            }
            if ((at < 1) || (at > 64) || ((length - at) < 4)) {
                return false;
            }
            local dots: int = 0;
            local labelLength: int = 0;
            loop (local i: long = at + 1; i < length; i = i + 1) {
                local c: char = text[i];
                if (c == '.') {
                    if ((labelLength == 0) || (text[i - 1] == '-')) {
                        return false;
                    }
                    dots = dots + 1;
                    labelLength = 0;
                } else if (((c >= 'a') && (c <= 'z')) || ((c >= 'A') && (c <= 'Z')) || ((c >= '0') && (c <= '9')) || ((c == '-') && (labelLength > 0))) {
                    labelLength = labelLength + 1;
                } else {
                    return false;
                }
            }
            return (dots > 0) && (labelLength > 0) && (text[length - 1] != '-');
        }
        if (strcmp(format, "uri") == 0) {
            # scheme ":" rest, with an RFC 3986 scheme and no whitespace.
            local c0: char = text[0];
            if (!(((c0 >= 'a') && (c0 <= 'z')) || ((c0 >= 'A') && (c0 <= 'Z')))) {
                return false;
            }
            local i: long = 1;
            loop ((text[i] != 0) && (text[i] != ':')) {
                local c: char = text[i];
                if (!(((c >= 'a') && (c <= 'z')) || ((c >= 'A') && (c <= 'Z')) || ((c >= '0') && (c <= '9')) || (c == '+') || (c == '-') || (c == '.'))) {
                    return false;
                }
                i = i + 1;
            }
            if ((text[i] != ':') || (text[i + 1] == 0)) {
                return false;
            }
            loop (local j: long = i; j < length; j = j + 1) {
                if ((cast<u8>(text[j]) <= cast<u8>(32)) || (text[j] == 127)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
}
