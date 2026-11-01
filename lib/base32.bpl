# Base32 encoding and decoding (RFC 4648 section 6)

export [Base32];

extern malloc(size: long) ret *void;
extern strlen(str: string) ret long;

# Encodes with the alphabet `A`-`Z`, `2`-`7` and `=` padding to a multiple of
# eight characters. Decoding accepts upper or lower case letters, with or
# without the padding; any other character, padding before the end, or a
# length that cannot come from whole bytes is refused.
struct Base32 {
    # Base32 text for `length` bytes at `data`. Returns a newly allocated
    # string (caller must free), or nullptr if allocation fails.
    frame encode(data: *u8, length: long) ret string {
        if ((data == nullptr) || (length < 0)) {
            length = 0;
        }
        local outputLength: long = ((length + 4) / 5) * 8;
        local output: *u8 = cast<*u8>(malloc(outputLength + 1));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        local alphabet: *u8 = cast<*u8>("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567");
        local buffer: ulong = 0;
        local bits: int = 0;
        local written: long = 0;
        local i: long = 0;
        loop (i < length) {
            buffer = (buffer << cast<ulong>(8)) | cast<ulong>(*(data + i));
            bits = bits + 8;
            loop (bits >= 5) {
                bits = bits - 5;
                *(output + written) = *(alphabet + cast<int>((buffer >> cast<ulong>(bits)) & cast<ulong>(31)));
                written = written + 1;
            }
            i = i + 1;
        }
        if (bits > 0) {
            *(output + written) = *(alphabet + cast<int>((buffer << cast<ulong>(5 - bits)) & cast<ulong>(31)));
            written = written + 1;
        }
        loop (written < outputLength) {
            *(output + written) = cast<u8>(61);
            written = written + 1;
        }
        *(output + outputLength) = cast<u8>(0);
        return cast<string>(output);
    }

    # Base32 text for a null-terminated string (caller must free).
    frame encodeString(text: string) ret string {
        if (text == nullptr) {
            return Base32.encode(nullptr, 0);
        }
        return Base32.encode(cast<*u8>(text), strlen(text));
    }

    # The 5-bit value of an alphabet character in either case, or -1.
    frame value(c: u8) ret int {
        local code: int = cast<int>(c);
        if ((code >= 65) && (code <= 90)) {
            return code - 65;
        }
        if ((code >= 97) && (code <= 122)) {
            return code - 97;
        }
        if ((code >= 50) && (code <= 55)) {
            return code - 24;
        }
        return -1;
    }

    # Validates `input` and returns the number of bytes it decodes to, or -1;
    # with `write`, also stores them at `output`.
    frame scan(input: string, output: *u8, write: bool) ret long {
        if (input == nullptr) {
            return -1;
        }
        local text: *u8 = cast<*u8>(input);
        local length: long = strlen(input);
        local dataLength: long = 0;
        loop ((dataLength < length) && (*(text + dataLength) != cast<u8>(61))) {
            if (Base32.value(*(text + dataLength)) < 0) {
                return -1;
            }
            dataLength = dataLength + 1;
        }
        local padding: long = length - dataLength;
        local i: long = dataLength;
        loop (i < length) {
            if (*(text + i) != cast<u8>(61)) {
                return -1;
            }
            i = i + 1;
        }
        # A final group holds 2, 4, 5 or 7 characters before its padding.
        local tail: long = dataLength % 8;
        if ((tail == 1) || (tail == 3) || (tail == 6)) {
            return -1;
        }
        if ((padding > 0) && ((tail == 0) || ((dataLength + padding) != (((dataLength + 7) / 8) * 8)))) {
            return -1;
        }
        local decoded: long = (dataLength * 5) / 8;
        if (!write) {
            return decoded;
        }
        local buffer: ulong = 0;
        local bits: int = 0;
        local stored: long = 0;
        i = 0;
        loop (i < dataLength) {
            buffer = (buffer << cast<ulong>(5)) | cast<ulong>(Base32.value(*(text + i)));
            bits = bits + 5;
            if (bits >= 8) {
                bits = bits - 8;
                *(output + stored) = cast<u8>((buffer >> cast<ulong>(bits)) & cast<ulong>(0xff));
                stored = stored + 1;
            }
            i = i + 1;
        }
        return stored;
    }

    # Decodes `input` into `output`, which must hold decodedLength(input)
    # bytes. Returns the number of bytes written, or -1 if the input is not
    # valid Base32 or the output pointer is null.
    frame decode(input: string, output: *u8) ret long {
        if (output == nullptr) {
            return -1;
        }
        return Base32.scan(input, output, true);
    }

    # Decodes to a new null-terminated string (caller must free), or nullptr
    # if the input is not valid Base32.
    frame decodeToString(input: string) ret string {
        local needed: long = Base32.scan(input, nullptr, false);
        if (needed < 0) {
            return cast<string>(nullptr);
        }
        local output: *u8 = cast<*u8>(malloc(needed + 1));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        Base32.scan(input, output, true);
        *(output + needed) = cast<u8>(0);
        return cast<string>(output);
    }

    # Exact number of bytes the input decodes to, or -1 if it is not valid.
    frame decodedLength(input: string) ret long {
        return Base32.scan(input, nullptr, false);
    }

    frame isValid(input: string) ret bool {
        return Base32.scan(input, nullptr, false) >= 0;
    }
}
