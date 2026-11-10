# Markdown to HTML (CommonMark/GFM subset). Output is safe to embed: raw
# HTML is escaped and link/image URLs with unsafe schemes are replaced.

import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;

export [Markdown];
export [MarkdownOptions];

struct MarkdownOptions {
    # Adds id="slug" to headings (lowercase letters, digits and hyphens).
    heading_ids: bool,
    # Adds rel="nofollow noopener" to links.
    nofollow: bool,
    # Nesting limit for block quotes and lists (1 to 64).
    max_depth: int,
    frame defaults() ret MarkdownOptions {
        local options: MarkdownOptions;
        options.heading_ids = false;
        options.nofollow = false;
        options.max_depth = 16;
        return options;
    }
}

frame mdCopy(text: string, start: long, end: long) ret string {
    local copy: string = cast<string>(malloc((end - start) + 1));
    if (copy == nullptr) {
        throw "Markdown allocation failed";
    }
    loop (local i: long = start; i < end; i = i + 1) {
        copy[i - start] = text[i];
    }
    copy[end - start] = 0;
    return copy;
}

frame mdFreeLines(lines: *Array<string>) {
    loop (local i: int = 0; i < lines.len(); i = i + 1) {
        free(lines.get(i));
    }
    lines.destroy();
}

frame mdIsSpace(c: char) ret bool {
    return (c == ' ') || (c == '\t');
}

frame mdIsAlnum(c: char) ret bool {
    return ((c >= 'a') && (c <= 'z')) || ((c >= 'A') && (c <= 'Z')) || ((c >= '0') && (c <= '9')) || (cast<u8>(c) >= cast<u8>(128));
}

frame mdIsPunct(c: char) ret bool {
    local code: int = cast<int>(cast<u8>(c));
    return ((code >= 33) && (code <= 47)) || ((code >= 58) && (code <= 64)) || ((code >= 91) && (code <= 96)) || ((code >= 123) && (code <= 126));
}

frame mdBlank(line: string) ret bool {
    loop (local i: int = 0; line[i] != 0; i = i + 1) {
        if (!mdIsSpace(line[i])) {
            return false;
        }
    }
    return true;
}

# Leading indentation in columns (tabs advance to the next multiple of 4).
frame mdIndent(line: string) ret int {
    local columns: int = 0;
    loop (local i: int = 0; mdIsSpace(line[i]); i = i + 1) {
        if (line[i] == '\t') {
            columns = columns + (4 - (columns % 4));
        } else {
            columns = columns + 1;
        }
    }
    return columns;
}

# Copy of `line` without its first `columns` columns of indentation.
frame mdDedent(line: string, columns: int) ret string {
    local used: int = 0;
    local i: int = 0;
    local out: StringBuilder = StringBuilder.new(32);
    loop ((used < columns) && mdIsSpace(line[i])) {
        if (line[i] == '\t') {
            local width: int = 4 - (used % 4);
            if ((used + width) > columns) {
                # A tab straddling the boundary leaves its remaining columns.
                loop (local k: int = 0; k < ((used + width) - columns); k = k + 1) {
                    out.appendChar(' ');
                }
                used = columns;
                i = i + 1;
                break;
            }
            used = used + width;
        } else {
            used = used + 1;
        }
        i = i + 1;
    }
    out.append(line + i);
    local result: string = mdCopy(out.toString(), 0, cast<long>(out.len()));
    out.destroy();
    return result;
}

frame mdEscape(out: *StringBuilder, text: string, start: long, end: long) {
    loop (local i: long = start; i < end; i = i + 1) {
        local c: char = text[i];
        if (c == '&') {
            out.append("&amp;");
        } else if (c == '<') {
            out.append("&lt;");
        } else if (c == '>') {
            out.append("&gt;");
        } else if (c == '"') {
            out.append("&quot;");
        } else {
            out.appendChar(c);
        }
    }
}

frame mdEscapeAll(out: *StringBuilder, text: string) {
    mdEscape(out, text, 0, strlen(text));
}

struct ListMarker {
    ordered: bool,
    # Bullet character or ordered delimiter ('.' or ')').
    symbol: char,
    start: int,
    # Columns from the line start to the item content.
    content: int,
    # Byte index of the item content on the marker line.
    offset: int,
    valid: bool,
}

struct Markdown {
    options: MarkdownOptions,
    out: StringBuilder,
    # Scan steps left for delimiter, bracket and backtick searches. Once
    # spent, unmatched-looking syntax renders literally, which bounds the
    # time spent on adversarial input.
    budget: long,
    # Current nesting of inline() (emphasis inside links inside ...).
    inline_depth: int,

    # Renders with default options; returns an owned String.
    frame toHtml(text: string) ret String {
        local options: MarkdownOptions = MarkdownOptions.defaults();
        return Markdown.render(text, &options);
    }
    frame render(text: string, options: *MarkdownOptions) ret String {
        if (text == nullptr) {
            throw "Markdown text is required";
        }
        if ((options.max_depth < 1) || (options.max_depth > 64)) {
            throw "Markdown nesting limit must be 1 to 64";
        }
        local renderer: Markdown;
        renderer.options = *options;
        renderer.out = StringBuilder.new(256);
        renderer.budget = 20000000;
        renderer.inline_depth = 0;
        local owner: *StringBuilder = &renderer.out;
        defer owner.destroy();
        local lines: Array<string> = Array<string>.new(16);
        local length: long = strlen(text);
        local start: long = 0;
        loop (start <= length) {
            local end: long = start;
            loop ((end < length) && (text[end] != '\n')) {
                end = end + 1;
            }
            local stop: long = end;
            if ((stop > start) && (text[stop - 1] == '\r')) {
                stop = stop - 1;
            }
            if ((end < length) || (stop > start)) {
                lines.push(mdCopy(text, start, stop));
            }
            start = end + 1;
        }
        renderer.blocks(&lines, false, 0);
        mdFreeLines(&lines);
        return String.new(renderer.out.toString());
    }

    # ---- block structure ---------------------------------------------------

    frame fenceLength(line: string, fence: *char) ret int {
        local i: int = 0;
        loop ((i < 3) && (line[i] == ' ')) {
            i = i + 1;
        }
        local c: char = line[i];
        if ((c != '`') && (c != '~')) {
            return 0;
        }
        local count: int = 0;
        loop (line[i + count] == c) {
            count = count + 1;
        }
        if (count < 3) {
            return 0;
        }
        if (c == '`') {
            # A backtick fence's info string cannot contain backticks.
            loop (local j: int = i + count; line[j] != 0; j = j + 1) {
                if (line[j] == '`') {
                    return 0;
                }
            }
        }
        fence[0] = c;
        return count;
    }
    frame headingLevel(line: string) ret int {
        local i: int = 0;
        loop ((i < 3) && (line[i] == ' ')) {
            i = i + 1;
        }
        local level: int = 0;
        loop (line[i + level] == '#') {
            level = level + 1;
        }
        if ((level < 1) || (level > 6)) {
            return 0;
        }
        local next: char = line[i + level];
        if ((next != 0) && !mdIsSpace(next)) {
            return 0;
        }
        return level;
    }
    frame isBreak(line: string) ret bool {
        local c: char = cast<char>(0);
        local count: int = 0;
        if (mdIndent(line) >= 4) {
            return false;
        }
        loop (local i: int = 0; line[i] != 0; i = i + 1) {
            if (mdIsSpace(line[i])) {
                continue;
            }
            if ((line[i] != '-') && (line[i] != '*') && (line[i] != '_')) {
                return false;
            }
            if ((c != 0) && (line[i] != c)) {
                return false;
            }
            c = line[i];
            count = count + 1;
        }
        return count >= 3;
    }
    frame isQuote(line: string) ret bool {
        local i: int = 0;
        loop ((i < 3) && (line[i] == ' ')) {
            i = i + 1;
        }
        return line[i] == '>';
    }
    frame listMarker(line: string) ret ListMarker {
        local marker: ListMarker;
        marker.valid = false;
        marker.ordered = false;
        marker.symbol = cast<char>(0);
        marker.start = 1;
        marker.content = 0;
        marker.offset = 0;
        local indent: int = mdIndent(line);
        if (indent >= 4) {
            return marker;
        }
        local i: int = 0;
        loop (mdIsSpace(line[i])) {
            i = i + 1;
        }
        local width: int = 0;
        local c: char = line[i];
        if ((c == '-') || (c == '*') || (c == '+')) {
            marker.symbol = c;
            width = 1;
        } else {
            local number: int = 0;
            loop ((width < 9) && (line[i + width] >= '0') && (line[i + width] <= '9')) {
                number = (number * 10) + cast<int>(line[i + width] - '0');
                width = width + 1;
            }
            if ((width == 0) || ((line[i + width] != '.') && (line[i + width] != ')'))) {
                return marker;
            }
            marker.ordered = true;
            marker.symbol = line[i + width];
            marker.start = number;
            width = width + 1;
        }
        local after: char = line[i + width];
        if ((after != 0) && !mdIsSpace(after)) {
            return marker;
        }
        local spaces: int = 0;
        loop (mdIsSpace(line[i + width + spaces]) && (spaces < 5)) {
            spaces = spaces + 1;
        }
        # Blank item or code inside the item: content starts one column in.
        local consumed: int = spaces;
        if ((line[i + width + spaces] == 0) || (spaces > 4) || (spaces == 0)) {
            consumed = 0;
            if (spaces > 0) {
                consumed = 1;
            }
            spaces = 1;
        }
        marker.content = indent + width + spaces;
        marker.offset = i + width + consumed;
        marker.valid = true;
        return marker;
    }
    frame isTableDelimiter(line: string) ret bool {
        local dashes: int = 0;
        local pipes: int = 0;
        loop (local i: int = 0; line[i] != 0; i = i + 1) {
            local c: char = line[i];
            if (c == '-') {
                dashes = dashes + 1;
            } else if (c == '|') {
                pipes = pipes + 1;
            } else if ((c != ':') && !mdIsSpace(c)) {
                return false;
            }
        }
        return (dashes > 0) && (pipes > 0);
    }
    frame hasPipe(line: string) ret bool {
        loop (local i: int = 0; line[i] != 0; i = i + 1) {
            if ((line[i] == '\\') && (line[i + 1] != 0)) {
                i = i + 1;
            } else if (line[i] == '|') {
                return true;
            }
        }
        return false;
    }
    # Whether `line` starts a block that ends a paragraph.
    frame interrupts(this: *Markdown, line: string) ret bool {
        local fence: char = cast<char>(0);
        if ((Markdown.headingLevel(line) > 0) || (Markdown.fenceLength(line, &fence) > 0) || Markdown.isBreak(line) || Markdown.isQuote(line)) {
            return true;
        }
        local marker: ListMarker = Markdown.listMarker(line);
        if (marker.valid) {
            # Only non-empty bullets and lists starting at 1 interrupt.
            local blankItem: bool = mdBlank((line + marker.content) - 1) || (cast<long>(marker.content) > strlen(line));
            return !blankItem && (!marker.ordered || (marker.start == 1));
        }
        return false;
    }

    frame blocks(this: *Markdown, lines: *Array<string>, tight: bool, depth: int) {
        local i: int = 0;
        local n: int = lines.len();
        loop (i < n) {
            local line: string = lines.get(i);
            if (mdBlank(line)) {
                i = i + 1;
                continue;
            }
            local fence: char = cast<char>(0);
            local fenceSize: int = Markdown.fenceLength(line, &fence);
            if (fenceSize > 0) {
                i = this.codeFence(lines, i, fence, fenceSize);
                continue;
            }
            if (mdIndent(line) >= 4) {
                i = this.indentedCode(lines, i);
                continue;
            }
            local level: int = Markdown.headingLevel(line);
            if (level > 0) {
                this.heading(line, level);
                i = i + 1;
                continue;
            }
            if (Markdown.isBreak(line)) {
                this.out.append("<hr />\n");
                i = i + 1;
                continue;
            }
            if (Markdown.isQuote(line)) {
                i = this.quote(lines, i, depth);
                continue;
            }
            local marker: ListMarker = Markdown.listMarker(line);
            if (marker.valid) {
                i = this.list(lines, i, marker, depth);
                continue;
            }
            if (((i + 1) < n) && Markdown.hasPipe(line) && Markdown.isTableDelimiter(lines.get(i + 1))) {
                local columns: int = this.cellCount(line);
                if (columns == this.cellCount(lines.get(i + 1))) {
                    i = this.table(lines, i, columns);
                    continue;
                }
            }
            i = this.paragraph(lines, i, tight);
        }
    }
    frame codeFence(this: *Markdown, lines: *Array<string>, first: int, fence: char, size: int) ret int {
        local opener: string = lines.get(first);
        local indent: int = mdIndent(opener);
        local info: long = cast<long>(indent + size);
        loop (mdIsSpace(opener[info])) {
            info = info + 1;
        }
        local infoEnd: long = info;
        loop ((opener[infoEnd] != 0) && !mdIsSpace(opener[infoEnd])) {
            infoEnd = infoEnd + 1;
        }
        this.out.append("<pre><code");
        if (infoEnd > info) {
            this.out.append(" class=\"language-");
            this.inlineText(opener, info, infoEnd);
            this.out.append("\"");
        }
        this.out.append(">");
        local i: int = first + 1;
        loop (i < lines.len()) {
            local line: string = lines.get(i);
            local closeChar: char = cast<char>(0);
            local closeSize: int = Markdown.fenceLength(line, &closeChar);
            if ((closeSize >= size) && (closeChar == fence)) {
                local rest: int = 0;
                loop (line[rest] == ' ') {
                    rest = rest + 1;
                }
                rest = rest + closeSize;
                if (mdBlank(line + rest)) {
                    i = i + 1;
                    break;
                }
            }
            local content: string = mdDedent(line, indent);
            mdEscapeAll(&this.out, content);
            free(content);
            this.out.appendChar('\n');
            i = i + 1;
        }
        this.out.append("</code></pre>\n");
        return i;
    }
    frame indentedCode(this: *Markdown, lines: *Array<string>, first: int) ret int {
        local last: int = first;
        local i: int = first;
        loop ((i < lines.len()) && (mdBlank(lines.get(i)) || (mdIndent(lines.get(i)) >= 4))) {
            if (!mdBlank(lines.get(i))) {
                last = i;
            }
            i = i + 1;
        }
        this.out.append("<pre><code>");
        loop (local j: int = first; j <= last; j = j + 1) {
            local content: string = mdDedent(lines.get(j), 4);
            mdEscapeAll(&this.out, content);
            free(content);
            this.out.appendChar('\n');
        }
        this.out.append("</code></pre>\n");
        return last + 1;
    }
    frame heading(this: *Markdown, line: string, level: int) {
        local start: long = 0;
        loop (line[start] == ' ') {
            start = start + 1;
        }
        start = start + cast<long>(level);
        loop (mdIsSpace(line[start])) {
            start = start + 1;
        }
        local end: long = strlen(line);
        loop ((end > start) && mdIsSpace(line[end - 1])) {
            end = end - 1;
        }
        # Optional closing sequence: spaces then only '#'.
        local hashes: long = end;
        loop ((hashes > start) && (line[hashes - 1] == '#')) {
            hashes = hashes - 1;
        }
        if ((hashes == start) || mdIsSpace(line[hashes - 1])) {
            end = hashes;
            loop ((end > start) && mdIsSpace(line[end - 1])) {
                end = end - 1;
            }
        }
        this.headingRange(line, start, end, level);
    }
    frame headingRange(this: *Markdown, text: string, start: long, end: long, level: int) {
        this.out.append("<h");
        this.out.appendInt(level);
        if (this.options.heading_ids) {
            this.out.append(" id=\"");
            local dash: bool = false;
            local written: int = 0;
            loop (local i: long = start; i < end; i = i + 1) {
                local c: char = text[i];
                if ((c >= 'A') && (c <= 'Z')) {
                    c = c + cast<char>(32);
                }
                if (((c >= 'a') && (c <= 'z')) || ((c >= '0') && (c <= '9'))) {
                    if (dash && (written > 0)) {
                        this.out.appendChar('-');
                    }
                    this.out.appendChar(c);
                    written = written + 1;
                    dash = false;
                } else if ((c == ' ') || (c == '-') || (c == '_')) {
                    dash = true;
                }
            }
            if (written == 0) {
                this.out.append("section");
            }
            this.out.append("\"");
        }
        this.out.append(">");
        this.inline(text, start, end);
        this.out.append("</h");
        this.out.appendInt(level);
        this.out.append(">\n");
    }
    frame quote(this: *Markdown, lines: *Array<string>, first: int, depth: int) ret int {
        local inner: Array<string> = Array<string>.new(8);
        local i: int = first;
        local lazy: bool = false;
        loop (i < lines.len()) {
            local line: string = lines.get(i);
            if (Markdown.isQuote(line)) {
                local j: int = 0;
                loop (line[j] != '>') {
                    j = j + 1;
                }
                j = j + 1;
                if (line[j] == ' ') {
                    j = j + 1;
                }
                local content: string = mdCopy(line, cast<long>(j), strlen(line));
                lazy = !mdBlank(content);
                inner.push(content);
            } else if (lazy && !mdBlank(line) && !this.interrupts(line) && (mdIndent(line) < 4)) {
                # Lazy continuation of a quoted paragraph.
                inner.push(mdCopy(line, 0, strlen(line)));
            } else {
                break;
            }
            i = i + 1;
        }
        this.out.append("<blockquote>\n");
        if (depth < this.options.max_depth) {
            this.blocks(&inner, false, depth + 1);
        } else {
            this.paragraph(&inner, 0, false);
        }
        this.out.append("</blockquote>\n");
        mdFreeLines(&inner);
        return i;
    }
    frame list(this: *Markdown, lines: *Array<string>, first: int, marker: ListMarker, depth: int) ret int {
        # Gather items; each item's lines are dedented by its content column.
        local items: Array<Array<string>> = Array<Array<string>>.new(4);
        local loose: bool = false;
        local i: int = first;
        local current: ListMarker = marker;
        loop (i < lines.len()) {
            local line: string = lines.get(i);
            local item: Array<string> = Array<string>.new(4);
            # First line: content after the marker.
            local firstLine: string = mdCopy(line, cast<long>(current.offset), strlen(line));
            item.push(firstLine);
            i = i + 1;
            local sawBlank: bool = false;
            local ended: bool = false;
            loop ((i < lines.len()) && !ended) {
                local next: string = lines.get(i);
                if (mdBlank(next)) {
                    item.push(mdCopy("", 0, 0));
                    sawBlank = true;
                    i = i + 1;
                } else if (mdIndent(next) >= current.content) {
                    if (sawBlank) {
                        loose = true;
                    }
                    item.push(mdDedent(next, current.content));
                    sawBlank = false;
                    i = i + 1;
                } else if (!sawBlank && !this.interrupts(next) && !Markdown.listMarker(next).valid) {
                    # Lazy paragraph continuation.
                    item.push(mdCopy(next, 0, strlen(next)));
                    i = i + 1;
                } else {
                    ended = true;
                }
            }
            # Trailing blank lines belong between items, not to the item.
            local trailing: int = 0;
            loop ((item.len() > 1) && mdBlank(item.get(item.len() - 1))) {
                free(item.pop());
                trailing = trailing + 1;
            }
            items.push(item);
            if (i >= lines.len()) {
                break;
            }
            local following: ListMarker = Markdown.listMarker(lines.get(i));
            if (!following.valid || (following.ordered != marker.ordered) || (following.symbol != marker.symbol) || Markdown.isBreak(lines.get(i))) {
                if (trailing > 0) {
                    # Leave blank lines to the outer block parser.
                    i = i - trailing;
                }
                break;
            }
            if (trailing > 0) {
                loose = true;
            }
            current = following;
        }
        if (marker.ordered) {
            this.out.append("<ol");
            if (marker.start != 1) {
                this.out.append(" start=\"");
                this.out.appendInt(marker.start);
                this.out.append("\"");
            }
            this.out.append(">\n");
        } else {
            this.out.append("<ul>\n");
        }
        loop (local k: int = 0; k < items.len(); k = k + 1) {
            local item: *Array<string> = items.getRef(k);
            this.out.append("<li>");
            if (depth < this.options.max_depth) {
                if (!loose && (item.len() > 0) && !this.startsBlock(item.get(0))) {
                    # Tight items render their leading paragraph inline.
                    this.blocks(item, true, depth + 1);
                } else {
                    this.out.appendChar('\n');
                    this.blocks(item, !loose, depth + 1);
                }
            } else {
                this.paragraph(item, 0, true);
            }
            this.trimNewline();
            this.out.append("</li>\n");
            mdFreeLines(item);
        }
        items.destroy();
        if (marker.ordered) {
            this.out.append("</ol>\n");
        } else {
            this.out.append("</ul>\n");
        }
        return i;
    }
    frame startsBlock(this: *Markdown, line: string) ret bool {
        local fence: char = cast<char>(0);
        return (Markdown.headingLevel(line) > 0) || (Markdown.fenceLength(line, &fence) > 0) || Markdown.isBreak(line) || Markdown.isQuote(line) || Markdown.listMarker(line).valid || (mdIndent(line) >= 4);
    }
    frame trimNewline(this: *Markdown) {
        if ((this.out.length > 0) && (this.out.buffer[this.out.length - 1] == '\n')) {
            # Keep "</p>\n" style separators inside loose items readable.
            local previous: char = cast<char>(0);
            if (this.out.length > 1) {
                previous = this.out.buffer[this.out.length - 2];
            }
            if (previous != '>') {
                this.out.length = this.out.length - 1;
                this.out.buffer[this.out.length] = 0;
            }
        }
    }
    frame cellCount(this: *Markdown, line: string) ret int {
        local cells: Array<string> = Markdown.cells(line);
        local count: int = cells.len();
        mdFreeLines(&cells);
        return count;
    }
    # Splits a table row on unescaped pipes, trimming cells and the
    # optional leading/trailing pipe. Escaped pipes become literal.
    frame cells(line: string) ret Array<string> {
        local cells: Array<string> = Array<string>.new(4);
        local i: long = 0;
        loop (mdIsSpace(line[i])) {
            i = i + 1;
        }
        if (line[i] == '|') {
            i = i + 1;
        }
        local cell: StringBuilder = StringBuilder.new(16);
        local pending: bool = false;
        loop (line[i] != 0) {
            if ((line[i] == '\\') && (line[i + 1] == '|')) {
                cell.appendChar('|');
                pending = true;
                i = i + 2;
                continue;
            }
            if (line[i] == '|') {
                cells.push(Markdown.trimmed(cell.toString()));
                cell.clear();
                pending = false;
                i = i + 1;
                continue;
            }
            cell.appendChar(line[i]);
            if (!mdIsSpace(line[i])) {
                pending = true;
            }
            i = i + 1;
        }
        if (pending) {
            cells.push(Markdown.trimmed(cell.toString()));
        }
        cell.destroy();
        return cells;
    }
    frame trimmed(text: string) ret string {
        local start: long = 0;
        local end: long = strlen(text);
        loop ((start < end) && mdIsSpace(text[start])) {
            start = start + 1;
        }
        loop ((end > start) && mdIsSpace(text[end - 1])) {
            end = end - 1;
        }
        return mdCopy(text, start, end);
    }
    frame table(this: *Markdown, lines: *Array<string>, first: int, columns: int) ret int {
        local delimiter: Array<string> = Markdown.cells(lines.get(first + 1));
        local align: Array<int> = Array<int>.new(columns);
        loop (local c: int = 0; c < columns; c = c + 1) {
            local cellSpec: string = delimiter.get(c);
            local length: long = strlen(cellSpec);
            local left: bool = (length > 0) && (cellSpec[0] == ':');
            local right: bool = (length > 0) && (cellSpec[length - 1] == ':');
            if (left && right) {
                align.push(3);
            } else if (right) {
                align.push(2);
            } else if (left) {
                align.push(1);
            } else {
                align.push(0);
            }
        }
        mdFreeLines(&delimiter);
        this.out.append("<table>\n<thead>\n");
        this.tableRow(lines.get(first), "th", &align);
        this.out.append("</thead>\n");
        local i: int = first + 2;
        local body: bool = false;
        loop ((i < lines.len()) && !mdBlank(lines.get(i)) && Markdown.hasPipe(lines.get(i)) && !this.interrupts(lines.get(i))) {
            if (!body) {
                this.out.append("<tbody>\n");
                body = true;
            }
            this.tableRow(lines.get(i), "td", &align);
            i = i + 1;
        }
        if (body) {
            this.out.append("</tbody>\n");
        }
        this.out.append("</table>\n");
        align.destroy();
        return i;
    }
    frame tableRow(this: *Markdown, line: string, tag: string, align: *Array<int>) {
        local cells: Array<string> = Markdown.cells(line);
        this.out.append("<tr>\n");
        loop (local c: int = 0; c < align.len(); c = c + 1) {
            this.out.appendChar('<');
            this.out.append(tag);
            local a: int = align.get(c);
            if (a == 1) {
                this.out.append(" align=\"left\"");
            } else if (a == 2) {
                this.out.append(" align=\"right\"");
            } else if (a == 3) {
                this.out.append(" align=\"center\"");
            }
            this.out.appendChar('>');
            if (c < cells.len()) {
                local cell: string = cells.get(c);
                this.inline(cell, 0, strlen(cell));
            }
            this.out.append("</");
            this.out.append(tag);
            this.out.append(">\n");
        }
        this.out.append("</tr>\n");
        mdFreeLines(&cells);
    }
    frame isSetextUnderline(line: string) ret int {
        if (mdIndent(line) >= 4) {
            return 0;
        }
        local i: int = 0;
        loop (line[i] == ' ') {
            i = i + 1;
        }
        local c: char = line[i];
        if ((c != '=') && (c != '-')) {
            return 0;
        }
        loop (line[i] == c) {
            i = i + 1;
        }
        if (!mdBlank(line + i)) {
            return 0;
        }
        if (c == '=') {
            return 1;
        }
        return 2;
    }
    frame paragraph(this: *Markdown, lines: *Array<string>, first: int, tight: bool) ret int {
        local text: StringBuilder = StringBuilder.new(64);
        local i: int = first;
        local setext: int = 0;
        loop (i < lines.len()) {
            local line: string = lines.get(i);
            if (mdBlank(line)) {
                break;
            }
            if (i > first) {
                setext = Markdown.isSetextUnderline(line);
                if (setext > 0) {
                    i = i + 1;
                    break;
                }
                if (this.interrupts(line)) {
                    break;
                }
                text.appendChar('\n');
            }
            local start: int = 0;
            loop (mdIsSpace(line[start])) {
                start = start + 1;
            }
            text.append(line + start);
            i = i + 1;
        }
        local content: string = text.toString();
        local end: long = cast<long>(text.len());
        loop ((end > 0) && mdIsSpace(content[end - 1])) {
            end = end - 1;
        }
        if (setext > 0) {
            this.headingRange(content, 0, end, setext);
        } else if (tight) {
            this.inline(content, 0, end);
            this.out.appendChar('\n');
        } else {
            this.out.append("<p>");
            this.inline(content, 0, end);
            this.out.append("</p>\n");
        }
        text.destroy();
        return i;
    }

    # ---- inline content ------------------------------------------------------

    # Escaped text with backslash escapes resolved (for attributes).
    frame inlineText(this: *Markdown, text: string, start: long, end: long) {
        loop (local i: long = start; i < end; i = i + 1) {
            if ((text[i] == '\\') && ((i + 1) < end) && mdIsPunct(text[i + 1])) {
                i = i + 1;
            }
            mdEscape(&this.out, text, i, i + 1);
        }
    }
    frame safeUrl(text: string, start: long, end: long) ret bool {
        # A scheme is letters/digits/+-. before the first ':' (and before any
        # '/', '?' or '#'). Only http, https and mailto schemes are allowed;
        # relative URLs and fragments are always fine.
        loop (local i: long = start; i < end; i = i + 1) {
            local c: char = text[i];
            if ((c == '/') || (c == '?') || (c == '#')) {
                return true;
            }
            if (c == ':') {
                local length: long = i - start;
                local scheme: char[8];
                if ((length < 1) || (length > 6)) {
                    return false;
                }
                loop (local j: long = 0; j < length; j = j + 1) {
                    local s: char = text[start + j];
                    if ((s >= 'A') && (s <= 'Z')) {
                        s = s + cast<char>(32);
                    }
                    scheme[j] = s;
                }
                scheme[length] = 0;
                local name: string = cast<string>(&scheme[0]);
                return Markdown.same(name, "http") || Markdown.same(name, "https") || Markdown.same(name, "mailto");
            }
            if ((cast<u8>(c) < cast<u8>(32)) || (c == 127)) {
                # Browsers drop tabs and newlines inside URLs, so control
                # characters could hide a scheme. Spaces are written as %20.
                return false;
            }
        }
        return true;
    }
    frame same(a: string, b: string) ret bool {
        local i: int = 0;
        loop ((a[i] != 0) && (a[i] == b[i])) {
            i = i + 1;
        }
        return a[i] == b[i];
    }
    frame url(this: *Markdown, text: string, start: long, end: long) {
        if (!Markdown.safeUrl(text, start, end)) {
            this.out.appendChar('#');
            return;
        }
        loop (local i: long = start; i < end; i = i + 1) {
            local c: char = text[i];
            if ((c == '\\') && ((i + 1) < end) && mdIsPunct(text[i + 1])) {
                i = i + 1;
                c = text[i];
            }
            if (c == ' ') {
                this.out.append("%20");
            } else {
                mdEscape(&this.out, text, i, i + 1);
            }
        }
    }
    # Finds the ']' matching '[' at `open`, or -1.
    frame closeBracket(this: *Markdown, text: string, open: long, end: long) ret long {
        local depth: int = 0;
        loop (local i: long = open; i < end; i = i + 1) {
            this.budget = this.budget - 1;
            if (this.budget <= 0) {
                return -1;
            }
            local c: char = text[i];
            if ((c == '\\') && ((i + 1) < end)) {
                i = i + 1;
            } else if (c == '`') {
                # Brackets inside code spans do not count.
                local run: long = 0;
                loop (((i + run) < end) && (text[i + run] == '`')) {
                    run = run + 1;
                }
                local close: long = this.findBackticks(text, i + run, end, run);
                if (close >= 0) {
                    i = (close + run) - 1;
                } else {
                    i = (i + run) - 1;
                }
            } else if (c == '[') {
                depth = depth + 1;
            } else if (c == ']') {
                depth = depth - 1;
                if (depth == 0) {
                    return i;
                }
            }
        }
        return -1;
    }
    frame findBackticks(this: *Markdown, text: string, begin: long, end: long, run: long) ret long {
        local i: long = begin;
        loop (i < end) {
            this.budget = this.budget - 1;
            if (this.budget <= 0) {
                return -1;
            }
            if (text[i] == '`') {
                local count: long = 0;
                loop (((i + count) < end) && (text[i + count] == '`')) {
                    count = count + 1;
                }
                if (count == run) {
                    return i;
                }
                i = i + count;
            } else {
                i = i + 1;
            }
        }
        return -1;
    }
    # Parses "(destination "title")" at `open`; on success stores the ranges
    # and returns the index after ')', else -1.
    frame linkTarget(text: string, open: long, end: long, dest: *long, title: *long) ret long {
        if ((open >= end) || (text[open] != '(')) {
            return -1;
        }
        local i: long = open + 1;
        loop ((i < end) && mdIsSpace(text[i])) {
            i = i + 1;
        }
        if ((i < end) && (text[i] == '<')) {
            dest[0] = i + 1;
            loop ((i < end) && (text[i] != '>') && (text[i] != '\n')) {
                i = i + 1;
            }
            if ((i >= end) || (text[i] != '>')) {
                return -1;
            }
            dest[1] = i;
            i = i + 1;
        } else {
            dest[0] = i;
            local parens: int = 0;
            loop ((i < end) && !mdIsSpace(text[i]) && (text[i] != '\n')) {
                if ((text[i] == '\\') && ((i + 1) < end)) {
                    i = i + 2;
                    continue;
                }
                if (text[i] == '(') {
                    parens = parens + 1;
                } else if (text[i] == ')') {
                    if (parens == 0) {
                        break;
                    }
                    parens = parens - 1;
                }
                i = i + 1;
            }
            dest[1] = i;
        }
        title[0] = -1;
        title[1] = -1;
        loop ((i < end) && (mdIsSpace(text[i]) || (text[i] == '\n'))) {
            i = i + 1;
        }
        if ((i < end) && ((text[i] == '"') || (text[i] == '\''))) {
            local quote: char = text[i];
            title[0] = i + 1;
            i = i + 1;
            loop ((i < end) && (text[i] != quote)) {
                if ((text[i] == '\\') && ((i + 1) < end)) {
                    i = i + 1;
                }
                i = i + 1;
            }
            if (i >= end) {
                return -1;
            }
            title[1] = i;
            i = i + 1;
            loop ((i < end) && mdIsSpace(text[i])) {
                i = i + 1;
            }
        }
        if ((i >= end) || (text[i] != ')')) {
            return -1;
        }
        return i + 1;
    }
    # Plain text of an image description (alt attributes cannot hold tags).
    frame altText(this: *Markdown, text: string, start: long, end: long) {
        loop (local i: long = start; i < end; i = i + 1) {
            local c: char = text[i];
            if ((c == '\\') && ((i + 1) < end) && mdIsPunct(text[i + 1])) {
                i = i + 1;
                mdEscape(&this.out, text, i, i + 1);
            } else if ((c != '*') && (c != '_') && (c != '`') && (c != '[') && (c != ']') && (c != '~')) {
                mdEscape(&this.out, text, i, i + 1);
            }
        }
    }
    frame autolink(this: *Markdown, text: string, open: long, end: long) ret long {
        local i: long = open + 1;
        local at: bool = false;
        local colon: bool = false;
        loop ((i < end) && (text[i] != '>')) {
            local c: char = text[i];
            if ((cast<u8>(c) <= cast<u8>(32)) || (c == '<')) {
                return -1;
            }
            if (c == '@') {
                at = true;
            }
            if (c == ':') {
                colon = true;
            }
            i = i + 1;
        }
        if ((i >= end) || (i == (open + 1)) || (!colon && !at)) {
            return -1;
        }
        if (colon) {
            if (!Markdown.safeUrl(text, open + 1, i)) {
                return -1;
            }
            this.out.append("<a href=\"");
            this.url(text, open + 1, i);
        } else {
            this.out.append("<a href=\"mailto:");
            mdEscape(&this.out, text, open + 1, i);
        }
        this.out.append("\"");
        if (this.options.nofollow) {
            this.out.append(" rel=\"nofollow noopener\"");
        }
        this.out.append(">");
        mdEscape(&this.out, text, open + 1, i);
        this.out.append("</a>");
        return i + 1;
    }
    # Index of a closing delimiter run of `count` `marker` characters that can
    # close emphasis opened before `from`, or -1.
    frame closingRun(this: *Markdown, text: string, begin: long, end: long, marker: char, count: long, depth: int) ret long {
        local i: long = begin;
        loop (i < end) {
            this.budget = this.budget - 1;
            if (this.budget <= 0) {
                return -1;
            }
            local c: char = text[i];
            if ((c == '\\') && ((i + 1) < end)) {
                i = i + 2;
                continue;
            }
            if (c == '`') {
                local run: long = 0;
                loop (((i + run) < end) && (text[i + run] == '`')) {
                    run = run + 1;
                }
                local close: long = this.findBackticks(text, i + run, end, run);
                if (close >= 0) {
                    i = close + run;
                } else {
                    i = i + run;
                }
                continue;
            }
            if (c == marker) {
                local run: long = 0;
                loop (((i + run) < end) && (text[i + run] == marker)) {
                    run = run + 1;
                }
                local before: char = text[i - 1];
                local after: char = cast<char>(0);
                if ((i + run) < end) {
                    after = text[i + run];
                }
                local canClose: bool = !mdIsSpace(before) && (before != '\n');
                if ((marker == '_') && mdIsAlnum(after)) {
                    canClose = false;
                }
                if (canClose && (run >= count)) {
                    # Close with the last `count` characters of the run.
                    return (i + run) - count;
                }
                # A run that only opens starts nested emphasis: skip it
                # together with its own closer.
                local canOpen: bool = (after != 0) && !mdIsSpace(after) && (after != '\n');
                if ((marker == '_') && mdIsAlnum(before)) {
                    canOpen = false;
                }
                if (canOpen && !canClose && (depth < 32)) {
                    local inner: long = this.closingRun(text, i + run, end, marker, run, depth + 1);
                    if (inner > 0) {
                        i = inner + run;
                        continue;
                    }
                }
                i = i + run;
                continue;
            }
            i = i + 1;
        }
        return -1;
    }
    frame inline(this: *Markdown, text: string, start: long, end: long) {
        if (this.inline_depth >= 64) {
            mdEscape(&this.out, text, start, end);
            return;
        }
        this.inline_depth = this.inline_depth + 1;
        this.inlineSpan(text, start, end);
        this.inline_depth = this.inline_depth - 1;
    }
    frame inlineSpan(this: *Markdown, text: string, start: long, end: long) {
        local i: long = start;
        loop (i < end) {
            local c: char = text[i];
            if (c == '\\') {
                if (((i + 1) < end) && (text[i + 1] == '\n')) {
                    this.out.append("<br />\n");
                    i = i + 2;
                    continue;
                }
                if (((i + 1) < end) && mdIsPunct(text[i + 1])) {
                    mdEscape(&this.out, text, i + 1, i + 2);
                    i = i + 2;
                    continue;
                }
                this.out.appendChar('\\');
                i = i + 1;
                continue;
            }
            if (c == '`') {
                local run: long = 0;
                loop (((i + run) < end) && (text[i + run] == '`')) {
                    run = run + 1;
                }
                local close: long = this.findBackticks(text, i + run, end, run);
                if (close < 0) {
                    loop (local k: long = 0; k < run; k = k + 1) {
                        this.out.appendChar('`');
                    }
                    i = i + run;
                    continue;
                }
                local codeStart: long = i + run;
                local codeEnd: long = close;
                local allSpace: bool = true;
                loop (local k: long = codeStart; k < codeEnd; k = k + 1) {
                    if ((text[k] != ' ') && (text[k] != '\n')) {
                        allSpace = false;
                    }
                }
                if (!allSpace && ((codeEnd - codeStart) >= 2) && ((text[codeStart] == ' ') || (text[codeStart] == '\n')) && ((text[codeEnd - 1] == ' ') || (text[codeEnd - 1] == '\n'))) {
                    codeStart = codeStart + 1;
                    codeEnd = codeEnd - 1;
                }
                this.out.append("<code>");
                loop (local k: long = codeStart; k < codeEnd; k = k + 1) {
                    if (text[k] == '\n') {
                        this.out.appendChar(' ');
                    } else {
                        mdEscape(&this.out, text, k, k + 1);
                    }
                }
                this.out.append("</code>");
                i = close + run;
                continue;
            }
            if ((c == '!') && ((i + 1) < end) && (text[i + 1] == '[')) {
                local close: long = this.closeBracket(text, i + 1, end);
                if (close > 0) {
                    local dest: long[2];
                    local title: long[2];
                    local after: long = Markdown.linkTarget(text, close + 1, end, &dest[0], &title[0]);
                    if (after > 0) {
                        this.out.append("<img src=\"");
                        this.url(text, dest[0], dest[1]);
                        this.out.append("\" alt=\"");
                        this.altText(text, i + 2, close);
                        this.out.append("\"");
                        if (title[0] >= 0) {
                            this.out.append(" title=\"");
                            this.inlineText(text, title[0], title[1]);
                            this.out.append("\"");
                        }
                        this.out.append(" />");
                        i = after;
                        continue;
                    }
                }
                this.out.appendChar('!');
                i = i + 1;
                continue;
            }
            if (c == '[') {
                local close: long = this.closeBracket(text, i, end);
                if (close > 0) {
                    local dest: long[2];
                    local title: long[2];
                    local after: long = Markdown.linkTarget(text, close + 1, end, &dest[0], &title[0]);
                    if (after > 0) {
                        this.out.append("<a href=\"");
                        this.url(text, dest[0], dest[1]);
                        this.out.append("\"");
                        if (title[0] >= 0) {
                            this.out.append(" title=\"");
                            this.inlineText(text, title[0], title[1]);
                            this.out.append("\"");
                        }
                        if (this.options.nofollow) {
                            this.out.append(" rel=\"nofollow noopener\"");
                        }
                        this.out.append(">");
                        this.inline(text, i + 1, close);
                        this.out.append("</a>");
                        i = after;
                        continue;
                    }
                }
                this.out.appendChar('[');
                i = i + 1;
                continue;
            }
            if (c == '<') {
                local after: long = this.autolink(text, i, end);
                if (after > 0) {
                    i = after;
                    continue;
                }
                this.out.append("&lt;");
                i = i + 1;
                continue;
            }
            if ((c == '*') || (c == '_') || (c == '~')) {
                local run: long = 0;
                loop (((i + run) < end) && (text[i + run] == c)) {
                    run = run + 1;
                }
                local next: char = cast<char>(0);
                if ((i + run) < end) {
                    next = text[i + run];
                }
                local prev: char = cast<char>(0);
                if (i > start) {
                    prev = text[i - 1];
                }
                local canOpen: bool = (next != 0) && !mdIsSpace(next) && (next != '\n');
                if ((c == '_') && mdIsAlnum(prev)) {
                    canOpen = false;
                }
                if ((c == '~') && (run != 2)) {
                    canOpen = false;
                }
                if (canOpen) {
                    local count: long = run;
                    if (count > 3) {
                        count = 3;
                    }
                    local close: long = -1;
                    loop ((count > 0) && (close < 0)) {
                        close = this.closingRun(text, i + run, end, c, count, 0);
                        if (close < 0) {
                            count = count - 1;
                            if (c == '~') {
                                count = 0;
                            }
                        }
                    }
                    if (close > 0) {
                        # Unmatched opening characters stay literal.
                        loop (local k: long = count; k < run; k = k + 1) {
                            this.out.appendChar(c);
                        }
                        local open: string = "<em>";
                        local shut: string = "</em>";
                        if (c == '~') {
                            open = "<del>";
                            shut = "</del>";
                        } else if (count == 2) {
                            open = "<strong>";
                            shut = "</strong>";
                        } else if (count == 3) {
                            open = "<em><strong>";
                            shut = "</strong></em>";
                        }
                        this.out.append(open);
                        this.inline(text, i + run, close);
                        this.out.append(shut);
                        i = close + count;
                        continue;
                    }
                }
                loop (local k: long = 0; k < run; k = k + 1) {
                    this.out.appendChar(c);
                }
                i = i + run;
                continue;
            }
            if (c == ' ') {
                local spaces: long = 0;
                loop (((i + spaces) < end) && (text[i + spaces] == ' ')) {
                    spaces = spaces + 1;
                }
                if (((i + spaces) < end) && (text[i + spaces] == '\n')) {
                    if (spaces >= 2) {
                        this.out.append("<br />");
                    }
                    i = i + spaces;
                    continue;
                }
                if ((i + spaces) >= end) {
                    i = end;
                    continue;
                }
                loop (local k: long = 0; k < spaces; k = k + 1) {
                    this.out.appendChar(' ');
                }
                i = i + spaces;
                continue;
            }
            if (c == '&') {
                # Pass through well-formed entity references; escape others.
                local j: long = i + 1;
                local numeric: bool = (j < end) && (text[j] == '#');
                if (numeric) {
                    j = j + 1;
                    if ((j < end) && ((text[j] == 'x') || (text[j] == 'X'))) {
                        j = j + 1;
                    }
                }
                local nameStart: long = j;
                loop ((j < end) && mdIsAlnum(text[j]) && (cast<u8>(text[j]) < cast<u8>(128)) && ((j - nameStart) < 32)) {
                    j = j + 1;
                }
                if ((j > nameStart) && (j < end) && (text[j] == ';')) {
                    loop (local k: long = i; k <= j; k = k + 1) {
                        this.out.appendChar(text[k]);
                    }
                    i = j + 1;
                    continue;
                }
                this.out.append("&amp;");
                i = i + 1;
                continue;
            }
            mdEscape(&this.out, text, i, i + 1);
            i = i + 1;
        }
    }
}
