# Hex encoding and decoding utilities

export [Hex];

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(str: string) ret long;

struct Hex {
    # Encode a byte array to lowercase hex string
    # Returns a newly allocated string (caller must free)
    frame encode(data: *u8, length: int) ret string {
        if ((data == nullptr) || (length <= 0)) {
            local empty: *u8 = cast<*u8>(malloc(1));
            if (empty != nullptr) {
                *empty = cast<u8>(0);
            }
            return cast<string>(empty);
        }
        if (length > 1073741823) {
            throw "Hex encoded length exceeds int";
        }
        local outLen: int = length * 2;
        local output: *u8 = cast<*u8>(malloc(cast<long>(outLen) + cast<long>(1)));
        if (output == nullptr) { return cast<string>(nullptr); }
        local hexChars: string = "0123456789abcdef";
        local hexPtr: *u8 = cast<*u8>(hexChars);

        local i: int = 0;
        loop (i < length) {
            local b: u8 = *(data + i);
            local hi: int = cast<int>(b >> cast<u8>(4));
            local lo: int = cast<int>(b & cast<u8>(0x0F));
            *(output + (i * 2)) = *(hexPtr + hi);
            *(output + (i * 2) + 1) = *(hexPtr + lo);
            i = i + 1;
        }

        *(output + outLen) = cast<u8>(0);
        return cast<string>(output);
    }

    # Encode a byte array to uppercase hex string
    frame encodeUpper(data: *u8, length: int) ret string {
        if ((data == nullptr) || (length <= 0)) {
            return Hex.encode(nullptr, 0);
        }
        if (length > 1073741823) {
            throw "Hex encoded length exceeds int";
        }
        local outLen: int = length * 2;
        local output: *u8 = cast<*u8>(malloc(cast<long>(outLen) + cast<long>(1)));
        if (output == nullptr) { return cast<string>(nullptr); }
        local hexChars: string = "0123456789ABCDEF";
        local hexPtr: *u8 = cast<*u8>(hexChars);

        local i: int = 0;
        loop (i < length) {
            local b: u8 = *(data + i);
            local hi: int = cast<int>(b >> cast<u8>(4));
            local lo: int = cast<int>(b & cast<u8>(0x0F));
            *(output + (i * 2)) = *(hexPtr + hi);
            *(output + (i * 2) + 1) = *(hexPtr + lo);
            i = i + 1;
        }

        *(output + outLen) = cast<u8>(0);
        return cast<string>(output);
    }

    # Encode a string to hex
    frame encodeString(str: string) ret string {
        if (str == nullptr) {
            return Hex.encode(nullptr, 0);
        }
        local len: long = strlen(str);
        if (len > cast<long>(1073741823)) {
            throw "Hex encoded length exceeds int";
        }
        return Hex.encode(cast<*u8>(str), cast<int>(len));
    }

    # Convert a hex character to its value (0-15), or -1 for invalid
    frame hexCharToValue(c: u8) ret int {
        if ((c >= cast<u8>(48)) && (c <= cast<u8>(57))) {
            # 0-9
            return cast<int>(c) - 48;
        }
        if ((c >= cast<u8>(65)) && (c <= cast<u8>(70))) {
            # A-F
            return (cast<int>(c) - 65) + 10;
        }
        if ((c >= cast<u8>(97)) && (c <= cast<u8>(102))) {
            # a-f
            return (cast<int>(c) - 97) + 10;
        }
        return -1;
    }

    # Whitespace separates byte pairs, as it does for Python's bytes.fromhex,
    # so "41 42" is two bytes. It may not split a pair: "4 142" is refused.
    frame isWhitespace(c: u8) ret bool {
        return (c == cast<u8>(32)) || (c == cast<u8>(10)) || (c == cast<u8>(13)) || (c == cast<u8>(9));
    }

    # The one place that knows what a valid hex string looks like. decode,
    # decodedLength and isValid all run this, so a string can never be
    # accepted by one and refused by another.
    #
    # An odd digit, a digit outside the alphabet, or whitespace inside a pair
    # is refused rather than silently ending the decode, which is what let
    # `isValid` accept strings the decoder could not finish.
    #
    # Returns the number of bytes the input decodes to, or -1 if it is not a
    # valid hex string. Bytes are written to `output` only when `write` is
    # set, so the length can be measured without a buffer.
    frame scan(input: string, output: *u8, write: bool) ret int {
        if (input == nullptr) {
            return -1;
        }
        local ptr: *u8 = cast<*u8>(input);
        local len: int = cast<int>(strlen(input));

        # Skip optional 0x prefix
        if (len >= 2) {
            if ((*ptr == cast<u8>(48)) && ((*(ptr + 1) == cast<u8>(120)) || (*(ptr + 1) == cast<u8>(88)))) {
                ptr = ptr + 2;
                len = len - 2;
            }
        }
        local i: int = 0;
        local j: int = 0;

        loop (i < len) {
            local c1: u8 = *(ptr + i);

            if (Hex.isWhitespace(c1)) {
                i = i + 1;
                continue;
            }
            if ((i + 1) >= len) {
                # A digit with no partner.
                return -1;
            }
            local c2: u8 = *(ptr + i + 1);
            local hi: int = Hex.hexCharToValue(c1);
            local lo: int = Hex.hexCharToValue(c2);

            if ((hi < 0) || (lo < 0)) {
                return -1;
            }
            if (write) {
                *(output + j) = cast<u8>((hi << 4) | lo);
            }
            i = i + 2;
            j = j + 1;
        }

        return j;
    }

    # Decode a hex string to bytes
    # Returns the number of decoded bytes, or -1 if the input is not valid hex
    # or the output pointer is null. The output buffer must hold at least
    # decodedLength(input) bytes.
    frame decode(input: string, output: *u8) ret int {
        if (output == nullptr) {
            return -1;
        }
        return Hex.scan(input, output, true);
    }

    # Decode hex to a new string (caller must free)
    # Returns nullptr if the input is not valid hex.
    frame decodeToString(input: string) ret string {
        local needed: int = Hex.scan(input, nullptr, false);
        if (needed < 0) {
            return cast<string>(nullptr);
        }
        local output: *u8 = cast<*u8>(malloc(cast<long>(needed + 1)));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }

        Hex.scan(input, output, true);
        *(output + needed) = cast<u8>(0);

        return cast<string>(output);
    }

    # Convert a single byte to 2-char hex string (lowercase)
    frame byteToHex(b: u8) ret string {
        local output: *u8 = cast<*u8>(malloc(cast<long>(3)));
        if (output == nullptr) { return cast<string>(nullptr); }
        local hexChars: string = "0123456789abcdef";
        local hexPtr: *u8 = cast<*u8>(hexChars);

        local hi: int = cast<int>(b >> cast<u8>(4));
        local lo: int = cast<int>(b & cast<u8>(0x0F));
        *output = *(hexPtr + hi);
        *(output + 1) = *(hexPtr + lo);
        *(output + 2) = cast<u8>(0);

        return cast<string>(output);
    }

    # Convert a u32 to hex string (lowercase, no prefix)
    frame u32ToHex(val: u32) ret string {
        local output: *u8 = cast<*u8>(malloc(cast<long>(9)));
        if (output == nullptr) { return cast<string>(nullptr); }
        local hexChars: string = "0123456789abcdef";
        local hexPtr: *u8 = cast<*u8>(hexChars);

        local i: int = 7;
        loop (i >= 0) {
            local nibble: int = cast<int>(val & cast<u32>(0x0F));
            *(output + i) = *(hexPtr + nibble);
            val = val >> cast<u32>(4);
            i = i - 1;
        }
        *(output + 8) = cast<u8>(0);

        return cast<string>(output);
    }

    # Convert a u64 to hex string (lowercase, no prefix)
    frame u64ToHex(val: u64) ret string {
        local output: *u8 = cast<*u8>(malloc(cast<long>(17)));
        if (output == nullptr) { return cast<string>(nullptr); }
        local hexChars: string = "0123456789abcdef";
        local hexPtr: *u8 = cast<*u8>(hexChars);

        local i: int = 15;
        loop (i >= 0) {
            local nibble: int = cast<int>(val & cast<u64>(0x0F));
            *(output + i) = *(hexPtr + nibble);
            val = val >> cast<u64>(4);
            i = i - 1;
        }
        *(output + 16) = cast<u8>(0);

        return cast<string>(output);
    }

    # Check if a string is valid hex
    # True exactly when decode would accept the string, empty input included.
    frame isValid(input: string) ret bool {
        return Hex.scan(input, nullptr, false) >= 0;
    }

    # Exact number of bytes the input decodes to, or -1 if it is not valid
    # hex. Whitespace and a 0x prefix are discounted.
    frame decodedLength(input: string) ret int {
        return Hex.scan(input, nullptr, false);
    }
}
