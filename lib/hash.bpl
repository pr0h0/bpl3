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

global HASH_CRC32C_TABLE: uint[256];
global HASH_CRC32C_READY: bool = false;

# Fills the table for the reflected Castagnoli polynomial 0x82F63B78.
frame hashCrc32cTable() {
    loop (local n: int = 0; n < 256; n = n + 1) {
        local value: uint = cast<uint>(n);
        loop (local bit: int = 0; bit < 8; bit = bit + 1) {
            if ((value & cast<uint>(1)) != cast<uint>(0)) {
                value = (value >> 1) ^ cast<uint>(0x82F63B78);
            } else {
                value = value >> 1;
            }
        }
        HASH_CRC32C_TABLE[n] = value;
    }
    HASH_CRC32C_READY = true;
}

frame _hashRotl32(value: uint, count: uint) ret uint {
    return (value << count) | (value >> (cast<uint>(32) - count));
}

frame _hashRotl64(value: ulong, count: ulong) ret ulong {
    return (value << count) | (value >> (cast<ulong>(64) - count));
}

# Little-endian loads from unaligned byte pointers.
frame _hashRead32(data: *u8) ret uint {
    return cast<uint>(data[0]) | (cast<uint>(data[1]) << 8) | (cast<uint>(data[2]) << 16) | (cast<uint>(data[3]) << 24);
}

frame _hashRead64(data: *u8) ret ulong {
    return cast<ulong>(_hashRead32(data)) | (cast<ulong>(_hashRead32(data + 4)) << 32);
}

frame _hashXxh64Round(accumulator: ulong, input: ulong) ret ulong {
    local value: ulong = accumulator + (input * cast<ulong>(14029467366897019727));
    value = _hashRotl64(value, 31);
    return value * cast<ulong>(11400714785074694791);
}

frame _hashXxh64Merge(accumulator: ulong, value: ulong) ret ulong {
    local merged: ulong = accumulator ^ _hashXxh64Round(0, value);
    return (merged * cast<ulong>(11400714785074694791)) + cast<ulong>(9650029242287828579);
}

frame _hashSipRound(v: *ulong) {
    v[0] = v[0] + v[1];
    v[1] = _hashRotl64(v[1], 13);
    v[1] = v[1] ^ v[0];
    v[0] = _hashRotl64(v[0], 32);
    v[2] = v[2] + v[3];
    v[3] = _hashRotl64(v[3], 16);
    v[3] = v[3] ^ v[2];
    v[0] = v[0] + v[3];
    v[3] = _hashRotl64(v[3], 21);
    v[3] = v[3] ^ v[0];
    v[2] = v[2] + v[1];
    v[1] = _hashRotl64(v[1], 17);
    v[1] = v[1] ^ v[2];
    v[2] = _hashRotl64(v[2], 32);
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
    # FNV-1a 32-bit hash of `length` bytes.
    frame fnv1a32Bytes(data: *u8, length: long) ret uint {
        local hash: uint = 2166136261;
        loop (local i: long = 0; i < length; i = i + 1) {
            hash = (hash ^ cast<uint>(data[i])) * cast<uint>(16777619);
        }
        return hash;
    }

    # FNV-1a 64-bit hash of `length` bytes.
    frame fnv1a64Bytes(data: *u8, length: long) ret ulong {
        local hash: ulong = 14695981039346656037;
        loop (local i: long = 0; i < length; i = i + 1) {
            hash = (hash ^ cast<ulong>(data[i])) * cast<ulong>(1099511628211);
        }
        return hash;
    }

    # Bernstein's djb2 (`hash * 33 + byte`) of a null-terminated string.
    frame djb2(input: string) ret uint {
        local hash: uint = 5381;
        if (input == nullptr) {
            return hash;
        }
        local ptr: *u8 = cast<*u8>(input);
        loop (*ptr != cast<u8>(0)) {
            hash = (hash * cast<uint>(33)) + cast<uint>(*ptr);
            ptr = ptr + 1;
        }
        return hash;
    }

    # CRC-32C (Castagnoli, as used by iSCSI, ext4 and SCTP) of `length` bytes.
    frame crc32c(data: *u8, length: long) ret uint {
        return Hash.crc32cUpdate(0, data, length);
    }

    # Continues a CRC-32C; start from 0.
    frame crc32cUpdate(crc: uint, data: *u8, length: long) ret uint {
        if (!HASH_CRC32C_READY) {
            hashCrc32cTable();
        }
        local value: uint = ~crc;
        if (data != nullptr) {
            loop (local i: long = 0; i < length; i = i + 1) {
                local index: uint = (value ^ cast<uint>(data[i])) & cast<uint>(0xff);
                value = HASH_CRC32C_TABLE[index] ^ (value >> 8);
            }
        }
        return ~value;
    }

    # MurmurHash3 x86 32-bit of `length` bytes with `seed`.
    frame murmur3_32(data: *u8, length: long, seed: uint) ret uint {
        local c1: uint = 0xcc9e2d51;
        local c2: uint = 0x1b873593;
        local hash: uint = seed;
        local blocks: long = length / 4;
        loop (local i: long = 0; i < blocks; i = i + 1) {
            local k: uint = _hashRead32(data + (i * 4));
            k = k * c1;
            k = _hashRotl32(k, 15);
            k = k * c2;
            hash = hash ^ k;
            hash = _hashRotl32(hash, 13);
            hash = (hash * cast<uint>(5)) + cast<uint>(0xe6546b64);
        }
        local tail: *u8 = data + (blocks * 4);
        local remaining: long = length & 3;
        local k1: uint = 0;
        if (remaining >= cast<long>(3)) {
            k1 = k1 ^ (cast<uint>(tail[2]) << 16);
        }
        if (remaining >= cast<long>(2)) {
            k1 = k1 ^ (cast<uint>(tail[1]) << 8);
        }
        if (remaining >= cast<long>(1)) {
            k1 = k1 ^ cast<uint>(tail[0]);
            k1 = k1 * c1;
            k1 = _hashRotl32(k1, 15);
            k1 = k1 * c2;
            hash = hash ^ k1;
        }
        hash = hash ^ cast<uint>(length);
        hash = hash ^ (hash >> 16);
        hash = hash * cast<uint>(0x85ebca6b);
        hash = hash ^ (hash >> 13);
        hash = hash * cast<uint>(0xc2b2ae35);
        hash = hash ^ (hash >> 16);
        return hash;
    }

    # xxHash32 of `length` bytes with `seed`.
    frame xxhash32(data: *u8, length: long, seed: uint) ret uint {
        local p1: uint = 2654435761;
        local p2: uint = 2246822519;
        local p3: uint = 3266489917;
        local p4: uint = 668265263;
        local p5: uint = 374761393;
        local offset: long = 0;
        local hash: uint = 0;
        if (length >= cast<long>(16)) {
            local v1: uint = seed + p1 + p2;
            local v2: uint = seed + p2;
            local v3: uint = seed;
            local v4: uint = seed - p1;
            loop ((offset + 16) <= length) {
                v1 = _hashRotl32(v1 + (_hashRead32(data + offset) * p2), 13) * p1;
                v2 = _hashRotl32(v2 + (_hashRead32(data + offset + 4) * p2), 13) * p1;
                v3 = _hashRotl32(v3 + (_hashRead32(data + offset + 8) * p2), 13) * p1;
                v4 = _hashRotl32(v4 + (_hashRead32(data + offset + 12) * p2), 13) * p1;
                offset = offset + 16;
            }
            hash = _hashRotl32(v1, 1) + _hashRotl32(v2, 7) + _hashRotl32(v3, 12) + _hashRotl32(v4, 18);
        } else {
            hash = seed + p5;
        }
        hash = hash + cast<uint>(length);
        loop ((offset + 4) <= length) {
            hash = hash + (_hashRead32(data + offset) * p3);
            hash = _hashRotl32(hash, 17) * p4;
            offset = offset + 4;
        }
        loop (offset < length) {
            hash = hash + (cast<uint>(data[offset]) * p5);
            hash = _hashRotl32(hash, 11) * p1;
            offset = offset + 1;
        }
        hash = hash ^ (hash >> 15);
        hash = hash * p2;
        hash = hash ^ (hash >> 13);
        hash = hash * p3;
        hash = hash ^ (hash >> 16);
        return hash;
    }

    # xxHash64 of `length` bytes with `seed`.
    frame xxhash64(data: *u8, length: long, seed: ulong) ret ulong {
        local p1: ulong = 11400714785074694791;
        local p2: ulong = 14029467366897019727;
        local p3: ulong = 1609587929392839161;
        local p4: ulong = 9650029242287828579;
        local p5: ulong = 2870177450012600261;
        local offset: long = 0;
        local hash: ulong = 0;
        if (length >= cast<long>(32)) {
            local v1: ulong = seed + p1 + p2;
            local v2: ulong = seed + p2;
            local v3: ulong = seed;
            local v4: ulong = seed - p1;
            loop ((offset + 32) <= length) {
                v1 = _hashXxh64Round(v1, _hashRead64(data + offset));
                v2 = _hashXxh64Round(v2, _hashRead64(data + offset + 8));
                v3 = _hashXxh64Round(v3, _hashRead64(data + offset + 16));
                v4 = _hashXxh64Round(v4, _hashRead64(data + offset + 24));
                offset = offset + 32;
            }
            hash = _hashRotl64(v1, 1) + _hashRotl64(v2, 7) + _hashRotl64(v3, 12) + _hashRotl64(v4, 18);
            hash = _hashXxh64Merge(hash, v1);
            hash = _hashXxh64Merge(hash, v2);
            hash = _hashXxh64Merge(hash, v3);
            hash = _hashXxh64Merge(hash, v4);
        } else {
            hash = seed + p5;
        }
        hash = hash + cast<ulong>(length);
        loop ((offset + 8) <= length) {
            hash = hash ^ _hashXxh64Round(0, _hashRead64(data + offset));
            hash = (_hashRotl64(hash, 27) * p1) + p4;
            offset = offset + 8;
        }
        if ((offset + 4) <= length) {
            hash = hash ^ (cast<ulong>(_hashRead32(data + offset)) * p1);
            hash = (_hashRotl64(hash, 23) * p2) + p3;
            offset = offset + 4;
        }
        loop (offset < length) {
            hash = hash ^ (cast<ulong>(data[offset]) * p5);
            hash = _hashRotl64(hash, 11) * p1;
            offset = offset + 1;
        }
        hash = hash ^ (hash >> 33);
        hash = hash * p2;
        hash = hash ^ (hash >> 29);
        hash = hash * p3;
        hash = hash ^ (hash >> 32);
        return hash;
    }

    # xxHash32/xxHash64 of a null-terminated string with seed 0.
    frame xxhash32String(input: string) ret uint {
        if (input == nullptr) {
            return Hash.xxhash32(cast<*u8>(""), 0, 0);
        }
        return Hash.xxhash32(cast<*u8>(input), strlen(input), 0);
    }

    frame xxhash64String(input: string) ret ulong {
        if (input == nullptr) {
            return Hash.xxhash64(cast<*u8>(""), 0, 0);
        }
        return Hash.xxhash64(cast<*u8>(input), strlen(input), 0);
    }

    /#
        SipHash-2-4 of `length` bytes keyed by the 128-bit key (`key0` holds
        key bytes 0-7 little-endian, `key1` bytes 8-15). A keyed hash suitable
        for hash tables exposed to untrusted input; it is not a MAC for
        long-term secrets.
    #/
    frame siphash24(key0: ulong, key1: ulong, data: *u8, length: long) ret ulong {
        local v: ulong[4];
        v[0] = key0 ^ cast<ulong>(0x736f6d6570736575);
        v[1] = key1 ^ cast<ulong>(0x646f72616e646f6d);
        v[2] = key0 ^ cast<ulong>(0x6c7967656e657261);
        v[3] = key1 ^ cast<ulong>(0x7465646279746573);
        local state: *ulong = &v[0];
        local blocks: long = length / 8;
        loop (local i: long = 0; i < blocks; i = i + 1) {
            local m: ulong = _hashRead64(data + (i * 8));
            v[3] = v[3] ^ m;
            _hashSipRound(state);
            _hashSipRound(state);
            v[0] = v[0] ^ m;
        }
        local last: ulong = cast<ulong>(length & 255) << 56;
        local tail: *u8 = data + (blocks * 8);
        local remaining: long = length & 7;
        loop (local j: long = 0; j < remaining; j = j + 1) {
            last = last | (cast<ulong>(tail[j]) << cast<ulong>(j * 8));
        }
        v[3] = v[3] ^ last;
        _hashSipRound(state);
        _hashSipRound(state);
        v[0] = v[0] ^ last;
        v[2] = v[2] ^ cast<ulong>(0xff);
        _hashSipRound(state);
        _hashSipRound(state);
        _hashSipRound(state);
        _hashSipRound(state);
        return v[0] ^ v[1] ^ v[2] ^ v[3];
    }
}
