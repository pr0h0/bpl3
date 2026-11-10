# RFC 4180 CSV reader.
#
# Handles quoted fields with embedded commas, doubled quotes and line
# breaks, CRLF/LF line endings and an optional header row. Fields are
# copied into a single arena so a parsed table is two allocations plus the
# arena. Malformed input (an unterminated quote, text after a closing quote)
# is reported with its line number.

import malloc, free, memcpy from "std/c.bpl";
import [Text], [ParsedFloat] from "./text.bpl";

export [CsvTable];

struct CsvTable {
    arena: *char,
    arena_len: int,
    arena_cap: int,
    # Offsets of each field into the arena, row-major.
    fields: *int,
    field_count: int,
    field_cap: int,
    row_starts: *int,
    row_lengths: *int,
    rows: int,
    row_cap: int,
    error: string,
    error_line: int,

    frame parse(this: *CsvTable, text: string, max_rows: int) ret bool {
        local n: int = Text.length(text);
        this.arena_cap = n + 16;
        this.arena_len = 0;
        this.arena = cast<*char>(malloc(cast<long>(this.arena_cap)));
        this.field_cap = 64;
        this.field_count = 0;
        this.fields = cast<*int>(malloc(cast<long>(this.field_cap) * sizeof(int)));
        this.row_cap = 16;
        this.rows = 0;
        this.row_starts = cast<*int>(malloc(cast<long>(this.row_cap) * sizeof(int)));
        this.row_lengths = cast<*int>(malloc(cast<long>(this.row_cap) * sizeof(int)));
        this.error = nullptr;
        this.error_line = 0;
        local i: int = 0;
        local line: int = 1;
        loop (i < n) {
            if (this.rows >= max_rows) {
                this.error = "too many rows";
                this.error_line = line;
                return false;
            }
            # Skip blank lines between records.
            if ((text[i] == '\n') || (text[i] == '\r')) {
                if (text[i] == '\n') {
                    line = line + 1;
                }
                i = i + 1;
                continue;
            }
            this.beginRow();
            loop {
                local start: int = this.arena_len;
                if (text[i] == '"') {
                    i = i + 1;
                    loop {
                        if (i >= n) {
                            this.error = "unterminated quoted field";
                            this.error_line = line;
                            return false;
                        }
                        local c: char = text[i];
                        if (c == '"') {
                            if (((i + 1) < n) && (text[i + 1] == '"')) {
                                this.put('"');
                                i = i + 2;
                                continue;
                            }
                            i = i + 1;
                            break;
                        }
                        if (c == '\n') {
                            line = line + 1;
                        }
                        this.put(c);
                        i = i + 1;
                    }
                    if ((i < n) && (text[i] != ',') && (text[i] != '\n') && (text[i] != '\r')) {
                        this.error = "unexpected text after a closing quote";
                        this.error_line = line;
                        return false;
                    }
                } else {
                    loop ((i < n) && (text[i] != ',') && (text[i] != '\n') && (text[i] != '\r')) {
                        this.put(text[i]);
                        i = i + 1;
                    }
                }
                this.put(cast<char>(0));
                this.addField(start);
                if ((i < n) && (text[i] == ',')) {
                    i = i + 1;
                    continue;
                }
                break;
            }
            if ((i < n) && (text[i] == '\r')) {
                i = i + 1;
            }
            if ((i < n) && (text[i] == '\n')) {
                i = i + 1;
                line = line + 1;
            }
        }
        return true;
    }

    frame destroy(this: *CsvTable) {
        free(cast<*void>(this.arena));
        free(cast<*void>(this.fields));
        free(cast<*void>(this.row_starts));
        free(cast<*void>(this.row_lengths));
    }

    frame put(this: *CsvTable, c: char) {
        if (this.arena_len == this.arena_cap) {
            local next_cap: int = this.arena_cap * 2;
            local next: *char = cast<*char>(malloc(cast<long>(next_cap)));
            memcpy(cast<*void>(next), cast<*void>(this.arena), cast<long>(this.arena_len));
            free(cast<*void>(this.arena));
            this.arena = next;
            this.arena_cap = next_cap;
        }
        this.arena[this.arena_len] = c;
        this.arena_len = this.arena_len + 1;
    }

    frame beginRow(this: *CsvTable) {
        if (this.rows == this.row_cap) {
            local next_cap: int = this.row_cap * 2;
            local starts: *int = cast<*int>(malloc(cast<long>(next_cap) * sizeof(int)));
            local lengths: *int = cast<*int>(malloc(cast<long>(next_cap) * sizeof(int)));
            loop (local r: int = 0; r < this.rows; r = r + 1) {
                starts[r] = this.row_starts[r];
                lengths[r] = this.row_lengths[r];
            }
            free(cast<*void>(this.row_starts));
            free(cast<*void>(this.row_lengths));
            this.row_starts = starts;
            this.row_lengths = lengths;
            this.row_cap = next_cap;
        }
        this.row_starts[this.rows] = this.field_count;
        this.row_lengths[this.rows] = 0;
        this.rows = this.rows + 1;
    }

    frame addField(this: *CsvTable, offset: int) {
        if (this.field_count == this.field_cap) {
            local next_cap: int = this.field_cap * 2;
            local next: *int = cast<*int>(malloc(cast<long>(next_cap) * sizeof(int)));
            memcpy(cast<*void>(next), cast<*void>(this.fields), cast<long>(this.field_count) * sizeof(int));
            free(cast<*void>(this.fields));
            this.fields = next;
            this.field_cap = next_cap;
        }
        this.fields[this.field_count] = offset;
        this.field_count = this.field_count + 1;
        this.row_lengths[this.rows - 1] = this.row_lengths[this.rows - 1] + 1;
    }

    frame width(this: *CsvTable, row: int) ret int {
        return this.row_lengths[row];
    }

    # Field text, or nullptr when the row is shorter than `col`.
    frame field(this: *CsvTable, row: int, col: int) ret string {
        if ((row < 0) || (row >= this.rows) || (col < 0) || (col >= this.row_lengths[row])) {
            return nullptr;
        }
        return cast<string>(this.arena + this.fields[this.row_starts[row] + col]);
    }

    # Column index of a header name (row 0, case-insensitive), or -1.
    frame column(this: *CsvTable, name: string) ret int {
        if (this.rows == 0) {
            return -1;
        }
        loop (local c: int = 0; c < this.row_lengths[0]; c = c + 1) {
            local h: string = this.field(0, c);
            local trimmed: string = h;
            loop (trimmed[0] == ' ') {
                trimmed = cast<string>(cast<*char>(trimmed) + 1);
            }
            if (Text.equalsIgnoreCase(trimmed, name)) {
                return c;
            }
        }
        return -1;
    }

    frame number(this: *CsvTable, row: int, col: int, ok: *bool) ret float {
        local s: string = this.field(row, col);
        local p: ParsedFloat = Text.parseFloat(s);
        if (!p.ok) {
            *ok = false;
            return 0.0;
        }
        return p.value;
    }
}
