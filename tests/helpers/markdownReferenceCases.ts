// Generated from markdown-it (commonmark preset with tables and strikethrough,
// raw HTML disabled) and checked against bpl-markdown; <s> is spelled <del>
// and entity references are passed through rather than decoded.
export const MARKDOWN_REFERENCE_CASES: [string, string][] = [
  [
    "- a\n\n- b\n",
    "<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>\n",
  ],
  [
    "- a\n- b\n\n  para in b\n",
    "<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n<p>para in b</p>\n</li>\n</ul>\n",
  ],
  ["Title\n=====\n\nSub\n---\n", "<h1>Title</h1>\n<h2>Sub</h2>\n"],
  [
    "***both*** and **bold *nested* here**\n",
    "<p><em><strong>both</strong></em> and <strong>bold <em>nested</em> here</strong></p>\n",
  ],
  [
    "snake_case_word and _em_ and __strong__\n",
    "<p>snake_case_word and <em>em</em> and <strong>strong</strong></p>\n",
  ],
  [
    "`` code with ` tick `` and ` x `\n",
    "<p><code>code with ` tick</code> and <code>x</code></p>\n",
  ],
  ["\\*not em\\* and \\# not heading\n", "<p>*not em* and # not heading</p>\n"],
  [
    "<https://example.org/a?b=1> and <me@example.org>\n",
    '<p><a href="https://example.org/a?b=1">https://example.org/a?b=1</a> and <a href="mailto:me@example.org">me@example.org</a></p>\n',
  ],
  [
    "    indented code\n    line2\n\nafter\n",
    "<pre><code>indented code\nline2\n</code></pre>\n<p>after</p>\n",
  ],
  [
    "> quote\n> > nested\n> back\n",
    "<blockquote>\n<p>quote</p>\n<blockquote>\n<p>nested\nback</p>\n</blockquote>\n</blockquote>\n",
  ],
  [
    "3. three\n4. four\n",
    '<ol start="3">\n<li>three</li>\n<li>four</li>\n</ol>\n',
  ],
  [
    "* a\n  * b\n    * c\n",
    "<ul>\n<li>a\n<ul>\n<li>b\n<ul>\n<li>c</li>\n</ul>\n</li>\n</ul>\n</li>\n</ul>\n",
  ],
  ["1) x\n2) y\n", "<ol>\n<li>x</li>\n<li>y</li>\n</ol>\n"],
  [
    "para\n- list after para\n",
    "<p>para</p>\n<ul>\n<li>list after para</li>\n</ul>\n",
  ],
  ["para\n2. not a list\n", "<p>para\n2. not a list</p>\n"],
  ["~~gone~~ and ~single~\n", "<p><del>gone</del> and ~single~</p>\n"],
  ["a  \nb\\\nc\n", "<p>a<br />\nb<br />\nc</p>\n"],
  [
    '[link *em*](/path "t") [no target] [x](</with space>)\n',
    '<p><a href="/path" title="t">link <em>em</em></a> [no target] <a href="/with%20space">x</a></p>\n',
  ],
  [
    '![alt *x*](/i.png "T")\n',
    '<p><img src="/i.png" alt="alt x" title="T" /></p>\n',
  ],
  [
    "# H1\n## H2 ##\n###### H6\n####### seven\n#nospace\n",
    "<h1>H1</h1>\n<h2>H2</h2>\n<h6>H6</h6>\n<p>####### seven\n#nospace</p>\n",
  ],
  ["***\n---\n___\n- - -\n", "<hr />\n<hr />\n<hr />\n<hr />\n"],
  ["```\nunclosed\nfence\n", "<pre><code>unclosed\nfence\n</code></pre>\n"],
  [
    "~~~ python extra\nx\n~~~\n",
    '<pre><code class="language-python">x\n</code></pre>\n',
  ],
  [
    "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 |\n",
    "<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n<td>2</td>\n</tr>\n<tr>\n<td>3</td>\n<td></td>\n</tr>\n</tbody>\n</table>\n",
  ],
  [
    "a | b\n--|--\nc | d\n",
    "<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>c</td>\n<td>d</td>\n</tr>\n</tbody>\n</table>\n",
  ],
  [
    "&copy; &#169; &#xA9; & AT&T\n",
    "<p>&copy; &#169; &#xA9; &amp; AT&amp;T</p>\n",
  ],
  ["*a **b** c*\n", "<p><em>a <strong>b</strong> c</em></p>\n"],
  ["**a** **b**\n", "<p><strong>a</strong> <strong>b</strong></p>\n"],
  ["-\n- x\n", "<ul>\n<li></li>\n<li>x</li>\n</ul>\n"],
  [
    "- a\n\n\n- b\n",
    "<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>\n",
  ],
  [
    "1. a\n\n   b\n2. c\n",
    "<ol>\n<li>\n<p>a</p>\n<p>b</p>\n</li>\n<li>\n<p>c</p>\n</li>\n</ol>\n",
  ],
  [
    "text\n\n```\ncode\n```\ntext\n",
    "<p>text</p>\n<pre><code>code\n</code></pre>\n<p>text</p>\n",
  ],
  [
    "> a\nlazy\n\nnot\n",
    "<blockquote>\n<p>a\nlazy</p>\n</blockquote>\n<p>not</p>\n",
  ],
  ["*foo*bar and foo*bar*\n", "<p><em>foo</em>bar and foo<em>bar</em></p>\n"],
  ["\ttab code\n", "<pre><code>tab code\n</code></pre>\n"],
  ["- a\n    - b\n", "<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>\n"],
  ["x <b>raw</b> y\n", "<p>x &lt;b&gt;raw&lt;/b&gt; y</p>\n"],
];
