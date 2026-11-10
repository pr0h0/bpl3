# ANSI terminal escape sequences: colours, styles and cursor control.
#
# The constants are SGR sequences to print around text. `Ansi.paint` wraps
# text in a sequence and a reset, returning a new String. `Ansi.enabled()`
# reports whether colour output is appropriate: it honours NO_COLOR and
# FORCE_COLOR, then checks that stdout is a terminal and TERM is not "dumb".
# `Ansi.strip` removes escape sequences, and `Ansi.visibleWidth` counts the
# printed codepoints of a string that contains them.

export [Ansi];

import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern getenv(name: string) ret string;
extern isatty(fd: int) ret int;
extern strlen(text: string) ret long;
extern strcmp(left: string, right: string) ret int;

global ANSI_RESET: string = "\x1b[0m";

frame _ansiTake(builder: *StringBuilder) ret String {
    local result: String;
    result.data = builder.buffer;
    result.length = builder.length;
    builder.buffer = nullptr;
    return result;
}

struct Ansi {
    frame reset() ret string {
        return ANSI_RESET;
    }

    frame bold() ret string {
        return "\x1b[1m";
    }

    frame dim() ret string {
        return "\x1b[2m";
    }

    frame italic() ret string {
        return "\x1b[3m";
    }

    frame underline() ret string {
        return "\x1b[4m";
    }

    frame blink() ret string {
        return "\x1b[5m";
    }

    frame inverse() ret string {
        return "\x1b[7m";
    }

    frame strikethrough() ret string {
        return "\x1b[9m";
    }

    frame black() ret string {
        return "\x1b[30m";
    }

    frame red() ret string {
        return "\x1b[31m";
    }

    frame green() ret string {
        return "\x1b[32m";
    }

    frame yellow() ret string {
        return "\x1b[33m";
    }

    frame blue() ret string {
        return "\x1b[34m";
    }

    frame magenta() ret string {
        return "\x1b[35m";
    }

    frame cyan() ret string {
        return "\x1b[36m";
    }

    frame white() ret string {
        return "\x1b[37m";
    }

    frame gray() ret string {
        return "\x1b[90m";
    }

    frame brightRed() ret string {
        return "\x1b[91m";
    }

    frame brightGreen() ret string {
        return "\x1b[92m";
    }

    frame brightYellow() ret string {
        return "\x1b[93m";
    }

    frame brightBlue() ret string {
        return "\x1b[94m";
    }

    frame brightMagenta() ret string {
        return "\x1b[95m";
    }

    frame brightCyan() ret string {
        return "\x1b[96m";
    }

    frame brightWhite() ret string {
        return "\x1b[97m";
    }

    frame bgBlack() ret string {
        return "\x1b[40m";
    }

    frame bgRed() ret string {
        return "\x1b[41m";
    }

    frame bgGreen() ret string {
        return "\x1b[42m";
    }

    frame bgYellow() ret string {
        return "\x1b[43m";
    }

    frame bgBlue() ret string {
        return "\x1b[44m";
    }

    frame bgMagenta() ret string {
        return "\x1b[45m";
    }

    frame bgCyan() ret string {
        return "\x1b[46m";
    }

    frame bgWhite() ret string {
        return "\x1b[47m";
    }

    # Clears the screen and moves the cursor home.
    frame clearScreen() ret string {
        return "\x1b[2J\x1b[H";
    }

    # Clears the current line.
    frame clearLine() ret string {
        return "\x1b[2K\r";
    }

    frame hideCursor() ret string {
        return "\x1b[?25l";
    }

    frame showCursor() ret string {
        return "\x1b[?25h";
    }

    # 256-colour foreground (0-255), as a new String.
    frame color256(index: int) ret String {
        local out: StringBuilder = StringBuilder.new(12);
        out.append("\x1b[38;5;");
        out.appendInt(index & 255);
        out.appendChar('m');
        return _ansiTake(&out);
    }

    # 256-colour background (0-255), as a new String.
    frame background256(index: int) ret String {
        local out: StringBuilder = StringBuilder.new(12);
        out.append("\x1b[48;5;");
        out.appendInt(index & 255);
        out.appendChar('m');
        return _ansiTake(&out);
    }

    # 24-bit foreground colour, as a new String.
    frame rgb(red: int, green: int, blue: int) ret String {
        local out: StringBuilder = StringBuilder.new(20);
        out.append("\x1b[38;2;");
        out.appendInt(red & 255);
        out.appendChar(';');
        out.appendInt(green & 255);
        out.appendChar(';');
        out.appendInt(blue & 255);
        out.appendChar('m');
        return _ansiTake(&out);
    }

    # 24-bit background colour, as a new String.
    frame backgroundRgb(red: int, green: int, blue: int) ret String {
        local out: StringBuilder = StringBuilder.new(20);
        out.append("\x1b[48;2;");
        out.appendInt(red & 255);
        out.appendChar(';');
        out.appendInt(green & 255);
        out.appendChar(';');
        out.appendInt(blue & 255);
        out.appendChar('m');
        return _ansiTake(&out);
    }

    # Moves the cursor to a 1-based row and column, as a new String.
    frame moveTo(row: int, column: int) ret String {
        local out: StringBuilder = StringBuilder.new(16);
        out.append("\x1b[");
        out.appendInt(row);
        out.appendChar(';');
        out.appendInt(column);
        out.appendChar('H');
        return _ansiTake(&out);
    }

    # `style` + `text` + reset, as a new String.
    frame paint(text: string, style: string) ret String {
        local out: StringBuilder = StringBuilder.new(32);
        if (style != nullptr) {
            out.append(style);
        }
        if (text != nullptr) {
            out.append(text);
        }
        out.append(ANSI_RESET);
        return _ansiTake(&out);
    }

    # Like `paint`, but returns a plain copy when `enabled` is false.
    frame paintIf(text: string, style: string, enabled: bool) ret String {
        if (!enabled) {
            return String.new(text);
        }
        return Ansi.paint(text, style);
    }

    # Whether colour output should be used on stdout.
    frame enabled() ret bool {
        local noColor: string = getenv("NO_COLOR");
        if ((noColor != nullptr) && (noColor[0] != cast<char>(0))) {
            return false;
        }
        local force: string = getenv("FORCE_COLOR");
        if ((force != nullptr) && (force[0] != cast<char>(0)) && (strcmp(force, "0") != 0)) {
            return true;
        }
        local term: string = getenv("TERM");
        if ((term != nullptr) && (strcmp(term, "dumb") == 0)) {
            return false;
        }
        return isatty(1) != 0;
    }

    # Removes CSI (ESC '[' ... final byte) and OSC (ESC ']' ... BEL or ESC
    # '\') sequences, and lone two-byte escapes.
    frame strip(text: string) ret String {
        local out: StringBuilder = StringBuilder.new(32);
        if (text == nullptr) {
            return _ansiTake(&out);
        }
        local n: long = strlen(text);
        local i: long = 0;
        loop (i < n) {
            local c: char = text[i];
            if ((c != cast<char>(27)) || ((i + 1) >= n)) {
                out.appendChar(c);
                i = i + 1;
                continue;
            }
            local kind: char = text[i + 1];
            i = i + 2;
            if (kind == '[') {
                # Parameter and intermediate bytes, then one final byte.
                loop ((i < n) && ((cast<int>(text[i]) < 64) || (cast<int>(text[i]) > 126))) {
                    i = i + 1;
                }
                i = i + 1;
            } else if (kind == ']') {
                loop (i < n) {
                    if (text[i] == cast<char>(7)) {
                        i = i + 1;
                        break;
                    }
                    if ((text[i] == cast<char>(27)) && ((i + 1) < n) && (text[i + 1] == '\\')) {
                        i = i + 2;
                        break;
                    }
                    i = i + 1;
                }
            }
        }
        return _ansiTake(&out);
    }

    # Printed width in codepoints, ignoring escape sequences (wide East
    # Asian characters count as one).
    frame visibleWidth(text: string) ret int {
        local plain: String = Ansi.strip(text);
        local width: int = 0;
        loop (local i: int = 0; i < plain.length; i = i + 1) {
            # Count every byte that does not continue a UTF-8 sequence.
            if ((cast<int>(cast<u8>(plain.data[i])) & 192) != 128) {
                width = width + 1;
            }
        }
        plain.destroy();
        return width;
    }
}
