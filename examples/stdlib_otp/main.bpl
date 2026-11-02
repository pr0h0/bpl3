import printf from "std/c.bpl";
import [Otp] from "std/otp.bpl";
import [HmacSha1] from "std/hmac.bpl";
import [Base32] from "std/base32.bpl";

frame main() ret int {
    # RFC 4226 appendix D: secret "12345678901234567890", counters 0 to 9.
    local secret: *u8 = cast<*u8>("12345678901234567890");
    local counter: long = 0;
    loop (counter < 10) {
        printf("hotp %ld %06d\n", counter, Otp.hotp(secret, 20, counter, 6));
        counter = counter + 1;
    }

    # RFC 6238 appendix B (SHA-1 rows): 8 digits, 30-second steps.
    printf("totp 59 %08d\n", Otp.totpAt(secret, 20, 59, 30, 8));
    printf("totp 1111111109 %08d\n", Otp.totpAt(secret, 20, 1111111109, 30, 8));
    printf("totp 1111111111 %08d\n", Otp.totpAt(secret, 20, 1111111111, 30, 8));
    printf("totp 1234567890 %08d\n", Otp.totpAt(secret, 20, 1234567890, 30, 8));
    printf("totp 2000000000 %08d\n", Otp.totpAt(secret, 20, 2000000000, 30, 8));
    printf("totp 20000000000 %08d\n", Otp.totpAt(secret, 20, 20000000000, 30, 8));

    # Invalid arguments.
    printf("digits 5: %d, step 0: %d\n", Otp.hotp(secret, 20, 0, 5), Otp.totpAt(secret, 20, 59, 0, 6));

    # The current code with the usual 6 digits and 30-second step.
    local now: int = Otp.totp(secret, 20);
    printf("current code in range: %d\n", cast<int>((now >= 0) && (now < 1000000)));

    # An authenticator secret is shown as Base32; decode it to bytes first.
    local qrKey: u8[32];
    local qrKeyLength: long = Base32.decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", &qrKey[0]);
    printf("base32 secret: %ld bytes, totp 59 %06d\n", qrKeyLength, Otp.totpAt(&qrKey[0], qrKeyLength, 59, 30, 6));

    # RFC 2202 test case 2 for HMAC-SHA1.
    local mac: u8[20];
    HmacSha1.digest(cast<*u8>("Jefe"), 4, cast<*u8>("what do ya want for nothing?"), 28, &mac[0]);
    printf("hmac-sha1 ");
    loop (local i: int = 0; i < 20; i = i + 1) {
        printf("%02x", cast<int>(mac[i]));
    }
    printf("\n");
    return 0;
}
