import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { createContext, runInContext } from "vm";

const FRONTEND_DIR = resolve(import.meta.dir, "../playground/frontend");
const TUTORIALS_DIR = resolve(import.meta.dir, "../playground/tutorials");

interface MarkdownApi {
  render(
    text: string,
    options?: {
      highlight?: (code: string) => string;
      headingOffset?: number;
    },
  ): string;
  renderInline(text: string): string;
}

interface SyntaxApi {
  highlight(code: string): string;
}

function load(): { md: MarkdownApi; syntax: SyntaxApi } {
  const context = createContext({});
  for (const file of ["bplSyntax.js", "markdown.js"]) {
    runInContext(readFileSync(resolve(FRONTEND_DIR, file), "utf8"), context);
  }
  return { md: context.BplMarkdown, syntax: context.BplSyntax };
}

const { md, syntax } = load();

describe("playground Markdown renderer", () => {
  test("renders tables with alignment and inline code cells", () => {
    const html = md.render(
      "| Type | Bits |\n|------|-----:|\n| `char` | 8 |\n| `int` | 32 |",
    );
    expect(html).toBe(
      '<div class="table-wrap"><table><thead><tr><th>Type</th><th style="text-align: right">Bits</th></tr></thead>' +
        '<tbody><tr><td><code>char</code></td><td style="text-align: right">8</td></tr>' +
        '<tr><td><code>int</code></td><td style="text-align: right">32</td></tr></tbody></table></div>',
    );
  });

  test("escapes HTML and keeps code spans literal", () => {
    expect(md.render("a <b> & `x **y** <z>`")).toBe(
      "<p>a &lt;b&gt; &amp; <code>x **y** &lt;z&gt;</code></p>",
    );
  });

  test("renders emphasis without touching identifiers", () => {
    expect(md.renderInline("**bold** *em* _em_ snake_case_name 2*3*4")).toBe(
      "<strong>bold</strong> <em>em</em> <em>em</em> snake_case_name 2*3*4",
    );
  });

  test("allows only safe link targets", () => {
    expect(md.renderInline("[docs](https://example.com/a?b=1&c=2)")).toBe(
      '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener">docs</a>',
    );
    expect(md.renderInline("[next](?lesson=arrays)")).toBe(
      '<a href="?lesson=arrays">next</a>',
    );
    expect(md.renderInline("[x](javascript:alert)")).toBe("x");
  });

  test("renders nested and numbered lists", () => {
    expect(md.render("- one\n- two\n  - nested\n\n3. three\n4. four")).toBe(
      "<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul>" +
        '<ol start="3"><li>three</li><li>four</li></ol>',
    );
  });

  test("treats single newlines as line breaks and lets fences interrupt paragraphs", () => {
    expect(md.render("first\nsecond\n```\nx\n```")).toBe(
      '<p>first<br>second</p><pre class="code-block"><code>x</code></pre>',
    );
  });

  test("highlights BPL fences and shifts headings", () => {
    const html = md.render("## Title\n```bpl\nlocal x: int = 1; # note\n```", {
      highlight: syntax.highlight,
      headingOffset: 1,
    });
    expect(html).toBe(
      "<h3>Title</h3>" +
        '<pre class="code-block"><code class="language-bpl"><span class="tok-keyword">local</span> x: ' +
        '<span class="tok-type">int</span> = <span class="tok-number">1</span>; ' +
        '<span class="tok-comment"># note</span></code></pre>',
    );
  });

  test("renders block quotes and rules", () => {
    expect(md.render("> **Note:** read\n\n---")).toBe(
      "<blockquote><p><strong>Note:</strong> read</p></blockquote><hr>",
    );
  });
});

describe("BPL highlighter", () => {
  test("handles nested block comments, strings and interpolation", () => {
    expect(syntax.highlight('/# a /# b #/ c #/ "q\\"<" `${x}`')).toBe(
      '<span class="tok-comment">/# a /# b #/ c #/</span> ' +
        '<span class="tok-string">&quot;q\\&quot;&lt;&quot;</span> ' +
        '<span class="tok-string">`${x}`</span>',
    );
  });

  test("distinguishes keywords, primitive types and type names", () => {
    expect(syntax.highlight("frame f(p: Point) ret u64")).toBe(
      '<span class="tok-keyword">frame</span> f(p: <span class="tok-name">Point</span>) ' +
        '<span class="tok-keyword">ret</span> <span class="tok-type">u64</span>',
    );
  });
});

describe("tutorial lesson text", () => {
  const lessons = readdirSync(TUTORIALS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      name,
      lesson: JSON.parse(readFileSync(resolve(TUTORIALS_DIR, name), "utf8")),
    }));

  test("renders every Markdown field without leaking table syntax", () => {
    expect(lessons.length).toBeGreaterThan(0);
    for (const { name, lesson } of lessons) {
      for (const section of lesson.sections) {
        for (const field of [
          "content",
          "instructions",
          "explanation",
          "hint",
          "note",
        ]) {
          const text = section[field];
          if (typeof text !== "string") continue;
          const html = md.render(text, { highlight: syntax.highlight });
          const outsideCode = html.replace(/<pre[\s\S]*?<\/pre>/g, "");
          expect({
            name,
            field,
            leaked: /(^|<br>|<p>)\s*\|/.test(outsideCode),
          }).toEqual({
            name,
            field,
            leaked: false,
          });
        }
      }
    }
  });
});
