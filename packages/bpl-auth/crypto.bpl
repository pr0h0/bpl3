import [String] from "std/string.bpl";
export [AuthCrypto];
extern sodium_init() ret int;
extern crypto_pwhash_str_alg(out: string, password: string, bytes: ulong, ops: ulong, memory: ulong, algorithm: int) ret int;
extern crypto_pwhash_str_verify(encoded: string, password: string, bytes: ulong) ret int;
extern crypto_pwhash_opslimit_interactive() ret ulong;
extern crypto_pwhash_memlimit_interactive() ret ulong;
extern crypto_pwhash_alg_argon2id13() ret int;
extern randombytes_buf(out: *void, bytes: ulong);
extern crypto_hash_sha256(out: *void, input: string, bytes: ulong) ret int;
extern sodium_memcmp(a: string, b: string, bytes: ulong) ret int;
extern sodium_memzero(data: *void, bytes: ulong);
extern strlen(text: string) ret ulong;
struct AuthCrypto {
    frame init() {
        if (sodium_init() < 0) {
            throw "Cannot initialize authentication crypto";
        }
    }
    frame passwordHash(password: string) ret String {
        if ((password == nullptr) || (strlen(password) < 12) || (strlen(password) > 256)) {
            throw "Password must contain 12 to 256 bytes";
        }
        local out: char[128];
        if (crypto_pwhash_str_alg(cast<string>(&out[0]), password, strlen(password), crypto_pwhash_opslimit_interactive(), crypto_pwhash_memlimit_interactive(), crypto_pwhash_alg_argon2id13()) != 0) {
            throw "Cannot hash password";
        }
        return String.new(cast<string>(&out[0]));
    }
    frame verify(encoded: string, password: string) ret bool {
        if ((encoded == nullptr) || (password == nullptr) || (strlen(password) > 256)) {
            return false;
        }
        return crypto_pwhash_str_verify(encoded, password, strlen(password)) == 0;
    }
    frame hex(bytes: *u8) ret String {
        local out: char[65];
        local digits: string = "0123456789abcdef";
        loop (local i: int = 0; i < 32; i = i + 1) {
            out[i * 2] = digits[cast<int>(bytes[i]) / 16];
            out[(i * 2) + 1] = digits[cast<int>(bytes[i]) % 16];
        }
        out[64] = 0;
        return String.new(cast<string>(&out[0]));
    }
    frame token() ret String {
        local bytes: u8[32];
        randombytes_buf(&bytes[0], 32);
        return AuthCrypto.hex(&bytes[0]);
    }
    frame tokenValid(value: string) ret bool {
        if ((value == nullptr) || (strlen(value) != 64)) {
            return false;
        }
        loop (local i: int = 0; i < 64; i = i + 1) {
            if (!(((value[i] >= '0') && (value[i] <= '9')) || ((value[i] >= 'a') && (value[i] <= 'f')))) {
                return false;
            }
        }
        return true;
    }
    frame digest(value: string) ret String {
        if (value == nullptr) {
            throw "Cannot digest a null token";
        }
        local bytes: u8[32];
        if (crypto_hash_sha256(&bytes[0], value, strlen(value)) != 0) {
            throw "Cannot digest session token";
        }
        return AuthCrypto.hex(&bytes[0]);
    }
    frame equalToken(a: string, b: string) ret bool {
        if (!AuthCrypto.tokenValid(a) || !AuthCrypto.tokenValid(b)) {
            return false;
        }
        return sodium_memcmp(a, b, 64) == 0;
    }
    frame wipe(data: string, size: ulong) {
        if (data != nullptr) {
            sodium_memzero(data, size);
        }
    }
}
