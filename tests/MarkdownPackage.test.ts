import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeRepoTempDir } from "./helpers/repoTempDir";
import { MARKDOWN_REFERENCE_CASES } from "./helpers/markdownReferenceCases";

const SEPARATOR = "\x01";

// Renders every input with the given options and returns the HTML outputs.
function render(inputs: string[], options = ""): string[] {
  const dir = makeRepoTempDir("markdown-test-");
  const outDir = mkdtempSync(join(tmpdir(), "bpl-markdown-"));
  try {
    const casesPath = join(dir, "cases.txt");
    writeFileSync(casesPath, inputs.map((input) => input + SEPARATOR).join(""));
    const file = join(dir, "main.bpl");
    writeFileSync(
      file,
      String.raw`
    import [Markdown], [MarkdownOptions] from "bpl-markdown";
    import [String] from "std/string.bpl";
    import [FS] from "std/fs.bpl";
    extern printf(fmt: string, ...) ret int;
    extern strchr(text: string, c: int) ret string;
    frame main() ret int {
        local options: MarkdownOptions = MarkdownOptions.defaults();
        ${options}
        local source: String = FS.readFile(${JSON.stringify(casesPath)});
        local cursor: string = source.data;
        loop (cursor[0] != 0) {
            local separator: string = strchr(cursor, 1);
            separator[0] = 0;
            local html: String = Markdown.render(cursor, &options);
            printf("%s\x01", html.data);
            html.destroy();
            cursor = separator + 1;
        }
        source.destroy();
        return 0;
    }`,
    );
    const exe = join(outDir, "main");
    const build = spawnSync(
      "bun",
      [resolve("index.ts"), "build", file, "-o", exe],
      { encoding: "utf8", timeout: 60000 },
    );
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const run = spawnSync(exe, [], {
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 64 * 1024 * 1024,
    });
    expect(run.status, run.stderr).toBe(0);
    const outputs = run.stdout.split(SEPARATOR);
    expect(outputs.pop()).toBe("");
    expect(outputs.length).toBe(inputs.length);
    return outputs;
  } finally {
    rmSync(dir, { force: true, recursive: true });
    rmSync(outDir, { force: true, recursive: true });
  }
}

test("bpl-markdown matches a reference renderer on core CommonMark and GFM syntax", () => {
  const outputs = render(MARKDOWN_REFERENCE_CASES.map(([input]) => input));
  MARKDOWN_REFERENCE_CASES.forEach(([input, expected], index) => {
    expect({ input, html: outputs[index] }).toEqual({ input, html: expected });
  });
}, 90000);

test("bpl-markdown escapes raw HTML and neutralizes unsafe URLs", () => {
  const [links, html, crlf, titles] = render([
    '[x](javascript:alert(1)) [y](JaVaScRiPt:x) [z](data:text/html,x) [w](vbscript:x) [t](java\tscript:x) [ok](mailto:a@b.c) [rel](../a%20b) [frag](#top) [q](/s?a=1&b="2")\n',
    "![i](javascript:x) <javascript:alert(1)> <script>alert('x')</script> <img src=x onerror=y> \"q\"\n",
    "line one\r\nline two\r\n\r\n# CRLF heading\r\n",
    '[a](/x "t\\"q") [b](<x y> \'single\') [c](/y)\n',
  ]);
  expect(links).toBe(
    '<p><a href="#">x</a> <a href="#">y</a> <a href="#">z</a> <a href="#">w</a> [t](java\tscript:x) <a href="mailto:a@b.c">ok</a> <a href="../a%20b">rel</a> <a href="#top">frag</a> <a href="/s?a=1&amp;b=&quot;2&quot;">q</a></p>\n',
  );
  expect(html).toBe(
    '<p><img src="#" alt="i" /> &lt;javascript:alert(1)&gt; &lt;script&gt;alert(\'x\')&lt;/script&gt; &lt;img src=x onerror=y&gt; &quot;q&quot;</p>\n',
  );
  expect(crlf).toBe("<p>line one\nline two</p>\n<h1>CRLF heading</h1>\n");
  expect(titles).toBe(
    '<p><a href="/x" title="t&quot;q">a</a> <a href="x%20y" title="single">b</a> <a href="/y">c</a></p>\n',
  );
}, 90000);

test("bpl-markdown options add heading ids and nofollow links", () => {
  const [ids] = render(
    [
      "# Hello, World!\n## Install `bpl` -- now\n### ???\n\nsee [docs](https://example.org) and <https://a.b>\n",
    ],
    "options.heading_ids = true; options.nofollow = true;",
  );
  expect(ids).toBe(
    '<h1 id="hello-world">Hello, World!</h1>\n<h2 id="install-bpl-now">Install <code>bpl</code> -- now</h2>\n<h3 id="section">???</h3>\n<p>see <a href="https://example.org" rel="nofollow noopener">docs</a> and <a href="https://a.b" rel="nofollow noopener">https://a.b</a></p>\n',
  );
}, 90000);

test("bpl-markdown stays fast and bounded on adversarial input", () => {
  const nestedList = Array.from(
    { length: 200 },
    (_, i) => "  ".repeat(i) + "- item",
  ).join("\n");
  const inputs = [
    "*a ".repeat(20000),
    "[".repeat(20000) + "x" + "](".repeat(5000),
    "`x ".repeat(20000),
    ">".repeat(2000) + " deep",
    nestedList,
    "*".repeat(5000) + "x" + "*".repeat(5000),
    "**a *b ".repeat(5000),
    "_".repeat(30000),
  ];
  const started = Date.now();
  const outputs = render(inputs);
  expect(Date.now() - started).toBeLessThan(60000);
  expect(outputs[0]!.startsWith("<p>*a *a ")).toBe(true);
  // Quotes and lists deeper than the nesting limit fall back to paragraphs.
  expect(outputs[3]!.split("<blockquote>").length - 1).toBe(17);
  expect(outputs[4]!.split("<ul>").length - 1).toBe(17);
  expect(outputs[7]).toBe("<hr />\n");
}, 90000);
