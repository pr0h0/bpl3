# Stable non-cryptographic hashing utilities and checksums

export [Hash];

extern strlen(str: string) ret long;

global HASH_CRC32_TABLE: uint[256];
global HASH_CRC32_READY: bool = false;

# Fills the table for the reflected IEEE 802.3 polynomial 0xEDB88320.
frame hashCrc32Table() {
    local n: int = 0;
    loop (n < 256) {
        local value: uint = cast<uint>(n);
        local bit: int = 0;
        loop (bit < 8) {
            if ((value & cast<uint>(1)) != cast<uint>(0)) {
                value = (value >> cast<uint>(1)) ^ cast<uint>(0xEDB88320);
            } else {
                value = value >> cast<uint>(1);
            }
            bit = bit + 1;
        }
        HASH_CRC32_TABLE[n] = value;
        n = n + 1;
    }
    HASH_CRC32_READY = true;
}

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

    # FNV-1a 64-bit hash for null-terminated strings.
    frame fnv1a64(input: string) ret ulong {
        if (input == nullptr) {
            return 0;
        }
        local hash: ulong = 14695981039346656037;
        local ptr: *u8 = cast<*u8>(input);

        loop (*ptr != cast<u8>(0)) {
            hash = hash ^ cast<ulong>(*ptr);
            hash = hash * cast<ulong>(1099511628211);
            ptr = ptr + 1;
        }

        return hash;
    }

    # CRC-32 (IEEE 802.3, as used by zlib, gzip, ZIP and PNG) of `length`
    # bytes at `data`.
    frame crc32(data: *u8, length: long) ret uint {
        return Hash.crc32Update(0, data, length);
    }

    # Continues a CRC-32: `crc32Update(crc32(a), b)` equals the CRC-32 of `a`
    # followed by `b`. Start from 0.
    frame crc32Update(crc: uint, data: *u8, length: long) ret uint {
        if (!HASH_CRC32_READY) {
            hashCrc32Table();
        }
        local value: uint = ~crc;
        if (data != nullptr) {
            local i: long = 0;
            loop (i < length) {
                local index: uint = (value ^ cast<uint>(*(data + i))) & cast<uint>(0xff);
                value = HASH_CRC32_TABLE[index] ^ (value >> cast<uint>(8));
                i = i + 1;
            }
        }
        return ~value;
    }

    # CRC-32 of a null-terminated string.
    frame crc32String(input: string) ret uint {
        if (input == nullptr) {
            return 0;
        }
        return Hash.crc32(cast<*u8>(input), strlen(input));
    }

    # Adler-32 (RFC 1950, the zlib stream checksum) of `length` bytes at
    # `data`.
    frame adler32(data: *u8, length: long) ret uint {
        local a: uint = 1;
        local b: uint = 0;
        if (data != nullptr) {
            local i: long = 0;
            loop (i < length) {
                a = (a + cast<uint>(*(data + i))) % cast<uint>(65521);
                b = (b + a) % cast<uint>(65521);
                i = i + 1;
            }
        }
        return (b << cast<uint>(16)) | a;
    }
}
