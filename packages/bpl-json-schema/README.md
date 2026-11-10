# bpl-json-schema

Validates [bpl-json](../bpl-json/README.md) values against a JSON Schema
(draft 2020-12 subset). Errors carry the JSON Pointer of the failing instance
location and the keyword that failed, so they can be returned to API clients
as-is.

```bpl
import [JsonSchema], [SchemaResult] from "bpl-json-schema";
import [String] from "std/string.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    local schema: JsonSchema = JsonSchema.compile("{\"type\":\"object\",\"required\":[\"title\"],\"properties\":{\"title\":{\"type\":\"string\",\"minLength\":1}},\"additionalProperties\":false}");
    if (!schema.valid()) {
        printf("bad schema: %s\n", schema.problem);
        return 1;
    }
    local result: SchemaResult = schema.validateText("{\"title\":\"\",\"done\":true}");
    if (!result.ok()) {
        local body: String = result.json();
        # {"errors":[{"path":"/title","keyword":"minLength",...},{"path":"/done",...}]}
        printf("%s\n", body.data);
        body.destroy();
    }
    result.destroy();
    schema.destroy();
    return 0;
}
```

## Supported keywords

| Area        | Keywords                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any value   | `type` (name or array), `enum`, `const`, `allOf`, `anyOf`, `oneOf`, `not`, `if` / `then` / `else`, `$ref`, `$defs`, `definitions`, `true`/`false` |
| Numbers     | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum` (numeric form), `multipleOf`                                                         |
| Strings     | `minLength`, `maxLength` (Unicode code points), `pattern`, `format`                                                                               |
| Arrays      | `items`, `prefixItems`, `minItems`, `maxItems`, `uniqueItems`, `contains`, `minContains`, `maxContains`                                           |
| Objects     | `properties`, `required`, `additionalProperties`, `patternProperties`, `propertyNames`, `minProperties`, `maxProperties`, `dependentRequired`     |
| Annotations | `$schema`, `$id`, `$comment`, `$anchor`, `title`, `description`, `default`, `examples`, `deprecated`, `readOnly`, `writeOnly`, `contentMediaType` |

Annotations are accepted and ignored. **Any other keyword makes the schema
invalid** instead of being silently skipped, so a typo such as `minLenght` or
an unsupported keyword (`unevaluatedProperties`, `dependentSchemas`, `$dynamicRef`)
cannot weaken validation unnoticed. `schema.problem` names the keyword and its
location, for example `unsupported schema keyword at #/properties/a/minLenght`.

Notes on semantics:

- `integer` accepts any number with no fractional part (`1.0` included).
  Integer comparisons and `multipleOf` between integers are exact for 64-bit
  values; other numbers compare as doubles, and fractional `multipleOf`
  tolerates binary rounding (`0.3` is a multiple of `0.1`).
- `enum`/`const`/`uniqueItems` use structural equality: `1` equals `1.0`,
  and object member order does not matter.
- `pattern` and `patternProperties` use the linear-time engine from
  `std/regex.bpl` and are unanchored searches, as in JSON Schema. That engine
  supports classes, `\d \w \s`, groups, alternation, counted repetition and
  `^`/`$`, but not lookaround or backreferences; an unsupported pattern
  invalidates the schema. Patterns are compiled once, when the schema is.
- `$ref` must point inside the same document (`#`, `#/$defs/name`,
  `#/definitions/name`, or any JSON Pointer to a subschema); remote
  references are rejected. Recursive schemas are allowed and validation depth
  is capped at 128 levels.
- `format` is an assertion for `date`, `date-time` (RFC 3339, with leap-year
  and offset checks), `uuid`, `ipv4`, `email` (pragmatic: one `@` and a dotted
  domain of letters, digits and hyphens) and `uri` (scheme and no
  whitespace). Other format names are rejected.
- A `type` mismatch stops further checks of that value, so one wrong value
  reports one error. `anyOf`, `oneOf` and `not` report a single error at the
  value rather than the alternatives' errors.

## API

- `JsonSchema.compile(text)` parses and checks a schema; `JsonSchema.adopt(value)`
  takes ownership of a parsed `*JsonValue`. Check `valid()` before use;
  `problem` holds the owned description otherwise. Validating with an invalid
  schema throws.
- `validate(value)` / `validateText(text)` return a `SchemaResult`. A
  `validateText` parse failure is a single error with keyword `json`.
  `isValid(value)` returns only the verdict.
- `setMaxErrors(n)` caps collected errors (default 100).
- `SchemaResult`: `ok()`, `count()`, `get(i)` (a `SchemaError` with owned
  `path` and `message` and a static `keyword`), `hasErrorAt(path, keyword)`
  (`keyword` may be `nullptr`), `json()` and `destroy()`.

The schema and every result own their memory; destroy both. A compiled schema
can validate any number of documents and is not modified by validation.
