/**
 * Unified diffs for `bpl format --diff`.
 * Kept free of compiler imports so the format command stays light.
 */

type Edit = { kind: " " | "-" | "+"; line: string };

/** Marks a last line that has no `\n`: it differs from the same text with one. */
const NO_NEWLINE = "\u0000no-newline";

/** The lines of `text` without their `\n`; a last line without one is marked. */
function splitLines(text: string): string[] {
  if (text === "") return [];
  if (text.endsWith("\n")) return text.slice(0, -1).split("\n");
  const lines = text.split("\n");
  lines[lines.length - 1] += NO_NEWLINE;
  return lines;
}

/** Larger middles are shown as one replacement rather than diffed exactly. */
const MAX_DIFF_CELLS = 4_000_000;

/** The edit script turning `a` into `b`, using a longest common subsequence. */
function diffLines(a: string[], b: string[]): Edit[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const edits: Edit[] = a
    .slice(0, start)
    .map((line) => ({ kind: " ", line }) as Edit);
  const n = endA - start;
  const m = endB - start;
  if (n * m > MAX_DIFF_CELLS) {
    for (let i = start; i < endA; i++) edits.push({ kind: "-", line: a[i]! });
    for (let j = start; j < endB; j++) edits.push({ kind: "+", line: b[j]! });
  } else {
    // lengths[i][j]: LCS length of a[start+i..endA) and b[start+j..endB).
    const width = m + 1;
    const lengths = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lengths[i * width + j] =
          a[start + i] === b[start + j]
            ? lengths[(i + 1) * width + j + 1]! + 1
            : Math.max(
                lengths[(i + 1) * width + j]!,
                lengths[i * width + j + 1]!,
              );
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) {
        edits.push({ kind: " ", line: a[start + i]! });
        i++;
        j++;
      } else if (
        j < m &&
        (i === n || lengths[i * width + j + 1]! > lengths[(i + 1) * width + j]!)
      ) {
        edits.push({ kind: "+", line: b[start + j]! });
        j++;
      } else {
        edits.push({ kind: "-", line: a[start + i]! });
        i++;
      }
    }
  }
  for (let k = endA; k < a.length; k++) edits.push({ kind: " ", line: a[k]! });
  return edits;
}

/**
 * A unified diff (3 lines of context) from `before` to `after`, labelled with
 * `path`, or "" when they are equal. A missing final newline is marked with
 * `\ No newline at end of file`, as `diff -u` does.
 */
export function unifiedDiff(
  path: string,
  before: string,
  after: string,
): string {
  if (before === after) return "";
  const edits = diffLines(splitLines(before), splitLines(after));
  const context = 3;
  const output = [`--- ${path}`, `+++ ${path} (formatted)`];
  let index = 0;
  while (index < edits.length) {
    if (edits[index]!.kind === " ") {
      index++;
      continue;
    }
    // A hunk runs until more than 2 * context unchanged lines separate changes.
    const hunkStart = Math.max(0, index - context);
    let lastChange = index;
    let scan = index;
    while (scan < edits.length && scan - lastChange <= 2 * context) {
      if (edits[scan]!.kind !== " ") lastChange = scan;
      scan++;
    }
    const hunkEnd = Math.min(edits.length, lastChange + context + 1);
    let oldLine = 1;
    let newLine = 1;
    for (let k = 0; k < hunkStart; k++) {
      if (edits[k]!.kind !== "+") oldLine++;
      if (edits[k]!.kind !== "-") newLine++;
    }
    let oldCount = 0;
    let newCount = 0;
    const body: string[] = [];
    for (let k = hunkStart; k < hunkEnd; k++) {
      const edit = edits[k]!;
      if (edit.kind !== "+") oldCount++;
      if (edit.kind !== "-") newCount++;
      if (edit.line.endsWith(NO_NEWLINE)) {
        body.push(
          `${edit.kind}${edit.line.slice(0, -NO_NEWLINE.length)}`,
          "\\ No newline at end of file",
        );
      } else {
        body.push(`${edit.kind}${edit.line}`);
      }
    }
    const oldStart = oldCount === 0 ? oldLine - 1 : oldLine;
    const newStart = newCount === 0 ? newLine - 1 : newLine;
    output.push(
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      ...body,
    );
    index = hunkEnd;
  }
  return output.join("\n") + "\n";
}
