# Checked parsing of numbers and booleans from text

export [Parse];

extern strlen(str: string) ret long;
extern strtod(text: string, end: **char) ret float;

# Each function parses the whole of `text`, with no surrounding whitespace,
# and on success stores the value and returns true. On failure (empty or
# null text, a stray character, or a value out of range) it returns false
# and leaves `output` unchanged.
struct Parse {
    # A decimal `int`, with an optional `+` or `-` sign.
    frame int(text: string, output: *int) ret bool {
        local value: long = 0;
        if ((output == nullptr) || !Parse.radix(text, 10, &value)) {
            return false;
        }
        if ((value < cast<long>(-2147483648)) || (value > cast<long>(2147483647))) {
            return false;
        }
        *output = cast<int>(value);
        return true;
    }

    # A decimal `long`, with an optional `+` or `-` sign.
    frame long(text: string, output: *long) ret bool {
        return Parse.radix(text, 10, output);
    }

    # A `long` in `base` (2 to 36, letters in either case), with an optional
    # sign. Base 16, 8 and 2 also accept a `0x`, `0o` or `0b` prefix after the
    # sign.
    frame radix(text: string, base: int, output: *long) ret bool {
        if ((text == nullptr) || (output == nullptr) || (base < 2) || (base > 36)) {
            return false;
        }
        local length: long = strlen(text);
        local at: long = 0;
        local negative: bool = false;
        if ((length > 0) && ((text[0] == '+') || (text[0] == '-'))) {
            negative = text[0] == '-';
            at = 1;
        }
        if (((at + 1) < length) && (text[at] == '0')) {
            local marker: char = text[at + 1];
            if (((base == 16) && ((marker == 'x') || (marker == 'X'))) || ((base == 8) && ((marker == 'o') || (marker == 'O'))) || ((base == 2) && ((marker == 'b') || (marker == 'B')))) {
                at = at + 2;
            }
        }
        if (at >= length) {
            return false;
        }
        # The magnitude may reach 2^63 only for a negative value.
        local limit: ulong = cast<ulong>(9223372036854775807);
        if (negative) {
            limit = limit + cast<ulong>(1);
        }
        local magnitude: ulong = 0;
        loop (at < length) {
            local digit: int = Parse.digitValue(text[at]);
            if ((digit < 0) || (digit >= base)) {
                return false;
            }
            if (magnitude > ((limit - cast<ulong>(digit)) / cast<ulong>(base))) {
                return false;
            }
            magnitude = (magnitude * cast<ulong>(base)) + cast<ulong>(digit);
            at = at + 1;
        }
        if (negative) {
            *output = cast<long>(cast<ulong>(0) - magnitude);
        } else {
            *output = cast<long>(magnitude);
        }
        return true;
    }

    # A floating-point number in any form `strtod` reads: decimal or
    # exponent notation, hexadecimal floats, `inf` and `nan`.
    frame float(text: string, output: *float) ret bool {
        if ((text == nullptr) || (output == nullptr)) {
            return false;
        }
        local length: long = strlen(text);
        # strtod skips leading whitespace, which is not part of a number here.
        if ((length == 0) || !Parse.startsFloat(text[0])) {
            return false;
        }
        local end: *char = nullptr;
        local value: float = strtod(text, &end);
        if (end != (cast<*char>(text) + length)) {
            return false;
        }
        *output = value;
        return true;
    }

    # `true` or `false`, in lower case.
    frame bool(text: string, output: *bool) ret bool {
        if ((text == nullptr) || (output == nullptr)) {
            return false;
        }
        switch (text) {
            case "true":
                *output = true;
                return true;
            case "false":
                *output = false;
                return true;
            default:
                return false;
        }
    }

    # Whether `c` can begin a number `strtod` reads: a digit, sign or point,
    # or the first letter of `inf` or `nan`.
    frame startsFloat(c: char) ret bool {
        local code: int = cast<int>(cast<u8>(c));
        return ((code >= 48) && (code <= 57)) || (c == '+') || (c == '-') || (c == '.') || (c == 'i') || (c == 'I') || (c == 'n') || (c == 'N');
    }

    # The value of a digit or letter (`a`/`A` is 10), or -1.
    frame digitValue(c: char) ret int {
        local code: int = cast<int>(cast<u8>(c));
        if ((code >= 48) && (code <= 57)) {
            return code - 48;
        }
        if ((code >= 97) && (code <= 122)) {
            return code - 87;
        }
        if ((code >= 65) && (code <= 90)) {
            return code - 55;
        }
        return -1;
    }
}
