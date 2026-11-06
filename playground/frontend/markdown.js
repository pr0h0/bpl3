/*
 * Markdown renderer for playground lesson text.
 *
 * Supports the subset lessons use: ATX headings, paragraphs (a single newline
 * is a line break), fenced code blocks, bullet and numbered lists with nesting,
 * block quotes, GitHub-style tables with column alignment, horizontal rules,
 * and inline code, bold, italic and links. All text is HTML-escaped; raw HTML
 * in the source is shown literally, and links only use http(s), mailto,
 * relative or fragment targets.
 */
(function (root) {
  "use strict";

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeUrl(url) {
    const trimmed = url.trim();
    if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
    return trimmed;
  }

  /** Render inline Markdown (code, emphasis, links) to HTML. */
  function renderInline(text) {
    const source = String(text ?? "");
    const codeSpans = [];
    // Code spans first so their contents are never treated as emphasis.
    let protectedText = source.replace(
      /(`+)([\s\S]*?[^`])\1(?!`)/g,
      (_, _ticks, body) => {
        codeSpans.push(
          `<code>${escapeHtml(body.replace(/^ (.*) $/, "$1"))}</code>`,
        );
        return `\u0000${codeSpans.length - 1}\u0000`;
      },
    );
    protectedText = escapeHtml(protectedText);
    protectedText = protectedText.replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (whole, label, url) => {
        const target = safeUrl(url.replace(/&amp;/g, "&"));
        if (target === null) return label;
        const external = /^(https?:|mailto:)/i.test(target);
        return `<a href="${escapeHtml(target)}"${external ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
      },
    );
    protectedText = protectedText
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
      .replace(/__(?=\S)([\s\S]*?\S)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, "$1<em>$2</em>")
      .replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, "$1<em>$2</em>");
    return protectedText.replace(
      /\u0000(\d+)\u0000/g,
      (_, index) => codeSpans[Number(index)],
    );
  }

  const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
  const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
  const RULE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
  const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
  const QUOTE = /^ {0,3}>\s?(.*)$/;
  const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

  function isBlank(line) {
    return line.trim() === "";
  }

  function splitRow(line) {
    let row = line.trim();
    if (row.startsWith("|")) row = row.slice(1);
    if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
    const cells = [];
    let cell = "";
    let inCode = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === "\\" && row[i + 1] === "|") {
        cell += "|";
        i++;
      } else if (ch === "`") {
        inCode = !inCode;
        cell += ch;
      } else if (ch === "|" && !inCode) {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    return cells;
  }

  function startsBlock(lines, i) {
    const line = lines[i];
    return (
      FENCE.test(line) ||
      HEADING.test(line) ||
      RULE.test(line) ||
      LIST_ITEM.test(line) ||
      QUOTE.test(line) ||
      isTableStart(lines, i)
    );
  }

  function isTableStart(lines, i) {
    return (
      lines[i].includes("|") &&
      i + 1 < lines.length &&
      lines[i + 1].includes("-") &&
      TABLE_SEPARATOR.test(lines[i + 1])
    );
  }

  function indentOf(line) {
    return line.length - line.trimStart().length;
  }

  function renderBlocks(lines, options) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) {
        i++;
        continue;
      }

      let match;
      if ((match = FENCE.exec(line))) {
        const fence = match[1];
        const lang = match[2].toLowerCase();
        const body = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith(fence)) {
          body.push(lines[i]);
          i++;
        }
        i++;
        const code = body.join("\n");
        const highlighted =
          (lang === "" || lang === "bpl") && options.highlight
            ? options.highlight(code)
            : escapeHtml(code);
        const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
        out.push(
          `<pre class="code-block"><code${langClass}>${highlighted}</code></pre>`,
        );
        continue;
      }

      if ((match = HEADING.exec(line))) {
        const level = Math.min(6, match[1].length + options.headingOffset);
        out.push(`<h${level}>${renderInline(match[2])}</h${level}>`);
        i++;
        continue;
      }

      if (RULE.test(line)) {
        out.push("<hr>");
        i++;
        continue;
      }

      if (isTableStart(lines, i)) {
        const header = splitRow(line);
        const align = splitRow(lines[i + 1]).map((cell) => {
          const left = cell.startsWith(":");
          const right = cell.endsWith(":");
          if (left && right) return "center";
          if (right) return "right";
          if (left) return "left";
          return "";
        });
        i += 2;
        const rows = [];
        while (
          i < lines.length &&
          !isBlank(lines[i]) &&
          lines[i].includes("|")
        ) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        const cell = (tag, text, column) => {
          const style = align[column]
            ? ` style="text-align: ${align[column]}"`
            : "";
          return `<${tag}${style}>${renderInline(text ?? "")}</${tag}>`;
        };
        const head = header
          .map((text, column) => cell("th", text, column))
          .join("");
        const body = rows
          .map(
            (row) =>
              `<tr>${header.map((_, column) => cell("td", row[column], column)).join("")}</tr>`,
          )
          .join("");
        out.push(
          `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
        );
        continue;
      }

      if (QUOTE.test(line)) {
        const body = [];
        while (i < lines.length && (match = QUOTE.exec(lines[i]))) {
          body.push(match[1]);
          i++;
        }
        out.push(`<blockquote>${renderBlocks(body, options)}</blockquote>`);
        continue;
      }

      if ((match = LIST_ITEM.exec(line))) {
        const baseIndent = match[1].length;
        const ordered = /\d/.test(match[2]);
        const start = ordered ? parseInt(match[2], 10) : 1;
        const items = [];
        let current = null;
        while (i < lines.length) {
          const next = lines[i];
          const item = LIST_ITEM.exec(next);
          if (
            item &&
            item[1].length === baseIndent &&
            /\d/.test(item[2]) === ordered
          ) {
            current = [item[3]];
            items.push(current);
            i++;
          } else if (isBlank(next)) {
            // A blank line continues the list only when indented content follows.
            const following = lines[i + 1];
            if (
              following !== undefined &&
              !isBlank(following) &&
              (indentOf(following) > baseIndent ||
                (LIST_ITEM.test(following) &&
                  indentOf(following) === baseIndent &&
                  /\d/.test(LIST_ITEM.exec(following)[2]) === ordered))
            ) {
              current.push("");
              i++;
            } else {
              break;
            }
          } else if (indentOf(next) > baseIndent) {
            current.push(next.slice(Math.min(indentOf(next), baseIndent + 2)));
            i++;
          } else if (!startsBlock(lines, i)) {
            // Lazy continuation of the item's paragraph.
            current.push(next.trim());
            i++;
          } else {
            break;
          }
        }
        const tag = ordered ? "ol" : "ul";
        const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
        const rendered = items
          .map((body) => {
            let html = renderBlocks(body, options);
            // Tight items (no blank lines) drop the paragraph around their text.
            if (!body.some(isBlank)) {
              html = html.replace(/^<p>([\s\S]*?)<\/p>/, "$1");
            }
            return `<li>${html}</li>`;
          })
          .join("");
        out.push(`<${tag}${startAttr}>${rendered}</${tag}>`);
        continue;
      }

      const paragraph = [];
      while (i < lines.length && !isBlank(lines[i])) {
        if (paragraph.length > 0 && startsBlock(lines, i)) break;
        paragraph.push(lines[i].trim());
        i++;
      }
      out.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
    }
    return out.join("");
  }

  /**
   * Render Markdown to HTML. `options.highlight(code)` returns escaped HTML for
   * untagged and `bpl` fences; `options.headingOffset` shifts heading levels so
   * lesson `##` headings nest under the page's section headings.
   */
  function render(text, options = {}) {
    const lines = String(text ?? "")
      .replace(/\r\n?/g, "\n")
      .split("\n");
    return renderBlocks(lines, {
      highlight: options.highlight,
      headingOffset: options.headingOffset ?? 0,
    });
  }

  root.BplMarkdown = { render, renderInline, escapeHtml };
})(globalThis);
