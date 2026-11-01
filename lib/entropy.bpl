# Cryptographically secure random bytes from the operating system
# (getentropy), for keys, tokens and nonces. For simulations and games use the
# faster, seedable generator in std/rand.bpl instead.

export [Entropy];

extern getentropy(buffer: *void, length: ulong) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

struct Entropy {
    # Fill `length` bytes at `buffer`. Returns false, leaving the contents
    # unspecified, if the operating system cannot supply them.
    frame fill(buffer: *u8, length: long) ret bool {
        local offset: long = 0;
        loop (offset < length) {
            # getentropy supplies at most 256 bytes per call.
            local chunk: long = length - offset;
            if (chunk > 256) {
                chunk = 256;
            }
            if (getentropy(cast<*void>(buffer + offset), cast<ulong>(chunk)) != 0) {
                return false;
            }
            offset = offset + chunk;
        }
        return true;
    }

    # Like `fill`, but throws when no entropy is available instead of
    # returning a weak fallback.
    frame bytes(buffer: *u8, length: long) {
        if (!Entropy.fill(buffer, length)) {
            throw "Secure entropy unavailable";
        }
    }

    # `byteCount` random bytes as lowercase hex (2 characters per byte), for
    # session ids, CSRF tokens and nonces; 16 bytes give 128 bits. Returns a
    # newly allocated string (caller must free). Throws when no entropy is
    # available or `byteCount` is not positive.
    frame hexToken(byteCount: int) ret string {
        if (byteCount <= 0) {
            throw "Entropy.hexToken needs a positive byte count";
        }
        local raw: *u8 = cast<*u8>(malloc(cast<long>(byteCount)));
        local text: *u8 = cast<*u8>(malloc((cast<long>(byteCount) * 2) + 1));
        if ((raw == nullptr) || (text == nullptr)) {
            free(cast<*void>(raw));
            free(cast<*void>(text));
            throw "Entropy.hexToken: out of memory";
        }
        if (!Entropy.fill(raw, cast<long>(byteCount))) {
            free(cast<*void>(raw));
            free(cast<*void>(text));
            throw "Secure entropy unavailable";
        }
        local digits: *u8 = cast<*u8>("0123456789abcdef");
        loop (local i: int = 0; i < byteCount; i = i + 1) {
            local b: u8 = *(raw + i);
            *(text + (i * 2)) = *(digits + cast<int>(b >> cast<u8>(4)));
            *(text + ((i * 2) + 1)) = *(digits + cast<int>(b & cast<u8>(0x0f)));
        }
        *(text + (byteCount * 2)) = cast<u8>(0);
        free(cast<*void>(raw));
        return cast<string>(text);
    }

    # A uniformly random 64-bit value.
    frame nextULong() ret ulong {
        local raw: u8[8];
        Entropy.bytes(&raw[0], 8);
        local value: ulong = 0;
        local i: int = 0;
        loop (i < 8) {
            value = (value << cast<ulong>(8)) | cast<ulong>(raw[i]);
            i = i + 1;
        }
        return value;
    }

    # A uniformly random value in [0, bound), without modulo bias. Throws if
    # `bound` is 0.
    frame below(bound: ulong) ret ulong {
        if (bound == cast<ulong>(0)) {
            throw "Entropy.below needs a positive bound";
        }
        # Reject the top partial range so every residue is equally likely.
        local limit: ulong = cast<ulong>(0) - ((cast<ulong>(0) - bound) % bound);
        loop {
            local value: ulong = Entropy.nextULong();
            if ((limit == cast<ulong>(0)) || (value < limit)) {
                return value % bound;
            }
        }
        return 0;
    }
}
