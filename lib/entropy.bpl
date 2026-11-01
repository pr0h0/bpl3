# Cryptographically secure random bytes from the operating system
# (getentropy), for keys, tokens and nonces. For simulations and games use the
# faster, seedable generator in std/rand.bpl instead.

export [Entropy];

extern getentropy(buffer: *void, length: ulong) ret int;

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
