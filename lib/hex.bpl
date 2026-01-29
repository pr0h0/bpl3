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
            return "";
        }
        local outLen: int = length * 2;
        local output: *u8 = cast<*u8>(malloc(cast<long>(outLen + 1)));
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
            return "";
        }
        local outLen: int = length * 2;
        local output: *u8 = cast<*u8>(malloc(cast<long>(outLen + 1)));
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
            return "";
        }
        local len: int = cast<int>(strlen(str));
        return Hex.encode(cast<*u8>(str), len);
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

    # Decode a hex string to bytes
    # Returns the number of decoded bytes, output must be pre-allocated
    # Output buffer should be at least (strlen(input) / 2) bytes
    frame decode(input: string, output: *u8) ret int {
        if ((input == nullptr) || (output == nullptr)) {
            return 0;
        }
        local inputPtr: *u8 = cast<*u8>(input);
        local inLen: int = cast<int>(strlen(input));

        # Skip optional 0x prefix
        if (inLen >= 2) {
            if ((*inputPtr == cast<u8>(48)) && ((*(inputPtr + 1) == cast<u8>(120)) || (*(inputPtr + 1) == cast<u8>(88)))) {
                inputPtr = inputPtr + 2;
                inLen = inLen - 2;
            }
        }
        local i: int = 0;
        local j: int = 0;

        loop (i < (inLen - 1)) {
            local c1: u8 = *(inputPtr + i);
            local c2: u8 = *(inputPtr + i + 1);

            # Skip whitespace
            if ((c1 == cast<u8>(32)) || (c1 == cast<u8>(10)) || (c1 == cast<u8>(13)) || (c1 == cast<u8>(9))) {
                i = i + 1;
                continue;
            }
            local hi: int = Hex.hexCharToValue(c1);
            local lo: int = Hex.hexCharToValue(c2);

            if ((hi < 0) || (lo < 0)) {
                # Invalid hex character
                break;
            }
            *(output + j) = cast<u8>((hi << 4) | lo);
            i = i + 2;
            j = j + 1;
        }

        return j;
    }

    # Decode hex to a new string (caller must free)
    frame decodeToString(input: string) ret string {
        if (input == nullptr) {
            return "";
        }
        local inLen: int = cast<int>(strlen(input));
        local maxOutLen: int = (inLen / 2) + 1;
        local output: *u8 = cast<*u8>(malloc(cast<long>(maxOutLen)));

        local decoded: int = Hex.decode(input, output);
        *(output + decoded) = cast<u8>(0);

        return cast<string>(output);
    }

    # Convert a single byte to 2-char hex string (lowercase)
    frame byteToHex(b: u8) ret string {
        local output: *u8 = cast<*u8>(malloc(cast<long>(3)));
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
    frame isValid(input: string) ret bool {
        if (input == nullptr) {
            return false;
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
        if (len == 0) {
            return false;
        }
        local i: int = 0;
        loop (i < len) {
            local c: u8 = *(ptr + i);
            if (Hex.hexCharToValue(c) < 0) {
                return false;
            }
            i = i + 1;
        }

        return true;
    }

    # Calculate the decoded length
    frame decodedLength(input: string) ret int {
        if (input == nullptr) {
            return 0;
        }
        local len: int = cast<int>(strlen(input));
        # Account for 0x prefix
        local ptr: *u8 = cast<*u8>(input);
        if (len >= 2) {
            if ((*ptr == cast<u8>(48)) && ((*(ptr + 1) == cast<u8>(120)) || (*(ptr + 1) == cast<u8>(88)))) {
                len = len - 2;
            }
        }
        return len / 2;
    }
}
