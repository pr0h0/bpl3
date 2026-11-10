# Text Formats and Terminal Output

## CSV (`std/csv.bpl`)

`Csv.parse(text)` and `Csv.parseWith(text, delimiter)` read RFC 4180 data
into an `Array<Array<String>>`. Quoted fields may contain delimiters, line
breaks and doubled quotes; records end at LF, CRLF or CR, and a final line
break adds no empty record. An unterminated quote, or text after a closing
quote, throws. Release a table with `Csv.destroyRows(&rows)`.

`Csv.format(&rows, delimiter)` writes CRLF-terminated records,
`Csv.formatRow(&fields, delimiter)` and `Csv.formatStrings(&fields,
delimiter)` format one record, and `Csv.appendField(&builder, field,
delimiter)` writes a field into a `StringBuilder`. A field is quoted when it
contains the delimiter, a quote or a line break, or starts or ends with a space.

```bpl
import [Csv] from "std/csv.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local rows: Array<Array<String>> = Csv.parse("name,city\n\"Smith, J\",Oslo\n");
    printf("%s lives in %s\n", rows.get(1).get(0).cstr(), rows.get(1).get(1).cstr());
    Csv.destroyRows(&rows);
    return 0;
}
```

## INI (`std/ini.bpl`)

`Ini.parse(text)` reads `[section]` headers, `key = value` or `key: value`
entries and `;`/`#` comment lines. Keys and values are trimmed and one pair of
matching quotes around a value is removed. Keys before the first header belong
to section `""`; lookups ignore ASCII case, and a repeated key keeps its last
value. Malformed lines throw `"INI line N: ..."` (the message is allocated).

Lookups: `get` (an `Option<string>` borrowed from the Ini), `getOr`, `has`,
`getInt` and `getBool` (`true/yes/on/1`, `false/no/off/0`) with fallbacks.
Changes: `set` and `remove`. `sections()` and `keys(section)` list names in
first-seen order, `toText()` serializes, and `destroy` releases everything.

## Semantic versions (`std/semver.bpl`)

`SemVer.parse(text)` returns `Option<SemVer>` for a strict SemVer 2.0.0 string
(a leading `v` is allowed); `SemVer.isValid` checks without keeping the
value. A `SemVer` has `major`, `minor`, `patch`, and owned `prerelease` and
`build` Strings released by `destroy`. `compare` and `SemVer.compareStrings`
apply SemVer precedence: build metadata is ignored, a prerelease sorts before
its release, and numeric identifiers compare numerically. `toString`,
`bumpMajor`, `bumpMinor` and `bumpPatch` produce new values.

`satisfies(range)` and `SemVer.satisfiesString(version, range)` accept npm
ranges: comparators (`>=1.2.0 <2`), caret (`^1.2.3`, `^0.2.3`), tilde
(`~1.2.3`), wildcards (`1.x`, `1.2.*`, `*`), hyphen ranges (`1.0.0 - 2.0.0`)
and `||`. As in npm, a prerelease only matches when a comparator names a
prerelease of the same version.

```bpl
import [SemVer] from "std/semver.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    printf("%d\n", SemVer.satisfiesString("1.4.2", "^1.2.0 || >=3")); # 1
    printf("%d\n", SemVer.compareStrings("1.0.0-rc.1", "1.0.0")); # -1
    return 0;
}
```

## ANSI terminal codes (`std/ansi.bpl`)

`Ansi` returns escape sequences: styles (`bold`, `dim`, `italic`,
`underline`, `blink`, `inverse`, `strikethrough`, `reset`), foreground colours
(`red`, `brightBlue`, `gray`, ...), backgrounds (`bgRed`, ...), and cursor
control (`clearScreen`, `clearLine`, `hideCursor`, `showCursor`). Allocating
helpers return Strings: `color256`, `background256`, `rgb`, `backgroundRgb`,
`moveTo(row, column)`, `paint(text, style)` and `paintIf(text, style,
enabled)`. `Ansi.enabled()` honours `NO_COLOR` and `FORCE_COLOR`, then requires
a terminal on stdout and a `TERM` other than `dumb`. `Ansi.strip` removes CSI
and OSC sequences and `Ansi.visibleWidth` counts printed codepoints.

## Tables (`std/table.bpl`)

`Table` renders aligned columns for command-line output. Set a header with
`setHeader(&cells)`, add rows with `addRow(&cells)` or `addStringRow`, choose
`setAlignment(column, TABLE_ALIGN_LEFT | TABLE_ALIGN_RIGHT |
TABLE_ALIGN_CENTER)` and `setPadding`, then call `render()` (box drawing),
`renderAscii()` or `renderPlain()` (two-space gaps and a dashed header rule).
Widths count codepoints and ignore ANSI codes, so coloured cells line up. Rows
may have fewer cells than the widest row.

```bpl
import [Table], TABLE_ALIGN_RIGHT from "std/table.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    local table: Table = Table.new();
    local header: Array<string> = Array<string>.new(2);
    header.push("Item");
    header.push("Qty");
    table.setHeader(&header);
    local row: Array<string> = Array<string>.new(2);
    row.push("apples");
    row.push("12");
    table.addRow(&row);
    table.setAlignment(1, TABLE_ALIGN_RIGHT);
    local text: String = table.renderAscii();
    printf("%s", text.cstr());
    text.destroy();
    table.destroy();
    header.destroy();
    row.destroy();
    return 0;
}
```

## Base85 (`std/base85.bpl`)

`Base85.encode`/`encodeString` produce Ascii85 (an all-zero group becomes
`z`), and `decode`, `decodeToString` and `decodedLength` read it, accepting
optional `<~ ~>` delimiters and whitespace. `encodeZ85`/`decodeZ85` implement
ZeroMQ's Z85, whose input lengths must be multiples of 4 (encode) and 5
(decode). Encoders return a new string or `nullptr`; decoders return the byte
count or -1, like `std/base64.bpl`.
