import [Array] from "std/array.bpl";
import [StringBuilder] from "std/string_builder.bpl";
export [CSV];

struct CSV {
    # Write to a caller-owned builder so reports can share or reuse buffers.
    # All fields are quoted; embedded quotes are doubled.
    frame field(out: *StringBuilder, value: string, spreadsheetSafe: bool) {
        out.append("\"");
        if (value != nullptr) {
            local start: int = 0;
            loop ((value[start] == ' ') || (value[start] == '\t') || (value[start] == '\r') || (value[start] == '\n')) {
                start = start + 1;
            }
            local first: char = value[start];
            if (spreadsheetSafe && ((first == '=') || (first == '+') || (first == '-') || (first == '@') || (value[0] == '\t') || (value[0] == '\r') || (value[0] == '\n'))) {
                out.append("'");
            }
            loop (local i: int = 0; value[i] != 0; i = i + 1) {
                if (value[i] == '"') {
                    out.append("\"");
                }
                out.appendChar(cast<u8>(value[i]));
            }
        }
        out.append("\"");
    }
    frame row(out: *StringBuilder, fields: *Array<string>) {
        CSV.row(out, fields, true);
    }
    frame row(out: *StringBuilder, fields: *Array<string>, spreadsheetSafe: bool) {
        if ((fields == nullptr) || (fields.len() == 0)) {
            throw "CSV row requires at least one field";
        }
        loop (local i: int = 0; i < fields.len(); i = i + 1) {
            if (i != 0) {
                out.append(",");
            }
            CSV.field(out, fields.get(i), spreadsheetSafe);
        }
        out.append("\r\n");
    }
}
