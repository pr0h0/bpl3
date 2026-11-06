# SHA-256 message digests (FIPS 180-4)

export [Sha256];

extern malloc(size: long) ret *void;
extern strlen(str: string) ret long;

global SHA256_K: u32[64] = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

# Streaming SHA-256: create a context with `Sha256.new()`, call `update` any
# number of times, then `finish` to write the 32-byte digest. The static
# helpers `digest`, `hexBytes` and `hex` hash in one call.
struct Sha256 {
    state: u32[8],
    block: u8[64],
    blockLength: int,
    totalLength: ulong,

    # A context ready for `update`.
    frame new() ret Sha256 {
        local context: Sha256 = Sha256 { state: [0, 0, 0, 0, 0, 0, 0, 0], block: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], blockLength: 0, totalLength: 0 };
        context.init();
        return context;
    }

    # Reset to the initial state, discarding any data added so far.
    frame init(this: *Sha256) {
        this.state[0] = 0x6a09e667;
        this.state[1] = 0xbb67ae85;
        this.state[2] = 0x3c6ef372;
        this.state[3] = 0xa54ff53a;
        this.state[4] = 0x510e527f;
        this.state[5] = 0x9b05688c;
        this.state[6] = 0x1f83d9ab;
        this.state[7] = 0x5be0cd19;
        this.blockLength = 0;
        this.totalLength = 0;
    }

    # Add `length` bytes from `data` to the message.
    frame update(this: *Sha256, data: *u8, length: long) {
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

    # Pad the message and write the 32-byte digest to `digest`. Call `init`
    # before reusing the context.
    frame finish(this: *Sha256, digest: *u8) {
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
        local shift: int = 56;
        local index: int = 56;
        loop (index < 64) {
            this.block[index] = cast<u8>((bitLength >> cast<ulong>(shift)) & cast<ulong>(0xff));
            shift = shift - 8;
            index = index + 1;
        }
        this.compress();

        local word: int = 0;
        loop (word < 8) {
            local value: u32 = this.state[word];
            *(digest + (word * 4)) = cast<u8>(value >> cast<u32>(24));
            *(digest + (word * 4) + 1) = cast<u8>((value >> cast<u32>(16)) & cast<u32>(0xff));
            *(digest + (word * 4) + 2) = cast<u8>((value >> cast<u32>(8)) & cast<u32>(0xff));
            *(digest + (word * 4) + 3) = cast<u8>(value & cast<u32>(0xff));
            word = word + 1;
        }
    }

    frame compress(this: *Sha256) {
        local w: u32[64];
        local t: int = 0;
        loop (t < 16) {
            w[t] = (cast<u32>(this.block[t * 4]) << cast<u32>(24)) | (cast<u32>(this.block[(t * 4) + 1]) << cast<u32>(16)) | (cast<u32>(this.block[(t * 4) + 2]) << cast<u32>(8)) | cast<u32>(this.block[(t * 4) + 3]);
            t = t + 1;
        }
        loop (t < 64) {
            local s0: u32 = Sha256.rotr(w[t - 15], 7) ^ Sha256.rotr(w[t - 15], 18) ^ (w[t - 15] >> cast<u32>(3));
            local s1: u32 = Sha256.rotr(w[t - 2], 17) ^ Sha256.rotr(w[t - 2], 19) ^ (w[t - 2] >> cast<u32>(10));
            w[t] = w[t - 16] + s0 + w[t - 7] + s1;
            t = t + 1;
        }

        local a: u32 = this.state[0];
        local b: u32 = this.state[1];
        local c: u32 = this.state[2];
        local d: u32 = this.state[3];
        local e: u32 = this.state[4];
        local f: u32 = this.state[5];
        local g: u32 = this.state[6];
        local h: u32 = this.state[7];

        t = 0;
        loop (t < 64) {
            local bigS1: u32 = Sha256.rotr(e, 6) ^ Sha256.rotr(e, 11) ^ Sha256.rotr(e, 25);
            local choose: u32 = (e & f) ^ ((~e) & g);
            local temp1: u32 = h + bigS1 + choose + SHA256_K[t] + w[t];
            local bigS0: u32 = Sha256.rotr(a, 2) ^ Sha256.rotr(a, 13) ^ Sha256.rotr(a, 22);
            local majority: u32 = (a & b) ^ (a & c) ^ (b & c);
            local temp2: u32 = bigS0 + majority;
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

    frame rotr(value: u32, bits: int) ret u32 {
        return (value >> cast<u32>(bits)) | (value << cast<u32>(32 - bits));
    }

    # Write the 32-byte digest of `length` bytes at `data` to `digest`.
    frame digest(data: *u8, length: long, digest: *u8) {
        local context: Sha256 = Sha256.new();
        context.update(data, length);
        context.finish(digest);
    }

    # Lowercase hex digest of the bytes at `data`. Returns a newly allocated
    # 64-character string (caller must free), or nullptr if allocation fails.
    frame hexBytes(data: *u8, length: long) ret string {
        local raw: u8[32];
        Sha256.digest(data, length, &raw[0]);
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

    # Lowercase hex digest of a null-terminated string (caller must free).
    frame hex(text: string) ret string {
        if (text == nullptr) {
            return Sha256.hexBytes(nullptr, 0);
        }
        return Sha256.hexBytes(cast<*u8>(text), strlen(text));
    }
}
