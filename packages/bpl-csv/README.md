# bpl-csv

Optional CSV **writer** for reports and downloads. It has no HTTP/database
or native library dependency; it writes into a caller-owned StringBuilder.
It is not a CSV parser.

```bpl
import [CSV] from "bpl-csv";
import [Array] from "std/array.bpl";
import [StringBuilder] from "std/string_builder.bpl";
frame main() {
    local columns: Array<string> = Array<string>.new(2);
    columns.push("Title"); columns.push("Completed");
    local output: StringBuilder = StringBuilder.new(64);
    CSV.row(&output, &columns);
    # Send output.toString() as text/csv before destroying the builder.
    output.destroy(); columns.destroy();
}
```

Every field is quoted, embedded quotes are doubled, and rows end with CRLF.
Commas, newlines, and UTF-8 bytes are preserved. Null fields become empty fields;
input strings are borrowed and must be NUL-terminated. A row needs at least one
field. Builder limits and allocation failures raise standard builder errors.

`CSV.row(&out, &fields)` enables a spreadsheet guard: leading formula-like
`=`, `+`, `-`, or `@` (also after whitespace), or initial tab/CR/LF, gets an
apostrophe prefix inside the quoted field. This **changes the field data**, and
negative numeric strings become spreadsheet text. It is a conservative guard,
not a guarantee about every spreadsheet application/import configuration.
Use `CSV.row(&out, &fields, false)` for exact data exports consumed as CSV by
software. `CSV.field(&out, value, guard)` writes a single quoted field.

For an HTTP download, set `Content-Type: text/csv; charset=utf-8` and a fixed
`Content-Disposition: attachment; filename="report.csv"`, then send the builder
buffer. Keep export row limits and authorization in your application. This
package adds no endpoints or permissions automatically.
