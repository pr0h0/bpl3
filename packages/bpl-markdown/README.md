# bpl-markdown

Renders Markdown to HTML that is safe to embed in a page: raw HTML in the
source is escaped, and links or images with schemes other than `http`,
`https` and `mailto` are replaced with `#`. Use it for comments, task
descriptions, READMEs and other user-written text.

```bpl
import [Markdown], [MarkdownOptions] from "bpl-markdown";
import [String] from "std/string.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    local options: MarkdownOptions = MarkdownOptions.defaults();
    options.heading_ids = true;
    options.nofollow = true;
    local html: String = Markdown.render("# Notes\n\n- **Due** Friday\n- see [the brief](https://example.org)\n", &options);
    printf("%s", html.data);
    html.destroy();
    return 0;
}
```

`Markdown.toHtml(text)` renders with the defaults; `Markdown.render(text,
&options)` takes `MarkdownOptions`: `heading_ids` adds `id` slugs (lowercase
ASCII letters and digits joined by `-`, or `section`) to headings,
`nofollow` adds `rel="nofollow noopener"` to links, and `max_depth` (1 to 64,
default 16) limits how deeply block quotes and lists nest; deeper content is
rendered as a paragraph. Both return an owned `String`.

## Supported syntax

The output follows CommonMark for the constructs below and is tested against
a reference CommonMark/GFM renderer.

- Blocks: ATX (`#` to `######`) and setext (`===` / `---`) headings,
  paragraphs, thematic breaks (`***`, `---`, `___`), fenced code blocks with
  backticks or tildes and an info string (`class="language-js"`), indented
  code blocks, block quotes with lazy continuation, bullet lists (`-`, `*`,
  `+`) and ordered lists (`1.` / `1)`, with `start`), nested and loose or
  tight, and GFM tables with column alignment and escaped `\|`.
- Inline: emphasis and strong emphasis with `*` and `_` (intraword `_` stays
  literal), `~~strikethrough~~` (rendered as `<del>`), code spans with any
  backtick run, links `[text](https://example.org "title")` including `<...>` destinations,
  images `![alt](https://example.org/a.png "title")`, autolinks `<https://...>` and
  `<user@example.org>`, backslash escapes, hard line breaks (two trailing
  spaces or a trailing backslash), and entity references, which are passed
  through unchanged.

Not supported: raw HTML (always escaped), reference-style links and link
reference definitions, footnotes, task-list checkboxes, bare-URL autolinking
and smart punctuation. Entity references are kept as written rather than
decoded; browsers display them the same way.

## Safety and limits

- Every `<`, `>`, `&` (except entity references) and `"` from the source is
  escaped, so the output cannot contain tags or attributes the renderer did
  not write.
- A URL with a scheme is kept only for `http`, `https` and `mailto`
  (case-insensitive); `javascript:`, `data:`, `vbscript:` and every other
  scheme become `#`. Destinations containing control characters (which
  browsers strip, hiding a scheme) are rejected too. Relative URLs and
  fragments are kept; spaces are written as `%20`.
- Delimiter, bracket and backtick searches share a fixed work budget per
  render and inline nesting is capped at 64 levels, so adversarial input
  (thousands of unmatched `*` or `[`) renders in linear-ish time; past the
  budget, unmatched-looking syntax is rendered literally.
- Input bytes are copied through, so UTF-8 text is preserved. Line endings may
  be LF or CRLF.

Sanitizing Markdown is not the same as authorizing it: links still point
wherever the author chose, so use `nofollow` for untrusted content and keep a
Content-Security-Policy on pages that show it.
