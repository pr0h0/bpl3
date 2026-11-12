import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Expected output was checked by hand against RFC 4180 (CSV), SemVer 2.0.0
// precedence and npm range semantics, and Python's base64.a85encode.

it("splits, trims, cases, wraps and escapes strings", () => {
  expectCorrectnessSuite([
    {
      name: "string utilities",
      validateLlvm: true,
      expectedStdout:
        '4 7 2 0 1\n1 3 4\ntrim=[hi there]\nstart=[x ]\nend=[  x]\nchars=[x]\nprefix=[rest]\nsuffix=[file]\nsplit: [a] [] [b] []\nsplitmulti: [a] [b] [c]\nws: [one] [two] [three]\nlines: [a] [b] [c] [d]\nlower=[mixed]\nupper=[MIXED]\ncap=[Word]\ntitle=[Hello Big World]\nsnake=[parse_http_response2_fast]\nkebab=[hello-world-again]\ncamel=[helloBigWorld]\npascal=[HelloBigWorld]\ncenter=[**ab***]\nrepeat=[ababab]\ntrunc=[hello...]\nwrap=[the quick\nbrown fox\njumps over\nthe lazy\ndog]\nesc=[a\\"b\\\\c\\n\\x01]\nunesc=[x\tyA\\]\njoin=[x+y+z]\n',
      source: `import [StringUtils] from "std/string_utils.bpl";
import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
extern printf(fmt: string, ...);
frame p(label: string, value: String) {
    printf("%s=[%s]\\n", label, value.cstr());
    local v: String = value;
    v.destroy();
}
frame list(label: string, parts: Array<String>) {
    printf("%s:", label);
    loop (local i: int = 0; i < parts.length; i = i + 1) { printf(" [%s]", parts.get(i).cstr()); }
    printf("\\n");
    local copy: Array<String> = parts;
    StringUtils.destroyAll(&copy);
}
frame main() ret int {
    printf("%d %d %d %d %d\\n", StringUtils.indexOf("hello world", "o"), StringUtils.lastIndexOf("hello world", "o"), StringUtils.countOccurrences("aaaa", "aa"), StringUtils.contains("abc", "bd"), StringUtils.equalsIgnoreCase("HeLLo", "hello"));
    printf("%d %d %d\\n", StringUtils.isBlank(" \\t\\n"), StringUtils.editDistance("kitten", "sitting"), StringUtils.commonPrefixLength("flower", "flow"));
    p("trim", StringUtils.trimWhitespace("\\t hi there \\n"));
    p("start", StringUtils.trimStart("  x "));
    p("end", StringUtils.trimEnd("  x  "));
    p("chars", StringUtils.trimChars("--==x=-", "-="));
    p("prefix", StringUtils.removePrefix("prefix.rest", "prefix."));
    p("suffix", StringUtils.removeSuffix("file.txt", ".txt"));
    list("split", StringUtils.splitBy("a,,b,", ","));
    list("splitmulti", StringUtils.splitBy("a::b::c", "::"));
    list("ws", StringUtils.splitWhitespace("  one two\\t three  "));
    list("lines", StringUtils.splitLines("a\\r\\nb\\nc\\rd\\n"));
    p("lower", StringUtils.toLowerAscii("MiXeD"));
    p("upper", StringUtils.toUpperAscii("MiXeD"));
    p("cap", StringUtils.capitalize("word"));
    p("title", StringUtils.toTitleCase("hELLO big world"));
    p("snake", StringUtils.toSnakeCase("parseHTTPResponse2Fast"));
    p("kebab", StringUtils.toKebabCase("Hello World_again"));
    p("camel", StringUtils.toCamelCase("hello_big-world"));
    p("pascal", StringUtils.toPascalCase("hello big world"));
    p("center", StringUtils.padCenter("ab", 7, '*'));
    p("repeat", StringUtils.repeat("ab", 3));
    p("trunc", StringUtils.truncate("hello world", 8, "..."));
    p("wrap", StringUtils.wordWrap("the quick brown fox jumps over the lazy dog", 10));
    p("esc", StringUtils.escape("a\\"b\\\\c\\n\\x01"));
    p("unesc", StringUtils.unescape("x\\\\ty\\\\x41\\\\\\\\"));
    local parts: Array<String> = StringUtils.splitBy("x-y-z", "-");
    p("join", StringUtils.joinStrings(&parts, "+"));
    StringUtils.destroyAll(&parts);
    return 0;
}
`,
    },
  ]);
}, 120000);

it("parses and formats CSV, INI, semver, ANSI, tables and base85", () => {
  expectCorrectnessSuite([
    {
      name: "text formats",
      validateLlvm: true,
      expectedStdout:
        'csv rows 4\nrow 0: [name] [age]\nrow 1: [Smith, J] [42]\nrow 2: [say "hi"] []\nrow 3: [multi\nline] [x]\ncsv out name,age\r\n"Smith, J",42\r\n"say ""hi""",\r\n"multi\nline",x\r\n|\ntsv 3 c\ncsv error CSV: unterminated quoted field\nini demo localhost 8080 T T F 5\nname = demo\n\n[server]\nhost = localhost\nport = 9090\n\n[Paths]\nroot = /var\nini error INI line 2: expected key = value\nsemver 1 2 3 alpha.1 build.5 1.2.3-alpha.1+build.5\nvalid T F F F\norder -1 -1 -1 -1 0 1\ncaret T F T F\ntilde T F range T T F\nwild T F T hyphen T F pre T F\nbump 1.3.0\nansi 11 hi 2 14\n\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2510\n\u2502 Name  \u2502 Qty \u2502 Note \u2502\n\u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2524\n\u2502 apple \u2502   3 \u2502 red  \u2502\n\u2502 kiwi  \u2502  12 \u2502      \u2502\n\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n+-------+-----+------+\n| Name  | Qty | Note |\n+-------+-----+------+\n| apple |   3 | red  |\n| kiwi  |  12 |      |\n+-------+-----+------+\nName   Qty  Note\n-----  ---  ----\napple    3  red\nkiwi    12\na85 9jqo^BlbD-BleB1DJ+*+F(f,q z@:B BOu!rD]j7BEbo7 Man is distinguished hello world 6 -1\nz85 HelloWorld 8 865b -1\n',
      source: `import [Csv] from "std/csv.bpl";
import [Ini] from "std/ini.bpl";
import [SemVer] from "std/semver.bpl";
import [Ansi] from "std/ansi.bpl";
import [Table], TABLE_ALIGN_RIGHT, TABLE_ALIGN_CENTER from "std/table.bpl";
import [Base85] from "std/base85.bpl";
import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
extern printf(fmt: string, ...);
extern free(ptr: *void);
frame b(v: bool) ret string { if (v) { return "T"; } return "F"; }
frame main() ret int {
    local rows: Array<Array<String>> = Csv.parse("name,age\\r\\n\\"Smith, J\\",42\\n\\"say \\"\\"hi\\"\\"\\",\\n\\"multi\\nline\\",x\\n");
    printf("csv rows %d\\n", rows.length);
    loop (local r: int = 0; r < rows.length; r = r + 1) {
        printf("row %d:", r);
        loop (local c: int = 0; c < rows.get(r).length; c = c + 1) { printf(" [%s]", rows.get(r).get(c).cstr()); }
        printf("\\n");
    }
    local text: String = Csv.format(&rows, ',');
    printf("csv out %s|\\n", text.cstr());
    text.destroy();
    Csv.destroyRows(&rows);
    local tsv: Array<Array<String>> = Csv.parseWith("a\\tb\\tc", '\\t');
    printf("tsv %d %s\\n", tsv.get(0).length, tsv.get(0).get(2).cstr());
    Csv.destroyRows(&tsv);
    try { Csv.parse("\\"open"); } catch (m: string) { printf("csv error %s\\n", m); }
    local ini: Ini = Ini.parse("; comment\\nname = demo\\n[server]\\nhost = \\"localhost\\"\\nport: 8080\\ndebug = yes\\n[Paths]\\nroot=/var\\n");
    printf("ini %s %s %ld %s %s %s %d\\n", ini.get("", "name").unwrap(), ini.getOr("SERVER", "Host", "?"), ini.getInt("server", "port", cast<long>(0)), b(ini.getBool("server", "debug", false)), b(ini.has("paths", "root")), b(ini.has("paths", "missing")), ini.len());
    ini.set("server", "port", "9090");
    ini.remove("server", "debug");
    local dump: String = ini.toText();
    printf("%s", dump.cstr());
    dump.destroy();
    ini.destroy();
    try { Ini.parse("[ok]\\nbroken line\\n"); } catch (m: string) { printf("ini error %s\\n", m); }
    local v: SemVer = SemVer.parse("v1.2.3-alpha.1+build.5").unwrap();
    local vs: String = v.toString();
    printf("semver %ld %ld %ld %s %s %s\\n", v.major, v.minor, v.patch, v.prerelease.cstr(), v.build.cstr(), vs.cstr());
    vs.destroy();
    printf("valid %s %s %s %s\\n", b(SemVer.isValid("1.0.0")), b(SemVer.isValid("01.0.0")), b(SemVer.isValid("1.0")), b(SemVer.isValid("1.0.0-")));
    printf("order %d %d %d %d %d %d\\n", SemVer.compareStrings("1.0.0-alpha", "1.0.0-alpha.1"), SemVer.compareStrings("1.0.0-alpha.1", "1.0.0-alpha.beta"), SemVer.compareStrings("1.0.0-beta.2", "1.0.0-beta.11"), SemVer.compareStrings("1.0.0-rc.1", "1.0.0"), SemVer.compareStrings("1.0.0+a", "1.0.0+b"), SemVer.compareStrings("2.1.0", "2.0.9"));
    printf("caret %s %s %s %s\\n", b(SemVer.satisfiesString("1.4.0", "^1.2.3")), b(SemVer.satisfiesString("2.0.0", "^1.2.3")), b(SemVer.satisfiesString("0.2.9", "^0.2.3")), b(SemVer.satisfiesString("0.3.0", "^0.2.3")));
    printf("tilde %s %s range %s %s %s\\n", b(SemVer.satisfiesString("1.2.9", "~1.2.3")), b(SemVer.satisfiesString("1.3.0", "~1.2.3")), b(SemVer.satisfiesString("1.5.0", ">=1.2.0 <2.0.0")), b(SemVer.satisfiesString("3.0.0", "<2 || >=3")), b(SemVer.satisfiesString("2.5.0", "<2 || >=3")));
    printf("wild %s %s %s hyphen %s %s pre %s %s\\n", b(SemVer.satisfiesString("1.9.9", "1.x")), b(SemVer.satisfiesString("1.3.0", "1.2.*")), b(SemVer.satisfiesString("9.9.9", "*")), b(SemVer.satisfiesString("1.5.0", "1.0.0 - 2.0.0")), b(SemVer.satisfiesString("2.0.1", "1.0.0 - 2.0.0")), b(SemVer.satisfiesString("1.2.3-beta", ">=1.2.3-alpha")), b(SemVer.satisfiesString("1.2.4-beta", ">=1.2.3")));
    local next: SemVer = v.bumpMinor();
    local ns: String = next.toString();
    printf("bump %s\\n", ns.cstr());
    ns.destroy(); next.destroy(); v.destroy();
    local painted: String = Ansi.paint("hi", Ansi.red());
    local stripped: String = Ansi.strip(painted.cstr());
    local rgb: String = Ansi.rgb(1, 2, 300);
    printf("ansi %d %s %d %d\\n", painted.length, stripped.cstr(), Ansi.visibleWidth("\\x1b[1mé\\x1b[0m!"), rgb.length);
    painted.destroy(); stripped.destroy(); rgb.destroy();
    local t: Table = Table.new();
    local header: Array<string> = Array<string>.new(3);
    header.push("Name"); header.push("Qty"); header.push("Note");
    t.setHeader(&header);
    local r1: Array<string> = Array<string>.new(3);
    r1.push("apple"); r1.push("3"); r1.push("red");
    local r2: Array<string> = Array<string>.new(3);
    r2.push("kiwi"); r2.push("12");
    t.addRow(&r1); t.addRow(&r2);
    t.setAlignment(1, TABLE_ALIGN_RIGHT);
    t.setAlignment(2, TABLE_ALIGN_CENTER);
    local boxed: String = t.render();
    local ascii: String = t.renderAscii();
    local plain: String = t.renderPlain();
    printf("%s%s%s", boxed.cstr(), ascii.cstr(), plain.cstr());
    boxed.destroy(); ascii.destroy(); plain.destroy();
    t.destroy(); header.destroy(); r1.destroy(); r2.destroy();
    local e1: string = Base85.encodeString("Man is distinguished");
    local e2: string = Base85.encode(cast<*u8>("\\x00\\x00\\x00\\x00ab"), 6);
    local e3: string = Base85.encodeString("hello world");
    local d1: string = Base85.decodeToString("<~9jqo^BlbD-BleB1DJ+*+F(f,q~>");
    local d3: string = Base85.decodeToString(e3);
    printf("a85 %s %s %s %s %s %d %d\\n", e1, e2, e3, d1, d3, Base85.decodedLength("z@:B"), Base85.decodedLength("v"));
    free(cast<*void>(e1)); free(cast<*void>(e2)); free(cast<*void>(e3)); free(cast<*void>(d1)); free(cast<*void>(d3));
    local zin: u8[8] = [cast<u8>(0x86), cast<u8>(0x4F), cast<u8>(0xD2), cast<u8>(0x6F), cast<u8>(0xB5), cast<u8>(0x59), cast<u8>(0xF7), cast<u8>(0x5B)];
    local z: string = Base85.encodeZ85(&zin[0], 8);
    local back: u8[8];
    local count: int = Base85.decodeZ85(z, &back[0]);
    printf("z85 %s %d %02x%02x %d\\n", z, count, back[0], back[7], Base85.decodeZ85("abc", &back[0]));
    free(cast<*void>(z));
    return 0;
}
`,
    },
  ]);
}, 120000);
