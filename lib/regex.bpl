# Regular expressions over bytes, compiled to a Thompson NFA and matched by
# simulating every state at once, so matching never backtracks: time grows
# linearly with the text for each start position.
#
# Syntax: literal bytes; `.` (any byte except newline); `[abc]`, `[a-z]` and
# negated `[^...]` classes; `\d \w \s` and their negations `\D \W \S`; `\`
# escaping any other character (`\.`, `\*`, `\\`, also `\n \t \r`); grouping
# with `( )`; alternation `|`; `*`, `+` and `?` (greedy); counted repetition
# `{m}`, `{m,}`, `{m,n}` and `{,n}` (up to 1000; a `{` without a count is a
# literal brace); and the anchors `^` (start of text) and `$` (end of text).

export [Regex];

extern malloc(size: long) ret *void;
extern realloc(ptr: *void, size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(str: string) ret long;

# NFA state kinds.
global REGEX_BYTE: int = 0;
global REGEX_CLASS: int = 1;
global REGEX_SPLIT: int = 2;
global REGEX_EMPTY: int = 3;
global REGEX_MATCH: int = 4;
global REGEX_START: int = 5;
global REGEX_END: int = 6;

# A compiled pattern. Create it with `Regex.compile`, which throws on a syntax
# error, and release it with `destroy`.
struct Regex {
    # Parallel arrays describing each state.
    kinds: *int,
    # The byte for REGEX_BYTE, the class index for REGEX_CLASS.
    args: *int,
    outs: *int,
    alternates: *int,
    count: int,
    capacity: int,
    # 32-byte bitmaps, one per class.
    classes: *u8,
    classCount: int,
    classCapacity: int,
    start: int,
    # Parser position in `pattern`.
    pattern: string,
    position: int,

    frame compile(pattern: string) ret Regex {
        local regex: Regex;
        local length: long = strlen(pattern);
        # Each pattern byte adds at most four states.
        regex.capacity = cast<int>((length * 4) + 4);
        regex.kinds = cast<*int>(malloc(cast<long>(regex.capacity) * 4));
        regex.args = cast<*int>(malloc(cast<long>(regex.capacity) * 4));
        regex.outs = cast<*int>(malloc(cast<long>(regex.capacity) * 4));
        regex.alternates = cast<*int>(malloc(cast<long>(regex.capacity) * 4));
        # Counted repetition can add more of both; they grow as needed.
        regex.classCapacity = cast<int>(length + 1);
        regex.classes = cast<*u8>(malloc(cast<long>(regex.classCapacity) * 32));
        regex.count = 0;
        regex.classCount = 0;
        regex.pattern = pattern;
        regex.position = 0;
        local end: int = -1;
        local first: int = -1;
        # Syntax errors are thrown from deep in the parser; free the buffers
        # before passing them on.
        try {
            first = regex.parseAlternation(&end);
            if (regex.pattern[regex.position] != cast<char>(0)) {
                throw "Regex: unmatched ')'";
            }
        } catch (message: string) {
            regex.destroy();
            throw message;
        }
        local accept: int = regex.addState(REGEX_MATCH, 0);
        *(regex.outs + end) = accept;
        regex.start = first;
        return regex;
    }

    frame destroy(this: *Regex) {
        free(cast<*void>(this.kinds));
        free(cast<*void>(this.args));
        free(cast<*void>(this.outs));
        free(cast<*void>(this.alternates));
        free(cast<*void>(this.classes));
        this.kinds = nullptr;
        this.args = nullptr;
        this.outs = nullptr;
        this.alternates = nullptr;
        this.classes = nullptr;
        this.count = 0;
    }

    frame addState(this: *Regex, kind: int, argument: int) ret int {
        if (this.count == this.capacity) {
            this.capacity = this.capacity * 2;
            local bytes: long = cast<long>(this.capacity) * 4;
            this.kinds = cast<*int>(realloc(cast<*void>(this.kinds), bytes));
            this.args = cast<*int>(realloc(cast<*void>(this.args), bytes));
            this.outs = cast<*int>(realloc(cast<*void>(this.outs), bytes));
            this.alternates = cast<*int>(realloc(cast<*void>(this.alternates), bytes));
            if ((this.kinds == nullptr) || (this.args == nullptr) || (this.outs == nullptr) || (this.alternates == nullptr)) {
                throw "Regex: out of memory";
            }
        }
        local index: int = this.count;
        *(this.kinds + index) = kind;
        *(this.args + index) = argument;
        *(this.outs + index) = -1;
        *(this.alternates + index) = -1;
        this.count = this.count + 1;
        return index;
    }

    # Each parse function returns the first state of a fragment and stores in
    # `end` its last state, an empty state whose `out` the caller links.
    frame parseAlternation(this: *Regex, end: *int) ret int {
        local leftEnd: int = -1;
        local left: int = this.parseConcatenation(&leftEnd);
        if (this.pattern[this.position] != '|') {
            *end = leftEnd;
            return left;
        }
        local join: int = this.addState(REGEX_EMPTY, 0);
        *(this.outs + leftEnd) = join;
        local choice: int = this.addState(REGEX_SPLIT, 0);
        *(this.outs + choice) = left;
        local last: int = choice;
        loop (this.pattern[this.position] == '|') {
            this.position = this.position + 1;
            local branchEnd: int = -1;
            local branch: int = this.parseConcatenation(&branchEnd);
            *(this.outs + branchEnd) = join;
            if (this.pattern[this.position] == '|') {
                local next: int = this.addState(REGEX_SPLIT, 0);
                *(this.outs + next) = branch;
                *(this.alternates + last) = next;
                last = next;
            } else {
                *(this.alternates + last) = branch;
            }
        }
        *end = join;
        return choice;
    }

    frame parseConcatenation(this: *Regex, end: *int) ret int {
        local first: int = this.addState(REGEX_EMPTY, 0);
        local tail: int = first;
        loop {
            local c: char = this.pattern[this.position];
            if ((c == cast<char>(0)) || (c == '|') || (c == ')')) {
                break;
            }
            local pieceEnd: int = -1;
            local piece: int = this.parseRepetition(&pieceEnd);
            *(this.outs + tail) = piece;
            tail = pieceEnd;
        }
        *end = tail;
        return first;
    }

    frame parseRepetition(this: *Regex, end: *int) ret int {
        local atomStart: int = this.position;
        local atomEnd: int = -1;
        local atom: int = this.parseAtom(&atomEnd);
        local c: char = this.pattern[this.position];
        if (c == '{') {
            local counted: int = this.parseCounted(atomStart, end);
            if (counted >= 0) {
                return counted;
            }
        }
        if ((c != '*') && (c != '+') && (c != '?')) {
            *end = atomEnd;
            return atom;
        }
        this.position = this.position + 1;
        local after: int = this.addState(REGEX_EMPTY, 0);
        local split: int = this.addState(REGEX_SPLIT, 0);
        *(this.outs + split) = atom;
        *(this.alternates + split) = after;
        if (c == '?') {
            *(this.outs + atomEnd) = after;
            *end = after;
            return split;
        }
        # `*` and `+` loop back through the split after each repetition.
        *(this.outs + atomEnd) = split;
        *end = after;
        if (c == '*') {
            return split;
        }
        return atom;
    }

    # A decimal count at `position`, or -1 if there are no digits.
    frame parseCount(this: *Regex) ret int {
        local value: int = -1;
        loop ((this.pattern[this.position] >= '0') && (this.pattern[this.position] <= '9')) {
            if (value < 0) {
                value = 0;
            }
            value = (value * 10) + (cast<int>(this.pattern[this.position]) - 48);
            if (value > 1000) {
                throw "Regex: repetition count above 1000";
            }
            this.position = this.position + 1;
        }
        return value;
    }

    # `{m}`, `{m,}`, `{m,n}` or `{,n}` after the atom that starts at `atomStart`
    # (`position` is on the `{`): the atom is parsed again for each copy, m
    # required ones followed by a starred one or n - m optional ones. Returns
    # -1, leaving `position` on the `{`, when no count follows, so the brace
    # is an ordinary character.
    frame parseCounted(this: *Regex, atomStart: int, end: *int) ret int {
        local brace: int = this.position;
        this.position = this.position + 1;
        local low: int = this.parseCount();
        # `{,n}` means `{0,n}`.
        if ((low < 0) && (this.pattern[this.position] == ',')) {
            low = 0;
        }
        local high: int = low;
        local unbounded: bool = false;
        if (this.pattern[this.position] == ',') {
            this.position = this.position + 1;
            high = this.parseCount();
            unbounded = high < 0;
        }
        if ((low < 0) || (this.pattern[this.position] != '}')) {
            this.position = brace;
            return -1;
        }
        if (!unbounded && (high < low)) {
            throw "Regex: repetition range out of order";
        }
        local afterBrace: int = this.position + 1;

        local first: int = this.addState(REGEX_EMPTY, 0);
        local tail: int = first;
        loop (local i: int = 0; i < low; i = i + 1) {
            this.position = atomStart;
            local copyEnd: int = -1;
            local copy: int = this.parseAtom(&copyEnd);
            *(this.outs + tail) = copy;
            tail = copyEnd;
        }
        local optional: int = high - low;
        if (unbounded) {
            optional = 1;
        }
        loop (local i: int = 0; i < optional; i = i + 1) {
            this.position = atomStart;
            local copyEnd: int = -1;
            local copy: int = this.parseAtom(&copyEnd);
            local after: int = this.addState(REGEX_EMPTY, 0);
            local split: int = this.addState(REGEX_SPLIT, 0);
            *(this.outs + split) = copy;
            *(this.alternates + split) = after;
            *(this.outs + tail) = split;
            if (unbounded) {
                *(this.outs + copyEnd) = split;
            } else {
                *(this.outs + copyEnd) = after;
            }
            tail = after;
        }
        this.position = afterBrace;
        *end = tail;
        return first;
    }

    frame parseAtom(this: *Regex, end: *int) ret int {
        local c: char = this.pattern[this.position];
        if ((c == '*') || (c == '+') || (c == '?')) {
            throw "Regex: quantifier with nothing to repeat";
        }
        this.position = this.position + 1;
        local state: int = -1;
        if (c == '(') {
            local innerEnd: int = -1;
            local inner: int = this.parseAlternation(&innerEnd);
            if (this.pattern[this.position] != ')') {
                throw "Regex: missing ')'";
            }
            this.position = this.position + 1;
            *end = innerEnd;
            return inner;
        } else if (c == '.') {
            local any: int = this.newClass();
            this.fillClass(any, 0, 255);
            this.clearByte(any, 10);
            state = this.addState(REGEX_CLASS, any);
        } else if (c == '[') {
            state = this.addState(REGEX_CLASS, this.parseClass());
        } else if (c == '^') {
            state = this.addState(REGEX_START, 0);
        } else if (c == '$') {
            state = this.addState(REGEX_END, 0);
        } else if (c == '\\') {
            local shorthand: int = this.parseShorthand(this.pattern[this.position]);
            if (shorthand >= 0) {
                this.position = this.position + 1;
                state = this.addState(REGEX_CLASS, shorthand);
            } else {
                state = this.addState(REGEX_BYTE, this.parseEscapedByte());
            }
        } else {
            state = this.addState(REGEX_BYTE, cast<int>(cast<u8>(c)));
        }
        local after: int = this.addState(REGEX_EMPTY, 0);
        *(this.outs + state) = after;
        *end = after;
        return state;
    }

    # The byte an escape such as `\n` or `\.` stands for; `position` is on
    # the character after the backslash.
    frame parseEscapedByte(this: *Regex) ret int {
        local c: char = this.pattern[this.position];
        if (c == cast<char>(0)) {
            throw "Regex: trailing '\\'";
        }
        this.position = this.position + 1;
        if (c == 'n') {
            return 10;
        }
        if (c == 't') {
            return 9;
        }
        if (c == 'r') {
            return 13;
        }
        return cast<int>(cast<u8>(c));
    }

    # A new class for `\d \w \s \D \W \S`, or -1 for any other letter.
    frame parseShorthand(this: *Regex, c: char) ret int {
        local lower: char = c;
        if ((c == 'D') || (c == 'W') || (c == 'S')) {
            lower = c + cast<char>(32);
        }
        if ((lower != 'd') && (lower != 'w') && (lower != 's')) {
            return -1;
        }
        local index: int = this.newClass();
        this.addShorthand(index, lower);
        if (lower != c) {
            this.invertClass(index);
        }
        return index;
    }

    frame addShorthand(this: *Regex, index: int, kind: char) {
        if (kind == 'd') {
            this.fillClass(index, 48, 57);
        } else if (kind == 'w') {
            this.fillClass(index, 48, 57);
            this.fillClass(index, 65, 90);
            this.fillClass(index, 97, 122);
            this.fillClass(index, 95, 95);
        } else {
            this.fillClass(index, 32, 32);
            this.fillClass(index, 9, 13);
        }
    }

    # `[...]` after the opening bracket: bytes, ranges, escapes and
    # shorthands, negated by a leading `^`; `]` first is a literal.
    frame parseClass(this: *Regex) ret int {
        local index: int = this.newClass();
        local negate: bool = false;
        if (this.pattern[this.position] == '^') {
            negate = true;
            this.position = this.position + 1;
        }
        local first: bool = true;
        loop {
            local c: char = this.pattern[this.position];
            if (c == cast<char>(0)) {
                throw "Regex: missing ']'";
            }
            if ((c == ']') && !first) {
                this.position = this.position + 1;
                break;
            }
            first = false;
            this.position = this.position + 1;
            local low: int = cast<int>(cast<u8>(c));
            if (c == '\\') {
                local next: char = this.pattern[this.position];
                if ((next == 'd') || (next == 'w') || (next == 's')) {
                    this.position = this.position + 1;
                    this.addShorthand(index, next);
                    continue;
                }
                low = this.parseEscapedByte();
            }
            local high: int = low;
            if ((this.pattern[this.position] == '-') && (this.pattern[this.position + 1] != ']') && (this.pattern[this.position + 1] != cast<char>(0))) {
                this.position = this.position + 1;
                local upper: char = this.pattern[this.position];
                this.position = this.position + 1;
                high = cast<int>(cast<u8>(upper));
                if (upper == '\\') {
                    high = this.parseEscapedByte();
                }
                if (high < low) {
                    throw "Regex: class range out of order";
                }
            }
            this.fillClass(index, low, high);
        }
        if (negate) {
            this.invertClass(index);
        }
        return index;
    }

    frame newClass(this: *Regex) ret int {
        if (this.classCount == this.classCapacity) {
            this.classCapacity = this.classCapacity * 2;
            this.classes = cast<*u8>(realloc(cast<*void>(this.classes), cast<long>(this.classCapacity) * 32));
            if (this.classes == nullptr) {
                throw "Regex: out of memory";
            }
        }
        local index: int = this.classCount;
        loop (local i: int = 0; i < 32; i = i + 1) {
            *(this.classes + ((index * 32) + i)) = cast<u8>(0);
        }
        this.classCount = this.classCount + 1;
        return index;
    }

    frame fillClass(this: *Regex, index: int, low: int, high: int) {
        loop (local b: int = low; b <= high; b = b + 1) {
            local slot: *u8 = this.classes + ((index * 32) + (b / 8));
            *slot = *slot | cast<u8>(1 << (b % 8));
        }
    }

    frame clearByte(this: *Regex, index: int, b: int) {
        local slot: *u8 = this.classes + ((index * 32) + (b / 8));
        *slot = *slot & ~cast<u8>(1 << (b % 8));
    }

    frame invertClass(this: *Regex, index: int) {
        loop (local i: int = 0; i < 32; i = i + 1) {
            local slot: *u8 = this.classes + ((index * 32) + i);
            *slot = ~*slot;
        }
    }

    frame classHas(this: *Regex, index: int, b: int) ret bool {
        local bits: u8 = *(this.classes + ((index * 32) + (b / 8)));
        return (bits & cast<u8>(1 << (b % 8))) != cast<u8>(0);
    }

    # Add `state` and everything reachable from it without consuming a byte
    # to `set`, at text offset `at` of a text `length` bytes long. `marks`
    # records the generation each state was last added in.
    frame addToSet(this: *Regex, set: *int, size: *int, marks: *int, generation: int, state: int, at: long, length: long) {
        local stack: *int = cast<*int>(malloc(cast<long>(this.count) * 4));
        local top: int = 0;
        *stack = state;
        top = 1;
        loop (top > 0) {
            top = top - 1;
            local current: int = *(stack + top);
            if ((current < 0) || (*(marks + current) == generation)) {
                continue;
            }
            *(marks + current) = generation;
            local kind: int = *(this.kinds + current);
            if (kind == REGEX_SPLIT) {
                *(stack + top) = *(this.alternates + current);
                *(stack + (top + 1)) = *(this.outs + current);
                top = top + 2;
            } else if (kind == REGEX_EMPTY) {
                *(stack + top) = *(this.outs + current);
                top = top + 1;
            } else if (kind == REGEX_START) {
                if (at == 0) {
                    *(stack + top) = *(this.outs + current);
                    top = top + 1;
                }
            } else if (kind == REGEX_END) {
                if (at == length) {
                    *(stack + top) = *(this.outs + current);
                    top = top + 1;
                }
            } else {
                *(set + *size) = current;
                *size = *size + 1;
            }
        }
        free(cast<*void>(stack));
    }

    # The end of the longest match starting at `begin`, or -1 if none does.
    frame longestMatchFrom(this: *Regex, text: string, length: long, begin: long) ret long {
        local current: *int = cast<*int>(malloc(cast<long>(this.count) * 4));
        local next: *int = cast<*int>(malloc(cast<long>(this.count) * 4));
        local marks: *int = cast<*int>(malloc(cast<long>(this.count) * 4));
        loop (local i: int = 0; i < this.count; i = i + 1) {
            *(marks + i) = -1;
        }
        local generation: int = 0;
        local size: int = 0;
        this.addToSet(current, &size, marks, generation, this.start, begin, length);
        local best: long = -1;
        local at: long = begin;
        loop {
            local nextSize: int = 0;
            generation = generation + 1;
            loop (local i: int = 0; i < size; i = i + 1) {
                local state: int = *(current + i);
                local kind: int = *(this.kinds + state);
                if (kind == REGEX_MATCH) {
                    best = at;
                    continue;
                }
                if (at >= length) {
                    continue;
                }
                local b: int = cast<int>(cast<u8>(text[at]));
                local accepts: bool = false;
                if (kind == REGEX_BYTE) {
                    accepts = *(this.args + state) == b;
                } else if (kind == REGEX_CLASS) {
                    accepts = this.classHas(*(this.args + state), b);
                }
                if (accepts) {
                    this.addToSet(next, &nextSize, marks, generation, *(this.outs + state), at + 1, length);
                }
            }
            if ((nextSize == 0) || (at >= length)) {
                break;
            }
            local swap: *int = current;
            current = next;
            next = swap;
            size = nextSize;
            at = at + 1;
        }
        free(cast<*void>(current));
        free(cast<*void>(next));
        free(cast<*void>(marks));
        return best;
    }

    # Whether the whole of `text` matches.
    frame matches(this: *Regex, text: string) ret bool {
        local length: long = strlen(text);
        return this.longestMatchFrom(text, length, 0) == length;
    }

    # The leftmost match at or after byte `begin`, extended as far as it goes.
    # On success stores its start and end offsets and returns true.
    frame find(this: *Regex, text: string, begin: long, matchStart: *long, matchEnd: *long) ret bool {
        local length: long = strlen(text);
        loop (local at: long = begin; at <= length; at = at + 1) {
            local end: long = this.longestMatchFrom(text, length, at);
            if (end >= 0) {
                *matchStart = at;
                *matchEnd = end;
                return true;
            }
        }
        return false;
    }

    # Whether any part of `text` matches.
    frame contains(this: *Regex, text: string) ret bool {
        local start: long = 0;
        local end: long = 0;
        return this.find(text, 0, &start, &end);
    }

    # The search position after a match from `start` to `end`. An empty
    # match moves one byte on so the scan always advances; after a non-empty
    # match an empty match at its end is still found, as in Perl and Python.
    frame nextSearch(start: long, end: long) ret long {
        if (end == start) {
            return end + 1;
        }
        return end;
    }

    # The number of non-overlapping matches in `text`.
    frame countMatches(this: *Regex, text: string) ret long {
        local length: long = strlen(text);
        local found: long = 0;
        local at: long = 0;
        local start: long = 0;
        local end: long = 0;
        loop ((at <= length) && this.find(text, at, &start, &end)) {
            found = found + 1;
            at = Regex.nextSearch(start, end);
        }
        return found;
    }

    # `text` with each non-overlapping match replaced by `replacement`, which
    # is copied literally. Returns a newly allocated string (caller must
    # free), or nullptr if allocation fails.
    frame replaceAll(this: *Regex, text: string, replacement: string) ret string {
        return this.replace(text, replacement, -1);
    }

    # `text` with its first match replaced by `replacement` (caller must
    # free), or nullptr if allocation fails.
    frame replaceFirst(this: *Regex, text: string, replacement: string) ret string {
        return this.replace(text, replacement, 1);
    }

    # Replaces up to `limit` matches, or all of them when `limit` is negative.
    frame replace(this: *Regex, text: string, replacement: string, limit: long) ret string {
        local length: long = strlen(text);
        local replacementLength: long = strlen(replacement);
        local capacity: long = length + 1;
        local output: *u8 = cast<*u8>(malloc(capacity));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        local used: long = 0;
        local copied: long = 0;
        local at: long = 0;
        local replaced: long = 0;
        local start: long = 0;
        local end: long = 0;
        loop ((at <= length) && ((limit < 0) || (replaced < limit)) && this.find(text, at, &start, &end)) {
            # Text before the match, the replacement, and for an empty match
            # the byte it stands before.
            local keepEnd: long = start;
            if ((end == start) && (start < length)) {
                keepEnd = start + 1;
            }
            local needed: long = used + (start - copied) + replacementLength + (keepEnd - start) + 1;
            if (needed > capacity) {
                loop (capacity < needed) {
                    capacity = capacity * 2;
                }
                local grown: *u8 = cast<*u8>(realloc(cast<*void>(output), capacity));
                if (grown == nullptr) {
                    free(cast<*void>(output));
                    return cast<string>(nullptr);
                }
                output = grown;
            }
            loop (local i: long = copied; i < start; i = i + 1) {
                *(output + used) = cast<u8>(text[i]);
                used = used + 1;
            }
            loop (local r: long = 0; r < replacementLength; r = r + 1) {
                *(output + used) = cast<u8>(replacement[r]);
                used = used + 1;
            }
            loop (local k: long = start; k < keepEnd; k = k + 1) {
                *(output + used) = cast<u8>(text[k]);
                used = used + 1;
            }
            copied = end;
            if (keepEnd > end) {
                copied = keepEnd;
            }
            replaced = replaced + 1;
            at = Regex.nextSearch(start, end);
        }
        local rest: long = length - copied;
        if ((used + rest + 1) > capacity) {
            capacity = used + rest + 1;
            local grown: *u8 = cast<*u8>(realloc(cast<*void>(output), capacity));
            if (grown == nullptr) {
                free(cast<*void>(output));
                return cast<string>(nullptr);
            }
            output = grown;
        }
        loop (local i: long = copied; i < length; i = i + 1) {
            *(output + used) = cast<u8>(text[i]);
            used = used + 1;
        }
        *(output + used) = cast<u8>(0);
        return cast<string>(output);
    }
}
