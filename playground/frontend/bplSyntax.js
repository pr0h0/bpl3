/*
 * BPL syntax support shared by the playground pages: the Monaco language
 * definition and a static highlighter for read-only code blocks.
 *
 * Keywords follow rule R-LEX-3 in docs/LANGUAGE_SPEC.md; `defer` is a
 * contextual statement keyword and is highlighted as one.
 */
(function (root) {
  "use strict";

  const KEYWORDS = [
    "global",
    "local",
    "const",
    "type",
    "frame",
    "static",
    "ret",
    "struct",
    "enum",
    "spec",
    "Self",
    "import",
    "from",
    "as",
    "export",
    "extern",
    "asm",
    "loop",
    "if",
    "else",
    "break",
    "continue",
    "try",
    "catch",
    "return",
    "throw",
    "switch",
    "case",
    "default",
    "fallthrough",
    "cast",
    "sizeof",
    "typeof",
    "offsetof",
    "match",
    "is",
    "Func",
    "Lambda",
    "null",
    "nullptr",
    "true",
    "false",
    "defer",
  ];

  const TYPES = [
    "int",
    "uint",
    "short",
    "ushort",
    "long",
    "ulong",
    "i8",
    "i16",
    "i32",
    "i64",
    "u8",
    "u16",
    "u32",
    "u64",
    "float",
    "double",
    "f32",
    "f64",
    "bool",
    "char",
    "uchar",
    "void",
    "string",
  ];

  const KEYWORD_SET = new Set(KEYWORDS);
  const TYPE_SET = new Set(TYPES);

  /** Monarch tokenizer definition for Monaco. */
  function monarchLanguage() {
    return {
      keywords: KEYWORDS,
      typeKeywords: TYPES,
      symbols: /[=><!~?:&|+\-*\/^%]+/,
      escapes: /\\(?:[ntr0\\'"]|x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4})/,
      tokenizer: {
        root: [
          [/\/#/, "comment", "@blockComment"],
          [/#.*$/, "comment"],
          [
            /[A-Za-z_][\w]*/,
            {
              cases: {
                "@keywords": "keyword",
                "@typeKeywords": "type",
                "[A-Z][\\w]*": "type.identifier",
                "@default": "identifier",
              },
            },
          ],
          [/0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+/, "number"],
          [/\d[\d_]*\.\d[\d_]*/, "number.float"],
          [/\d[\d_]*/, "number"],
          [/"/, "string", "@string"],
          [/`/, "string", "@template"],
          [/'(?:[^'\\]|\\.)*'/, "string"],
          [/[{}()[\]]/, "@brackets"],
          [/@symbols/, "operator"],
          [/[;,.]/, "delimiter"],
        ],
        blockComment: [
          [/\/#/, "comment", "@push"],
          [/#\//, "comment", "@pop"],
          [/[^/#]+/, "comment"],
          [/[/#]/, "comment"],
        ],
        string: [
          [/[^\\"]+/, "string"],
          [/@escapes/, "string.escape"],
          [/\\./, "string.escape.invalid"],
          [/"/, "string", "@pop"],
        ],
        template: [
          [/\$\{/, "delimiter.bracket", "@interpolation"],
          [/[^\\`$]+/, "string"],
          [/@escapes/, "string.escape"],
          [/\\./, "string.escape.invalid"],
          [/\$/, "string"],
          [/`/, "string", "@pop"],
        ],
        interpolation: [
          [/\}/, "delimiter.bracket", "@pop"],
          { include: "root" },
        ],
      },
    };
  }

  let monacoRegistered = false;
  /** Register the language and light/dark themes with a loaded Monaco. */
  function registerMonaco(monaco) {
    if (monacoRegistered) return;
    monacoRegistered = true;
    monaco.languages.register({ id: "bpl" });
    monaco.languages.setMonarchTokensProvider("bpl", monarchLanguage());
    monaco.languages.setLanguageConfiguration("bpl", {
      comments: { lineComment: "#", blockComment: ["/#", "#/"] },
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"],
      ],
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"', notIn: ["string", "comment"] },
      ],
    });
  }

  /** Monaco theme name matching the page's current color scheme. */
  function monacoTheme() {
    const doc = root.document;
    const explicit = doc?.documentElement?.dataset?.theme;
    if (explicit === "dark") return "vs-dark";
    if (explicit === "light") return "vs";
    const dark = root.matchMedia?.("(prefers-color-scheme: dark)").matches;
    return dark ? "vs-dark" : "vs";
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function span(kind, text) {
    return `<span class="tok-${kind}">${escapeHtml(text)}</span>`;
  }

  /** Length of a nested `/# ... #/` comment starting at `start`. */
  function blockCommentEnd(code, start) {
    let depth = 0;
    let i = start;
    while (i < code.length) {
      if (code.startsWith("/#", i)) {
        depth++;
        i += 2;
      } else if (code.startsWith("#/", i)) {
        depth--;
        i += 2;
        if (depth === 0) return i;
      } else {
        i++;
      }
    }
    return code.length;
  }

  function quotedEnd(code, start, quote) {
    let i = start + 1;
    while (i < code.length && code[i] !== quote && code[i] !== "\n") {
      i += code[i] === "\\" ? 2 : 1;
    }
    return Math.min(code.length, i + 1);
  }

  /** Escaped HTML for `code` with `tok-*` spans around recognized tokens. */
  function highlight(code) {
    const source = String(code ?? "");
    let html = "";
    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      const rest = source.slice(i);
      let match;
      if (source.startsWith("/#", i)) {
        const end = blockCommentEnd(source, i);
        html += span("comment", source.slice(i, end));
        i = end;
      } else if (ch === "#") {
        const newline = source.indexOf("\n", i);
        const end = newline === -1 ? source.length : newline;
        html += span("comment", source.slice(i, end));
        i = end;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        const end = quotedEnd(source, i, ch);
        html += span("string", source.slice(i, end));
        i = end;
      } else if ((match = /^[A-Za-z_]\w*/.exec(rest))) {
        const word = match[0];
        if (KEYWORD_SET.has(word)) html += span("keyword", word);
        else if (TYPE_SET.has(word)) html += span("type", word);
        else if (/^[A-Z]/.test(word)) html += span("name", word);
        else html += escapeHtml(word);
        i += word.length;
      } else if (
        (match =
          /^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+|\d[\d_]*(?:\.\d[\d_]*)?)/.exec(
            rest,
          ))
      ) {
        html += span("number", match[0]);
        i += match[0].length;
      } else {
        html += escapeHtml(ch);
        i++;
      }
    }
    return html;
  }

  root.BplSyntax = {
    KEYWORDS,
    TYPES,
    monarchLanguage,
    registerMonaco,
    monacoTheme,
    highlight,
    escapeHtml,
  };
})(globalThis);
