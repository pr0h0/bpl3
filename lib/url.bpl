# URL percent-encoding (RFC 3986) and HTML form encoding

export [Url];

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(str: string) ret long;

# Every result is a newly allocated string the caller must free, or nullptr
# when allocation fails or, for the decoders, when the input is malformed.
struct Url {
    # `text` with every byte except the RFC 3986 unreserved characters
    # (`A`-`Z`, `a`-`z`, `0`-`9`, `-`, `_`, `.`, `~`) written as `%XX`, as for
    # a path segment or query value.
    frame encodeComponent(text: string) ret string {
        return Url.encode(text, false);
    }

    # Like `encodeComponent`, but a space becomes `+`, as in
    # `application/x-www-form-urlencoded` bodies and query strings.
    frame encodeForm(text: string) ret string {
        return Url.encode(text, true);
    }

    # Decodes `%XX` escapes (either case). Returns nullptr for a `%` without
    # two hex digits after it and for `%00`, which would end the string early.
    frame decode(text: string) ret string {
        return Url.decodeWith(text, false);
    }

    # Like `decode`, but `+` also becomes a space.
    frame decodeForm(text: string) ret string {
        return Url.decodeWith(text, true);
    }

    frame isUnreserved(c: int) ret bool {
        return ((c >= 65) && (c <= 90)) || ((c >= 97) && (c <= 122)) || ((c >= 48) && (c <= 57)) || (c == 45) || (c == 95) || (c == 46) || (c == 126);
    }

    frame hexValue(c: int) ret int {
        if ((c >= 48) && (c <= 57)) {
            return c - 48;
        }
        if ((c >= 65) && (c <= 70)) {
            return c - 55;
        }
        if ((c >= 97) && (c <= 102)) {
            return c - 87;
        }
        return -1;
    }

    frame encode(text: string, spaceAsPlus: bool) ret string {
        local length: long = 0;
        if (text != nullptr) {
            length = strlen(text);
        }
        # At most three output bytes per input byte.
        local output: *u8 = cast<*u8>(malloc((length * 3) + 1));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        local hexChars: *u8 = cast<*u8>("0123456789ABCDEF");
        local used: long = 0;
        local i: long = 0;
        loop (i < length) {
            local c: int = cast<int>(cast<u8>(text[i]));
            if (Url.isUnreserved(c)) {
                *(output + used) = cast<u8>(c);
                used = used + 1;
            } else if (spaceAsPlus && (c == 32)) {
                *(output + used) = cast<u8>(43);
                used = used + 1;
            } else {
                *(output + used) = cast<u8>(37);
                *(output + used + 1) = *(hexChars + (c >> 4));
                *(output + used + 2) = *(hexChars + (c & 15));
                used = used + 3;
            }
            i = i + 1;
        }
        *(output + used) = cast<u8>(0);
        return cast<string>(output);
    }

    frame decodeWith(text: string, plusAsSpace: bool) ret string {
        if (text == nullptr) {
            return cast<string>(nullptr);
        }
        local length: long = strlen(text);
        local output: *u8 = cast<*u8>(malloc(length + 1));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        local used: long = 0;
        local i: long = 0;
        loop (i < length) {
            local c: int = cast<int>(cast<u8>(text[i]));
            if (plusAsSpace && (c == 43)) {
                c = 32;
            } else if (c == 37) {
                local high: int = -1;
                local low: int = -1;
                if ((i + 2) < length) {
                    high = Url.hexValue(cast<int>(cast<u8>(text[i + 1])));
                    low = Url.hexValue(cast<int>(cast<u8>(text[i + 2])));
                }
                if ((high < 0) || (low < 0) || ((high == 0) && (low == 0))) {
                    free(cast<*void>(output));
                    return cast<string>(nullptr);
                }
                c = (high * 16) + low;
                i = i + 2;
            }
            *(output + used) = cast<u8>(c);
            used = used + 1;
            i = i + 1;
        }
        *(output + used) = cast<u8>(0);
        return cast<string>(output);
    }
}
