# One-time passwords: HOTP (RFC 4226) and TOTP (RFC 6238) with HMAC-SHA1, as
# used by authenticator apps.

export [Otp];

import [HmacSha1] from "std/hmac.bpl";
import [Time] from "std/time.bpl";

struct Otp {
    # The `digits`-digit HOTP code (6 to 9 digits) for `counter` under the
    # `keyLength`-byte shared secret at `key`, or -1 for another digit count.
    # A Base32 secret from a QR code must be decoded to bytes first.
    frame hotp(key: *u8, keyLength: long, counter: long, digits: int) ret int {
        if ((digits < 6) || (digits > 9)) {
            return -1;
        }
        local message: u8[8];
        local i: int = 0;
        loop (i < 8) {
            message[i] = cast<u8>((counter >> cast<long>(56 - (i * 8))) & cast<long>(0xff));
            i = i + 1;
        }
        local mac: u8[20];
        HmacSha1.digest(key, keyLength, &message[0], 8, &mac[0]);
        # Dynamic truncation: four bytes at the offset in the last nibble.
        local offset: int = cast<int>(mac[19] & cast<u8>(0x0f));
        local code: long = ((cast<long>(mac[offset]) & cast<long>(0x7f)) << cast<long>(24)) | (cast<long>(mac[offset + 1]) << cast<long>(16)) | (cast<long>(mac[offset + 2]) << cast<long>(8)) | cast<long>(mac[offset + 3]);
        local modulus: long = 1;
        i = 0;
        loop (i < digits) {
            modulus = modulus * cast<long>(10);
            i = i + 1;
        }
        return cast<int>(code % modulus);
    }

    # The TOTP code for Unix time `unixSeconds` with a `stepSeconds` time step
    # (usually 30), or -1 for an invalid step or digit count.
    frame totpAt(key: *u8, keyLength: long, unixSeconds: long, stepSeconds: int, digits: int) ret int {
        if ((stepSeconds <= 0) || (unixSeconds < 0)) {
            return -1;
        }
        return Otp.hotp(key, keyLength, unixSeconds / cast<long>(stepSeconds), digits);
    }

    # The current 6-digit, 30-second TOTP code, as shown by authenticator
    # apps.
    frame totp(key: *u8, keyLength: long) ret int {
        return Otp.totpAt(key, keyLength, Time.nowSeconds(), 30, 6);
    }
}
