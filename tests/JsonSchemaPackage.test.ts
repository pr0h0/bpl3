import { test } from "bun:test";
import { native } from "./helpers/webPackages";

// Sources stay ASCII (Bun rewrites non-ASCII in String.raw); BPL \u escapes
// spell multi-byte text.

test("bpl-json-schema reports JSON Pointer errors for each failing keyword", () => {
  native(String.raw`
    import [JsonSchema], [SchemaResult] from "bpl-json-schema";
    import [Json], [JsonValue] from "bpl-json";
    import [String] from "std/string.bpl";
    extern strcmp(a: string, b: string) ret int;
    extern strstr(a: string, b: string) ret string;
    frame check(schema: *JsonSchema, text: string) ret bool {
        local result: SchemaResult = schema.validateText(text);
        local ok: bool = result.ok();
        result.destroy();
        return ok;
    }
    frame main() ret int {
        local user: JsonSchema = JsonSchema.compile("{\"$schema\":\"https://json-schema.org/draft/2020-12/schema\",\"title\":\"User\",\"type\":\"object\",\"required\":[\"name\",\"age\"],\"additionalProperties\":false,\"properties\":{\"name\":{\"type\":\"string\",\"minLength\":2,\"maxLength\":4,\"pattern\":\"^[A-Z]\"},\"age\":{\"type\":\"integer\",\"minimum\":0,\"exclusiveMaximum\":150},\"email\":{\"type\":\"string\",\"format\":\"email\"},\"tags\":{\"type\":\"array\",\"items\":{\"$ref\":\"#/$defs/tag\"},\"uniqueItems\":true,\"maxItems\":3},\"a/b\":{\"const\":1}},\"$defs\":{\"tag\":{\"enum\":[\"a\",\"b\",\"c\",\"d\"]}}}");
        if (!user.valid()) { return 1; }
        if (!check(&user, "{\"name\":\"Ada\",\"age\":36,\"email\":\"ada@example.org\",\"tags\":[\"a\",\"b\"],\"a/b\":1.0}")) { return 2; }
        local r: SchemaResult = user.validateText("{\"name\":\"x\",\"age\":150,\"email\":\"bad@\",\"tags\":[\"a\",\"z\",\"a\",\"b\"],\"extra\":1,\"a/b\":2}");
        if (r.count() != 9) { return 3; }
        if (!r.hasErrorAt("/name", "minLength") || !r.hasErrorAt("/name", "pattern")) { return 4; }
        if (!r.hasErrorAt("/age", "exclusiveMaximum") || !r.hasErrorAt("/email", "format")) { return 5; }
        if (!r.hasErrorAt("/tags", "uniqueItems") || !r.hasErrorAt("/tags", "maxItems") || !r.hasErrorAt("/tags/1", "enum")) { return 6; }
        if (!r.hasErrorAt("/extra", "additionalProperties") || !r.hasErrorAt("/a~1b", "const")) { return 7; }
        local text: String = r.json();
        if (strstr(text.data, "{\"errors\":[{\"path\":\"/name\",\"keyword\":\"minLength\",\"message\":\"string is too short\"}") == nullptr) { return 8; }
        text.destroy();
        r.destroy();
        r = user.validateText("{\"name\":\"Bob\"}");
        if (r.count() != 1 || !r.hasErrorAt("/age", "required")) { return 9; }
        r.destroy();
        r = user.validateText("[]");
        if (r.count() != 1 || !r.hasErrorAt("", "type")) { return 10; }
        r.destroy();
        r = user.validateText("{\"name\":");
        if (r.count() != 1 || !r.hasErrorAt("", "json")) { return 11; }
        r.destroy();
        # maxLength counts code points: four 2-byte characters fit.
        if (!check(&user, "{\"name\":\"A\u00e9\u00e9\u00e9\",\"age\":1}") || check(&user, "{\"name\":\"Ab\u00e9\u00e9\u00e9\",\"age\":1}")) { return 12; }
        user.setMaxErrors(2);
        r = user.validateText("{\"name\":1,\"age\":\"x\",\"z\":0}");
        if (r.count() != 2) { return 13; }
        r.destroy();
        user.destroy();
        return 0;
    }
  `);
}, 90000);

test("bpl-json-schema combinators, numbers, arrays and objects", () => {
  native(String.raw`
    import [JsonSchema], [SchemaResult] from "bpl-json-schema";
    frame ok(schema: string, text: string) ret int {
        local compiled: JsonSchema = JsonSchema.compile(schema);
        if (!compiled.valid()) {
            compiled.destroy();
            return -1;
        }
        local result: SchemaResult = compiled.validateText(text);
        local passed: int = 0;
        if (result.ok()) {
            passed = 1;
        }
        result.destroy();
        compiled.destroy();
        return passed;
    }
    frame main() ret int {
        local cases: string[64] = [
            "{\"anyOf\":[{\"type\":\"string\"},{\"type\":\"integer\"}]}", "3",
            "{\"anyOf\":[{\"type\":\"string\"},{\"type\":\"integer\"}]}", "3.5",
            "{\"oneOf\":[{\"multipleOf\":3},{\"multipleOf\":5}]}", "9",
            "{\"oneOf\":[{\"multipleOf\":3},{\"multipleOf\":5}]}", "15",
            "{\"allOf\":[{\"minimum\":1},{\"maximum\":3}]}", "4",
            "{\"not\":{\"type\":\"null\"}}", "null",
            "{\"if\":{\"properties\":{\"kind\":{\"const\":\"a\"}}},\"then\":{\"required\":[\"x\"]},\"else\":{\"required\":[\"y\"]}}", "{\"kind\":\"a\",\"x\":1}",
            "{\"if\":{\"properties\":{\"kind\":{\"const\":\"a\"}}},\"then\":{\"required\":[\"x\"]},\"else\":{\"required\":[\"y\"]}}", "{\"kind\":\"b\",\"x\":1}",
            "{\"multipleOf\":0.1}", "0.3",
            "{\"multipleOf\":0.1}", "0.35",
            "{\"type\":[\"number\",\"null\"],\"maximum\":9007199254740993}", "9007199254740993",
            "{\"type\":[\"number\",\"null\"],\"maximum\":9007199254740992}", "9007199254740993",
            "{\"prefixItems\":[{\"type\":\"string\"},{\"type\":\"boolean\"}],\"items\":{\"type\":\"integer\"},\"minItems\":2}", "[\"a\",true,1,2]",
            "{\"prefixItems\":[{\"type\":\"string\"},{\"type\":\"boolean\"}],\"items\":{\"type\":\"integer\"},\"minItems\":2}", "[\"a\",true,1.5]",
            "{\"contains\":{\"const\":2},\"minContains\":2,\"maxContains\":3}", "[2,1,2]",
            "{\"contains\":{\"const\":2},\"minContains\":2,\"maxContains\":3}", "[2,1]",
            "{\"patternProperties\":{\"^x-\":{\"type\":\"string\"}},\"additionalProperties\":{\"type\":\"integer\"}}", "{\"x-a\":\"s\",\"b\":1}",
            "{\"patternProperties\":{\"^x-\":{\"type\":\"string\"}},\"additionalProperties\":{\"type\":\"integer\"}}", "{\"x-a\":1}",
            "{\"propertyNames\":{\"maxLength\":3},\"minProperties\":1,\"maxProperties\":2}", "{\"abc\":1}",
            "{\"propertyNames\":{\"maxLength\":3},\"minProperties\":1,\"maxProperties\":2}", "{\"abcd\":1}",
            "{\"dependentRequired\":{\"card\":[\"cvv\"]}}", "{\"card\":1}",
            "{\"$defs\":{\"node\":{\"type\":\"object\",\"properties\":{\"next\":{\"$ref\":\"#/$defs/node\"}}}},\"$ref\":\"#/$defs/node\"}", "{\"next\":{\"next\":{}}}",
            "{\"$defs\":{\"node\":{\"type\":\"object\",\"properties\":{\"next\":{\"$ref\":\"#/$defs/node\"}}}},\"$ref\":\"#/$defs/node\"}", "{\"next\":{\"next\":3}}",
            "{\"format\":\"date-time\"}", "\"2024-02-29T23:59:60.5+05:30\"",
            "{\"format\":\"date-time\"}", "\"2023-02-29T10:00:00Z\"",
            "{\"format\":\"uuid\"}", "\"123e4567-e89b-12d3-a456-426614174000\"",
            "{\"format\":\"ipv4\"}", "\"192.168.01.1\"",
            "{\"format\":\"uri\"}", "\"https://example.org/a?b\"",
            "{\"properties\":{\"a\":false}}", "{\"a\":1}",
            "true", "{\"anything\":[1]}",
            "{\"enum\":[[1,{\"a\":null}],\"x\"]}", "[1.0,{\"a\":null}]",
            "{\"exclusiveMinimum\":0,\"maximum\":1}", "0"
        ];
        local expected: int[32] = [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0];
        loop (local i: int = 0; i < 32; i = i + 1) {
            if (ok(cases[i * 2], cases[(i * 2) + 1]) != expected[i]) {
                return 10 + i;
            }
        }
        return 0;
    }
  `);
}, 90000);

test("bpl-json-schema rejects unsupported or malformed schemas instead of ignoring them", () => {
  native(String.raw`
    import [JsonSchema] from "bpl-json-schema";
    extern strcmp(a: string, b: string) ret int;
    frame problem(text: string, expected: string) ret bool {
        local schema: JsonSchema = JsonSchema.compile(text);
        local matched: bool = !schema.valid() && (strcmp(schema.problem, expected) == 0);
        schema.destroy();
        return matched;
    }
    frame main() ret int {
        if (!problem("{\"properties\":{\"a\":{\"minLenght\":1}}}", "unsupported schema keyword at #/properties/a/minLenght")) { return 1; }
        if (!problem("{\"type\":\"str\"}", "unknown type name at #/type")) { return 2; }
        if (!problem("{\"minLength\":-1}", "expected a non-negative integer at #/minLength")) { return 3; }
        if (!problem("{\"pattern\":\"(a\"}", "invalid regular expression at #/pattern")) { return 4; }
        if (!problem("{\"$ref\":\"#/$defs/missing\"}", "$ref must point inside this document (#, #/$defs/name) at #/$ref")) { return 5; }
        if (!problem("{\"$ref\":\"https://example.org/s.json\"}", "$ref must point inside this document (#, #/$defs/name) at #/$ref")) { return 6; }
        if (!problem("{\"format\":\"hostname\"}", "unsupported format at #/format")) { return 7; }
        if (!problem("{\"allOf\":[]}", "expected a non-empty array of schemas at #/allOf")) { return 8; }
        if (!problem("{\"multipleOf\":0}", "multipleOf must be a positive number at #/multipleOf")) { return 9; }
        if (!problem("[1]", "schema must be an object or boolean at #")) { return 10; }
        if (!problem("{\"type\":", "schema is not valid JSON: unexpected end of input")) { return 11; }
        local caught: bool = false;
        local broken: JsonSchema = JsonSchema.compile("{\"type\":1}");
        try {
            broken.validateText("1");
        } catch {
            caught = true;
        }
        broken.destroy();
        if (!caught) { return 12; }
        return 0;
    }
  `);
}, 90000);
