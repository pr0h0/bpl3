import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("parses URLs and query strings", () => {
  expectCorrectnessSuite([
    {
      name: "url parsing",
      validateLlvm: true,
      expectedStdout:
        "HTTPS://User:pw@Example.COM:8443/a/b%20c?x=1&y=2#top -> scheme=https user=User:pw host=example.com port=8443/8443 path=/a/b%20c query=x=1&y=2 frag=top | https://User:pw@example.com:8443/a/b%20c?x=1&y=2#top\nhttp://example.com -> scheme=http user= host=example.com port=-1/80 path= query= frag= | http://example.com\nhttp://[::1]:8080/index.html -> scheme=http user= host=::1 port=8080/8080 path=/index.html query= frag= | http://[::1]:8080/index.html\nmailto:someone@example.com -> scheme=mailto user= host= port=-1/-1 path=someone@example.com query= frag= | mailto:someone@example.com\nfile:///etc/hosts -> scheme=file user= host= port=-1/-1 path=/etc/hosts query= frag= | file:///etc/hosts\n/relative/path?q#f -> scheme= user= host= port=-1/-1 path=/relative/path query=q frag=f | /relative/path?q#f\nws://host:/chat -> scheme=ws user= host=host port=-1/80 path=/chat query= frag= | ws://host/chat\nhttp://host:99999/ -> invalid\nhttp://[::1/ -> invalid\n -> invalid\nparam [a]=[1] valued\nparam [name]=[John Doe] valued\nparam [empty]=[] valued\nparam [flag]=[] bare\nparam [enc]=[&=] valued\nbuilt a=1&name=John+Doe&empty=&flag&enc=%26%3D\nvalue J\u00f6rg missing none\n",
      source: `import [Url], [ParsedUrl], [QueryParam] from "std/url.bpl";
import [Option] from "std/option.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
extern printf(fmt: string, ...);
frame show(text: string) {
    local parsed: Option<ParsedUrl> = Url.parse(text);
    if (parsed.isNone()) {
        printf("%s -> invalid\\n", text);
        return;
    }
    local u: ParsedUrl = parsed.unwrap();
    local back: String = u.toString();
    printf("%s -> scheme=%s user=%s host=%s port=%d/%d path=%s query=%s frag=%s | %s\\n", text, u.scheme.cstr(), u.userinfo.cstr(), u.host.cstr(), u.port, u.effectivePort(), u.path.cstr(), u.query.cstr(), u.fragment.cstr(), back.cstr());
    back.destroy();
    u.destroy();
}
frame main() ret int {
    show("HTTPS://User:pw@Example.COM:8443/a/b%20c?x=1&y=2#top");
    show("http://example.com");
    show("http://[::1]:8080/index.html");
    show("mailto:someone@example.com");
    show("file:///etc/hosts");
    show("/relative/path?q#f");
    show("ws://host:/chat");
    show("http://host:99999/");
    show("http://[::1/");
    show("");
    local params: Array<QueryParam> = Url.parseQuery("?a=1&name=John+Doe&empty=&flag&enc=%26%3D&bad=%zz");
    loop (local i: int = 0; i < params.length; i = i + 1) {
        printf("param [%s]=[%s] %s\\n", params.get(i).key.cstr(), params.get(i).value.cstr(), params.get(i).hasValue ? "valued" : "bare");
    }
    local built: String = Url.buildQuery(&params);
    printf("built %s\\n", built.cstr());
    built.destroy();
    Url.destroyParams(&params);
    local name: Option<String> = Url.queryValue("a=1&name=J%C3%B6rg", "name");
    local value: String = name.unwrap();
    printf("value %s missing %s\\n", value.cstr(), Url.queryValue("a=1", "zz").isNone() ? "none" : "some");
    value.destroy();
    return 0;
}
`,
    },
  ]);
}, 120000);
