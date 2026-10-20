import { Token } from "../frontend/Token";
import { TokenType } from "../frontend/TokenType";
import { lexWithGrammar } from "../frontend/GrammarLexer";

interface PositionedToken {
  token: Token;
  start: number;
  end: number;
}

function hasBlankLine(text: string): boolean {
  // The standalone CR branch must not split one CRLF into two newlines.
  return /(?:\r\n|\r(?!\n)|\n)[\t ]*(?:\r\n|\r(?!\n)|\n)/.test(text);
}

function lineOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) {
    // Treat CRLF as one newline, while retaining original UTF-16 offsets.
    if (source[i] === "\n" || (source[i] === "\r" && source[i + 1] !== "\n"))
      offsets.push(i + 1);
  }
  return offsets;
}

function positionedTokens(source: string, file: string): PositionedToken[] {
  const offsets = lineOffsets(source);
  return lexWithGrammar(source, file)
    .filter(
      (token) =>
        token.type !== TokenType.Comment && token.type !== TokenType.EOF,
    )
    .flatMap((token) => {
      const start = offsets[token.line - 1]! + token.column - 1;
      // Generic closing brackets can share a lexer token with another bracket
      // or assignment. Give each character a boundary without changing output.
      if (
        token.type === TokenType.GreaterGreater ||
        token.type === TokenType.GreaterEqual
      ) {
        return [...token.lexeme].map((character, index) => ({
          token: new Token(
            character === ">" ? TokenType.Greater : TokenType.Equal,
            character,
            null,
            token.line,
            token.column + index,
            token.file,
          ),
          start: start + index,
          end: start + index + 1,
        }));
      }
      return [{ token, start, end: start + token.lexeme.length }];
    });
}

function tokenKey(token: PositionedToken): string {
  // Comment-bearing interpolation tokens retain their original source below.
  // The AST printer otherwise normalizes escapes/expressions inside them.
  if (
    token.token.type === TokenType.StringLiteral &&
    typeof token.token.literal === "string"
  )
    return `${token.token.type}:${JSON.stringify(token.token.literal)}`;
  return token.token.type === TokenType.InterpolatedStringLiteral
    ? token.token.type
    : `${token.token.type}:${token.token.lexeme}`;
}

/** Align tokens through punctuation/void normalization without matching trivia. */
function alignSegment(before: string[], after: string[]): Map<number, number> {
  const trace: Map<number, number>[] = [];
  let frontier = new Map<number, number>([[1, 0]]);
  // Bound work for modified/non-equivalent ASTs instead of guessing locations.
  const limit = Math.min(before.length + after.length, 1024);
  for (let distance = 0; distance <= limit; distance++) {
    trace.push(frontier);
    const next = new Map<number, number>();
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down =
        diagonal === -distance ||
        (diagonal !== distance &&
          (frontier.get(diagonal - 1) ?? -1) <
            (frontier.get(diagonal + 1) ?? -1));
      let x = down
        ? (frontier.get(diagonal + 1) ?? 0)
        : (frontier.get(diagonal - 1) ?? 0) + 1;
      let y = x - diagonal;
      while (x < before.length && y < after.length && before[x] === after[y]) {
        x++;
        y++;
      }
      next.set(diagonal, x);
      if (x >= before.length && y >= after.length) {
        const matches = new Map<number, number>();
        for (let d = distance; d >= 0; d--) {
          const previous = trace[d]!;
          const k = x - y;
          const cameDown =
            k === -d ||
            (k !== d &&
              (previous.get(k - 1) ?? -1) < (previous.get(k + 1) ?? -1));
          const previousK = cameDown ? k + 1 : k - 1;
          const previousX = previous.get(previousK) ?? 0;
          const previousY = previousX - previousK;
          while (x > previousX && y > previousY) {
            matches.set(--x, --y);
          }
          x = previousX;
          y = previousY;
        }
        return matches;
      }
    }
    frontier = next;
  }
  throw new Error(
    "Cannot preserve formatter comment positions: source and AST differ too much.",
  );
}

/** Stable unique-token anchors split generated/large files into small diffs. */
function alignTokens(
  original: PositionedToken[],
  formatted: PositionedToken[],
): Map<number, number> {
  const before = original.map(tokenKey);
  const after = formatted.map(tokenKey);
  if (before.length + after.length < 4096) return alignSegment(before, after);
  const unique = (keys: string[]) => {
    const result = new Map<string, number>();
    for (let i = 0; i < keys.length; i++)
      result.set(keys[i]!, result.has(keys[i]!) ? -1 : i);
    return result;
  };
  const left = unique(before);
  const right = unique(after);
  const candidates: Array<[number, number]> = [];
  for (let i = 0; i < before.length; i++) {
    const target = right.get(before[i]!);
    if (left.get(before[i]!) === i && target !== undefined && target >= 0)
      candidates.push([i, target]);
  }
  const tails: number[] = [];
  const previous = new Array<number>(candidates.length).fill(-1);
  for (let i = 0; i < candidates.length; i++) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (candidates[tails[middle]!]![1] < candidates[i]![1]) low = middle + 1;
      else high = middle;
    }
    previous[i] = low > 0 ? tails[low - 1]! : -1;
    tails[low] = i;
  }
  const anchors: Array<[number, number]> = [];
  for (let index = tails.at(-1) ?? -1; index >= 0; index = previous[index]!)
    anchors.push(candidates[index]!);
  anchors.reverse();
  anchors.push([before.length, after.length]);
  const mapping = new Map<number, number>();
  let sourceStart = 0;
  let targetStart = 0;
  for (const [sourceEnd, targetEnd] of anchors) {
    if (sourceEnd > sourceStart && targetEnd > targetStart) {
      for (const [source, target] of alignSegment(
        before.slice(sourceStart, sourceEnd),
        after.slice(targetStart, targetEnd),
      ))
        mapping.set(sourceStart + source, targetStart + target);
    }
    if (sourceEnd < before.length) mapping.set(sourceEnd, targetEnd);
    sourceStart = sourceEnd + 1;
    targetStart = targetEnd + 1;
  }
  return mapping;
}

interface SourceComment {
  token: Token;
  start: number;
  end: number;
  nextToken: number;
}

function indentationAt(source: string, position: number): string {
  const start = source.lastIndexOf("\n", position - 1) + 1;
  return source.slice(start, position).match(/^[\t ]*/)?.[0] ?? "";
}

function columns(text: string, tabWidth: number): number {
  let width = 0;
  for (const character of text)
    width += character === "\t" ? tabWidth - (width % tabWidth) : 1;
  return width;
}

function commentText(
  comment: SourceComment,
  source: string,
  output: string,
  indent: string,
  tabWidth: number,
): string {
  const lineStart =
    Math.max(
      source.lastIndexOf("\n", comment.start - 1),
      source.lastIndexOf("\r", comment.start - 1),
    ) + 1;
  const oldColumn = columns(source.slice(lineStart, comment.start), tabWidth);
  const newColumn = columns(
    output.slice(output.lastIndexOf("\n") + 1),
    tabWidth,
  );
  const shift = newColumn - oldColumn;
  return comment.token.lexeme
    .replace(/\r\n?|\n/g, "\n")
    .split("\n")
    .map((line, index) => {
      if (index === 0 || !line.trim()) return index === 0 ? line : "";
      const prefix = line.match(/^[\t ]*/)?.[0] ?? "";
      const width = Math.max(0, columns(prefix, tabWidth) + shift);
      const indentation =
        indent === "\t"
          ? "\t".repeat(Math.floor(width / tabWidth)) +
            " ".repeat(width % tabWidth)
          : " ".repeat(width);
      return indentation + line.slice(prefix.length);
    })
    .join("\n");
}

function commentLayout(
  source: string,
  formatted: string,
  tokens: PositionedToken[],
  groups: Map<number, SourceComment[]>,
  indent: string,
) {
  const matchingClose = new Map([
    [TokenType.LeftBrace, TokenType.RightBrace],
    [TokenType.LeftBracket, TokenType.RightBracket],
    [TokenType.LeftParen, TokenType.RightParen],
    [TokenType.Less, TokenType.Greater],
  ]);
  const stack: number[] = [];
  const container: Array<number | undefined> = [];
  const closeFor = new Map<number, number>();
  const openFor = new Map<number, number>();
  for (let i = 0; i < tokens.length; i++) {
    const type = tokens[i]!.token.type;
    container[i] = stack.at(-1);
    const start = stack.at(-1);
    if (
      start !== undefined &&
      matchingClose.get(tokens[start]!.token.type) === type
    ) {
      stack.pop();
      closeFor.set(start, i);
      openFor.set(i, start);
    } else if (
      matchingClose.has(type) &&
      // In the canonical printer, generic '<' is adjacent to its base;
      // comparisons and shifts always have surrounding spaces.
      (type !== TokenType.Less ||
        (i > 0 && tokens[i - 1]!.end === tokens[i]!.start))
    )
      stack.push(i);
  }
  const expanded = new Set<number>();
  for (const [gap, comments] of groups) {
    const start = container[gap];
    if (start === undefined) continue;
    const token = tokens[start]!;
    if (
      token.token.type === TokenType.LeftBrace &&
      /\n/.test(formatted.slice(token.end, tokens[start + 1]?.start))
    )
      continue;
    if (
      comments.some(
        (comment) =>
          !comment.token.lexeme.startsWith("/#") ||
          /[\r\n]/.test(comment.token.lexeme) ||
          /^[\t ]*$/.test(
            source.slice(
              Math.max(
                source.lastIndexOf("\n", comment.start - 1),
                source.lastIndexOf("\r", comment.start - 1),
              ) + 1,
              comment.start,
            ),
          ),
      )
    )
      expanded.add(start);
  }
  // A multiline child also expands enclosing inline lists/literals. Stop at
  // ordinary block bodies, whose indentation is already emitted by the AST.
  for (const start of [...expanded]) {
    let parent = container[start];
    while (parent !== undefined) {
      const token = tokens[parent]!;
      if (
        token.token.type === TokenType.LeftBrace &&
        /\n/.test(formatted.slice(token.end, tokens[parent + 1]?.start))
      )
        break;
      expanded.add(parent);
      parent = container[parent];
    }
  }
  const tokenIndents: string[] = [];
  const commentIndents: string[] = [];
  let extra = 0;
  for (let i = 0; i < tokens.length; i++) {
    const base = indentationAt(formatted, tokens[i]!.start);
    const closesExpanded = expanded.has(openFor.get(i) ?? -1);
    tokenIndents[i] = base + indent.repeat(extra - (closesExpanded ? 1 : 0));
    commentIndents[i] =
      base + indent.repeat(extra + (openFor.has(i) && !closesExpanded ? 1 : 0));
    if (closesExpanded) extra--;
    if (expanded.has(i)) extra++;
  }
  const lineGaps = new Set<number>();
  for (const start of expanded) {
    lineGaps.add(start + 1);
    const end = closeFor.get(start);
    if (end !== undefined) lineGaps.add(end);
  }
  for (let i = 0; i < tokens.length; i++) {
    if (
      tokens[i]!.token.type === TokenType.Comma &&
      expanded.has(container[i] ?? -1)
    )
      lineGaps.add(i + 1);
  }
  return { tokenIndents, commentIndents, lineGaps };
}

/** Insert comments at their original lexical boundaries in the formatted code. */
export function placeSourceComments(
  source: string,
  formatted: string,
  comments: readonly Token[],
  indent: string,
  tabWidth: number = 4,
): string {
  const file = comments[0]?.file ?? "format.bpl";
  const original = positionedTokens(source, file);
  const printed = positionedTokens(formatted, file);
  const mapping = alignTokens(original, printed);
  const offsets = lineOffsets(source);
  const groups = new Map<number, SourceComment[]>();
  const replacements = new Map<number, string>();
  let cursor = 0;
  const sorted = [...comments].sort(
    (a, b) => a.line - b.line || a.column - b.column,
  );
  for (const token of sorted) {
    const start = offsets[token.line - 1]! + token.column - 1;
    if (
      !Number.isInteger(start) ||
      source.slice(start, start + token.lexeme.length) !== token.lexeme
    ) {
      throw new Error(
        "Original source does not match the AST comment positions.",
      );
    }
    while (cursor < original.length && original[cursor]!.end <= start) cursor++;
    const comment = {
      token,
      start,
      end: start + token.lexeme.length,
      nextToken: cursor,
    };
    const containing = original[cursor];
    if (
      containing &&
      containing.start <= start &&
      containing.end >= comment.end
    ) {
      const target = mapping.get(cursor);
      if (target === undefined)
        throw new Error("Cannot preserve a comment inside a changed literal.");
      replacements.set(target, containing.token.lexeme);
      continue;
    }
    let next = cursor;
    while (next < original.length && !mapping.has(next)) next++;
    const target = mapping.get(next) ?? printed.length;
    const group = groups.get(target) ?? [];
    group.push(comment);
    groups.set(target, group);
  }

  const layout = commentLayout(source, formatted, printed, groups, indent);
  let output = "";
  let previousEnd = 0;
  for (let i = 0; i <= printed.length; i++) {
    const token = printed[i];
    let gap = formatted.slice(previousEnd, token?.start ?? formatted.length);
    const rightIndent = layout.tokenIndents[i] ?? "";
    if (layout.lineGaps.has(i)) gap = "\n" + rightIndent;
    else if (token && /\n/.test(gap)) gap = gap.replace(/[\t ]*$/, rightIndent);
    const group = groups.get(i);
    if (!group) output += gap;
    else {
      const commentIndent = layout.commentIndents[i] ?? "";
      for (let c = 0; c < group.length; c++) {
        const comment = group[c]!;
        const prior =
          c > 0
            ? group[c - 1]!.end
            : (original[comment.nextToken - 1]?.end ?? 0);
        const lineStart =
          Math.max(
            source.lastIndexOf("\n", comment.start - 1),
            source.lastIndexOf("\r", comment.start - 1),
          ) + 1;
        const inline =
          c > 0
            ? !/[\r\n]/.test(source.slice(prior, comment.start))
            : /\S/.test(source.slice(lineStart, comment.start));
        if (inline && output.length > 0) output += " ";
        else {
          if (output.length > 0 && !output.endsWith("\n")) output += "\n";
          if (
            output.length > 0 &&
            hasBlankLine(source.slice(prior, comment.start))
          )
            output += "\n";
          output += commentIndent;
        }
        output += commentText(comment, source, output, indent, tabWidth);
      }
      const last = group[group.length - 1]!;
      const lineComment = !last.token.lexeme.startsWith("/#");
      const nextOriginal = original[last.nextToken];
      const originalGap = source.slice(
        last.end,
        nextOriginal?.start ?? source.length,
      );
      const ownLine = /^[\t ]*$/.test(
        source.slice(
          Math.max(
            source.lastIndexOf("\n", last.start - 1),
            source.lastIndexOf("\r", last.start - 1),
          ) + 1,
          last.start,
        ),
      );
      if (
        lineComment ||
        ownLine ||
        /[\r\n]/.test(gap) ||
        /[\r\n]/.test(originalGap)
      ) {
        output += hasBlankLine(originalGap) && token ? "\n\n" : "\n";
        if (token) output += rightIndent;
      } else if (token) output += " ";
    }
    if (token) {
      output += replacements.get(i) ?? token.token.lexeme;
      previousEnd = token.end;
    }
  }
  return output.trimEnd() + "\n";
}

/** Change layout newlines without changing string/character literal payloads. */
export function formatLineEndings(
  source: string,
  ending: "lf" | "crlf",
): string {
  if (ending === "lf" && !source.includes("\r")) return source;
  const newline = ending === "crlf" ? "\r\n" : "\n";
  const normalize = (text: string) => text.replace(/\r\n|\r|\n/g, newline);
  let output = "";
  let previousEnd = 0;
  for (const token of positionedTokens(source, "formatted.bpl")) {
    output +=
      normalize(source.slice(previousEnd, token.start)) + token.token.lexeme;
    previousEnd = token.end;
  }
  return output + normalize(source.slice(previousEnd));
}
