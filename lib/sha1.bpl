# SHA-1 message digests (FIPS 180-4)
#
# SHA-1 is broken for collision resistance; do not use it for signatures or
# new security designs. It remains required by existing protocols such as the
# WebSocket handshake, TOTP's default HMAC and git object ids.

export [Sha1];

extern malloc(size: long) ret *void;
extern strlen(str: string) ret long;

# Streaming SHA-1: create a context with `Sha1.new()`, call `update` any number
# of times, then `finish` to write the 20-byte digest. The static helpers
# `digest`, `hexBytes` and `hex` hash in one call.
struct Sha1 {
    state: u32[5],
    block: u8[64],
    blockLength: int,
    totalLength: ulong,

    # A context ready for `update`.
    frame new() ret Sha1 {
        local context: Sha1;
        context.init();
        return context;
    }

    # Reset to the initial state, discarding any data added so far.
    frame init(this: *Sha1) {
        this.state[0] = 0x67452301;
        this.state[1] = 0xefcdab89;
        this.state[2] = 0x98badcfe;
        this.state[3] = 0x10325476;
        this.state[4] = 0xc3d2e1f0;
        this.blockLength = 0;
        this.totalLength = 0;
    }

    # Add `length` bytes from `data` to the message.
    frame update(this: *Sha1, data: *u8, length: long) {
        if ((data == nullptr) || (length <= 0)) {
            return;
        }
        local i: long = 0;
        loop (i < length) {
            this.block[this.blockLength] = *(data + i);
            this.blockLength = this.blockLength + 1;
            if (this.blockLength == 64) {
                this.compress();
                this.blockLength = 0;
            }
            i = i + 1;
        }
        this.totalLength = this.totalLength + cast<ulong>(length);
    }

    # Pad the message and write the 20-byte digest to `digest`. Call `init`
    # before reusing the context.
    frame finish(this: *Sha1, digest: *u8) {
        local bitLength: ulong = this.totalLength * cast<ulong>(8);
        this.block[this.blockLength] = cast<u8>(0x80);
        this.blockLength = this.blockLength + 1;
        if (this.blockLength > 56) {
            loop (this.blockLength < 64) {
                this.block[this.blockLength] = cast<u8>(0);
                this.blockLength = this.blockLength + 1;
            }
            this.compress();
            this.blockLength = 0;
        }
        loop (this.blockLength < 56) {
            this.block[this.blockLength] = cast<u8>(0);
            this.blockLength = this.blockLength + 1;
        }
        local index: int = 56;
        loop (index < 64) {
            this.block[index] = cast<u8>((bitLength >> cast<ulong>(8 * (63 - index))) & cast<ulong>(0xff));
            index = index + 1;
        }
        this.compress();

        local word: int = 0;
        loop (word < 5) {
            local value: u32 = this.state[word];
            *(digest + (word * 4)) = cast<u8>(value >> cast<u32>(24));
            *(digest + (word * 4) + 1) = cast<u8>((value >> cast<u32>(16)) & cast<u32>(0xff));
            *(digest + (word * 4) + 2) = cast<u8>((value >> cast<u32>(8)) & cast<u32>(0xff));
            *(digest + (word * 4) + 3) = cast<u8>(value & cast<u32>(0xff));
            word = word + 1;
        }
    }

    frame compress(this: *Sha1) {
        local w: u32[80];
        local t: int = 0;
        loop (t < 16) {
            w[t] = (cast<u32>(this.block[t * 4]) << cast<u32>(24)) | (cast<u32>(this.block[(t * 4) + 1]) << cast<u32>(16)) | (cast<u32>(this.block[(t * 4) + 2]) << cast<u32>(8)) | cast<u32>(this.block[(t * 4) + 3]);
            t = t + 1;
        }
        loop (t < 80) {
            w[t] = Sha1.rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
            t = t + 1;
        }

        local a: u32 = this.state[0];
        local b: u32 = this.state[1];
        local c: u32 = this.state[2];
        local d: u32 = this.state[3];
        local e: u32 = this.state[4];

        t = 0;
        loop (t < 80) {
            local f: u32 = 0;
            local k: u32 = 0;
            if (t < 20) {
                f = (b & c) | ((~b) & d);
                k = 0x5a827999;
            } else if (t < 40) {
                f = b ^ c ^ d;
                k = 0x6ed9eba1;
            } else if (t < 60) {
                f = (b & c) | (b & d) | (c & d);
                k = 0x8f1bbcdc;
            } else {
                f = b ^ c ^ d;
                k = 0xca62c1d6;
            }
            local temp: u32 = Sha1.rotl(a, 5) + f + e + k + w[t];
            e = d;
            d = c;
            c = Sha1.rotl(b, 30);
            b = a;
            a = temp;
            t = t + 1;
        }

        this.state[0] = this.state[0] + a;
        this.state[1] = this.state[1] + b;
        this.state[2] = this.state[2] + c;
        this.state[3] = this.state[3] + d;
        this.state[4] = this.state[4] + e;
    }

    frame rotl(value: u32, bits: int) ret u32 {
        return (value << cast<u32>(bits)) | (value >> cast<u32>(32 - bits));
    }

    # Write the 20-byte digest of `length` bytes at `data` to `digest`.
    frame digest(data: *u8, length: long, digest: *u8) {
        local context: Sha1 = Sha1.new();
        context.update(data, length);
        context.finish(digest);
    }

    # Lowercase hex digest of the bytes at `data`. Returns a newly allocated
    # 40-character string (caller must free), or nullptr if allocation fails.
    frame hexBytes(data: *u8, length: long) ret string {
        local raw: u8[20];
        Sha1.digest(data, length, &raw[0]);
        local output: *u8 = cast<*u8>(malloc(41));
        if (output == nullptr) {
            return cast<string>(nullptr);
        }
        local hexChars: *u8 = cast<*u8>("0123456789abcdef");
        local i: int = 0;
        loop (i < 20) {
            *(output + (i * 2)) = *(hexChars + cast<int>(raw[i] >> cast<u8>(4)));
            *(output + (i * 2) + 1) = *(hexChars + cast<int>(raw[i] & cast<u8>(0x0f)));
            i = i + 1;
        }
        *(output + 40) = cast<u8>(0);
        return cast<string>(output);
    }

    # Lowercase hex digest of a null-terminated string (caller must free).
    frame hex(text: string) ret string {
        if (text == nullptr) {
            return Sha1.hexBytes(nullptr, 0);
        }
        return Sha1.hexBytes(cast<*u8>(text), strlen(text));
    }
}
