# Code Formatting

BPL provides a built-in source formatter:

```bash
bpl format src/main.bpl
bpl format --write src/main.bpl
bpl format --check src/main.bpl
bpl format --check --json src/main.bpl
```

The default command prints formatted source. `--write` updates files atomically;
`--check` reports files that need formatting without changing them and exits
nonzero if any file differs or cannot be processed. JSON output is supported
with `--check`. `--write` and `--check` cannot be combined.

## Language style

- Indentation: four spaces.
- Braces: opening brace on the same line as the declaration or control statement.
- Comment-bearing multiline lists use one additional indentation level, with
  their closing delimiter aligned with the containing statement.
- Formatting produces one final newline and preserves section spacing around
  comments, capped at one blank line.

```bpl
frame add(
    left: int, # First operand.
    right: int
) ret int {
    return left + right;
}
```

## Comments

Comments are placed using their surrounding code tokens. A trailing field or
statement comment stays on its code line; parameter, argument, tuple, array and
initializer comments remain inside their original container. Nested block
comments remain intact. Multiline block comments are reindented while retaining their relative visual
alignment where possible.

Formatting the result again must produce the same text. The regression suite
checks the repository source corpus for comment preservation, parse equivalence
and repeated-formatting stability; known sources that already fail parsing are
listed separately and are not counted as formatter passes.

A comment inside an interpolated string expression preserves that literal's
original spelling and layout, including the commented expression. The formatter
does not relocate it outside the string.

## Formatter API

`Formatter.format(program)` uses original source retained for programs returned
by `Parser.parse()`. This provenance is held outside the AST and is not part of
serialized output. For copied, serialized or manually constructed ASTs containing
comments, supply the original text explicitly:

```typescript
const formatted = new Formatter().format(program, originalSource);
```

Formatting a detached AST with comments and no source raises an error. If source
and AST differ too much to align comments reliably, formatting also raises an
error. The CLI leaves that file unchanged and reports the processing failure.

The API accepts optional preferences when constructing a formatter:

```typescript
const formatter = new Formatter({
    indentWidth: 2,
    useTabs: false,
    lineEnding: "lf",
});
const formatted = formatter.format(program, originalSource);
```

`indentWidth` is an integer from 1 to 16 (default 4). `useTabs` defaults to false;
when true, one tab represents each indentation level and `indentWidth` supplies
the visual tab width for comment alignment. `lineEnding` accepts `lf` (default)
or `crlf`. Line-ending conversion applies to layout and comments, preserving
literal payloads. Unknown option names and invalid values are errors.
