# INI configuration files.
#
# Supported syntax: `[section]` headers, `key = value` or `key: value`
# entries, full-line comments starting with ';' or '#', and blank lines.
# Keys and values are trimmed; a value wrapped in matching double or single
# quotes has them removed. Keys before the first header belong to section
# "". Section and key lookups are ASCII case-insensitive. Duplicate keys keep
# the last value.

export [Ini];
export [IniEntry];

import [Option] from "std/option.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [StringUtils] from "std/string_utils.bpl";

extern strlen(text: string) ret long;
extern snprintf(buffer: string, size: long, format: string, ...) ret int;
extern malloc(size: long) ret *void;

struct IniEntry {
    section: String,
    key: String,
    value: String,
}

frame _iniSlice(text: string, start: long, end: long) ret String {
    local builder: StringBuilder = StringBuilder.new(cast<int>(end - start));
    loop (local i: long = start; i < end; i = i + 1) {
        builder.appendChar(text[i]);
    }
    local result: String;
    result.data = builder.buffer;
    result.length = builder.length;
    return result;
}

frame _iniSpace(c: char) ret bool {
    return (c == ' ') || (c == '\t');
}

frame _iniError(line: int, message: string) ret string {
    local buffer: string = cast<string>(malloc(160));
    if (buffer == nullptr) {
        return message;
    }
    snprintf(buffer, 160, "INI line %d: %s", line, message);
    return buffer;
}

struct Ini {
    entries: Array<IniEntry>,
    sectionOrder: Array<String>,
    frame new() ret Ini {
        local ini: Ini;
        ini.entries = Array<IniEntry>.new(8);
        ini.sectionOrder = Array<String>.new(4);
        return ini;
    }

    /#
        Parses INI text. Throws "INI line N: ..." for a malformed header or a
        line without '=' or ':'.
    #/
    frame parse(text: string) ret Ini {
        local ini: Ini = Ini.new();
        if (text == nullptr) {
            return ini;
        }
        local section: String = String.new("");
        local n: long = strlen(text);
        local position: long = 0;
        local lineNumber: int = 0;
        loop (position < n) {
            lineNumber = lineNumber + 1;
            local lineEnd: long = position;
            loop ((lineEnd < n) && (text[lineEnd] != '\n') && (text[lineEnd] != '\r')) {
                lineEnd = lineEnd + 1;
            }
            local next: long = lineEnd;
            if ((next < n) && (text[next] == '\r') && ((next + 1) < n) && (text[next + 1] == '\n')) {
                next = next + 1;
            }
            next = next + 1;
            local start: long = position;
            local end: long = lineEnd;
            loop ((start < end) && _iniSpace(text[start])) {
                start = start + 1;
            }
            loop ((end > start) && _iniSpace(text[end - 1])) {
                end = end - 1;
            }
            position = next;
            if ((start == end) || (text[start] == ';') || (text[start] == '#')) {
                continue;
            }
            if (text[start] == '[') {
                if (text[end - 1] != ']') {
                    section.destroy();
                    ini.destroy();
                    throw _iniError(lineNumber, "unterminated section header");
                }
                local nameStart: long = start + 1;
                local nameEnd: long = end - 1;
                loop ((nameStart < nameEnd) && _iniSpace(text[nameStart])) {
                    nameStart = nameStart + 1;
                }
                loop ((nameEnd > nameStart) && _iniSpace(text[nameEnd - 1])) {
                    nameEnd = nameEnd - 1;
                }
                section.destroy();
                section = _iniSlice(text, nameStart, nameEnd);
                ini._noteSection(section.data);
                continue;
            }
            local split: long = start;
            loop ((split < end) && (text[split] != '=') && (text[split] != ':')) {
                split = split + 1;
            }
            if (split == end) {
                section.destroy();
                ini.destroy();
                throw _iniError(lineNumber, "expected key = value");
            }
            local keyEnd: long = split;
            loop ((keyEnd > start) && _iniSpace(text[keyEnd - 1])) {
                keyEnd = keyEnd - 1;
            }
            if (keyEnd == start) {
                section.destroy();
                ini.destroy();
                throw _iniError(lineNumber, "empty key");
            }
            local valueStart: long = split + 1;
            loop ((valueStart < end) && _iniSpace(text[valueStart])) {
                valueStart = valueStart + 1;
            }
            local valueEnd: long = end;
            if (((valueEnd - valueStart) >= cast<long>(2)) && ((text[valueStart] == '"') || (text[valueStart] == '\'')) && (text[valueEnd - 1] == text[valueStart])) {
                valueStart = valueStart + 1;
                valueEnd = valueEnd - 1;
            }
            local key: String = _iniSlice(text, start, keyEnd);
            local value: String = _iniSlice(text, valueStart, valueEnd);
            ini.set(section.data, key.data, value.data);
            key.destroy();
            value.destroy();
        }
        section.destroy();
        return ini;
    }

    frame _noteSection(this: *Ini, section: string) {
        loop (local i: int = 0; i < this.sectionOrder.length; i = i + 1) {
            if (StringUtils.equalsIgnoreCase(this.sectionOrder.data[i].data, section)) {
                return;
            }
        }
        this.sectionOrder.push(String.new(section));
    }

    frame _find(this: *Ini, section: string, key: string) ret int {
        loop (local i: int = 0; i < this.entries.length; i = i + 1) {
            local entry: *IniEntry = &this.entries.data[i];
            if (StringUtils.equalsIgnoreCase(entry.section.data, section) && StringUtils.equalsIgnoreCase(entry.key.data, key)) {
                return i;
            }
        }
        return -1;
    }

    # Sets (or replaces) a value; the strings are copied.
    frame set(this: *Ini, section: string, key: string, value: string) {
        local index: int = this._find(section, key);
        if (index >= 0) {
            local entry: *IniEntry = &this.entries.data[index];
            entry.value.destroy();
            entry.value = String.new(value);
            return;
        }
        if (section != nullptr) {
            if (section[0] != cast<char>(0)) {
                this._noteSection(section);
            }
        }
        this.entries.push(IniEntry { section: String.new(section), key: String.new(key), value: String.new(value) });
    }

    # The value of `key` in `section` (borrowed; valid until changed).
    frame get(this: *Ini, section: string, key: string) ret Option<string> {
        local index: int = this._find(section, key);
        if (index < 0) {
            return Option<string>.None;
        }
        return Option<string>.Some(this.entries.data[index].value.data);
    }

    frame getOr(this: *Ini, section: string, key: string, fallback: string) ret string {
        local index: int = this._find(section, key);
        if (index < 0) {
            return fallback;
        }
        return this.entries.data[index].value.data;
    }

    frame has(this: *Ini, section: string, key: string) ret bool {
        return this._find(section, key) >= 0;
    }

    # Integer value; `fallback` when missing or not an integer.
    frame getInt(this: *Ini, section: string, key: string, fallback: long) ret long {
        local index: int = this._find(section, key);
        if (index < 0) {
            return fallback;
        }
        local text: string = this.entries.data[index].value.data;
        local n: long = strlen(text);
        if (n == cast<long>(0)) {
            return fallback;
        }
        local i: long = 0;
        local negative: bool = false;
        if ((text[0] == '-') || (text[0] == '+')) {
            negative = text[0] == '-';
            i = 1;
        }
        if (i == n) {
            return fallback;
        }
        local value: long = 0;
        loop (i < n) {
            local c: char = text[i];
            if ((c < '0') || (c > '9')) {
                return fallback;
            }
            value = (value * 10) + cast<long>(cast<int>(c) - 48);
            i = i + 1;
        }
        if (negative) {
            return -value;
        }
        return value;
    }

    # true/yes/on/1 and false/no/off/0 (case-insensitive); otherwise `fallback`.
    frame getBool(this: *Ini, section: string, key: string, fallback: bool) ret bool {
        local index: int = this._find(section, key);
        if (index < 0) {
            return fallback;
        }
        local text: string = this.entries.data[index].value.data;
        if (StringUtils.equalsIgnoreCase(text, "true") || StringUtils.equalsIgnoreCase(text, "yes") || StringUtils.equalsIgnoreCase(text, "on") || StringUtils.equalsIgnoreCase(text, "1")) {
            return true;
        }
        if (StringUtils.equalsIgnoreCase(text, "false") || StringUtils.equalsIgnoreCase(text, "no") || StringUtils.equalsIgnoreCase(text, "off") || StringUtils.equalsIgnoreCase(text, "0")) {
            return false;
        }
        return fallback;
    }

    # Removes a key; returns whether it existed.
    frame remove(this: *Ini, section: string, key: string) ret bool {
        local index: int = this._find(section, key);
        if (index < 0) {
            return false;
        }
        local entry: IniEntry = this.entries.data[index];
        entry.section.destroy();
        entry.key.destroy();
        entry.value.destroy();
        this.entries.removeAt(index);
        return true;
    }

    # Named sections in first-seen order (borrowed strings).
    frame sections(this: *Ini) ret Array<string> {
        local out: Array<string> = Array<string>.new(this.sectionOrder.length);
        loop (local i: int = 0; i < this.sectionOrder.length; i = i + 1) {
            out.push(this.sectionOrder.data[i].data);
        }
        return out;
    }

    # Keys of `section` in insertion order (borrowed strings).
    frame keys(this: *Ini, section: string) ret Array<string> {
        local out: Array<string> = Array<string>.new(4);
        loop (local i: int = 0; i < this.entries.length; i = i + 1) {
            if (StringUtils.equalsIgnoreCase(this.entries.data[i].section.data, section)) {
                out.push(this.entries.data[i].key.data);
            }
        }
        return out;
    }

    frame len(this: *Ini) ret int {
        return this.entries.length;
    }

    frame _appendSection(this: *Ini, out: *StringBuilder, section: string) {
        loop (local i: int = 0; i < this.entries.length; i = i + 1) {
            local entry: *IniEntry = &this.entries.data[i];
            if (StringUtils.equalsIgnoreCase(entry.section.data, section)) {
                out.append(entry.key.data);
                out.append(" = ");
                out.append(entry.value.data);
                out.appendChar('\n');
            }
        }
    }

    # Serializes global keys first, then each section in first-seen order.
    frame toText(this: *Ini) ret String {
        local out: StringBuilder = StringBuilder.new(64);
        this._appendSection(&out, "");
        loop (local s: int = 0; s < this.sectionOrder.length; s = s + 1) {
            if (out.length > 0) {
                out.appendChar('\n');
            }
            out.appendChar('[');
            out.append(this.sectionOrder.data[s].data);
            out.append("]\n");
            this._appendSection(&out, this.sectionOrder.data[s].data);
        }
        local result: String;
        result.data = out.buffer;
        result.length = out.length;
        return result;
    }

    frame destroy(this: *Ini) {
        loop (local i: int = 0; i < this.entries.length; i = i + 1) {
            local entry: IniEntry = this.entries.data[i];
            entry.section.destroy();
            entry.key.destroy();
            entry.value.destroy();
        }
        this.entries.destroy();
        loop (local i: int = 0; i < this.sectionOrder.length; i = i + 1) {
            local name: String = this.sectionOrder.data[i];
            name.destroy();
        }
        this.sectionOrder.destroy();
    }
}
