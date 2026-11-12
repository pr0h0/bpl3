# UTF-8 utilities

export [UTF8];

import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern strlen(s: string) ret long;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

struct UTF8 {
    frame encode(s: string) ret string {
        # Strings are already UTF-8; return pointer
        return cast<string>(s);
    }

    frame decode(buf: string) ret String {
        # Construct String from char* buffer
        return String.new(buf);
    }

    # Returns the byte length of a UTF-8 string
    frame byteLength(s: string) ret int {
        if (s == nullptr)
            return 0;
        return strlen(s);
    }

    # Returns the number of UTF-8 codepoints (characters) in a string
    frame codepointCount(s: string) ret int {
        if (s == nullptr)
            return 0;
        local ptr: *u8 = cast<*u8>(s);
        local count: int = 0;
        local i: int = 0;
        local len: int = strlen(s);

        loop (i < len) {
            local byte: u8 = ptr[i];

            # Count only leading bytes (not continuation bytes 10xxxxxx)
            if ((byte & cast<u8>(0xC0)) != cast<u8>(0x80)) {
                count = count + 1;
            }
            i = i + 1;
        }

        return count;
    }

    # Returns the byte length of a single UTF-8 codepoint starting at the given byte
    frame codepointByteLength(leadByte: u8) ret int {
        if ((leadByte & cast<u8>(0x80)) == cast<u8>(0x00))
            return 1;
        # 0xxxxxxx - ASCII
        if ((leadByte & cast<u8>(0xE0)) == cast<u8>(0xC0))
            return 2;
        # 110xxxxx
        if ((leadByte & cast<u8>(0xF0)) == cast<u8>(0xE0))
            return 3;
        # 1110xxxx
        if ((leadByte & cast<u8>(0xF8)) == cast<u8>(0xF0))
            return 4;
        # 11110xxx
        return 1; # Invalid, treat as single byte
    }

    /#
        Validates if a string is valid UTF-8.

        The leading byte fixes both the length and the range its second byte
        may take, and those ranges are what exclude overlong encodings, the
        surrogate block, and anything above U+10FFFF. The previous check asked
        codepointByteLength for a length, which reports one for any byte it
        does not recognise, so an isolated continuation byte, an FF, a
        surrogate encoded as ED A0 80, and F4 90 80 80 were all accepted.
    #/
    frame isValid(s: string) ret bool {
        if (s == nullptr)
            return true;
        # Empty/null is valid

        local ptr: *u8 = cast<*u8>(s);
        local i: int = 0;
        local len: int = strlen(s);

        loop (i < len) {
            local first: u8 = ptr[i];
            local following: int = 0;
            local secondLow: u8 = cast<u8>(0x80);
            local secondHigh: u8 = cast<u8>(0xBF);

            if (first <= cast<u8>(0x7F)) {
                following = 0;
            } else if ((first >= cast<u8>(0xC2)) && (first <= cast<u8>(0xDF))) {
                following = 1;
            } else if (first == cast<u8>(0xE0)) {
                # A second byte below A0 would be an overlong two-byte value.
                following = 2;
                secondLow = cast<u8>(0xA0);
            } else if ((first >= cast<u8>(0xE1)) && (first <= cast<u8>(0xEC))) {
                following = 2;
            } else if (first == cast<u8>(0xED)) {
                # A0 and above here encodes a surrogate, which is not a scalar.
                following = 2;
                secondHigh = cast<u8>(0x9F);
            } else if ((first >= cast<u8>(0xEE)) && (first <= cast<u8>(0xEF))) {
                following = 2;
            } else if (first == cast<u8>(0xF0)) {
                # Below 90 would be an overlong three-byte value.
                following = 3;
                secondLow = cast<u8>(0x90);
            } else if ((first >= cast<u8>(0xF1)) && (first <= cast<u8>(0xF3))) {
                following = 3;
            } else if (first == cast<u8>(0xF4)) {
                # Above 8F would exceed U+10FFFF.
                following = 3;
                secondHigh = cast<u8>(0x8F);
            } else {
                # 80 to C1 are continuation or overlong leads; F5 to FF are
                # beyond the encodable range.
                return false;
            }

            if ((i + following) >= len)
                return false;
            local j: int = 1;
            loop (j <= following) {
                local continuation: u8 = ptr[i + j];
                local low: u8 = cast<u8>(0x80);
                local high: u8 = cast<u8>(0xBF);
                if (j == 1) {
                    low = secondLow;
                    high = secondHigh;
                }
                if ((continuation < low) || (continuation > high))
                    return false;
                j = j + 1;
            }

            i = i + following + 1;
        }

        return true;
    }

    # Decode at a byte offset; malformed text or an invalid offset returns U+FFFD.
    frame decodeCodepoint(s: string, pos: int) ret u32 {
        if ((s == nullptr) || (pos < 0)) {
            return cast<u32>(0xFFFD);
        }
        return UTF8._decodeCodepoint(s, pos, strlen(s));
    }

    # The caller supplies the byte length so bulk decoding remains linear.
    frame _decodeCodepoint(s: string, pos: int, length: long) ret u32 {
        if ((s == nullptr) || (pos < 0) || (cast<long>(pos) >= length)) {
            return cast<u32>(0xFFFD);
        }
        local ptr: *u8 = cast<*u8>(s);
        local first: u8 = ptr[pos];
        if (first < cast<u8>(0x80)) {
            return cast<u32>(first);
        }
        local size: int = 0;
        local cp: u32 = cast<u32>(0);
        local minimum: u32 = cast<u32>(0);
        if ((first >= cast<u8>(0xC2)) && (first <= cast<u8>(0xDF))) {
            size = 2;
            cp = cast<u32>(first & cast<u8>(0x1F));
            minimum = cast<u32>(0x80);
        } else if ((first >= cast<u8>(0xE0)) && (first <= cast<u8>(0xEF))) {
            size = 3;
            cp = cast<u32>(first & cast<u8>(0x0F));
            minimum = cast<u32>(0x800);
        } else if ((first >= cast<u8>(0xF0)) && (first <= cast<u8>(0xF4))) {
            size = 4;
            cp = cast<u32>(first & cast<u8>(0x07));
            minimum = cast<u32>(0x10000);
        } else {
            return cast<u32>(0xFFFD);
        }
        if ((length - cast<long>(pos)) < cast<long>(size)) {
            return cast<u32>(0xFFFD);
        }
        loop (local j: int = 1; j < size; j = j + 1) {
            local byte: u8 = ptr[cast<long>(pos) + cast<long>(j)];
            if ((byte & cast<u8>(0xC0)) != cast<u8>(0x80)) {
                return cast<u32>(0xFFFD);
            }
            cp = (cp << 6) | cast<u32>(byte & cast<u8>(0x3F));
        }
        if ((cp < minimum) || (cp > cast<u32>(0x10FFFF)) || ((cp >= cast<u32>(0xD800)) && (cp <= cast<u32>(0xDFFF)))) {
            return cast<u32>(0xFFFD);
        }
        return cp;
    }

    # Encodes a Unicode codepoint to UTF-8 bytes
    # Returns the number of bytes written (1-4)
    frame encodeCodepoint(codepoint: u32, dest: *u8) ret int {
        # Surrogates and values outside the Unicode scalar range have no
        # UTF-8 encoding. Emit the replacement character instead.
        if ((codepoint > cast<u32>(0x10FFFF)) || ((codepoint >= cast<u32>(0xD800)) && (codepoint <= cast<u32>(0xDFFF)))) {
            codepoint = cast<u32>(0xFFFD);
        }
        if (codepoint < cast<u32>(0x80)) {
            dest[0] = cast<u8>(codepoint);
            return 1;
        }
        if (codepoint < cast<u32>(0x800)) {
            dest[0] = cast<u8>(cast<u32>(0xC0) | (codepoint >> 6));
            dest[1] = cast<u8>(cast<u32>(0x80) | (codepoint & cast<u32>(0x3F)));
            return 2;
        }
        if (codepoint < cast<u32>(0x10000)) {
            dest[0] = cast<u8>(cast<u32>(0xE0) | (codepoint >> 12));
            dest[1] = cast<u8>(cast<u32>(0x80) | ((codepoint >> 6) & cast<u32>(0x3F)));
            dest[2] = cast<u8>(cast<u32>(0x80) | (codepoint & cast<u32>(0x3F)));
            return 3;
        }
        dest[0] = cast<u8>(cast<u32>(0xF0) | (codepoint >> 18));
        dest[1] = cast<u8>(cast<u32>(0x80) | ((codepoint >> 12) & cast<u32>(0x3F)));
        dest[2] = cast<u8>(cast<u32>(0x80) | ((codepoint >> 6) & cast<u32>(0x3F)));
        dest[3] = cast<u8>(cast<u32>(0x80) | (codepoint & cast<u32>(0x3F)));
        return 4;
    }

    # Checks if a codepoint is ASCII
    frame isAscii(codepoint: u32) ret bool {
        return codepoint < cast<u32>(128);
    }

    # Checks if a string contains only ASCII characters
    frame isAsciiString(s: string) ret bool {
        if (s == nullptr)
            return true;
        local ptr: *u8 = cast<*u8>(s);
        local i: int = 0;
        local len: int = strlen(s);

        loop (i < len) {
            if (ptr[i] >= cast<u8>(128))
                return false;
            i = i + 1;
        }

        return true;
    }

    # Get codepoints as an array of u32
    frame toCodepoints(s: string) ret Array<u32> {
        local result: Array<u32> = Array<u32>.new(16);
        if (s == nullptr)
            return result;
        local ptr: *u8 = cast<*u8>(s);
        local i: int = 0;
        local len: int = strlen(s);

        loop (i < len) {
            local cp: u32 = UTF8._decodeCodepoint(s, i, cast<long>(len));
            result.push(cp);
            local cpLen: int = UTF8.codepointByteLength(ptr[i]);
            # Invalid sequences consume one byte, preserving any following text.
            # A valid encoded U+FFFD still consumes its complete three bytes.
            if (cp == cast<u32>(0xFFFD)) {
                if (((len - i) < 3) || (ptr[i] != cast<u8>(0xEF)) || (ptr[i + 1] != cast<u8>(0xBF)) || (ptr[i + 2] != cast<u8>(0xBD))) {
                    cpLen = 1;
                }
            }
            i = i + cpLen;
        }

        return result;
    }
    # ------------------------------------------------------------------
    # Codepoint-level operations. Malformed bytes decode as U+FFFD, one per
    # byte, as in `toCodepoints`. Results are new Strings or arrays the
    # caller destroys.

    # Encodes codepoints as UTF-8 (invalid values become U+FFFD).
    frame fromCodepoints(codepoints: *Array<u32>) ret String {
        local out: StringBuilder = StringBuilder.new(codepoints.length + 1);
        local bytes: u8[4];
        loop (local i: int = 0; i < codepoints.length; i = i + 1) {
            local count: int = UTF8.encodeCodepoint(codepoints.data[i], &bytes[0]);
            loop (local k: int = 0; k < count; k = k + 1) {
                out.appendChar(cast<char>(bytes[k]));
            }
        }
        local result: String;
        result.data = out.buffer;
        result.length = out.length;
        return result;
    }

    # A copy with every malformed byte replaced by U+FFFD.
    frame sanitize(s: string) ret String {
        local codepoints: Array<u32> = UTF8.toCodepoints(s);
        local result: String = UTF8.fromCodepoints(&codepoints);
        codepoints.destroy();
        return result;
    }

    # The codepoints in reverse order.
    frame reverse(s: string) ret String {
        local codepoints: Array<u32> = UTF8.toCodepoints(s);
        codepoints.reverse();
        local result: String = UTF8.fromCodepoints(&codepoints);
        codepoints.destroy();
        return result;
    }

    # `count` codepoints starting at codepoint `start` (clamped to the text).
    frame substring(s: string, start: int, count: int) ret String {
        local codepoints: Array<u32> = UTF8.toCodepoints(s);
        local end: long = cast<long>(start) + cast<long>(count);
        if (start < 0) {
            start = 0;
        }
        if (end > cast<long>(codepoints.length)) {
            end = cast<long>(codepoints.length);
        }
        local part: Array<u32> = codepoints.slice(start, cast<int>(end));
        local result: String = UTF8.fromCodepoints(&part);
        part.destroy();
        codepoints.destroy();
        return result;
    }

    # At most `maxCodepoints` codepoints from the start.
    frame truncate(s: string, maxCodepoints: int) ret String {
        return UTF8.substring(s, 0, maxCodepoints);
    }

    # The byte offset of codepoint `index` (the byte length for index equal
    # to the count), or -1 when it is out of range.
    frame byteOffset(s: string, index: int) ret int {
        if (index < 0) {
            return -1;
        }
        local n: int = 0;
        if (s != nullptr) {
            n = cast<int>(strlen(s));
        }
        local ptr: *u8 = cast<*u8>(s);
        local position: int = 0;
        local seen: int = 0;
        loop (position < n) {
            if (seen == index) {
                return position;
            }
            local cp: u32 = UTF8._decodeCodepoint(s, position, cast<long>(n));
            local size: int = UTF8.codepointByteLength(ptr[position]);
            if ((cp == cast<u32>(0xFFFD)) && (((n - position) < 3) || (ptr[position] != cast<u8>(0xEF)) || (ptr[position + 1] != cast<u8>(0xBF)) || (ptr[position + 2] != cast<u8>(0xBD)))) {
                size = 1;
            }
            position = position + size;
            seen = seen + 1;
        }
        if (seen == index) {
            return n;
        }
        return -1;
    }

    # UTF-16 code units (surrogate pairs above U+FFFF).
    frame toUtf16(s: string) ret Array<u16> {
        local codepoints: Array<u32> = UTF8.toCodepoints(s);
        local units: Array<u16> = Array<u16>.new(codepoints.length);
        loop (local i: int = 0; i < codepoints.length; i = i + 1) {
            local cp: u32 = codepoints.data[i];
            if (cp >= cast<u32>(0x10000)) {
                local offset: u32 = cp - cast<u32>(0x10000);
                units.push(cast<u16>(cast<u32>(0xD800) + (offset >> 10)));
                units.push(cast<u16>(cast<u32>(0xDC00) + (offset & cast<u32>(0x3FF))));
            } else {
                units.push(cast<u16>(cp));
            }
        }
        codepoints.destroy();
        return units;
    }

    # Decodes UTF-16 code units; unpaired surrogates become U+FFFD.
    frame fromUtf16(units: *Array<u16>) ret String {
        local codepoints: Array<u32> = Array<u32>.new(units.length);
        local i: int = 0;
        loop (i < units.length) {
            local unit: u32 = cast<u32>(units.data[i]);
            if ((unit >= cast<u32>(0xD800)) && (unit <= cast<u32>(0xDBFF)) && ((i + 1) < units.length)) {
                local low: u32 = cast<u32>(units.data[i + 1]);
                if ((low >= cast<u32>(0xDC00)) && (low <= cast<u32>(0xDFFF))) {
                    codepoints.push(cast<u32>(0x10000) + ((unit - cast<u32>(0xD800)) << 10) + (low - cast<u32>(0xDC00)));
                    i = i + 2;
                    continue;
                }
            }
            if ((unit >= cast<u32>(0xD800)) && (unit <= cast<u32>(0xDFFF))) {
                unit = cast<u32>(0xFFFD);
            }
            codepoints.push(unit);
            i = i + 1;
        }
        local result: String = UTF8.fromCodepoints(&codepoints);
        codepoints.destroy();
        return result;
    }

    # Unicode White_Space characters.
    frame isWhitespace(cp: u32) ret bool {
        local c: uint = cast<uint>(cp);
        return ((c >= cast<uint>(9)) && (c <= cast<uint>(13))) || (c == cast<uint>(32)) || (c == cast<uint>(0x85)) || (c == cast<uint>(0xA0)) || (c == cast<uint>(0x1680)) || ((c >= cast<uint>(0x2000)) && (c <= cast<uint>(0x200A))) || (c == cast<uint>(0x2028)) || (c == cast<uint>(0x2029)) || (c == cast<uint>(0x202F)) || (c == cast<uint>(0x205F)) || (c == cast<uint>(0x3000));
    }

    # Terminal columns of one codepoint: 0 for controls, combining marks and
    # zero-width characters, 2 for East Asian wide and emoji ranges, else 1.
    frame codepointWidth(cp: u32) ret int {
        local c: uint = cast<uint>(cp);
        if ((c < cast<uint>(32)) || ((c >= cast<uint>(0x7F)) && (c < cast<uint>(0xA0)))) {
            return 0;
        }
        if (((c >= cast<uint>(0x300)) && (c <= cast<uint>(0x36F))) || ((c >= cast<uint>(0x200B)) && (c <= cast<uint>(0x200F))) || ((c >= cast<uint>(0xFE00)) && (c <= cast<uint>(0xFE0F))) || ((c >= cast<uint>(0x20D0)) && (c <= cast<uint>(0x20FF))) || (c == cast<uint>(0xFEFF))) {
            return 0;
        }
        if (((c >= cast<uint>(0x1100)) && (c <= cast<uint>(0x115F))) || ((c >= cast<uint>(0x2E80)) && (c <= cast<uint>(0xA4CF)) && (c != cast<uint>(0x303F))) || ((c >= cast<uint>(0xAC00)) && (c <= cast<uint>(0xD7A3))) || ((c >= cast<uint>(0xF900)) && (c <= cast<uint>(0xFAFF))) || ((c >= cast<uint>(0xFE30)) && (c <= cast<uint>(0xFE4F))) || ((c >= cast<uint>(0xFF00)) && (c <= cast<uint>(0xFF60))) || ((c >= cast<uint>(0xFFE0)) && (c <= cast<uint>(0xFFE6))) || ((c >= cast<uint>(0x1F300)) && (c <= cast<uint>(0x1F64F))) || ((c >= cast<uint>(0x1F900)) && (c <= cast<uint>(0x1F9FF))) || ((c >= cast<uint>(0x20000)) && (c <= cast<uint>(0x3FFFD)))) {
            return 2;
        }
        return 1;
    }

    # Terminal columns of a string (sum of `codepointWidth`).
    frame displayWidth(s: string) ret int {
        local codepoints: Array<u32> = UTF8.toCodepoints(s);
        local width: int = 0;
        loop (local i: int = 0; i < codepoints.length; i = i + 1) {
            width = width + UTF8.codepointWidth(codepoints.data[i]);
        }
        codepoints.destroy();
        return width;
    }
}
