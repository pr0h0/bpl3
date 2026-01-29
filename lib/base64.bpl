# Base64 encoding and decoding utilities

export [Base64];

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(str: string) ret long;

struct Base64 {
    # Standard Base64 alphabet
    # Note: This is a static utility struct

    # Encode a byte array to Base64 string
    # Returns a newly allocated string (caller must free)
    frame encode(data: *u8, length: int) ret string {
        if ((data == nullptr) || (length <= 0)) {
            return "";
        }
        # Calculate output length: 4 chars for every 3 bytes, rounded up
        local outLen: int = ((length + 2) / 3) * 4;
        local output: *u8 = cast<*u8>(malloc(cast<long>(outLen + 1)));

        local alphabet: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        local alphaPtr: *u8 = cast<*u8>(alphabet);

        local i: int = 0;
        local j: int = 0;

        loop (i < length) {
            local b0: u8 = *(data + i);
            local b1: u8 = cast<u8>(0);
            local b2: u8 = cast<u8>(0);

            if ((i + 1) < length) {
                b1 = *(data + i + 1);
            }
            if ((i + 2) < length) {
                b2 = *(data + i + 2);
            }
            # Encode 3 bytes into 4 characters
            local idx0: int = cast<int>(b0 >> cast<u8>(2));
            local idx1: int = cast<int>(((b0 & cast<u8>(0x03)) << cast<u8>(4)) | (b1 >> cast<u8>(4)));
            local idx2: int = cast<int>(((b1 & cast<u8>(0x0F)) << cast<u8>(2)) | (b2 >> cast<u8>(6)));
            local idx3: int = cast<int>(b2 & cast<u8>(0x3F));

            *(output + j) = *(alphaPtr + idx0);
            *(output + j + 1) = *(alphaPtr + idx1);

            if ((i + 1) < length) {
                *(output + j + 2) = *(alphaPtr + idx2);
            } else {
                *(output + j + 2) = cast<u8>(61); # '='
            }

            if ((i + 2) < length) {
                *(output + j + 3) = *(alphaPtr + idx3);
            } else {
                *(output + j + 3) = cast<u8>(61); # '='
            }

            i = i + 3;
            j = j + 4;
        }

        *(output + outLen) = cast<u8>(0);
        return cast<string>(output);
    }

    # Encode a string to Base64
    frame encodeString(str: string) ret string {
        if (str == nullptr) {
            return "";
        }
        local len: int = cast<int>(strlen(str));
        return Base64.encode(cast<*u8>(str), len);
    }

    # Decode a Base64 character to its value (0-63), or -1 for padding/invalid
    frame decodeChar(c: u8) ret int {
        if ((c >= cast<u8>(65)) && (c <= cast<u8>(90))) {
            # A-Z
            return cast<int>(c) - 65;
        }
        if ((c >= cast<u8>(97)) && (c <= cast<u8>(122))) {
            # a-z
            return (cast<int>(c) - 97) + 26;
        }
        if ((c >= cast<u8>(48)) && (c <= cast<u8>(57))) {
            # 0-9
            return (cast<int>(c) - 48) + 52;
        }
        if (c == cast<u8>(43)) {
            # +
            return 62;
        }
        if (c == cast<u8>(47)) {
            # /
            return 63;
        }
        if (c == cast<u8>(45)) {
            # - (URL-safe)
            return 62;
        }
        if (c == cast<u8>(95)) {
            # _ (URL-safe)
            return 63;
        }
        return -1;
    }

    # Decode a Base64 string to bytes
    # Returns the number of decoded bytes, output must be pre-allocated
    # Output buffer should be at least (strlen(input) * 3 / 4) bytes
    frame decode(input: string, output: *u8) ret int {
        if ((input == nullptr) || (output == nullptr)) {
            return 0;
        }
        local inputPtr: *u8 = cast<*u8>(input);
        local inLen: int = cast<int>(strlen(input));

        local j: int = 0;
        local i: int = 0;

        loop (i < inLen) {
            # Read 4 characters, skipping whitespace
            local vals: int[4];
            local k: int = 0;
            local paddingCount: int = 0;

            loop ((k < 4) && (i < inLen)) {
                local c: u8 = *(inputPtr + i);
                i = i + 1;

                # Skip whitespace
                if ((c == cast<u8>(32)) || (c == cast<u8>(10)) || (c == cast<u8>(13)) || (c == cast<u8>(9))) {
                    continue;
                }
                if (c == cast<u8>(61)) {
                    # Padding '='
                    vals[k] = 0;
                    k = k + 1;
                    paddingCount = paddingCount + 1;
                    continue;
                }
                local val: int = Base64.decodeChar(c);
                if (val >= 0) {
                    vals[k] = val;
                    k = k + 1;
                }
            }

            if (k < 4) {
                break;
            }
            # Decode 4 characters to 3 bytes
            # Byte 1 is always written
            *(output + j) = cast<u8>((vals[0] << 2) | (vals[1] >> 4));
            j = j + 1;

            # Byte 2 is written if we have less than 2 padding chars
            if (paddingCount < 2) {
                *(output + j) = cast<u8>(((vals[1] & 15) << 4) | (vals[2] >> 2));
                j = j + 1;
            }
            # Byte 3 is written if we have no padding
            if (paddingCount < 1) {
                *(output + j) = cast<u8>(((vals[2] & 3) << 6) | vals[3]);
                j = j + 1;
            }
        }

        return j;
    }

    # Decode Base64 to a new string (caller must free)
    frame decodeToString(input: string) ret string {
        if (input == nullptr) {
            return "";
        }
        local inLen: int = cast<int>(strlen(input));
        local maxOutLen: int = ((inLen * 3) / 4) + 1;
        local output: *u8 = cast<*u8>(malloc(cast<long>(maxOutLen)));

        local decoded: int = Base64.decode(input, output);
        *(output + decoded) = cast<u8>(0);

        return cast<string>(output);
    }

    # Calculate the decoded length (approximate, may be slightly over)
    frame decodedLength(input: string) ret int {
        if (input == nullptr) {
            return 0;
        }
        local len: int = cast<int>(strlen(input));
        return (len * 3) / 4;
    }

    # Calculate the encoded length for given input length
    frame encodedLength(inputLen: int) ret int {
        return ((inputLen + 2) / 3) * 4;
    }

    # Check if a string is valid Base64
    frame isValid(input: string) ret bool {
        if (input == nullptr) {
            return false;
        }
        local ptr: *u8 = cast<*u8>(input);
        local len: int = cast<int>(strlen(input));
        local paddingStarted: bool = false;
        local paddingCount: int = 0;

        local i: int = 0;
        loop (i < len) {
            local c: u8 = *(ptr + i);

            # Skip whitespace
            if ((c == cast<u8>(32)) || (c == cast<u8>(10)) || (c == cast<u8>(13)) || (c == cast<u8>(9))) {
                i = i + 1;
                continue;
            }
            if (c == cast<u8>(61)) {
                # '=' padding
                paddingStarted = true;
                paddingCount = paddingCount + 1;
                if (paddingCount > 2) {
                    return false;
                }
            } else if (paddingStarted) {
                # Non-padding after padding
                return false;
            } else {
                local val: int = Base64.decodeChar(c);
                if (val < 0) {
                    return false;
                }
            }

            i = i + 1;
        }

        return true;
    }
}
