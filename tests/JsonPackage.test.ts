import { test } from "bun:test";
import { native } from "./helpers/webPackages";

// Keep these sources ASCII: Bun rewrites non-ASCII characters inside
// String.raw templates as \u escapes. BPL string escapes spell them instead.

test("bpl-json parses, queries, edits and serializes dynamic values", () => {
  native(String.raw`
    import [Json], [JsonValue], [JsonError], [JsonKind] from "bpl-json";
    import [String] from "std/string.bpl";
    extern strcmp(a: string, b: string) ret int;
    frame same(text: String, expected: string) ret bool {
        local ok: bool = strcmp(text.data, expected) == 0;
        local owner: *String = &text;
        owner.destroy();
        return ok;
    }
    frame main() ret int {
        local doc: *JsonValue = Json.parse("{\"name\":\"Ada\",\"tags\":[\"x\",\"y\"],\"n\":{\"deep\":[1,{\"k\":true}]},\"f\":-1.5e2,\"big\":18446744073709551616}");
        if (doc == nullptr) { return 1; }
        if (strcmp(doc.get("name").asString(""), "Ada") != 0) { return 2; }
        if (doc.path("n.deep.1.k").asBool(false) != true) { return 3; }
        if (doc.path("tags.1").asString("")[0] != 'y') { return 4; }
        if (doc.path("tags.9") != nullptr || doc.path("missing.x") != nullptr) { return 5; }
        if (doc.get("f").asNumber(0.0) != -150.0 || !doc.get("f").isInteger()) { return 6; }
        if (doc.get("big").exact || doc.get("big").kind != JsonKind.Number) { return 7; }
        if (doc.len() != 5 || strcmp(doc.keyAt(1), "tags") != 0) { return 8; }
        doc.setString("name", "Grace").setInt("age", 36).setBool("ok", false).setNull("none");
        doc.remove("n");
        doc.remove("big");
        doc.get("tags").push(JsonValue.newNumber(0.1));
        if (!same(doc.stringify(), "{\"name\":\"Grace\",\"tags\":[\"x\",\"y\",0.1],\"f\":-150,\"age\":36,\"ok\":false,\"none\":null}")) { return 9; }
        local copy: *JsonValue = doc.clone();
        if (!copy.equals(doc)) { return 10; }
        copy.setInt("age", 37);
        if (copy.equals(doc)) { return 11; }
        copy.destroy();
        local reordered: *JsonValue = Json.parse("{\"ok\":false,\"none\":null,\"age\":36.0,\"f\":-150,\"tags\":[\"x\",\"y\",0.1],\"name\":\"Grace\"}");
        if (!reordered.equals(doc)) { return 12; }
        reordered.destroy();
        doc.destroy();

        local esc: *JsonValue = Json.parse("\"tab\\t q\\\" \\u00e9 \\ud83d\\ude00 \\u0001\"");
        if (esc == nullptr) { return 20; }
        if (!same(esc.stringify(), "\"tab\\t q\\\" \u00e9 \ud83d\ude00 \\u0001\"")) { return 21; }
        esc.destroy();

        local nested: *JsonValue = Json.parse(" [ [ ] , { } , -0 , 9223372036854775807 , -9223372036854775808 ] ");
        if (nested == nullptr || nested.at(3).asLong(0) != 9223372036854775807 || nested.at(4).asLong(0) != (-9223372036854775807 - 1)) { return 22; }
        if (!same(nested.pretty(1), "[\n [],\n {},\n 0,\n 9223372036854775807,\n -9223372036854775808\n]")) { return 23; }
        nested.destroy();

        local err: JsonError = JsonError.none();
        local bad: string[12] = ["", "[1,]", "{\"a\" 1}", "01", "1.", "\"\\x\"", "\"\\ud800\"", "\"\\u0000\"", "[1] x", "{\"a\":1,}", "tru", "\"a\nb\""];
        loop (local i: int = 0; i < 12; i = i + 1) {
            local value: *JsonValue = Json.parseChecked(bad[i], &err);
            if (value != nullptr || !err.failed()) { return 30 + i; }
        }
        local where: *JsonValue = Json.parseChecked("{\n  \"a\": [1,\n   02]}", &err);
        if (where != nullptr || strcmp(err.message, "leading zero in number") != 0 || err.line != 3 || err.column != 4) { return 50; }
        local deep: *JsonValue = Json.parseBytes("[[[[1]]]]", 9, 3, &err);
        if (deep != nullptr || strcmp(err.message, "nesting too deep") != 0) { return 51; }
        deep = Json.parseBytes("[[[[1]]]]", 9, 4, &err);
        if (deep == nullptr) { return 52; }
        deep.destroy();
        local zero: double = 0.0;
        local built: *JsonValue = JsonValue.newArray();
        built.push(JsonValue.newNumber(zero / zero)).push(JsonValue.newString("a\"b")).push(JsonValue.newNumber(1.0 / 3.0));
        if (!same(built.stringify(), "[null,\"a\\\"b\",0.33333333333333331]")) { return 53; }
        built.destroy();
        return 0;
    }
  `);
}, 90000);
