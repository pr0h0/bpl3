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

## Project configuration

Place a `.bplfmt.json` file beside your sources or in a parent directory:

```json
{
  "indentWidth": 4,
  "useTabs": false,
  "lineEnding": "lf"
}
```

For each input file, the command searches upward from that file's directory.
The closest configuration wins; parent configurations are not merged. Omitted
settings use the language defaults. JSON must contain only the settings above
and optional string `$schema` metadata. Malformed JSON, unknown settings and
invalid values are reported as processing errors before that file is written.

Command flags override project settings:

```bash
bpl format --indent-width 2 --line-ending crlf src/main.bpl
bpl format --use-tabs src/main.bpl
bpl format --no-use-tabs src/main.bpl
bpl format --config ./config/format.json src/main.bpl
bpl format --no-config src/main.bpl
```

An explicit config path is relative to the working directory and replaces
configuration discovery. `bpl build --emit formatted` and the default compile
command with `--emit formatted` also discover project configuration; use the
`format` command for explicit configuration and style overrides.
`--no-config` selects the language defaults before any
explicit style flags. These preferences also apply to `--write`, `--check` and
`--check --json`. Configuration is JSON data; it does not execute scripts.

## Editor formatting

VS Code's Format Document uses the current buffer, including unsaved changes.
For file documents, the nearest `.bplfmt.json` selects the complete style, with
language defaults for omitted settings. Without a project config, editor tab
size and insert-spaces preferences control indentation. The extension defaults
BPL files to four spaces. Unsaved and virtual documents use editor preferences
without attempting filesystem configuration discovery. Invalid syntax or config
leaves the buffer unchanged and logs the formatting error in the language server.

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
