import printf, free from "std/c.bpl";
import [Url] from "std/url.bpl";

frame show(label: string, value: string) {
    if (value == nullptr) {
        printf("%s: null\n", label);
        return;
    }
    printf("%s: [%s]\n", label, value);
    free(cast<*void>(value));
}

frame main() ret int {
    show("component", Url.encodeComponent("Hello World/ä?x=1&y=~2"));
    show("form", Url.encodeForm("Hello World/ä?x=1&y=~2"));
    show("unreserved", Url.encodeComponent("AZaz09-_.~"));
    show("empty", Url.encodeComponent(""));

    show("decode", Url.decode("Hello%20World%2F%C3%A4%3fx%3D1+y"));
    show("decode form", Url.decodeForm("Hello+World%2F%C3%A4%3Fx%3D1%2By"));
    local encoded: string = Url.encodeForm("a b+c&d=é");
    show("round trip", Url.decodeForm(encoded));
    free(cast<*void>(encoded));
    show("truncated", Url.decode("abc%4"));
    show("bad hex", Url.decode("%zz"));
    show("nul", Url.decode("a%00b"));
    return 0;
}
