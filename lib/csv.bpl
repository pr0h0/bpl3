# CSV reading and writing (RFC 4180).
#
# Fields may be quoted with '"'; a doubled quote inside a quoted field is a
# literal quote, and quoted fields may contain delimiters and line breaks.
# Records end at LF, CRLF or CR. Parsed fields are Strings owned by the
# caller: release a table with `Csv.destroyRows`.

export [Csv];

import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern strlen(text: string) ret long;

frame _csvTake(builder: *StringBuilder) ret String {
    local result: String;
    result.data = builder.buffer;
    result.length = builder.length;
    builder.buffer = nullptr;
    builder.length = 0;
    builder.capacity = 0;
    return result;
}

struct Csv {
    # Parses comma-separated text.
    frame parse(text: string) ret Array<Array<String>> {
        return Csv.parseWith(text, ',');
    }

    /#
        Parses `text` with the given field delimiter. An empty input yields
        no rows; a trailing line break does not add an empty row. Throws on
        an unterminated quoted field or a quote followed by other text.
    #/
    frame parseWith(text: string, delimiter: char) ret Array<Array<String>> {
        local rows: Array<Array<String>> = Array<Array<String>>.new(8);
        if (text == nullptr) {
            return rows;
        }
        local n: long = strlen(text);
        local row: Array<String> = Array<String>.new(4);
        local field: StringBuilder = StringBuilder.new(16);
        local i: long = 0;
        local rowHasContent: bool = false;
        loop (i < n) {
            local c: char = text[i];
            if ((c == '"') && (field.length == 0)) {
                # Quoted field.
                i = i + 1;
                local closed: bool = false;
                loop (i < n) {
                    local q: char = text[i];
                    if (q == '"') {
                        if (((i + 1) < n) && (text[i + 1] == '"')) {
                            field.appendChar('"');
                            i = i + 2;
                            continue;
                        }
                        closed = true;
                        i = i + 1;
                        break;
                    }
                    field.appendChar(q);
                    i = i + 1;
                }
                if (!closed) {
                    field.destroy();
                    Csv._destroyRow(&row);
                    Csv.destroyRows(&rows);
                    throw "CSV: unterminated quoted field";
                }
                if ((i < n) && (text[i] != delimiter) && (text[i] != '\n') && (text[i] != '\r')) {
                    field.destroy();
                    Csv._destroyRow(&row);
                    Csv.destroyRows(&rows);
                    throw "CSV: unexpected text after a quoted field";
                }
                rowHasContent = true;
                continue;
            }
            if (c == delimiter) {
                row.push(_csvTake(&field));
                field = StringBuilder.new(16);
                rowHasContent = true;
                i = i + 1;
                continue;
            }
            if ((c == '\n') || (c == '\r')) {
                row.push(_csvTake(&field));
                field = StringBuilder.new(16);
                rows.push(row);
                row = Array<String>.new(4);
                rowHasContent = false;
                if ((c == '\r') && ((i + 1) < n) && (text[i + 1] == '\n')) {
                    i = i + 1;
                }
                i = i + 1;
                continue;
            }
            field.appendChar(c);
            rowHasContent = true;
            i = i + 1;
        }
        if (rowHasContent) {
            row.push(_csvTake(&field));
            rows.push(row);
        } else {
            field.destroy();
            row.destroy();
        }
        return rows;
    }

    frame _destroyRow(row: *Array<String>) {
        loop (local i: int = 0; i < row.length; i = i + 1) {
            local value: String = row.data[i];
            value.destroy();
        }
        row.destroy();
    }

    # Destroys every field, row and the table.
    frame destroyRows(rows: *Array<Array<String>>) {
        loop (local i: int = 0; i < rows.length; i = i + 1) {
            Csv._destroyRow(&rows.data[i]);
        }
        rows.destroy();
    }

    # Whether `field` must be quoted for `delimiter`.
    frame needsQuoting(field: string, delimiter: char) ret bool {
        if (field == nullptr) {
            return false;
        }
        local n: long = strlen(field);
        if ((n > cast<long>(0)) && ((field[0] == ' ') || (field[n - 1] == ' '))) {
            return true;
        }
        loop (local i: long = 0; i < n; i = i + 1) {
            local c: char = field[i];
            if ((c == delimiter) || (c == '"') || (c == '\n') || (c == '\r')) {
                return true;
            }
        }
        return false;
    }

    # Appends one field to `out`, quoting it when needed.
    frame appendField(out: *StringBuilder, field: string, delimiter: char) {
        if (field == nullptr) {
            return;
        }
        if (!Csv.needsQuoting(field, delimiter)) {
            out.append(field);
            return;
        }
        out.appendChar('"');
        local n: long = strlen(field);
        loop (local i: long = 0; i < n; i = i + 1) {
            if (field[i] == '"') {
                out.appendChar('"');
            }
            out.appendChar(field[i]);
        }
        out.appendChar('"');
    }

    # Formats one record (without a line terminator).
    frame formatRow(fields: *Array<String>, delimiter: char) ret String {
        local out: StringBuilder = StringBuilder.new(32);
        loop (local i: int = 0; i < fields.length; i = i + 1) {
            if (i > 0) {
                out.appendChar(delimiter);
            }
            Csv.appendField(&out, fields.data[i].data, delimiter);
        }
        return _csvTake(&out);
    }

    # Formats a record of plain strings.
    frame formatStrings(fields: *Array<string>, delimiter: char) ret String {
        local out: StringBuilder = StringBuilder.new(32);
        loop (local i: int = 0; i < fields.length; i = i + 1) {
            if (i > 0) {
                out.appendChar(delimiter);
            }
            Csv.appendField(&out, fields.data[i], delimiter);
        }
        return _csvTake(&out);
    }

    # Formats a table with CRLF record terminators (as RFC 4180 specifies).
    frame format(rows: *Array<Array<String>>, delimiter: char) ret String {
        local out: StringBuilder = StringBuilder.new(64);
        loop (local r: int = 0; r < rows.length; r = r + 1) {
            local row: *Array<String> = &rows.data[r];
            loop (local i: int = 0; i < row.length; i = i + 1) {
                if (i > 0) {
                    out.appendChar(delimiter);
                }
                Csv.appendField(&out, row.data[i].data, delimiter);
            }
            out.append("\r\n");
        }
        return _csvTake(&out);
    }
}
