import printf, free from "std/c.bpl";
import [Base64] from "std/base64.bpl";

frame roundTrip(text: string) {
    local encoded: string = Base64.encodeStringUrl(text);
    local decoded: string = Base64.decodeUrlToString(encoded);
    printf("[%s] -> [%s] -> [%s]\n", text, encoded, decoded);
    free(cast<*void>(encoded));
    free(cast<*void>(decoded));
}

frame main() ret int {
    roundTrip("");
    roundTrip("f");
    roundTrip("fo");
    roundTrip("foo");
    roundTrip("foob");
    roundTrip("hello?world/>");

    # Bytes that use both URL-safe characters.
    local raw: u8[3] = [cast<u8>(251), cast<u8>(255), cast<u8>(191)];
    local encoded: string = Base64.encodeUrl(&raw[0], 3);
    printf("bytes %s\n", encoded);
    local back: u8[3] = [cast<u8>(0), cast<u8>(0), cast<u8>(0)];
    local count: int = Base64.decodeUrl(encoded, &back[0]);
    printf("decoded %d %d %d %d\n", count, cast<int>(back[0]), cast<int>(back[1]), cast<int>(back[2]));
    free(cast<*void>(encoded));

    # Padded input decodes too; a length of 1 mod 4 and stray characters do not.
    local padded: string = Base64.decodeUrlToString("Zm8=");
    printf("padded %s\n", padded);
    free(cast<*void>(padded));
    local scratch: u8[8];
    printf("invalid %d %d\n", Base64.decodeUrl("Zm9vY", &scratch[0]), Base64.decodeUrl("Zm9*", &scratch[0]));
    return 0;
}
