# Plain-text tables for command-line output.
#
# Add a header and rows of cells, choose per-column alignment, then render
# with box-drawing borders (`render`), ASCII borders (`renderAscii`), or no
# borders (`renderPlain`). Column widths count UTF-8 codepoints and ignore
# ANSI escape sequences, so coloured cells line up. Cells are copied.

export [Table];
export TABLE_ALIGN_LEFT;
export TABLE_ALIGN_RIGHT;
export TABLE_ALIGN_CENTER;

import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [Ansi] from "std/ansi.bpl";

global TABLE_ALIGN_LEFT: int = 0;
global TABLE_ALIGN_RIGHT: int = 1;
global TABLE_ALIGN_CENTER: int = 2;

struct TableStyle {
    top: string,
    topJoin: string,
    topLeft: string,
    topRight: string,
    middle: string,
    middleJoin: string,
    middleLeft: string,
    middleRight: string,
    bottom: string,
    bottomJoin: string,
    bottomLeft: string,
    bottomRight: string,
    vertical: string,
    bordered: bool,
}

struct Table {
    header: Array<String>,
    rows: Array<Array<String>>,
    alignments: Array<int>,
    padding: int,
    frame new() ret Table {
        local table: Table;
        table.header = Array<String>.new(4);
        table.rows = Array<Array<String>>.new(8);
        table.alignments = Array<int>.new(4);
        table.padding = 1;
        return table;
    }

    # Sets the header cells (copied).
    frame setHeader(this: *Table, cells: *Array<string>) {
        Table._destroyCells(&this.header);
        this.header = Array<String>.new(cells.length);
        loop (local i: int = 0; i < cells.length; i = i + 1) {
            this.header.push(String.new(cells.data[i]));
        }
    }

    # Appends a row of cells (copied). Rows may have different lengths.
    frame addRow(this: *Table, cells: *Array<string>) {
        local row: Array<String> = Array<String>.new(cells.length);
        loop (local i: int = 0; i < cells.length; i = i + 1) {
            row.push(String.new(cells.data[i]));
        }
        this.rows.push(row);
    }

    # Appends a row of Strings (copied).
    frame addStringRow(this: *Table, cells: *Array<String>) {
        local row: Array<String> = Array<String>.new(cells.length);
        loop (local i: int = 0; i < cells.length; i = i + 1) {
            row.push(String.new(cells.data[i].data));
        }
        this.rows.push(row);
    }

    # Sets the alignment of `column` (TABLE_ALIGN_LEFT/RIGHT/CENTER).
    frame setAlignment(this: *Table, column: int, alignment: int) {
        loop (this.alignments.length <= column) {
            this.alignments.push(TABLE_ALIGN_LEFT);
        }
        this.alignments.data[column] = alignment;
    }

    # Spaces on each side of a cell (default 1).
    frame setPadding(this: *Table, padding: int) {
        if (padding < 0) {
            padding = 0;
        }
        this.padding = padding;
    }

    frame rowCount(this: *Table) ret int {
        return this.rows.length;
    }

    frame _columns(this: *Table) ret int {
        local columns: int = this.header.length;
        loop (local r: int = 0; r < this.rows.length; r = r + 1) {
            if (this.rows.data[r].length > columns) {
                columns = this.rows.data[r].length;
            }
        }
        return columns;
    }

    frame _widths(this: *Table, columns: int) ret Array<int> {
        local widths: Array<int> = Array<int>.new(columns);
        loop (local c: int = 0; c < columns; c = c + 1) {
            local width: int = 0;
            if (c < this.header.length) {
                width = Ansi.visibleWidth(this.header.data[c].data);
            }
            loop (local r: int = 0; r < this.rows.length; r = r + 1) {
                if (c < this.rows.data[r].length) {
                    local w: int = Ansi.visibleWidth(this.rows.data[r].data[c].data);
                    if (w > width) {
                        width = w;
                    }
                }
            }
            widths.push(width);
        }
        return widths;
    }

    frame _appendRepeated(out: *StringBuilder, text: string, count: int) {
        loop (local i: int = 0; i < count; i = i + 1) {
            out.append(text);
        }
    }

    frame _rule(this: *Table, out: *StringBuilder, widths: *Array<int>, fill: string, left: string, join: string, right: string) {
        out.append(left);
        loop (local c: int = 0; c < widths.length; c = c + 1) {
            if (c > 0) {
                out.append(join);
            }
            Table._appendRepeated(out, fill, widths.data[c] + (2 * this.padding));
        }
        out.append(right);
        out.appendChar('\n');
    }

    frame _row(this: *Table, out: *StringBuilder, cells: *Array<String>, widths: *Array<int>, style: *TableStyle) {
        if (style.bordered) {
            out.append(style.vertical);
        }
        loop (local c: int = 0; c < widths.length; c = c + 1) {
            if ((c > 0) && style.bordered) {
                out.append(style.vertical);
            } else if (c > 0) {
                out.append("  ");
            }
            local text: string = "";
            if (c < cells.length) {
                text = cells.data[c].data;
            }
            local alignment: int = TABLE_ALIGN_LEFT;
            if (c < this.alignments.length) {
                alignment = this.alignments.data[c];
            }
            local gap: int = widths.data[c] - Ansi.visibleWidth(text);
            local before: int = 0;
            if (alignment == TABLE_ALIGN_RIGHT) {
                before = gap;
            } else if (alignment == TABLE_ALIGN_CENTER) {
                before = gap / 2;
            }
            local pad: int = this.padding;
            if (!style.bordered) {
                pad = 0;
            }
            Table._appendRepeated(out, " ", pad + before);
            out.append(text);
            local after: int = (gap - before) + pad;
            # Unbordered output does not pad the last column with spaces.
            if (style.bordered || (c < (widths.length - 1))) {
                Table._appendRepeated(out, " ", after);
            }
        }
        if (style.bordered) {
            out.append(style.vertical);
        } else {
            # Plain rows never end in padding.
            loop ((out.length > 0) && (out.buffer[out.length - 1] == ' ')) {
                out.length = out.length - 1;
            }
            out.buffer[out.length] = cast<char>(0);
        }
        out.appendChar('\n');
    }

    frame _render(this: *Table, style: TableStyle) ret String {
        local out: StringBuilder = StringBuilder.new(128);
        local columns: int = this._columns();
        local widths: Array<int> = this._widths(columns);
        if (style.bordered) {
            this._rule(&out, &widths, style.top, style.topLeft, style.topJoin, style.topRight);
        }
        if (this.header.length > 0) {
            this._row(&out, &this.header, &widths, &style);
            if (style.bordered) {
                this._rule(&out, &widths, style.middle, style.middleLeft, style.middleJoin, style.middleRight);
            } else {
                local rule: StringBuilder = StringBuilder.new(32);
                loop (local c: int = 0; c < columns; c = c + 1) {
                    if (c > 0) {
                        rule.append("  ");
                    }
                    Table._appendRepeated(&rule, "-", widths.data[c]);
                }
                out.append(rule.buffer);
                out.appendChar('\n');
                rule.destroy();
            }
        }
        loop (local r: int = 0; r < this.rows.length; r = r + 1) {
            this._row(&out, &this.rows.data[r], &widths, &style);
        }
        if (style.bordered) {
            this._rule(&out, &widths, style.bottom, style.bottomLeft, style.bottomJoin, style.bottomRight);
        }
        widths.destroy();
        local result: String;
        result.data = out.buffer;
        result.length = out.length;
        return result;
    }

    # Unicode box-drawing borders.
    frame render(this: *Table) ret String {
        return this._render(TableStyle { top: "─", topJoin: "┬", topLeft: "┌", topRight: "┐", middle: "─", middleJoin: "┼", middleLeft: "├", middleRight: "┤", bottom: "─", bottomJoin: "┴", bottomLeft: "└", bottomRight: "┘", vertical: "│", bordered: true });
    }

    # ASCII borders (+, -, |).
    frame renderAscii(this: *Table) ret String {
        return this._render(TableStyle { top: "-", topJoin: "+", topLeft: "+", topRight: "+", middle: "-", middleJoin: "+", middleLeft: "+", middleRight: "+", bottom: "-", bottomJoin: "+", bottomLeft: "+", bottomRight: "+", vertical: "|", bordered: true });
    }

    # Columns separated by two spaces with a dashed header rule.
    frame renderPlain(this: *Table) ret String {
        return this._render(TableStyle { top: "", topJoin: "", topLeft: "", topRight: "", middle: "", middleJoin: "", middleLeft: "", middleRight: "", bottom: "", bottomJoin: "", bottomLeft: "", bottomRight: "", vertical: "", bordered: false });
    }

    frame _destroyCells(cells: *Array<String>) {
        loop (local i: int = 0; i < cells.length; i = i + 1) {
            local cell: String = cells.data[i];
            cell.destroy();
        }
        cells.destroy();
    }

    frame destroy(this: *Table) {
        Table._destroyCells(&this.header);
        loop (local r: int = 0; r < this.rows.length; r = r + 1) {
            Table._destroyCells(&this.rows.data[r]);
        }
        this.rows.destroy();
        this.alignments.destroy();
    }
}
