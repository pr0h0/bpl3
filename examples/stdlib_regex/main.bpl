import printf from "std/c.bpl";
import [Regex] from "std/regex.bpl";

frame full(pattern: string, text: string) {
    local regex: Regex = Regex.compile(pattern);
    printf("%s %d\n", pattern, cast<int>(regex.matches(text)));
    regex.destroy();
}

frame findAll(pattern: string, text: string) {
    local regex: Regex = Regex.compile(pattern);
    printf("find %s:", pattern);
    local at: long = 0;
    local start: long = 0;
    local end: long = 0;
    loop (regex.find(text, at, &start, &end)) {
        printf(" [%ld,%ld)", start, end);
        # An empty match still moves on by one byte.
        at = end;
        if (end == start) {
            at = end + 1;
        }
    }
    printf("\n");
    regex.destroy();
}

frame rejects(pattern: string) {
    local failed: bool = false;
    try {
        local regex: Regex = Regex.compile(pattern);
        regex.destroy();
    } catch {
        failed = true;
    }
    printf("rejects %s %d\n", pattern, cast<int>(failed));
}

frame main() ret int {
    full("a*b", "aaab");
    full("a*b", "aaac");
    full("(ab|cd)+", "abcdab");
    full("(ab|cd)+", "");
    full("colou?r", "color");
    full("colou?r", "colouur");
    full("[a-z]+[0-9]*", "hello42");
    full("[^0-9]+", "abc");
    full("[^0-9]+", "ab1");
    full("\\w+@\\w+\\.com", "me@site.com");
    full("\\s*\\d+\\s*", "  42 ");
    full("a.c", "abc");
    full("a.c", "a\nc");
    full("(a|b)*abb", "aababb");
    full("x(y(z|w))?", "xyw");
    full("[]a]+", "a]a");
    full("[a\\-z]+", "-az");
    full("\\D\\W\\S", "a!b");

    findAll("\\d+", "abc 123 de 45");
    findAll("b$", "abab");
    findAll("^ab", "xab");
    findAll("^ab", "abab");
    # Leftmost-longest: both alternatives match at 0, the longer one wins.
    findAll("a|ab", "abc");

    local any: Regex = Regex.compile("[A-Z][a-z]+");
    printf("contains %d %d\n", cast<int>(any.contains("hello World")), cast<int>(any.contains("hello world")));
    any.destroy();

    rejects("(ab");
    rejects("ab)");
    rejects("*a");
    rejects("[ab");
    rejects("[z-a]");
    rejects("a\\");
    return 0;
}
