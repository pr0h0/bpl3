import printf, free from "std/c.bpl";
import [JSON] from "std/json.bpl";

frame show(label: string, value: string) {
    if (value == nullptr) {
        printf("%s: null\n", label);
        return;
    }
    printf("%s:\n%s\n", label, value);
    free(cast<*void>(value));
}

frame main() ret int {
    local text: string = "{ \"name\": \"a, b: {c}\", \"tags\": [1, 2, [] , {}], \"nested\": {\"ok\": true, \"q\": \"say \\\"hi\\\"\"}, \"none\": null }";
    show("pretty 2", JSON.pretty(text, 2));
    show("pretty 4 array", JSON.pretty("[1,[2,[3]]]", 4));
    show("minify", JSON.minify(text));
    show("scalar", JSON.pretty(" 42 ", 2));
    show("mismatched", JSON.pretty("{\"a\": [1}", 2));
    show("unclosed", JSON.minify("[1, 2"));
    show("unterminated string", JSON.minify("[\"abc]"));
    show("bad indent", JSON.pretty("[]", 0));
    return 0;
}
