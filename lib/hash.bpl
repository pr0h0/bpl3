# Stable non-cryptographic hashing utilities

export [Hash];

struct Hash {
    # FNV-1a 32-bit hash for null-terminated strings.
    frame fnv1a32(input: string) ret uint {
        if (input == nullptr) {
            return 0;
        }

        local hash: uint = 2166136261;
        local ptr: *u8 = cast<*u8>(input);

        loop (*ptr != cast<u8>(0)) {
            hash = hash ^ cast<uint>(*ptr);
            hash = hash * 16777619;
            ptr = ptr + 1;
        }

        return hash;
    }

    # Simple additive checksum for fast smoke checks and small fixtures.
    frame checksum32(input: string) ret uint {
        if (input == nullptr) {
            return 0;
        }

        local sum: uint = 0;
        local ptr: *u8 = cast<*u8>(input);

        loop (*ptr != cast<u8>(0)) {
            sum = sum + cast<uint>(*ptr);
            ptr = ptr + 1;
        }

        return sum;
    }

    frame combine32(left: uint, right: uint) ret uint {
        return (left ^ (right + 2654435769 + (left << 6) + (left >> 2)));
    }
}
