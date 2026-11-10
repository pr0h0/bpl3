# Semantic Versioning 2.0.0: parsing, precedence and version ranges.
#
# `SemVer.parse` accepts MAJOR.MINOR.PATCH with optional "-prerelease" and
# "+build" parts (a leading "v" is allowed). Precedence follows the
# specification: build metadata is ignored, a prerelease sorts before its
# release, and prerelease identifiers compare numerically when both are
# numeric, otherwise by ASCII, with numeric identifiers lower.
#
# `satisfies` understands npm-style ranges: comparators (`>=1.2.0`, `<2`,
# `=1.0.0`, `>`, `<=`), caret (`^1.2.3`), tilde (`~1.2.3`), wildcards
# (`1.x`, `1.2.*`, `*`), hyphen ranges (`1.0.0 - 2.0.0`), whitespace for AND
# and `||` for OR. A prerelease version only matches comparators that name a
# prerelease of the same MAJOR.MINOR.PATCH, as in npm.

export [SemVer];

import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern strlen(text: string) ret long;
extern strcmp(left: string, right: string) ret int;

frame _semverDigit(c: char) ret bool {
    return (c >= '0') && (c <= '9');
}

frame _semverIdentChar(c: char) ret bool {
    return _semverDigit(c) || ((c >= 'a') && (c <= 'z')) || ((c >= 'A') && (c <= 'Z')) || (c == '-');
}

frame _semverSlice(text: string, start: long, end: long) ret String {
    local builder: StringBuilder = StringBuilder.new(cast<int>(end - start));
    loop (local i: long = start; i < end; i = i + 1) {
        builder.appendChar(text[i]);
    }
    local result: String;
    result.data = builder.buffer;
    result.length = builder.length;
    return result;
}

# Validates dot-separated identifiers in [start, end); numeric ones must not
# have leading zeros when `strictNumeric`.
frame _semverIdentifiers(text: string, start: long, end: long, strictNumeric: bool) ret bool {
    if (start >= end) {
        return false;
    }
    local partStart: long = start;
    loop (local i: long = start; i <= end; i = i + 1) {
        if ((i == end) || (text[i] == '.')) {
            if (i == partStart) {
                return false;
            }
            local numeric: bool = true;
            loop (local j: long = partStart; j < i; j = j + 1) {
                if (!_semverIdentChar(text[j])) {
                    return false;
                }
                if (!_semverDigit(text[j])) {
                    numeric = false;
                }
            }
            if (strictNumeric && numeric && ((i - partStart) > cast<long>(1)) && (text[partStart] == '0')) {
                return false;
            }
            partStart = i + 1;
        }
    }
    return true;
}

# Compares two dot-separated prerelease strings ("" means a release).
frame _semverComparePrerelease(a: string, b: string) ret int {
    local aEmpty: bool = (a == nullptr) || (a[0] == cast<char>(0));
    local bEmpty: bool = (b == nullptr) || (b[0] == cast<char>(0));
    if (aEmpty && bEmpty) {
        return 0;
    }
    if (aEmpty) {
        return 1;
    }
    if (bEmpty) {
        return -1;
    }
    local i: long = 0;
    local j: long = 0;
    local n: long = strlen(a);
    local m: long = strlen(b);
    loop ((i < n) && (j < m)) {
        local aEnd: long = i;
        loop ((aEnd < n) && (a[aEnd] != '.')) {
            aEnd = aEnd + 1;
        }
        local bEnd: long = j;
        loop ((bEnd < m) && (b[bEnd] != '.')) {
            bEnd = bEnd + 1;
        }
        local aNumeric: bool = true;
        loop (local k: long = i; k < aEnd; k = k + 1) {
            if (!_semverDigit(a[k])) {
                aNumeric = false;
            }
        }
        local bNumeric: bool = true;
        loop (local k: long = j; k < bEnd; k = k + 1) {
            if (!_semverDigit(b[k])) {
                bNumeric = false;
            }
        }
        if (aNumeric && bNumeric) {
            # Longer numbers (without leading zeros) are larger.
            local aLength: long = aEnd - i;
            local bLength: long = bEnd - j;
            if (aLength != bLength) {
                if (aLength < bLength) {
                    return -1;
                }
                return 1;
            }
            loop (local k: long = 0; k < aLength; k = k + 1) {
                if (a[i + k] != b[j + k]) {
                    if (a[i + k] < b[j + k]) {
                        return -1;
                    }
                    return 1;
                }
            }
        } else if (aNumeric) {
            return -1;
        } else if (bNumeric) {
            return 1;
        } else {
            local k: long = 0;
            loop (((i + k) < aEnd) && ((j + k) < bEnd)) {
                if (a[i + k] != b[j + k]) {
                    if (cast<u8>(a[i + k]) < cast<u8>(b[j + k])) {
                        return -1;
                    }
                    return 1;
                }
                k = k + 1;
            }
            local aRest: long = aEnd - i;
            local bRest: long = bEnd - j;
            if (aRest != bRest) {
                if (aRest < bRest) {
                    return -1;
                }
                return 1;
            }
        }
        i = aEnd + 1;
        j = bEnd + 1;
    }
    local aMore: bool = i < n;
    local bMore: bool = j < m;
    if (aMore == bMore) {
        return 0;
    }
    if (aMore) {
        return 1;
    }
    return -1;
}

struct SemVer {
    major: long,
    minor: long,
    patch: long,
    prerelease: String,
    build: String,
    frame new(major: long, minor: long, patch: long) ret SemVer {
        return SemVer { major: major, minor: minor, patch: patch, prerelease: String.new(""), build: String.new("") };
    }

    # Parses a strict semantic version; None when `text` is not one.
    frame parse(text: string) ret Option<SemVer> {
        if (text == nullptr) {
            return Option<SemVer>.None;
        }
        local n: long = strlen(text);
        local i: long = 0;
        if ((n > cast<long>(0)) && ((text[0] == 'v') || (text[0] == 'V'))) {
            i = 1;
        }
        local parts: long[3];
        loop (local p: int = 0; p < 3; p = p + 1) {
            local start: long = i;
            local value: long = 0;
            loop ((i < n) && _semverDigit(text[i])) {
                if (value > cast<long>(922337203685477579)) {
                    return Option<SemVer>.None;
                }
                value = (value * 10) + cast<long>(cast<int>(text[i]) - 48);
                i = i + 1;
            }
            if ((i == start) || (((i - start) > cast<long>(1)) && (text[start] == '0'))) {
                return Option<SemVer>.None;
            }
            parts[p] = value;
            if (p < 2) {
                if ((i >= n) || (text[i] != '.')) {
                    return Option<SemVer>.None;
                }
                i = i + 1;
            }
        }
        local preStart: long = i;
        local preEnd: long = i;
        if ((i < n) && (text[i] == '-')) {
            preStart = i + 1;
            preEnd = preStart;
            loop ((preEnd < n) && (text[preEnd] != '+')) {
                preEnd = preEnd + 1;
            }
            if (!_semverIdentifiers(text, preStart, preEnd, true)) {
                return Option<SemVer>.None;
            }
            i = preEnd;
        }
        local buildStart: long = i;
        local buildEnd: long = i;
        if ((i < n) && (text[i] == '+')) {
            buildStart = i + 1;
            buildEnd = n;
            if (!_semverIdentifiers(text, buildStart, buildEnd, false)) {
                return Option<SemVer>.None;
            }
            i = n;
        }
        if (i != n) {
            return Option<SemVer>.None;
        }
        local version: SemVer;
        version.major = parts[0];
        version.minor = parts[1];
        version.patch = parts[2];
        version.prerelease = _semverSlice(text, preStart, preEnd);
        version.build = _semverSlice(text, buildStart, buildEnd);
        return Option<SemVer>.Some(version);
    }

    frame isValid(text: string) ret bool {
        local parsed: Option<SemVer> = SemVer.parse(text);
        if (parsed.isNone()) {
            return false;
        }
        local version: SemVer = parsed.unwrap();
        version.destroy();
        return true;
    }

    frame destroy(this: *SemVer) {
        this.prerelease.destroy();
        this.build.destroy();
    }

    frame isPrerelease(this: *SemVer) ret bool {
        return this.prerelease.length > 0;
    }

    # Precedence comparison: negative, zero or positive.
    frame compare(this: *SemVer, other: *SemVer) ret int {
        if (this.major != other.major) {
            if (this.major < other.major) {
                return -1;
            }
            return 1;
        }
        if (this.minor != other.minor) {
            if (this.minor < other.minor) {
                return -1;
            }
            return 1;
        }
        if (this.patch != other.patch) {
            if (this.patch < other.patch) {
                return -1;
            }
            return 1;
        }
        return _semverComparePrerelease(this.prerelease.data, other.prerelease.data);
    }

    # Compares two version strings; throws when either is invalid.
    frame compareStrings(a: string, b: string) ret int {
        local left: Option<SemVer> = SemVer.parse(a);
        local right: Option<SemVer> = SemVer.parse(b);
        if (left.isNone() || right.isNone()) {
            if (left.isSome()) {
                local l: SemVer = left.unwrap();
                l.destroy();
            }
            if (right.isSome()) {
                local r: SemVer = right.unwrap();
                r.destroy();
            }
            throw "SemVer.compareStrings: invalid version";
        }
        local x: SemVer = left.unwrap();
        local y: SemVer = right.unwrap();
        local order: int = x.compare(&y);
        x.destroy();
        y.destroy();
        return order;
    }

    # MAJOR.MINOR.PATCH[-pre][+build]; the caller destroys the result.
    frame toString(this: *SemVer) ret String {
        local out: StringBuilder = StringBuilder.new(16);
        out.appendLong(this.major);
        out.appendChar('.');
        out.appendLong(this.minor);
        out.appendChar('.');
        out.appendLong(this.patch);
        if (this.prerelease.length > 0) {
            out.appendChar('-');
            out.append(this.prerelease.data);
        }
        if (this.build.length > 0) {
            out.appendChar('+');
            out.append(this.build.data);
        }
        local result: String;
        result.data = out.buffer;
        result.length = out.length;
        return result;
    }

    frame bumpMajor(this: *SemVer) ret SemVer {
        return SemVer.new(this.major + 1, 0, 0);
    }

    frame bumpMinor(this: *SemVer) ret SemVer {
        return SemVer.new(this.major, this.minor + 1, 0);
    }

    # The release of a prerelease, or the next patch of a release.
    frame bumpPatch(this: *SemVer) ret SemVer {
        if (this.prerelease.length > 0) {
            return SemVer.new(this.major, this.minor, this.patch);
        }
        return SemVer.new(this.major, this.minor, this.patch + 1);
    }

    # ------------------------------------------------------------- ranges

    # Whether this version is in `range` (see the module comment). Throws
    # on a malformed range.
    frame satisfies(this: *SemVer, range: string) ret bool {
        if (range == nullptr) {
            return true;
        }
        local n: long = strlen(range);
        local start: long = 0;
        loop (start <= n) {
            local end: long = start;
            loop ((end < n) && !((range[end] == '|') && ((end + 1) < n) && (range[end + 1] == '|'))) {
                end = end + 1;
            }
            if (this._satisfiesSet(range, start, end)) {
                return true;
            }
            start = end + 2;
        }
        return false;
    }

    frame satisfiesString(version: string, range: string) ret bool {
        local parsed: Option<SemVer> = SemVer.parse(version);
        if (parsed.isNone()) {
            return false;
        }
        local value: SemVer = parsed.unwrap();
        local result: bool = value.satisfies(range);
        value.destroy();
        return result;
    }

    # One AND-set of comparators in range[start, end).
    frame _satisfiesSet(this: *SemVer, range: string, start: long, end: long) ret bool {
        # Split into whitespace-separated tokens; handle "a - b" hyphen ranges.
        local tokens: long[64];
        local tokenEnds: long[64];
        local count: int = 0;
        local i: long = start;
        loop (i < end) {
            loop ((i < end) && ((range[i] == ' ') || (range[i] == '\t'))) {
                i = i + 1;
            }
            if (i >= end) {
                break;
            }
            local tokenStart: long = i;
            loop ((i < end) && (range[i] != ' ') && (range[i] != '\t')) {
                i = i + 1;
            }
            if (count == 64) {
                throw "SemVer range has too many comparators";
            }
            tokens[count] = tokenStart;
            tokenEnds[count] = i;
            count = count + 1;
        }
        # Join comparator operators separated from their version (">= 1.2").
        local allowsPrerelease: bool = false;
        local results: bool = true;
        local t: int = 0;
        loop (t < count) {
            local tokenStart: long = tokens[t];
            local tokenEnd: long = tokenEnds[t];
            if (((t + 2) < count) && ((tokenEnds[t + 1] - tokens[t + 1]) == cast<long>(1)) && (range[tokens[t + 1]] == '-')) {
                # Hyphen range: >= low and <= high (partial high rounds up).
                local low: bool = this._compareToken(range, tokenStart, tokenEnd, ">=", &allowsPrerelease);
                local high: bool = this._hyphenHigh(range, tokens[t + 2], tokenEnds[t + 2], &allowsPrerelease);
                results = results && low && high;
                t = t + 3;
                continue;
            }
            local isOperatorOnly: bool = true;
            loop (local k: long = tokenStart; k < tokenEnd; k = k + 1) {
                local c: char = range[k];
                if ((c != '<') && (c != '>') && (c != '=') && (c != '^') && (c != '~')) {
                    isOperatorOnly = false;
                }
            }
            if (isOperatorOnly && ((t + 1) < count)) {
                local opText: String = _semverSlice(range, tokenStart, tokenEnd);
                local ok: bool = this._compareToken(range, tokens[t + 1], tokenEnds[t + 1], opText.data, &allowsPrerelease);
                opText.destroy();
                results = results && ok;
                t = t + 2;
                continue;
            }
            results = results && this._compareToken(range, tokenStart, tokenEnd, "", &allowsPrerelease);
            t = t + 1;
        }
        if (!results) {
            return false;
        }
        if ((this.prerelease.length > 0) && !allowsPrerelease) {
            return false;
        }
        return true;
    }

    # Parses a possibly partial version "1", "1.2", "1.x", "*" in
    # range[start, end) into parts; returns the number of given parts (0-3)
    # and stores whether a prerelease was present.
    frame _partial(range: string, start: long, end: long, parts: *long, prerelease: *String) ret int {
        local i: long = start;
        if ((i < end) && ((range[i] == 'v') || (range[i] == 'V'))) {
            i = i + 1;
        }
        local given: int = 0;
        parts[0] = 0;
        parts[1] = 0;
        parts[2] = 0;
        *prerelease = String.new("");
        loop (given < 3) {
            if (i >= end) {
                break;
            }
            if ((range[i] == 'x') || (range[i] == 'X') || (range[i] == '*')) {
                i = i + 1;
                break;
            }
            local digitsStart: long = i;
            local value: long = 0;
            loop ((i < end) && _semverDigit(range[i])) {
                value = (value * 10) + cast<long>(cast<int>(range[i]) - 48);
                i = i + 1;
            }
            if (i == digitsStart) {
                throw "SemVer range: expected a number";
            }
            parts[given] = value;
            given = given + 1;
            if ((i < end) && (range[i] == '.')) {
                i = i + 1;
                continue;
            }
            break;
        }
        if ((given == 3) && (i < end) && (range[i] == '-')) {
            local preEnd: long = i + 1;
            loop ((preEnd < end) && (range[preEnd] != '+')) {
                preEnd = preEnd + 1;
            }
            prerelease.destroy();
            *prerelease = _semverSlice(range, i + 1, preEnd);
            i = preEnd;
        }
        if ((i < end) && (range[i] == '+')) {
            i = end;
        }
        if ((i < end) && (range[i] == '.')) {
            # Trailing wildcard segments such as "1.x.x".
            loop ((i < end) && ((range[i] == '.') || (range[i] == 'x') || (range[i] == 'X') || (range[i] == '*'))) {
                i = i + 1;
            }
        }
        if (i != end) {
            prerelease.destroy();
            throw "SemVer range: malformed version";
        }
        return given;
    }

    # Compares this version with (major, minor, patch, prerelease).
    frame _compareParts(this: *SemVer, major: long, minor: long, patch: long, prerelease: string) ret int {
        local other: SemVer = SemVer { major: major, minor: minor, patch: patch, prerelease: String.new(prerelease), build: String.new("") };
        local order: int = this.compare(&other);
        other.destroy();
        return order;
    }

    frame _sameTuple(this: *SemVer, parts: *long) ret bool {
        return (this.major == parts[0]) && (this.minor == parts[1]) && (this.patch == parts[2]);
    }

    # Evaluates one comparator token; `operator` overrides the token's own
    # leading operator when it is non-empty.
    frame _compareToken(this: *SemVer, range: string, start: long, end: long, operator: string, allowsPrerelease: *bool) ret bool {
        local op: String = String.new(operator);
        local i: long = start;
        if (op.length == 0) {
            local opEnd: long = i;
            loop ((opEnd < end) && ((range[opEnd] == '<') || (range[opEnd] == '>') || (range[opEnd] == '=') || (range[opEnd] == '^') || (range[opEnd] == '~'))) {
                opEnd = opEnd + 1;
            }
            op.destroy();
            op = _semverSlice(range, i, opEnd);
            i = opEnd;
        }
        local parts: long[3];
        local pre: String;
        local given: int = SemVer._partial(range, i, end, &parts[0], &pre);
        if ((pre.length > 0) && this._sameTuple(&parts[0])) {
            *allowsPrerelease = true;
        }
        local result: bool = this._evaluate(op.data, &parts[0], given, pre.data);
        op.destroy();
        pre.destroy();
        return result;
    }

    frame _evaluate(this: *SemVer, op: string, parts: *long, given: int, pre: string) ret bool {
        local major: long = parts[0];
        local minor: long = parts[1];
        local patch: long = parts[2];
        # Lower bound "major.minor.patch-0" covers prereleases of a partial
        # version's first release only when explicitly named.
        if ((strcmp(op, "") == 0) || (strcmp(op, "=") == 0)) {
            if (given == 0) {
                return true;
            }
            if (given == 3) {
                return this._compareParts(major, minor, patch, pre) == 0;
            }
            if (given == 1) {
                return this.major == major;
            }
            return (this.major == major) && (this.minor == minor);
        }
        if (strcmp(op, "^") == 0) {
            if (this._compareParts(major, minor, patch, pre) < 0) {
                return false;
            }
            if ((major > cast<long>(0)) || (given == 1)) {
                return this.major == major;
            }
            if ((minor > cast<long>(0)) || (given == 2)) {
                return (this.major == 0) && (this.minor == minor);
            }
            return (this.major == 0) && (this.minor == 0) && (this.patch == patch);
        }
        if (strcmp(op, "~") == 0) {
            if (this._compareParts(major, minor, patch, pre) < 0) {
                return false;
            }
            if (given == 1) {
                return this.major == major;
            }
            return (this.major == major) && (this.minor == minor);
        }
        # Partial versions round toward the comparator's meaning.
        if (strcmp(op, ">=") == 0) {
            return this._compareParts(major, minor, patch, pre) >= 0;
        }
        if (strcmp(op, "<") == 0) {
            return this._compareParts(major, minor, patch, pre) < 0;
        }
        if (strcmp(op, ">") == 0) {
            if (given == 1) {
                return this.major > major;
            }
            if (given == 2) {
                return (this.major > major) || ((this.major == major) && (this.minor > minor));
            }
            return this._compareParts(major, minor, patch, pre) > 0;
        }
        if (strcmp(op, "<=") == 0) {
            if (given == 1) {
                return this.major <= major;
            }
            if (given == 2) {
                return (this.major < major) || ((this.major == major) && (this.minor <= minor));
            }
            return this._compareParts(major, minor, patch, pre) <= 0;
        }
        throw "SemVer range: unknown operator";
    }

    frame _hyphenHigh(this: *SemVer, range: string, start: long, end: long, allowsPrerelease: *bool) ret bool {
        return this._compareToken(range, start, end, "<=", allowsPrerelease);
    }
}
