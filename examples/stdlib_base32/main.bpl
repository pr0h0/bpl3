import printf, free from "std/c.bpl";
import [Base32] from "std/base32.bpl";

frame show(text: string) {
    local encoded: string = Base32.encodeString(text);
    local decoded: string = Base32.decodeToString(encoded);
    printf("'%s' -> %s -> '%s'\n", text, encoded, decoded);
    free(cast<*void>(decoded));
    free(cast<*void>(encoded));
}

frame check(input: string) {
    printf("%s: valid %d, length %ld\n", input, Base32.isValid(input), Base32.decodedLength(input));
}

frame main() ret int {
    # RFC 4648 section 10 test vectors.
    show("");
    show("f");
    show("fo");
    show("foo");
    show("foob");
    show("fooba");
    show("foobar");

    # Lower case and missing padding are accepted, as in TOTP secrets.
    local secret: u8[10];
    local count: long = Base32.decode("jbswy3dpehpk3pxp", &secret[0]);
    printf("secret:");
    local i: long = 0;
    loop (i < count) {
        printf(" %02x", cast<int>(secret[i]));
        i = i + 1;
    }
    printf("\n");

    check("MZXW6===");
    check("MZXW6");
    check("MZXW6=");
    check("MZ=XW6==");
    check("MZXW1===");
    check("M");
    return 0;
}
