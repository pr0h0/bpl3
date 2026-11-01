import printf, free, malloc, memset from "std/c.bpl";
import [Sha512] from "std/sha512.bpl";

frame show(label: string, text: string) {
    local digest: string = Sha512.hex(text);
    printf("%s %s\n", label, digest);
    free(cast<*void>(digest));
}

frame showRepeated(length: int) {
    # Lengths around 112 and 128 bytes exercise each padding path.
    local data: *u8 = cast<*u8>(malloc(cast<long>(length) + cast<long>(1)));
    memset(cast<*void>(data), 120, cast<long>(length));
    local digest: string = Sha512.hexBytes(data, cast<long>(length));
    printf("x%d %s\n", length, digest);
    free(cast<*void>(digest));
    free(cast<*void>(data));
}

frame printDigest(label: string, raw: *u8) {
    printf("%s ", label);
    local i: int = 0;
    loop (i < 64) {
        printf("%02x", cast<int>(*(raw + i)));
        i = i + 1;
    }
    printf("\n");
}

frame main() ret int {
    show("empty", "");
    show("abc", "abc");
    show("two-block", "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu");
    showRepeated(111);
    showRepeated(112);
    showRepeated(127);
    showRepeated(128);
    showRepeated(129);

    # Streaming in uneven pieces matches the one-shot digest.
    local text: string = "The quick brown fox jumps over the lazy dog";
    local context: Sha512 = Sha512.new();
    context.update(cast<*u8>(text), 10);
    context.update(cast<*u8>(text) + 10, 33);
    local raw: u8[64];
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
    return 0;
}
