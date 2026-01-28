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

    # Validates if a string is valid UTF-8
    frame isValid(s: string) ret bool {
        if (s == nullptr) 
            return true;
        # Empty/null is valid

        local ptr: *u8 = cast<*u8>(s);
        local i: int = 0;
        local len: int = strlen(s);

        loop (i < len) {
            local byte: u8 = ptr[i];
            local cpLen: int = UTF8.codepointByteLength(byte);

            # Check if we have enough bytes
            if ((i + cpLen) > len) 
                return false;
            # Validate continuation bytes
            local j: int = 1;
            loop (j < cpLen) {
                local contByte: u8 = ptr[i + j];
                # Continuation bytes must be 10xxxxxx
                if ((contByte & cast<u8>(0xC0)) != cast<u8>(0x80)) 
                    return false;
                j = j + 1;
            }

            # Check for overlong encodings (simplified check)
            if (cpLen == 2) {
                if ((byte & cast<u8>(0x1E)) == cast<u8>(0)) 
                    return false;
                # Overlong
            } else if (cpLen == 3) {
                if ((byte == cast<u8>(0xE0)) && ((ptr[i + 1] & cast<u8>(0x20)) == cast<u8>(0))) 
                    return false;
            } else if (cpLen == 4) {
                if ((byte == cast<u8>(0xF0)) && ((ptr[i + 1] & cast<u8>(0x30)) == cast<u8>(0))) 
                    return false;
            }
            i = i + cpLen;
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
        } # Replacement character
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
