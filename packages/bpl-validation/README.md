# bpl-validation

Optional input rules with stable error codes. No network/database dependencies.

```bpl
import [Validator] from "bpl-validation";
import [Option] from "std/option.bpl";
frame main() {
    local v: Validator = Validator.new();
    v.required("title", "Homework").length("title", "Homework", 1, 120);
    local page: Option<int> = v.integer("page", "1", 1, 10000);
    # Check v.ok() before using the validated values.
    v.destroy();
}
```

`required` rejects null/empty strings; `length` measures bytes. `integer` parses
strict decimal int32 with overflow checking and inclusive range bounds; it
rejects whitespace, plus signs, fractions, and trailing characters. Negative
numbers, including -2147483648, are supported. `oneOf` compares a string against
an `Array<string>` pointer. First failure per field wins. Invalid rule bounds
throw; invalid input records `required`, `length`, `integer`, `range`, or `choice`.

More rules, each recording the code shown on failure:

| Rule                              | Accepts                                                                 | Code              |
| --------------------------------- | ----------------------------------------------------------------------- | ----------------- |
| `chars(field, value, min, max)`   | Length in Unicode code points (UTF-8), inclusive                        | `length`          |
| `number(field, value, min, max)`  | Strict decimal (`-1.5`, `2e3`); returns `Option<double>`                | `number`, `range` |
| `boolean(field, value)`           | `true`/`false`, `1`/`0`, `on`/`off`, `yes`/`no`; returns `Option<bool>` | `boolean`         |
| `email(field, value)`             | One `@`, plain ASCII local part, dotted domain, at most 254 bytes       | `email`           |
| `url(field, value)`               | Absolute `http://` or `https://` URL with a host, no whitespace         | `url`             |
| `uuid(field, value)`              | Canonical `8-4-4-4-12` hexadecimal, any case and version                | `uuid`            |
| `date(field, value)`              | Calendar date `YYYY-MM-DD` with leap years                              | `date`            |
| `matches(field, value, pattern)`  | Whole-value match of a `std/regex.bpl` pattern (linear time)            | `format`          |
| `same(field, value, other)`       | Exact equality, for confirmation fields                                 | `mismatch`        |
| `check(field, condition, reason)` | Application-computed rules; records `reason` when `condition` is false  | `reason`          |

`number` rejects whitespace, `+`, hexadecimal, `inf`/`nan` and values that
overflow a double. `email` is a shape check only; confirm ownership by
sending mail. `matches` compiles the pattern on every call and throws for an
invalid pattern, as other rules throw for invalid bounds.

`errors.get(field)` (or `error(field)`) returns an Option, and `count()` the
number of failing fields. `json()` returns an owned std String
containing `{"errors":{"field":"code"}}`; field names are JSON-escaped.
Destroy that String after sending it. Destroy the validator to release its map.
Field names and reason strings are borrowed, so keep them alive through
validation/error rendering. These rules do not imply authorization or a schema;
validate each relevant input explicitly. Length is not a Unicode character count.
