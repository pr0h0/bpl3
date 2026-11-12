import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Every expected group span and substitution agrees with Python's re module.

it("reports capture groups and expands replacement templates", () => {
  expectCorrectnessSuite([
    {
      name: "regex captures",
      validateLlvm: true,
      expectedStdout:
        "(\\d{4})-(\\d{2})-(\\d{2}) on on 2024-01-15 ok: 0=[2024-01-15]@3 1=[2024]@3 2=[01]@8 3=[15]@11\n(a|ab)(c|bcd)(d*) on abcd: 0=[abcd]@0 1=[a]@0 2=[bcd]@1 3=[]@4\n(a+)(b)? on xaaac: 0=[aaa]@1 1=[aaa]@1 2=-\n(?:ab)+(c) on zababc: 0=[ababc]@1 1=[c]@5\n((a)|b)+ on ab: 0=[ab]@0 1=[b]@1 2=[a]@0\n(\\w+)@(\\w+)\\.com on mail: bob@example.com!: 0=[bob@example.com]@6 1=[bob]@6 2=[example]@10\n(x)(y) on nothing here: none\n^(\\s*)(\\w+) on    indent: 0=[   indent]@0 1=[   ]@0 2=[indent]@3\n(a{2})(a*) on aaaaa: 0=[aaaaa]@0 1=[aa]@0 2=[aaa]@2\n(a*) on bbb: 0=[]@0 1=[]@0\n(colou?r) on my color: 0=[color]@3 1=[color]@3\nsub (\\w+)=(\\w+) => 1:a, 2:b\nsub (\\d+) => x<1>y<22>z\nsub o => f00\nsub x* => -a-b-\nsub (a)(b)? => [a||$|a][a|b|$|a]\n",
      source: `import [Regex], [RegexMatch] from "std/regex.bpl";
extern printf(fmt: string, ...);
extern free(ptr: *void);
frame show(pattern: string, text: string) {
    local r: Regex = Regex.compile(pattern);
    local m: RegexMatch = r.captures(text);
    printf("%s on %s:", pattern, text);
    if (!m.found) {
        printf(" none\\n");
    } else {
        loop (local g: int = 0; g <= r.groups(); g = g + 1) {
            if (m.matched(g)) {
                local part: string = m.text(text, g);
                printf(" %d=[%s]@%ld", g, part, m.start(g));
                free(cast<*void>(part));
            } else {
                printf(" %d=-", g);
            }
        }
        printf("\\n");
    }
    m.destroy();
    r.destroy();
}
frame sub(pattern: string, text: string, template: string) {
    local r: Regex = Regex.compile(pattern);
    local out: string = r.replaceAllGroups(text, template);
    printf("sub %s => %s\\n", pattern, out);
    free(cast<*void>(out));
    r.destroy();
}
frame main() ret int {
    show("(\\\\d{4})-(\\\\d{2})-(\\\\d{2})", "on 2024-01-15 ok");
    show("(a|ab)(c|bcd)(d*)", "abcd");
    show("(a+)(b)?", "xaaac");
    show("(?:ab)+(c)", "zababc");
    show("((a)|b)+", "ab");
    show("(\\\\w+)@(\\\\w+)\\\\.com", "mail: bob@example.com!");
    show("(x)(y)", "nothing here");
    show("^(\\\\s*)(\\\\w+)", "   indent");
    show("(a{2})(a*)", "aaaaa");
    show("(a*)", "bbb");
    show("(colou?r)", "my color");
    sub("(\\\\w+)=(\\\\w+)", "a=1, b=2", "$2:$1");
    sub("(\\\\d+)", "x1y22z", "<$1>");
    sub("o", "foo", "0");
    sub("x*", "ab", "-");
    sub("(a)(b)?", "aab", "[$1|$2|$$|\${1}]");
    return 0;
}
`,
    },
  ]);
}, 120000);
