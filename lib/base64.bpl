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
            local empty: *u8 = cast<*u8>(malloc(1));
            if (empty != nullptr) {
                *empty = cast<u8>(0);
            }
            return cast<string>(empty);
        }
        # Calculate output length: 4 chars for every 3 bytes, rounded up
        local outLen: int = Base64.encodedLength(length);
        local output: *u8 = cast<*u8>(malloc(cast<long>(outLen) + cast<long>(1)));
        if (output == nullptr) { return cast<string>(nullptr); }

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
            return Base64.encode(nullptr, 0);
        }
        local len: long = strlen(str);
        # Check before narrowing a C size_t into the public int length.
        if (len > cast<long>(1610612733)) {
            throw "Base64 encoded length exceeds int";
        }
        return Base64.encode(cast<*u8>(str), cast<int>(len));
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

    # Whitespace is ignored everywhere in an encoded string, so that text
    # wrapped across lines decodes as written.
    frame isWhitespace(c: u8) ret bool {
        return (c == cast<u8>(32)) || (c == cast<u8>(10)) || (c == cast<u8>(13)) || (c == cast<u8>(9));
    }

    # The one place that knows what a valid encoding looks like. decode,
    # decodedLength and isValid all run this, so a string can never be
    # accepted by one and refused by another.
    #
    # The grammar: whitespace anywhere; the remaining characters in groups of
    # four drawn from the alphabet; '=' only in the last one or two places of
    # the final group, and nothing but whitespace after that group. A partial
    # group at the end is refused rather than silently dropped, which is what
    # made `isValid` disagree with the decoder before.
    #
    # Returns the number of bytes the input decodes to, or -1 if it is not a
    # valid encoding. Bytes are written to `output` only when `write` is set,
    # so the length can be measured without a buffer.
    frame scan(input: string, output: *u8, write: bool) ret int {
        if (input == nullptr) {
            return -1;
        }
        local ptr: *u8 = cast<*u8>(input);
        local len: int = cast<int>(strlen(input));

        local vals: int[4];
        local held: int = 0;      # characters gathered for the current group
        local padding: int = 0;   # '=' seen in the current group
        local closed: bool = false;  # a padded group has ended the input
        local produced: int = 0;

        local i: int = 0;
        loop (i < len) {
            local c: u8 = *(ptr + i);
            i = i + 1;

            if (Base64.isWhitespace(c)) {
                continue;
            }
            if (closed) {
                # Data after the padded final group.
                return -1;
            }
            if (c == cast<u8>(61)) {
                # Padding cannot stand where a data character is required.
                if (held < 2) {
                    return -1;
                }
                vals[held] = 0;
                padding = padding + 1;
            } else {
                if (padding > 0) {
                    # Data after padding inside the same group.
                    return -1;
                }
                local val: int = Base64.decodeChar(c);
                if (val < 0) {
                    return -1;
                }
                vals[held] = val;
            }
            held = held + 1;

            if (held == 4) {
                # Four characters carry 24 bits; each '=' drops one byte.
                if (write) {
                    *(output + produced) = cast<u8>((vals[0] << 2) | (vals[1] >> 4));
                }
                produced = produced + 1;
                if (padding < 2) {
                    if (write) {
                        *(output + produced) = cast<u8>(((vals[1] & 15) << 4) | (vals[2] >> 2));
                    }
                    produced = produced + 1;
                }
                if (padding < 1) {
                    if (write) {
                        *(output + produced) = cast<u8>(((vals[2] & 3) << 6) | vals[3]);
                    }
                    produced = produced + 1;
                }
                if (padding > 0) {
                    closed = true;
                }
                held = 0;
                padding = 0;
            }
        }

        if (held != 0) {
            # A group left unfinished.
            return -1;
        }
        return produced;
    }

    # Decode a Base64 string to bytes
    # Returns the number of decoded bytes, or -1 if the input is not valid
    # Base64 or the output pointer is null. The output buffer must hold at
    # least decodedLength(input) bytes.
    frame decode(input: string, output: *u8) ret int {
        if (output == nullptr) {
            return -1;
        }
        return Base64.scan(input, output, true);
    }

    # Decode Base64 to a new string (caller must free)
    # Returns nullptr if the input is not valid Base64.
    frame decodeToString(input: string) ret string {
        local needed: int = Base64.scan(input, nullptr, false);
        if (needed < 0) {
            return cast<string>(nullptr);
        }
        local output: *u8 = cast<*u8>(malloc(cast<long>(needed + 1)));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }

        Base64.scan(input, output, true);
        *(output + needed) = cast<u8>(0);

        return cast<string>(output);
    }

    # Exact number of bytes the input decodes to, or -1 if it is not valid
    # Base64.
    frame decodedLength(input: string) ret int {
        return Base64.scan(input, nullptr, false);
    }

    # Calculate the encoded length for given input length
    frame encodedLength(inputLen: int) ret int {
        if (inputLen <= 0) { return 0; }
        local size: long = ((cast<long>(inputLen) + cast<long>(2)) / cast<long>(3)) * cast<long>(4);
        if (size > cast<long>(2147483647)) {
            throw "Base64 encoded length exceeds int";
        }
        return cast<int>(size);
    }

    # Check if a string is valid Base64
    # True exactly when decode would accept the string, empty input included.
    frame isValid(input: string) ret bool {
        return Base64.scan(input, nullptr, false) >= 0;
    }
}
