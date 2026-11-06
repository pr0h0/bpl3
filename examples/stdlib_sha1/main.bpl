import printf, free, malloc, memset from "std/c.bpl";
import [Sha1] from "std/sha1.bpl";
import [Base64] from "std/base64.bpl";

frame show(label: string, text: string) {
    local digest: string = Sha1.hex(text);
    printf("%s %s\n", label, digest);
    free(cast<*void>(digest));
}

frame showRepeated(length: int) {
    # Lengths around 56 and 64 bytes exercise each padding path.
    local data: *u8 = cast<*u8>(malloc(cast<long>(length) + cast<long>(1)));
    memset(cast<*void>(data), 120, cast<long>(length));
    local digest: string = Sha1.hexBytes(data, cast<long>(length));
    printf("x%d %s\n", length, digest);
    free(cast<*void>(digest));
    free(cast<*void>(data));
}

frame printDigest(label: string, raw: *u8) {
    printf("%s ", label);
    local i: int = 0;
    loop (i < 20) {
        printf("%02x", cast<int>(*(raw + i)));
        i = i + 1;
    }
    printf("\n");
}

frame main() ret int {
    show("empty", "");
    show("abc", "abc");
    show("two-block", "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq");
    showRepeated(55);
    showRepeated(56);
    showRepeated(63);
    showRepeated(64);
    showRepeated(65);

    # Streaming in uneven pieces matches the one-shot digest.
    local text: string = "The quick brown fox jumps over the lazy dog";
    local context: Sha1 = Sha1.new();
    context.update(cast<*u8>(text), 10);
    context.update(cast<*u8>(text) + 10, 33);
    local raw: u8[20];
    context.finish(&raw[0]);
    printDigest("streamed", &raw[0]);
    show("fox", text);

    # One million 'a' characters, fed 1000 bytes at a time.
    local chunk: u8[1000];
    memset(cast<*void>(&chunk[0]), 97, 1000);
    context.init();
    local i: int = 0;
    loop (i < 1000) {
        context.update(&chunk[0], 1000);
        i = i + 1;
    }
    context.finish(&raw[0]);
    printDigest("million", &raw[0]);

    # WebSocket handshake (RFC 6455 section 1.3): Base64 of the SHA-1 of the
    # client key followed by the protocol GUID.
    local accept: Sha1 = Sha1.new();
    local clientKey: string = "dGhlIHNhbXBsZSBub25jZQ==";
    local guid: string = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    accept.update(cast<*u8>(clientKey), 24);
    accept.update(cast<*u8>(guid), 36);
    local acceptDigest: u8[20];
    accept.finish(&acceptDigest[0]);
    local acceptKey: string = Base64.encode(&acceptDigest[0], 20);
    printf("websocket accept %s\n", acceptKey);
    free(cast<*void>(acceptKey));
    return 0;
}
