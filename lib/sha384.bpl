# SHA-384 message digests (FIPS 180-4)
#
# SHA-384 is SHA-512 with a different initial state and the digest cut to 48
# bytes. It is the usual hash for Subresource Integrity and HS384/ES384
# tokens.

export [Sha384];

import [Sha512] from "std/sha512.bpl";

extern malloc(size: long) ret *void;
extern strlen(str: string) ret long;

# Streaming SHA-384: create a context with `Sha384.new()`, call `update` any
# number of times, then `finish` to write the 48-byte digest. The static
# helpers `digest`, `hexBytes` and `hex` hash in one call.
struct Sha384 {
    inner: Sha512,

    # A context ready for `update`.
    frame new() ret Sha384 {
        local context: Sha384;
        context.init();
        return context;
    }

    # Reset to the initial state, discarding any data added so far.
    frame init(this: *Sha384) {
        this.inner.init();
        this.inner.state[0] = 0xcbbb9d5dc1059ed8;
        this.inner.state[1] = 0x629a292a367cd507;
        this.inner.state[2] = 0x9159015a3070dd17;
        this.inner.state[3] = 0x152fecd8f70e5939;
        this.inner.state[4] = 0x67332667ffc00b31;
        this.inner.state[5] = 0x8eb44a8768581511;
        this.inner.state[6] = 0xdb0c2e0d64f98fa7;
        this.inner.state[7] = 0x47b5481dbefa4fa4;
    }

    # Add `length` bytes from `data` to the message.
    frame update(this: *Sha384, data: *u8, length: long) {
        this.inner.update(data, length);
    }

    # Pad the message and write the 48-byte digest to `digest`. Call `init`
    # before reusing the context.
    frame finish(this: *Sha384, digest: *u8) {
        local full: u8[64];
        this.inner.finish(&full[0]);
        local i: int = 0;
        loop (i < 48) {
            *(digest + i) = full[i];
            i = i + 1;
        }
    }

    # Write the 48-byte digest of `length` bytes at `data` to `digest`.
    frame digest(data: *u8, length: long, digest: *u8) {
        local context: Sha384 = Sha384.new();
        context.update(data, length);
        context.finish(digest);
    }

    # Lowercase hex digest of the bytes at `data`. Returns a newly allocated
    # 96-character string (caller must free), or nullptr if allocation fails.
    frame hexBytes(data: *u8, length: long) ret string {
        local raw: u8[48];
        Sha384.digest(data, length, &raw[0]);
        local output: *u8 = cast<*u8>(malloc(97));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        local hexChars: *u8 = cast<*u8>("0123456789abcdef");
        local i: int = 0;
        loop (i < 48) {
            *(output + (i * 2)) = *(hexChars + cast<int>(raw[i] >> cast<u8>(4)));
            *(output + (i * 2) + 1) = *(hexChars + cast<int>(raw[i] & cast<u8>(0x0f)));
            i = i + 1;
        }
        *(output + 96) = cast<u8>(0);
        return cast<string>(output);
    }

    # Lowercase hex digest of a null-terminated string (caller must free).
    frame hex(text: string) ret string {
        if (text == nullptr) {
            return Sha384.hexBytes(nullptr, 0);
        }
        return Sha384.hexBytes(cast<*u8>(text), strlen(text));
    }
}
