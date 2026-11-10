# bpl-json

Dynamic JSON for documents whose shape is not known at compile time. The
standard library's `std/json.bpl` maps JSON onto declared structs through
reflection; this package parses into an owned value tree instead, so programs
can inspect, edit and re-serialize arbitrary JSON.

```bpl
import [Json], [JsonValue], [JsonError] from "bpl-json";
import [String] from "std/string.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    local error: JsonError = JsonError.none();
    local doc: *JsonValue = Json.parseChecked("{\"user\":{\"name\":\"Ada\",\"tags\":[\"admin\"]}}", &error);
    if (doc == nullptr) {
        printf("%s at %d:%d\n", error.message, error.line, error.column);
        return 1;
    }
    printf("%s\n", doc.getString("user.name", "?"));
    doc.get("user").get("tags").push(JsonValue.newString("ops"));
    doc.setInt("version", 2);
    local text: String = doc.stringify();
    printf("%s\n", text.data);
    text.destroy();
    doc.destroy();
    return 0;
}
```

## Parsing

- `Json.parse(text)` returns the root value or `nullptr`.
- `Json.parseChecked(text, &error)` also records `error.message`, the byte
  `offset`, and the 1-based `line` and `column` where parsing stopped.
- `Json.parseBytes(text, length, maxDepth, &error)` parses a length-delimited
  buffer with an explicit nesting limit (1 to 4096; the other entry points use
  256), which bounds recursion for untrusted input.

Parsing is strict RFC 8259: no comments, trailing commas, leading zeros,
single quotes or bare words, and nothing but whitespace after the value.
`\u` escapes are decoded to UTF-8, surrogate pairs are combined, and lone
surrogates are rejected. Because values are NUL-terminated strings, `\u0000`
and raw control characters in strings are rejected rather than truncated.
Other bytes are copied unchanged; the parser does not validate UTF-8.

Duplicate object keys are kept in order. Lookups return the **last**
occurrence, as most JSON implementations do, and `equals` compares that
member.

## Values

`JsonValue` has a `kind` (`JsonKind.Null`, `Bool`, `Number`, `String`,
`Array`, `Object`) and predicates `isNull()`, `isBool()`, `isNumber()`,
`isInteger()`, `isString()`, `isArray()`, `isObject()`. `kindName()` returns
the JSON Schema type name (`"integer"` for integral numbers).

Numbers always carry a `double`. Integer literals that fit in a signed 64-bit
value also keep their exact value (`exact` is true and `asLong` returns it
without rounding), so ids such as `9007199254740993` survive a round trip.
Larger integers and fractional numbers use the double.

Accessors take a fallback used when the kind does not match:
`asLong(0)`, `asNumber(0.0)`, `asBool(false)`, `asString("")`. Methods
dispatch through the object, so never call one on `nullptr`; `get`, `at` and
`path` return `nullptr` for missing members. For optional data use the path
getters, which return the fallback when any step is missing:
`doc.getString("user.name", "anonymous")`, `getLong`, `getNumber`, `getBool`.
Strings returned by `asString`, `getString` and `keyAt` are borrowed from the
tree.

- Arrays: `len()`, `at(i)`, `push(value)`.
- Objects: `len()`, `get(key)`, `has(key)`, `keyAt(i)`, `at(i)`, `set(key,
value)` (replaces in place, keeping the member's position), `setString`,
  `setInt`, `setNumber`, `setBool`, `setNull`, `remove(key)` and `take(key)`
  (detach without freeing).
- `path("a.b.0")` walks objects by key and arrays by decimal index and returns
  `nullptr` when any step is missing.
- `clone()` deep-copies; `equals(other)` compares structurally, treats `1` and
  `1.0` as equal and ignores member order.

## Construction and ownership

`JsonValue.newNull()`, `newBool(b)`, `newNumber(d)`, `newInt(n)`,
`newString(text)` (copies) and `newArray()` / `newObject()` allocate values.
`push` and `set` take ownership of the value they are given; keys are copied.
Destroy only the root: `destroy()` releases the value and all of its children. Do not destroy a value after adding it to a parent,
and do not add the same value twice.

## Serialization

`stringify()` writes compact JSON and `pretty(indent)` indents with 0 to 16
spaces per level; both return an owned `String`. Strings escape `"`, `\` and
control characters and copy other bytes verbatim. Exact integers print as
integers; other numbers use the shortest of `%.15g` / `%.17g` that parses back
to the same double. NaN and infinities have no JSON form and print as `null`.
