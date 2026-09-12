# Reflection and Generic JSON

## Runtime type information

`typeof<T>()` returns a borrowed pointer to compiler-generated `TypeInfo`
metadata. Do not free or modify this metadata. It includes the type's name,
size, kind, reflected fields and methods, and an element type for arrays and
pointers. See [the declarations](stdlib-reference.md#stdreflectionbpl) for
`TypeInfo`, `FieldInfo`, `MethodInfo`, and the `TYPE_KIND_*` constants.

```bpl
import printf from "std/c.bpl";
import [TypeInfo], {TYPE_KIND_STRUCT} from "std/reflection.bpl";

struct Point { x: int, y: int }

frame main() ret int {
    local info: *TypeInfo = typeof<Point>();
    printf("Type: %s\n", info.name);
    if (info.kind == TYPE_KIND_STRUCT) {
        printf("Fields: %d\n", info.num_fields);
    }
    return 0;
}
```

The metadata pointer is resolved during compilation/linking. Inspecting fields
or invoking methods through it involves runtime work; reflection metadata also
occupies space in the output. It is not an ownership or lifetime checker.

## Serialization and ownership

`JSON.stringify<T>(ptr: *T)` returns an owned `String`. Destroy that result when
finished. The input is borrowed and must remain valid for the entire call.

<!-- bpl-doc: run=json-serialize -->

```bpl
import [JSON] from "std/json.bpl";
import [String] from "std/string.bpl";
import printf from "std/c.bpl";

struct User { id: int, name: string, active: bool }

frame main() ret int {
    local user: User = User { id: 1, name: "Alice", active: true };
    local json: String = JSON.stringify<User>(&user);
    printf("%s\n", json.toString());
    json.destroy();
    return 0;
}
```

Output: `{"id": 1, "name": "Alice", "active": true}`.

## Parsing and cleanup

`JSON.parse<T>(text: string)` allocates a result. Check for `nullptr` before
accessing it. Release a successful result with `JSON.free<T>(ptr)`, which
recursively releases parsed strings, arrays, and pointer fields before releasing
the outer allocation. Calling only C `free` on the outer struct leaks nested
allocations. Do not call `JSON.free` on stack values or objects with borrowed
string literals.

<!-- bpl-doc: run=json-parse -->

```bpl
import [JSON] from "std/json.bpl";
import printf from "std/c.bpl";

struct User { id: int, name: string, active: bool }

frame main() ret int {
    local text: string = "{\"id\":2,\"name\":\"Bob\",\"active\":false}";
    local user: *User = JSON.parse<User>(text);
    if (user == nullptr) { return 1; }
    printf("User: %s\n", user.name);
    JSON.free<User>(user);
    return 0;
}
```

Parse failures return `nullptr` and print a diagnostic. String parsing decodes
`\uXXXX` and valid UTF-16 surrogate pairs into UTF-8. Invalid escapes, incomplete
pairs, unescaped control characters, and escaped U+0000 are rejected. BPL's
primitive strings are NUL-terminated, so they cannot represent embedded U+0000.

## Custom hooks

The serializer looks for a method named `toJson` with this contract:

```bpl
frame toJson(this: *Self) ret JsonToResult;
```

`JsonToResult.Result(text)` appends raw JSON text; it does not quote or validate
it. The text is borrowed during serialization, so a stable literal or caller-owned
buffer works. The serializer does not free a newly allocated hook result.
`Ignore` emits `null`; `Default` uses the ordinary serializer for this value.

<!-- bpl-doc: run=json-hook -->

```bpl
import [JSON], [JsonToResult] from "std/json.bpl";
import [String] from "std/string.bpl";
import printf from "std/c.bpl";

struct Redacted {
    frame toJson(this: *Redacted) ret JsonToResult {
        return JsonToResult.Result("\"redacted\"");
    }
}

frame main() ret int {
    local value: Redacted;
    local json: String = JSON.stringify<Redacted>(&value);
    printf("%s\n", json.toString());
    json.destroy();
    return 0;
}
```

The corresponding static parsing hook has the signature
`frame fromJson(json: string, dest: *Self) ret JsonParseResult`.
`Success` and `Ignore` consume the value; `Default` invokes the ordinary parser
for the current type while retaining nested hooks. The supplied JSON text is a
temporary allocation freed after the hook returns: copy anything you retain.
The destination belongs to the parser. Use allocation/ownership conventions that
`JSON.free` can release. The exported `Jsonable` spec declares both hooks.

## Current support and limitations

The implementation is experimental; it is not a general, strict JSON validator.

| Value                           | Serialization                         | Parsing                                                    |
| ------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `int` / `i32`, `bool`, `string` | Implemented                           | Implemented                                                |
| `long` / `i64`                  | Implemented with C formatting         | Checked signed 64-bit integers                             |
| `float` / `double` / `f64`      | Bounded binary64 formatting           | JSON fractions and exponents; finite binary64 results      |
| Other primitive kinds           | Unsupported kinds fall back to `null` | No general primitive conversion                            |
| Structs                         | Reflected fields or a custom hook     | Reflected fields; unknown keys are skipped                 |
| Fixed arrays, `Array<T>`        | Recursive elements                    | Subject to element support and parser limits               |
| Pointers                        | Pointee value or `null`               | Allocated pointee; requires supported element type         |
| Enums                           | Variant name only                     | Variant-name lookup; payloads are not a general round trip |

Missing fields are not required-field validation. Cyclic graphs are unsupported:
recursive serialization/freeing has no cycle detection. Fixed arrays reject
excess elements; shorter inputs retain zero-initialized remaining slots.
Unsupported primitive destinations return a parse error. Container separators,
null literals, and skipped unknown-field values are validated; malformed input
returns `nullptr` rather than leaving an array parser stuck (BUG-277/283).

Fixed-array aliases currently have a reflection limitation (BUG-284). For
`type Pair = int[2]`, use `JSON.parse<int[2]>` and `JSON.free<int[2]>`, even when
the destination variable is declared `*Pair`.

Serialization escapes quotes, backslashes, and all representable control bytes
below 0x20. Valid UTF-8 bytes are preserved; embedded NUL remains unsupported.
Binary64 (`float`/`double`/`f64`) output uses up to 17 significant digits and may
use exponent notation; this preserves finite values through a binary64 JSON
parser. Formatting is bounded and does not allocate a fixed-size heap buffer.
NaN and either infinity serialize as `null`. Numeric formatting and floating-point
parsing require the C numeric locale; callers changing the process locale must
retain that convention.

Integer parsing checks the destination range: `int`/`i32` accepts -2147483648
through 2147483647, and `long`/`i64` accepts -9223372036854775808 through 9223372036854775807. Overflow returns `nullptr`; values are never silently
truncated. Integer destinations require integer spelling: `1.0` and `1e0` are
rejected even though they describe integral values.

Floating-point destinations accept JSON fractions and exponent notation, including
negative zero and subnormals. Conversion rounds to binary64; underflow may round
to signed zero. Overflow to infinity is rejected. JSON text such as `"1e100"` can
be parsed even though BPL source literals do not support exponent notation.
Leading plus signs, leading zeros, incomplete fractions/exponents, `NaN`, and
`Infinity` are rejected. These numeric rules also apply to fields and supported
array elements. Other widths and unsigned primitive destinations remain unsupported.
