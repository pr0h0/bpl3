# Environment variables utilities

export [Env];

extern getenv(name: string) ret string;
extern setenv(name: string, value: string, overwrite: int) ret int;
extern unsetenv(name: string) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(str: string) ret long;
extern strcpy(dest: string, src: string) ret string;
extern atoi(str: string) ret int;
extern __bpl_read_file(path: string, data: *string, length: *int) ret int;

import [Array] from "std/array.bpl";
import [StringBuilder] from "std/string_builder.bpl";

# Whether `c` may appear in a dotenv key (`first` for its first character).
frame envKeyChar(c: char, first: bool) ret bool {
    local code: int = cast<int>(cast<u8>(c));
    local letter: bool = ((code >= 65) && (code <= 90)) || ((code >= 97) && (code <= 122)) || (code == 95);
    if (first) {
        return letter;
    }
    return letter || ((code >= 48) && (code <= 57)) || (code == 46);
}

frame envSpace(c: char) ret bool {
    return (c == ' ') || (c == '\t');
}

# Copies bytes `start` to `end` of `text` into a new string.
frame envCopy(text: string, start: int, end: int) ret string {
    local output: string = cast<string>(malloc(cast<long>((end - start) + 1)));
    if (output == nullptr) {
        throw "Env.loadFile allocation failed";
    }
    loop (local i: int = start; i < end; i = i + 1) {
        output[i - start] = text[i];
    }
    output[end - start] = cast<char>(0);
    return output;
}

# Parses the dotenv line `text[start..end)` into `keys` and `values`.
# Returns false for a malformed line; blank and comment lines add nothing.
frame envParseLine(text: string, start: int, end: int, keys: *Array<string>, values: *Array<string>) ret bool {
    local at: int = start;
    loop ((at < end) && envSpace(text[at])) {
        at = at + 1;
    }
    if ((at == end) || (text[at] == '#')) {
        return true;
    }
    # An optional `export ` prefix, as in shell scripts.
    if (((at + 7) <= end) && (text[at] == 'e') && (text[at + 1] == 'x') && (text[at + 2] == 'p') && (text[at + 3] == 'o') && (text[at + 4] == 'r') && (text[at + 5] == 't') && envSpace(text[at + 6])) {
        at = at + 7;
        loop ((at < end) && envSpace(text[at])) {
            at = at + 1;
        }
    }
    local keyStart: int = at;
    if ((at == end) || !envKeyChar(text[at], true)) {
        return false;
    }
    loop ((at < end) && envKeyChar(text[at], false)) {
        at = at + 1;
    }
    local keyEnd: int = at;
    loop ((at < end) && envSpace(text[at])) {
        at = at + 1;
    }
    if ((at == end) || (text[at] != '=')) {
        return false;
    }
    at = at + 1;
    loop ((at < end) && envSpace(text[at])) {
        at = at + 1;
    }
    local value: string = nullptr;
    if ((at < end) && ((text[at] == '"') || (text[at] == 39))) {
        local quote: char = text[at];
        local builder: StringBuilder = StringBuilder.new(16);
        at = at + 1;
        local closed: bool = false;
        loop (at < end) {
            local c: char = text[at];
            if (c == quote) {
                closed = true;
                at = at + 1;
                break;
            }
            if ((quote == '"') && (c == '\\') && ((at + 1) < end)) {
                local next: char = text[at + 1];
                if (next == 'n') {
                    builder.appendChar('\n');
                } else if (next == 't') {
                    builder.appendChar('\t');
                } else {
                    builder.appendChar(next);
                }
                at = at + 2;
                continue;
            }
            builder.appendChar(c);
            at = at + 1;
        }
        # After the closing quote only spaces and a comment may follow.
        loop ((at < end) && envSpace(text[at])) {
            at = at + 1;
        }
        if (!closed || ((at < end) && (text[at] != '#'))) {
            builder.destroy();
            return false;
        }
        local built: string = builder.toString();
        value = envCopy(built, 0, cast<int>(strlen(built)));
        builder.destroy();
    } else {
        # Unquoted: up to ` #` or the end of the line, without trailing spaces.
        local valueEnd: int = at;
        loop ((valueEnd < end) && !((text[valueEnd] == '#') && (valueEnd > at) && envSpace(text[valueEnd - 1]))) {
            valueEnd = valueEnd + 1;
        }
        loop ((valueEnd > at) && envSpace(text[valueEnd - 1])) {
            valueEnd = valueEnd - 1;
        }
        value = envCopy(text, at, valueEnd);
    }
    keys.push(envCopy(text, keyStart, keyEnd));
    values.push(value);
    return true;
}

struct EnvVar {
    name: string,
    value: string,
}

struct Env {
    # Get an environment variable value
    # Returns nullptr if not found
    frame get(name: string) ret string {
        if (name == nullptr) {
            return nullptr;
        }
        return getenv(name);
    }

    # Get an environment variable with a default value if not found
    frame getOr(name: string, defaultValue: string) ret string {
        local val: string = Env.get(name);
        if (val == nullptr) {
            return defaultValue;
        }
        return val;
    }

    # Set an environment variable
    # Returns true on success
    frame set(name: string, value: string) ret bool {
        if ((name == nullptr) || (value == nullptr)) {
            return false;
        }
        return setenv(name, value, 1) == 0;
    }

    # Set an environment variable only if it doesn't exist
    # Returns true on success (including if already set)
    /#
    Loads `KEY=value` lines from the dotenv file at `path` into the process
    environment and returns how many variables were set. Blank lines and `#`
    comments are skipped, `export ` before a key is allowed, and a value may
    be unquoted (an inline ` #` starts a comment; surrounding spaces are
    removed), single-quoted (taken literally) or double-quoted (`\n`, `\t`,
    `\"` and `\\` escapes). Variables that are already set are kept unless
    `overrideExisting` is true. Returns -1, setting nothing, when the file
    cannot be read or a line is malformed.
    #/
    frame loadFile(path: string, overrideExisting: bool) ret int {
        local text: string = nullptr;
        local length: int = 0;
        if ((path == nullptr) || (__bpl_read_file(path, &text, &length) != 0)) {
            return -1;
        }
        local keys: Array<string> = Array<string>.new(8);
        local values: Array<string> = Array<string>.new(8);
        local valid: bool = true;
        local lineStart: int = 0;
        loop (local i: int = 0; i <= length; i = i + 1) {
            if ((i == length) || (text[i] == '\n')) {
                local lineEnd: int = i;
                if ((lineEnd > lineStart) && (text[lineEnd - 1] == '\r')) {
                    lineEnd = lineEnd - 1;
                }
                if (!envParseLine(text, lineStart, lineEnd, &keys, &values)) {
                    valid = false;
                    break;
                }
                lineStart = i + 1;
            }
        }
        local count: int = 0;
        loop (local k: int = 0; k < keys.len(); k = k + 1) {
            if (valid) {
                # setenv without overwrite succeeds without setting, so a
                # variable that is already set is skipped and not counted.
                if (overrideExisting || !Env.has(keys.get(k))) {
                    if (Env.set(keys.get(k), values.get(k))) {
                        count = count + 1;
                    }
                }
            }
            free(cast<*void>(keys.get(k)));
            free(cast<*void>(values.get(k)));
        }
        keys.destroy();
        values.destroy();
        free(cast<*void>(text));
        if (!valid) {
            return -1;
        }
        return count;
    }

    frame setIfAbsent(name: string, value: string) ret bool {
        if ((name == nullptr) || (value == nullptr)) {
            return false;
        }
        return setenv(name, value, 0) == 0;
    }

    # Unset (remove) an environment variable
    # Returns true on success
    frame unset(name: string) ret bool {
        if (name == nullptr) {
            return false;
        }
        return unsetenv(name) == 0;
    }

    # Check if an environment variable exists
    frame has(name: string) ret bool {
        return Env.get(name) != nullptr;
    }

    # Check if an environment variable exists and is non-empty
    frame hasValue(name: string) ret bool {
        local val: string = Env.get(name);
        if (val == nullptr) {
            return false;
        }
        return strlen(val) > cast<long>(0);
    }

    # Get the PATH environment variable
    frame getPath() ret string {
        return Env.getOr("PATH", "");
    }

    # Get the HOME directory
    frame getHome() ret string {
        return Env.getOr("HOME", "");
    }

    # Get the current user name
    frame getUser() ret string {
        return Env.getOr("USER", "");
    }

    # Get the shell
    frame getShell() ret string {
        return Env.getOr("SHELL", "/bin/sh");
    }

    # Get the TERM variable
    frame getTerm() ret string {
        return Env.getOr("TERM", "");
    }

    # Get the PWD (current working directory from env)
    frame getPwd() ret string {
        return Env.getOr("PWD", "");
    }

    # Get the LANG variable
    frame getLang() ret string {
        return Env.getOr("LANG", "");
    }

    # Get the temporary directory
    frame getTmpDir() ret string {
        local tmp: string = Env.get("TMPDIR");
        if (tmp != nullptr) {
            return tmp;
        }
        tmp = Env.get("TMP");
        if (tmp != nullptr) {
            return tmp;
        }
        tmp = Env.get("TEMP");
        if (tmp != nullptr) {
            return tmp;
        }
        return "/tmp";
    }

    # Check if running in debug mode (various common env vars)
    frame isDebug() ret bool {
        local debug: string = Env.get("DEBUG");
        if ((debug != nullptr) && (strlen(debug) > cast<long>(0))) {
            return true;
        }
        debug = Env.get("BPL_DEBUG");
        if ((debug != nullptr) && (strlen(debug) > cast<long>(0))) {
            return true;
        }
        return false;
    }

    # Get environment variable as integer, with default
    frame getInt(name: string, defaultValue: int) ret int {
        local val: string = Env.get(name);
        if (val == nullptr) {
            return defaultValue;
        }
        local ptr: *u8 = cast<*u8>(val);
        local result: long = 0;
        local negative: bool = false;

        # Handle optional sign
        if (*ptr == cast<u8>(45)) {
            # '-'
            negative = true;
            ptr = ptr + 1;
        } else if (*ptr == cast<u8>(43)) {
            # '+'
            ptr = ptr + 1;
        }
        # Require at least one digit and bound each step before narrowing.
        if (*ptr == cast<u8>(0)) {
            return defaultValue;
        }
        local limit: long = 2147483647;
        if (negative) {
            limit = 2147483648;
        }
        # Parse digits
        loop (*ptr != cast<u8>(0)) {
            local c: u8 = *ptr;
            if ((c >= cast<u8>(48)) && (c <= cast<u8>(57))) {
                result = (result * 10) + cast<long>(c - cast<u8>(48));
                if (result > limit) {
                    return defaultValue;
                }
            } else {
                # Non-digit encountered
                return defaultValue;
            }
            ptr = ptr + 1;
        }

        if (negative) {
            result = -result;
        }
        return cast<int>(result);
    }

    # Get environment variable as boolean
    # Considers "1", "true", "yes", "on" as true (case insensitive)
    frame getBool(name: string, defaultValue: bool) ret bool {
        local val: string = Env.get(name);
        if (val == nullptr) {
            return defaultValue;
        }
        local ptr: *u8 = cast<*u8>(val);
        local c: u8 = *ptr;

        # Check first character
        if ((c == cast<u8>(49)) && (*(ptr + 1) == cast<u8>(0))) {
            # '1'
            return true;
        }
        if ((c == cast<u8>(48)) && (*(ptr + 1) == cast<u8>(0))) {
            # '0'
            return false;
        }
        # Check for "true"/"TRUE"
        if (((c == cast<u8>(116)) || (c == cast<u8>(84))) && ((*(ptr + 1) == cast<u8>(114)) || (*(ptr + 1) == cast<u8>(82))) && ((*(ptr + 2) == cast<u8>(117)) || (*(ptr + 2) == cast<u8>(85))) && ((*(ptr + 3) == cast<u8>(101)) || (*(ptr + 3) == cast<u8>(69))) && (*(ptr + 4) == cast<u8>(0))) {
            return true;
        }
        # Check for "false"/"FALSE"
        if (((c == cast<u8>(102)) || (c == cast<u8>(70))) && ((*(ptr + 1) == cast<u8>(97)) || (*(ptr + 1) == cast<u8>(65))) && ((*(ptr + 2) == cast<u8>(108)) || (*(ptr + 2) == cast<u8>(76))) && ((*(ptr + 3) == cast<u8>(115)) || (*(ptr + 3) == cast<u8>(83))) && ((*(ptr + 4) == cast<u8>(101)) || (*(ptr + 4) == cast<u8>(69))) && (*(ptr + 5) == cast<u8>(0))) {
            return false;
        }
        # Check for "yes"/"YES"
        if (((c == cast<u8>(121)) || (c == cast<u8>(89))) && ((*(ptr + 1) == cast<u8>(101)) || (*(ptr + 1) == cast<u8>(69))) && ((*(ptr + 2) == cast<u8>(115)) || (*(ptr + 2) == cast<u8>(83))) && (*(ptr + 3) == cast<u8>(0))) {
            return true;
        }
        # Check for "no"/"NO"
        if (((c == cast<u8>(110)) || (c == cast<u8>(78))) && ((*(ptr + 1) == cast<u8>(111)) || (*(ptr + 1) == cast<u8>(79))) && (*(ptr + 2) == cast<u8>(0))) {
            return false;
        }
        # Check for "on"/"ON"
        if (((c == cast<u8>(111)) || (c == cast<u8>(79))) && ((*(ptr + 1) == cast<u8>(110)) || (*(ptr + 1) == cast<u8>(78))) && (*(ptr + 2) == cast<u8>(0))) {
            return true;
        }
        # Check for "off"/"OFF"
        if (((c == cast<u8>(111)) || (c == cast<u8>(79))) && ((*(ptr + 1) == cast<u8>(102)) || (*(ptr + 1) == cast<u8>(70))) && ((*(ptr + 2) == cast<u8>(102)) || (*(ptr + 2) == cast<u8>(70))) && (*(ptr + 3) == cast<u8>(0))) {
            return false;
        }
        return defaultValue;
    }
}
