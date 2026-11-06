# HMAC-SHA256, HMAC-SHA512 and HMAC-SHA1 message authentication codes
# (RFC 2104, FIPS 198-1)

import [Sha256] from "std/sha256.bpl";
import [Sha512] from "std/sha512.bpl";
import [Sha1] from "std/sha1.bpl";

export [Hmac];
export [HmacSha512];
export [HmacSha1];

extern malloc(size: long) ret *void;
extern strlen(str: string) ret long;

# Streaming HMAC-SHA256: create a keyed context with `Hmac.sha256(key, n)`,
# call `update` any number of times, then `finish` to write the 32-byte MAC.
# The static helpers `digest` and `hex` authenticate in one call, and `equal`
# compares MACs in constant time.
struct Hmac {
    inner: Sha256,
    outerKey: u8[64],

    # A context keyed with `keyLength` bytes at `key`. Keys longer than the
    # 64-byte SHA-256 block are hashed first, as RFC 2104 requires.
    frame sha256(key: *u8, keyLength: long) ret Hmac {
        local block: u8[64];
        local i: int = 0;
        loop (i < 64) {
            block[i] = cast<u8>(0);
            i = i + 1;
        }
        if (keyLength > 64) {
            Sha256.digest(key, keyLength, &block[0]);
        } else if ((key != nullptr) && (keyLength > 0)) {
            local k: long = 0;
            loop (k < keyLength) {
                block[k] = *(key + k);
                k = k + 1;
            }
        }
        local mac: Hmac;
        mac.inner = Sha256.new();
        local innerKey: u8[64];
        i = 0;
        loop (i < 64) {
            innerKey[i] = block[i] ^ cast<u8>(0x36);
            mac.outerKey[i] = block[i] ^ cast<u8>(0x5c);
            i = i + 1;
        }
        mac.inner.update(&innerKey[0], 64);
        return mac;
    }

    # Add `length` bytes from `data` to the message.
    frame update(this: *Hmac, data: *u8, length: long) {
        this.inner.update(data, length);
    }

    # Write the 32-byte MAC to `mac`. The context cannot be reused afterwards.
    frame finish(this: *Hmac, mac: *u8) {
        local innerDigest: u8[32];
        this.inner.finish(&innerDigest[0]);
        local outer: Sha256 = Sha256.new();
        outer.update(&this.outerKey[0], 64);
        outer.update(&innerDigest[0], 32);
        outer.finish(mac);
    }

    # Write the 32-byte HMAC-SHA256 of `length` bytes at `data` to `mac`.
    frame digest(key: *u8, keyLength: long, data: *u8, length: long, mac: *u8) {
        local context: Hmac = Hmac.sha256(key, keyLength);
        context.update(data, length);
        context.finish(mac);
    }

    # Lowercase hex HMAC-SHA256 of the null-terminated `message` under the
    # null-terminated `key`. Returns a newly allocated 64-character string
    # (caller must free), or nullptr if allocation fails.
    frame hex(key: string, message: string) ret string {
        local raw: u8[32];
        local keyLength: long = 0;
        if (key != nullptr) {
            keyLength = strlen(key);
        }
        local messageLength: long = 0;
        if (message != nullptr) {
            messageLength = strlen(message);
        }
        Hmac.digest(cast<*u8>(key), keyLength, cast<*u8>(message), messageLength, &raw[0]);
        local output: *u8 = cast<*u8>(malloc(65));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        local hexChars: *u8 = cast<*u8>("0123456789abcdef");
        local i: int = 0;
        loop (i < 32) {
            *(output + (i * 2)) = *(hexChars + cast<int>(raw[i] >> cast<u8>(4)));
            *(output + (i * 2) + 1) = *(hexChars + cast<int>(raw[i] & cast<u8>(0x0f)));
            i = i + 1;
        }
        *(output + 64) = cast<u8>(0);
        return cast<string>(output);
    }

    # Whether `length` bytes at `a` and `b` are equal. Every byte is compared,
    # so the time taken does not reveal where two MACs first differ.
    frame equal(a: *u8, b: *u8, length: long) ret bool {
        local difference: u8 = cast<u8>(0);
        local i: long = 0;
        loop (i < length) {
            difference = difference | (*(a + i) ^ *(b + i));
            i = i + 1;
        }
        return difference == cast<u8>(0);
    }
}

# Streaming HMAC-SHA512, like `Hmac` but over SHA-512: create a keyed context
# with `HmacSha512.new(key, n)`, call `update`, then `finish` to write the
# 64-byte MAC. Compare MACs with `Hmac.equal`.
struct HmacSha512 {
    inner: Sha512,
    outerKey: u8[128],

    # A context keyed with `keyLength` bytes at `key`. Keys longer than the
    # 128-byte SHA-512 block are hashed first, as RFC 2104 requires.
    frame new(key: *u8, keyLength: long) ret HmacSha512 {
        local block: u8[128];
        local i: int = 0;
        loop (i < 128) {
            block[i] = cast<u8>(0);
            i = i + 1;
        }
        if (keyLength > 128) {
            Sha512.digest(key, keyLength, &block[0]);
        } else if ((key != nullptr) && (keyLength > 0)) {
            local k: long = 0;
            loop (k < keyLength) {
                block[k] = *(key + k);
                k = k + 1;
            }
        }
        local mac: HmacSha512;
        mac.inner = Sha512.new();
        local innerKey: u8[128];
        i = 0;
        loop (i < 128) {
            innerKey[i] = block[i] ^ cast<u8>(0x36);
            mac.outerKey[i] = block[i] ^ cast<u8>(0x5c);
            i = i + 1;
        }
        mac.inner.update(&innerKey[0], 128);
        return mac;
    }

    # Add `length` bytes from `data` to the message.
    frame update(this: *HmacSha512, data: *u8, length: long) {
        this.inner.update(data, length);
    }

    # Write the 64-byte MAC to `mac`. The context cannot be reused afterwards.
    frame finish(this: *HmacSha512, mac: *u8) {
        local innerDigest: u8[64];
        this.inner.finish(&innerDigest[0]);
        local outer: Sha512 = Sha512.new();
        outer.update(&this.outerKey[0], 128);
        outer.update(&innerDigest[0], 64);
        outer.finish(mac);
    }

    # Write the 64-byte HMAC-SHA512 of `length` bytes at `data` to `mac`.
    frame digest(key: *u8, keyLength: long, data: *u8, length: long, mac: *u8) {
        local context: HmacSha512 = HmacSha512.new(key, keyLength);
        context.update(data, length);
        context.finish(mac);
    }

    # Lowercase hex HMAC-SHA512 of the null-terminated `message` under the
    # null-terminated `key`. Returns a newly allocated 128-character string
    # (caller must free), or nullptr if allocation fails.
    frame hex(key: string, message: string) ret string {
        local raw: u8[64];
        local keyLength: long = 0;
        if (key != nullptr) {
            keyLength = strlen(key);
        }
        local messageLength: long = 0;
        if (message != nullptr) {
            messageLength = strlen(message);
        }
        HmacSha512.digest(cast<*u8>(key), keyLength, cast<*u8>(message), messageLength, &raw[0]);
        local output: *u8 = cast<*u8>(malloc(129));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        local hexChars: *u8 = cast<*u8>("0123456789abcdef");
        local i: int = 0;
        loop (i < 64) {
            *(output + (i * 2)) = *(hexChars + cast<int>(raw[i] >> cast<u8>(4)));
            *(output + (i * 2) + 1) = *(hexChars + cast<int>(raw[i] & cast<u8>(0x0f)));
            i = i + 1;
        }
        *(output + 128) = cast<u8>(0);
        return cast<string>(output);
    }
}

# Streaming HMAC-SHA1, like `Hmac` but over SHA-1, for protocols that require
# it such as HOTP and TOTP (std/otp.bpl): create a keyed context with
# `HmacSha1.new(key, n)`, call `update`, then `finish` to write the 20-byte
# MAC. Compare MACs with `Hmac.equal`.
struct HmacSha1 {
    inner: Sha1,
    outerKey: u8[64],

    # A context keyed with `keyLength` bytes at `key`. Keys longer than the
    # 64-byte SHA-1 block are hashed first, as RFC 2104 requires.
    frame new(key: *u8, keyLength: long) ret HmacSha1 {
        local block: u8[64];
        local i: int = 0;
        loop (i < 64) {
            block[i] = cast<u8>(0);
            i = i + 1;
        }
        if (keyLength > 64) {
            Sha1.digest(key, keyLength, &block[0]);
        } else if ((key != nullptr) && (keyLength > 0)) {
            local k: long = 0;
            loop (k < keyLength) {
                block[k] = *(key + k);
                k = k + 1;
            }
        }
        local mac: HmacSha1;
        mac.inner = Sha1.new();
        local innerKey: u8[64];
        i = 0;
        loop (i < 64) {
            innerKey[i] = block[i] ^ cast<u8>(0x36);
            mac.outerKey[i] = block[i] ^ cast<u8>(0x5c);
            i = i + 1;
        }
        mac.inner.update(&innerKey[0], 64);
        return mac;
    }

    # Add `length` bytes from `data` to the message.
    frame update(this: *HmacSha1, data: *u8, length: long) {
        this.inner.update(data, length);
    }

    # Write the 20-byte MAC to `mac`. The context cannot be reused afterwards.
    frame finish(this: *HmacSha1, mac: *u8) {
        local innerDigest: u8[20];
        this.inner.finish(&innerDigest[0]);
        local outer: Sha1 = Sha1.new();
        outer.update(&this.outerKey[0], 64);
        outer.update(&innerDigest[0], 20);
        outer.finish(mac);
    }

    # Write the 20-byte HMAC-SHA1 of `length` bytes at `data` to `mac`.
    frame digest(key: *u8, keyLength: long, data: *u8, length: long, mac: *u8) {
        local context: HmacSha1 = HmacSha1.new(key, keyLength);
        context.update(data, length);
        context.finish(mac);
    }
}
