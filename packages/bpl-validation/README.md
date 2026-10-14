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

`errors.get(field)` returns an Option. `json()` returns an owned std String
containing `{"errors":{"field":"code"}}`; field names are JSON-escaped.
Destroy that String after sending it. Destroy the validator to release its map.
Field names and reason strings are borrowed, so keep them alive through
validation/error rendering. These rules do not imply authorization or a schema;
validate each relevant input explicitly. Length is not a Unicode character count.
