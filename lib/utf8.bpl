# UTF-8 utilities

export [UTF8];

import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";

extern strlen(s: string) ret int;
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

    # Decodes a single UTF-8 codepoint from the given position
    # Returns the Unicode codepoint value
    frame decodeCodepoint(s: string, pos: int) ret u32 {
        local ptr: *u8 = cast<*u8>(s);
        local byte: u8 = ptr[pos];

        if ((byte & cast<u8>(0x80)) == cast<u8>(0x00)) {
            # ASCII
            return cast<u32>(byte);
        }
        if ((byte & cast<u8>(0xE0)) == cast<u8>(0xC0)) {
            # 2-byte sequence
            local cp: u32 = cast<u32>(byte & cast<u8>(0x1F)) << 6;
            cp = cp | cast<u32>(ptr[pos + 1] & cast<u8>(0x3F));
            return cp;
        }
        if ((byte & cast<u8>(0xF0)) == cast<u8>(0xE0)) {
            # 3-byte sequence
            local cp: u32 = cast<u32>(byte & cast<u8>(0x0F)) << 12;
            cp = cp | (cast<u32>(ptr[pos + 1] & cast<u8>(0x3F)) << 6);
            cp = cp | cast<u32>(ptr[pos + 2] & cast<u8>(0x3F));
            return cp;
        }
        if ((byte & cast<u8>(0xF8)) == cast<u8>(0xF0)) {
            # 4-byte sequence
            local cp: u32 = cast<u32>(byte & cast<u8>(0x07)) << 18;
            cp = cp | (cast<u32>(ptr[pos + 1] & cast<u8>(0x3F)) << 12);
            cp = cp | (cast<u32>(ptr[pos + 2] & cast<u8>(0x3F)) << 6);
            cp = cp | cast<u32>(ptr[pos + 3] & cast<u8>(0x3F));
            return cp;
        }
        # Replacement character
        return cast<u32>(0xFFFD);
    }

    # Encodes a Unicode codepoint to UTF-8 bytes
    # Returns the number of bytes written (1-4)
    frame encodeCodepoint(codepoint: u32, dest: *u8) ret int {
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
            local cp: u32 = UTF8.decodeCodepoint(s, i);
            result.push(cp);
            local cpLen: int = UTF8.codepointByteLength(ptr[i]);
            i = i + cpLen;
        }

        return result;
    }
}
