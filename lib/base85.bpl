# Base85 encodings: Ascii85 (Adobe/btoa) and Z85 (ZeroMQ RFC 32).
#
# Encoders return a newly allocated null-terminated string the caller
# frees, or nullptr when allocation fails (or, for Z85, when the length is
# not a multiple of 4). Decoders write into a caller buffer of at least
# `decodedLength` bytes and return the byte count, or -1 for invalid input.
#
# Ascii85 encodes an all-zero group as 'z' and a final group of k bytes as
# k + 1 characters. Its decoder accepts optional "<~" and "~>" delimiters
# and ignores whitespace.

export [Base85];

extern malloc(size: long) ret *void;
extern strlen(text: string) ret long;

global BASE85_Z85_ALPHABET: string = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#";

frame _base85Space(c: u8) ret bool {
    return (c == cast<u8>(32)) || (c == cast<u8>(9)) || (c == cast<u8>(10)) || (c == cast<u8>(13)) || (c == cast<u8>(12));
}

frame _base85Z85Value(c: u8) ret int {
    loop (local i: int = 0; i < 85; i = i + 1) {
        if (cast<u8>(BASE85_Z85_ALPHABET[i]) == c) {
            return i;
        }
    }
    return -1;
}

struct Base85 {
    # Ascii85 encoding of `length` bytes (no delimiters).
    frame encode(data: *u8, length: int) ret string {
        if ((length < 0) || ((data == nullptr) && (length > 0))) {
            return cast<string>(nullptr);
        }
        local capacity: long = ((cast<long>(length) / 4) * 5) + 6;
        local out: string = cast<string>(malloc(capacity));
        if (out == nullptr) {
            return out;
        }
        local w: long = 0;
        local i: int = 0;
        loop (i < length) {
            local count: int = length - i;
            if (count > 4) {
                count = 4;
            }
            local value: ulong = 0;
            loop (local k: int = 0; k < 4; k = k + 1) {
                value = value << cast<ulong>(8);
                if (k < count) {
                    value = value | cast<ulong>(data[i + k]);
                }
            }
            if ((count == 4) && (value == cast<ulong>(0))) {
                out[w] = 'z';
                w = w + 1;
            } else {
                local digits: char[5];
                loop (local k: int = 4; k >= 0; k = k - 1) {
                    digits[k] = cast<char>(cast<int>(value % cast<ulong>(85)) + 33);
                    value = value / cast<ulong>(85);
                }
                loop (local k: int = 0; k <= count; k = k + 1) {
                    out[w] = digits[k];
                    w = w + 1;
                }
            }
            i = i + count;
        }
        out[w] = cast<char>(0);
        return out;
    }

    frame encodeString(text: string) ret string {
        if (text == nullptr) {
            return Base85.encode(nullptr, 0);
        }
        return Base85.encode(cast<*u8>(text), cast<int>(strlen(text)));
    }

    # Decodes Ascii85 into `output` when `write`; returns the byte count or -1.
    frame scan(input: string, output: *u8, write: bool) ret int {
        if (input == nullptr) {
            return -1;
        }
        local bytes: *u8 = cast<*u8>(input);
        local n: long = strlen(input);
        local start: long = 0;
        loop ((start < n) && _base85Space(bytes[start])) {
            start = start + 1;
        }
        if (((start + 1) < n) && (bytes[start] == cast<u8>(60)) && (bytes[start + 1] == cast<u8>(126))) {
            start = start + 2;
        }
        local end: long = n;
        loop ((end > start) && _base85Space(bytes[end - 1])) {
            end = end - 1;
        }
        if (((end - start) >= cast<long>(2)) && (bytes[end - 2] == cast<u8>(126)) && (bytes[end - 1] == cast<u8>(62))) {
            end = end - 2;
        }
        local produced: int = 0;
        local group: ulong = 0;
        local filled: int = 0;
        loop (local i: long = start; i < end; i = i + 1) {
            local c: u8 = bytes[i];
            if (_base85Space(c)) {
                continue;
            }
            if (c == cast<u8>(122)) {
                if (filled != 0) {
                    return -1;
                }
                if (write) {
                    loop (local k: int = 0; k < 4; k = k + 1) {
                        output[produced + k] = cast<u8>(0);
                    }
                }
                produced = produced + 4;
                continue;
            }
            if ((c < cast<u8>(33)) || (c > cast<u8>(117))) {
                return -1;
            }
            group = (group * cast<ulong>(85)) + cast<ulong>(cast<int>(c) - 33);
            filled = filled + 1;
            if (filled == 5) {
                if (group > cast<ulong>(0xFFFFFFFF)) {
                    return -1;
                }
                if (write) {
                    output[produced] = cast<u8>((group >> cast<ulong>(24)) & cast<ulong>(255));
                    output[produced + 1] = cast<u8>((group >> cast<ulong>(16)) & cast<ulong>(255));
                    output[produced + 2] = cast<u8>((group >> cast<ulong>(8)) & cast<ulong>(255));
                    output[produced + 3] = cast<u8>(group & cast<ulong>(255));
                }
                produced = produced + 4;
                group = 0;
                filled = 0;
            }
        }
        if (filled == 1) {
            return -1;
        }
        if (filled > 1) {
            # Pad with 'u' (84) and keep filled - 1 bytes.
            loop (local k: int = filled; k < 5; k = k + 1) {
                group = (group * cast<ulong>(85)) + cast<ulong>(84);
            }
            if (group > cast<ulong>(0xFFFFFFFF)) {
                return -1;
            }
            loop (local k: int = 0; k < (filled - 1); k = k + 1) {
                if (write) {
                    output[produced] = cast<u8>((group >> cast<ulong>(24 - (8 * k))) & cast<ulong>(255));
                }
                produced = produced + 1;
            }
        }
        return produced;
    }

    frame decode(input: string, output: *u8) ret int {
        if (output == nullptr) {
            return -1;
        }
        if (Base85.scan(input, nullptr, false) < 0) {
            return -1;
        }
        return Base85.scan(input, output, true);
    }

    frame decodedLength(input: string) ret int {
        return Base85.scan(input, nullptr, false);
    }

    # Decodes Ascii85 into a new null-terminated string, or nullptr.
    frame decodeToString(input: string) ret string {
        local needed: int = Base85.scan(input, nullptr, false);
        if (needed < 0) {
            return cast<string>(nullptr);
        }
        local output: *u8 = cast<*u8>(malloc(cast<long>(needed + 1)));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        Base85.scan(input, output, true);
        output[needed] = cast<u8>(0);
        return cast<string>(output);
    }

    # Z85 encoding; `length` must be a multiple of 4.
    frame encodeZ85(data: *u8, length: int) ret string {
        if ((length < 0) || ((length % 4) != 0) || ((data == nullptr) && (length > 0))) {
            return cast<string>(nullptr);
        }
        local out: string = cast<string>(malloc(((cast<long>(length) / 4) * 5) + 1));
        if (out == nullptr) {
            return out;
        }
        local w: int = 0;
        loop (local i: int = 0; i < length; i = i + 4) {
            local value: ulong = (cast<ulong>(data[i]) << cast<ulong>(24)) | (cast<ulong>(data[i + 1]) << cast<ulong>(16)) | (cast<ulong>(data[i + 2]) << cast<ulong>(8)) | cast<ulong>(data[i + 3]);
            loop (local k: int = 4; k >= 0; k = k - 1) {
                out[w + k] = BASE85_Z85_ALPHABET[cast<int>(value % cast<ulong>(85))];
                value = value / cast<ulong>(85);
            }
            w = w + 5;
        }
        out[w] = cast<char>(0);
        return out;
    }

    # Decoded size of Z85 text (length / 5 * 4), or -1 when the length is
    # not a multiple of 5.
    frame decodedLengthZ85(input: string) ret int {
        if (input == nullptr) {
            return -1;
        }
        local n: long = strlen(input);
        if ((n % cast<long>(5)) != cast<long>(0)) {
            return -1;
        }
        return cast<int>((n / 5) * 4);
    }

    # Decodes Z85 into `output`; returns the byte count or -1.
    frame decodeZ85(input: string, output: *u8) ret int {
        local needed: int = Base85.decodedLengthZ85(input);
        if ((needed < 0) || (output == nullptr)) {
            return -1;
        }
        local bytes: *u8 = cast<*u8>(input);
        local n: int = (needed / 4) * 5;
        local produced: int = 0;
        loop (local i: int = 0; i < n; i = i + 5) {
            local value: ulong = 0;
            loop (local k: int = 0; k < 5; k = k + 1) {
                local digit: int = _base85Z85Value(bytes[i + k]);
                if (digit < 0) {
                    return -1;
                }
                value = (value * cast<ulong>(85)) + cast<ulong>(digit);
            }
            if (value > cast<ulong>(0xFFFFFFFF)) {
                return -1;
            }
            output[produced] = cast<u8>((value >> cast<ulong>(24)) & cast<ulong>(255));
            output[produced + 1] = cast<u8>((value >> cast<ulong>(16)) & cast<ulong>(255));
            output[produced + 2] = cast<u8>((value >> cast<ulong>(8)) & cast<ulong>(255));
            output[produced + 3] = cast<u8>(value & cast<ulong>(255));
            produced = produced + 4;
        }
        return produced;
    }
}
