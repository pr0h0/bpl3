# SHA-512 message digests (FIPS 180-4)

export [Sha512];

extern malloc(size: long) ret *void;
extern strlen(str: string) ret long;

global SHA512_K: u64[80] = [0x428a2f98d728ae22, 0x7137449123ef65cd, 0xb5c0fbcfec4d3b2f, 0xe9b5dba58189dbbc, 0x3956c25bf348b538, 0x59f111f1b605d019, 0x923f82a4af194f9b, 0xab1c5ed5da6d8118, 0xd807aa98a3030242, 0x12835b0145706fbe, 0x243185be4ee4b28c, 0x550c7dc3d5ffb4e2, 0x72be5d74f27b896f, 0x80deb1fe3b1696b1, 0x9bdc06a725c71235, 0xc19bf174cf692694, 0xe49b69c19ef14ad2, 0xefbe4786384f25e3, 0x0fc19dc68b8cd5b5, 0x240ca1cc77ac9c65, 0x2de92c6f592b0275, 0x4a7484aa6ea6e483, 0x5cb0a9dcbd41fbd4, 0x76f988da831153b5, 0x983e5152ee66dfab, 0xa831c66d2db43210, 0xb00327c898fb213f, 0xbf597fc7beef0ee4, 0xc6e00bf33da88fc2, 0xd5a79147930aa725, 0x06ca6351e003826f, 0x142929670a0e6e70, 0x27b70a8546d22ffc, 0x2e1b21385c26c926, 0x4d2c6dfc5ac42aed, 0x53380d139d95b3df, 0x650a73548baf63de, 0x766a0abb3c77b2a8, 0x81c2c92e47edaee6, 0x92722c851482353b, 0xa2bfe8a14cf10364, 0xa81a664bbc423001, 0xc24b8b70d0f89791, 0xc76c51a30654be30, 0xd192e819d6ef5218, 0xd69906245565a910, 0xf40e35855771202a, 0x106aa07032bbd1b8, 0x19a4c116b8d2d0c8, 0x1e376c085141ab53, 0x2748774cdf8eeb99, 0x34b0bcb5e19b48a8, 0x391c0cb3c5c95a63, 0x4ed8aa4ae3418acb, 0x5b9cca4f7763e373, 0x682e6ff3d6b2b8a3, 0x748f82ee5defb2fc, 0x78a5636f43172f60, 0x84c87814a1f0ab72, 0x8cc702081a6439ec, 0x90befffa23631e28, 0xa4506cebde82bde9, 0xbef9a3f7b2c67915, 0xc67178f2e372532b, 0xca273eceea26619c, 0xd186b8c721c0c207, 0xeada7dd6cde0eb1e, 0xf57d4f7fee6ed178, 0x06f067aa72176fba, 0x0a637dc5a2c898a6, 0x113f9804bef90dae, 0x1b710b35131c471b, 0x28db77f523047d84, 0x32caab7b40c72493, 0x3c9ebe0a15c9bebc, 0x431d67c49c100d4c, 0x4cc5d4becb3e42b6, 0x597f299cfc657e2a, 0x5fcb6fab3ad6faec, 0x6c44198c4a475817];

# Streaming SHA-512: create a context with `Sha512.new()`, call `update` any
# number of times, then `finish` to write the 64-byte digest. The static
# helpers `digest`, `hexBytes` and `hex` hash in one call.
struct Sha512 {
    state: u64[8],
    block: u8[128],
    blockLength: int,
    totalLength: ulong,

    # A context ready for `update`.
    frame new() ret Sha512 {
        local context: Sha512;
        context.init();
        return context;
    }

    # Reset to the initial state, discarding any data added so far.
    frame init(this: *Sha512) {
        this.state[0] = 0x6a09e667f3bcc908;
        this.state[1] = 0xbb67ae8584caa73b;
        this.state[2] = 0x3c6ef372fe94f82b;
        this.state[3] = 0xa54ff53a5f1d36f1;
        this.state[4] = 0x510e527fade682d1;
        this.state[5] = 0x9b05688c2b3e6c1f;
        this.state[6] = 0x1f83d9abfb41bd6b;
        this.state[7] = 0x5be0cd19137e2179;
        this.blockLength = 0;
        this.totalLength = 0;
    }

    # Add `length` bytes from `data` to the message.
    frame update(this: *Sha512, data: *u8, length: long) {
        if ((data == nullptr) || (length <= 0)) {
            return;
        }
        local i: long = 0;
        loop (i < length) {
            this.block[this.blockLength] = *(data + i);
            this.blockLength = this.blockLength + 1;
            if (this.blockLength == 128) {
                this.compress();
                this.blockLength = 0;
            }
            i = i + 1;
        }
        this.totalLength = this.totalLength + cast<ulong>(length);
    }

    # Pad the message and write the 64-byte digest to `digest`. Call `init`
    # before reusing the context.
    frame finish(this: *Sha512, digest: *u8) {
        # The message length in bits is a 128-bit big-endian number.
        local bitLengthHigh: ulong = this.totalLength >> cast<ulong>(61);
        local bitLengthLow: ulong = this.totalLength << cast<ulong>(3);
        this.block[this.blockLength] = cast<u8>(0x80);
        this.blockLength = this.blockLength + 1;
        if (this.blockLength > 112) {
            loop (this.blockLength < 128) {
                this.block[this.blockLength] = cast<u8>(0);
                this.blockLength = this.blockLength + 1;
            }
            this.compress();
            this.blockLength = 0;
        }
        loop (this.blockLength < 112) {
            this.block[this.blockLength] = cast<u8>(0);
            this.blockLength = this.blockLength + 1;
        }
        Sha512.storeWord(&this.block[112], bitLengthHigh);
        Sha512.storeWord(&this.block[120], bitLengthLow);
        this.compress();

        local word: int = 0;
        loop (word < 8) {
            Sha512.storeWord(digest + (word * 8), this.state[word]);
            word = word + 1;
        }
    }

    frame compress(this: *Sha512) {
        local w: u64[80];
        local t: int = 0;
        loop (t < 16) {
            local value: u64 = 0;
            local byteIndex: int = 0;
            loop (byteIndex < 8) {
                value = (value << cast<u64>(8)) | cast<u64>(this.block[(t * 8) + byteIndex]);
                byteIndex = byteIndex + 1;
            }
            w[t] = value;
            t = t + 1;
        }
        loop (t < 80) {
            local s0: u64 = Sha512.rotr(w[t - 15], 1) ^ Sha512.rotr(w[t - 15], 8) ^ (w[t - 15] >> cast<u64>(7));
            local s1: u64 = Sha512.rotr(w[t - 2], 19) ^ Sha512.rotr(w[t - 2], 61) ^ (w[t - 2] >> cast<u64>(6));
            w[t] = w[t - 16] + s0 + w[t - 7] + s1;
            t = t + 1;
        }

        local a: u64 = this.state[0];
        local b: u64 = this.state[1];
        local c: u64 = this.state[2];
        local d: u64 = this.state[3];
        local e: u64 = this.state[4];
        local f: u64 = this.state[5];
        local g: u64 = this.state[6];
        local h: u64 = this.state[7];

        t = 0;
        loop (t < 80) {
            local bigS1: u64 = Sha512.rotr(e, 14) ^ Sha512.rotr(e, 18) ^ Sha512.rotr(e, 41);
            local choose: u64 = (e & f) ^ ((~e) & g);
            local temp1: u64 = h + bigS1 + choose + SHA512_K[t] + w[t];
            local bigS0: u64 = Sha512.rotr(a, 28) ^ Sha512.rotr(a, 34) ^ Sha512.rotr(a, 39);
            local majority: u64 = (a & b) ^ (a & c) ^ (b & c);
            local temp2: u64 = bigS0 + majority;
            h = g;
            g = f;
            f = e;
            e = d + temp1;
            d = c;
            c = b;
            b = a;
            a = temp1 + temp2;
            t = t + 1;
        }

        this.state[0] = this.state[0] + a;
        this.state[1] = this.state[1] + b;
        this.state[2] = this.state[2] + c;
        this.state[3] = this.state[3] + d;
        this.state[4] = this.state[4] + e;
        this.state[5] = this.state[5] + f;
        this.state[6] = this.state[6] + g;
        this.state[7] = this.state[7] + h;
    }

    frame rotr(value: u64, bits: int) ret u64 {
        return (value >> cast<u64>(bits)) | (value << cast<u64>(64 - bits));
    }

    # Writes `value` as 8 big-endian bytes at `output`.
    frame storeWord(output: *u8, value: u64) {
        local i: int = 0;
        loop (i < 8) {
            *(output + i) = cast<u8>((value >> cast<u64>(56 - (i * 8))) & cast<u64>(0xff));
            i = i + 1;
        }
    }

    # Write the 64-byte digest of `length` bytes at `data` to `digest`.
    frame digest(data: *u8, length: long, digest: *u8) {
        local context: Sha512 = Sha512.new();
        context.update(data, length);
        context.finish(digest);
    }

    # Lowercase hex digest of the bytes at `data`. Returns a newly allocated
    # 128-character string (caller must free), or nullptr if allocation fails.
    frame hexBytes(data: *u8, length: long) ret string {
        local raw: u8[64];
        Sha512.digest(data, length, &raw[0]);
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

    # Lowercase hex digest of a null-terminated string (caller must free).
    frame hex(text: string) ret string {
        if (text == nullptr) {
            return Sha512.hexBytes(nullptr, 0);
        }
        return Sha512.hexBytes(cast<*u8>(text), strlen(text));
    }
}
