# BPL3 VS Code Extension

This extension provides comprehensive language support for the BPL3 programming language, including syntax highlighting, code completion, and advanced navigation features.

## Features

- **Syntax Highlighting**:
  - Full highlighting for keywords, control flow, types, and literals.
  - Distinct colors for variable declarations (`local`, `global`) and function definitions.
  - Support for BPL3 specific constructs like `frame`, `struct`, `enum`, `import`, and `asm` blocks.
  - **NEW**: Enhanced enum support with variant highlighting (`EnumType.Variant`).
  - **NEW**: Pattern guard syntax highlighting for conditional pattern matching.
  - **NEW**: Type-parameterized match syntax (`match<Type>(value)`).

- **IntelliSense & Tooltips**:
  - **Hover Information**: View full signatures for functions, structs, enums, and specs by hovering over them.
  - **Spec Tooltips**: Hover over spec (interface) definitions to see all method signatures and implementation relationships.
  - **Enum Tooltips**: Hover over enum variants to see their signatures and payload types (unit, tuple, or struct variants).
  - **Method Implementation Info**: When hovering over methods, see which spec (interface) they implement.
  - **Member Access**: Hover over object properties (e.g., `obj.field`) to see the field's type and definition.
  - **Keyword Documentation**: Explanations for standard BPL3 keywords and built-in types.
  - **Cross-File Support**: Tooltips work for imported symbols across multiple files.

- **Navigation**:
  - **Go to Definition**: Jump to the definition of symbols (functions, structs, enums, variables) within the current file or across imported files.
  - **Import Resolution**: Click on import paths to open the referenced file.

- **Code Completion**:
  - **Keyword & Type Suggestions**: Autocomplete for keywords (`if`, `loop`, `struct`, `enum`, `match`, etc.) and built-in types (`int`, `bool`, `string`, etc.).
  - **Member Access Completion**: Type-aware autocompletion for struct fields and methods (e.g., `user.` shows `getName`, `age`, etc.).
  - **Partial Text Filtering**: Smart filtering as you type (e.g., `user.getNa` filters to `getName`).
  - **Imported Symbol Completion**: Full support for both bracketed (`import [App] from "bpl-express"`) and bare function imports (`import sprintf, strcpy from "bpl-express"`).
  - **In-Memory Document Support**: Completions work on unsaved files with real-time parsing.
  - **Global Symbol Search**: Re-exported symbols from packages are properly resolved.
  - **Generic Type Support**: Completions for generic types like `Array<int>.` showing all methods.
  - **Enum Variants**: Type `EnumName.` to see all variants.

- **Inlay Hints**:
  - **Parameter Names**: See parameter names inline in function calls: `calculate(→base: 10, →power: 2)`.
  - **Return Types**: View inferred return types for complex expressions.
  - **Type Parameters**: See generic type arguments in instantiations.

## Installation

### Option 1: Automatic Installation (Recommended)

We provide a helper script that handles dependency installation, compilation, packaging, and installation into VS Code.

1. Navigate to the extension directory:

   ```bash
   cd vscode-ext
   ```

2. Run the install script:

   ```bash
   ./install.sh
   ```

   Follow the prompt (type `y`) to install the extension immediately.

### Option 2: Manual Installation

If you prefer to build and install manually:

1. **Install Dependencies**:

   ```bash
   cd vscode-ext
   npm install
   ```

2. **Compile**:

   ```bash
   npm run compile
   ```

3. **Package**:
   Generate the `.vsix` file:

   ```bash
   npx @vscode/vsce package
   ```

4. **Install**:
   Install the generated `.vsix` file using the VS Code CLI:
   ```bash
   code --install-extension bpl3-vscode-0.0.1.vsix
   ```
   _(Note: The version number `0.0.1` may vary)_

## Development Setup

To contribute or debug the extension:

1. Open the `vscode-ext` folder in VS Code.
2. Run `npm install`.
3. Press `F5` to launch a new **Extension Development Host** window with the extension loaded.
4. Open a `.bpl` file in the new window to test features.

Set `BPL_LSP_DEBUG=1` before launching the extension or test process to enable
verbose internal language-server traces such as symbol-index import resolution.
These traces are disabled by default so normal editor sessions and CI logs only
show warnings and errors.

### Running Tests

The extension has a comprehensive test suite. From the repository root, run:

```bash
npm run compile:test --prefix vscode-ext
npm test --prefix vscode-ext
npm run compile --prefix vscode-ext
```

`npm run compile:test --prefix vscode-ext` type-checks `src/test` under strict
settings. `npm test --prefix vscode-ext` runs that type-check first and then
executes the Bun language-server tests. `npm run compile --prefix vscode-ext`
checks the production extension build used for packaging.

VS Code type-check failures map to these same focused commands in `bun run
ci:triage`, including missing `vscode-languageserver-textdocument` declarations
and implicit-any diagnostics in extension tests.

When already inside `vscode-ext/`, run `npm test` for the same type-check plus
Bun test path.

Tests cover:

- ✅ Member access completions (`user.`, `loopVar.`)
- ✅ Partial text filtering (`user.getNa`)
- ✅ Method snippet generation (omitting `this` parameter)
- ✅ Enum variant completions (`Status.Active`)
- ✅ General symbol completions
- ✅ Hover information
- ✅ Go-to-definition navigation
- ✅ Generic type completions (`Array<int>.`)
- ✅ Chained member access
- ✅ Nested scope handling

Run `npm test` in `vscode-ext/` for the current pass count.

## Structure

- `package.json`: Extension manifest and configuration.
- `language-configuration.json`: Language configuration (comments, brackets, auto-closing).
- `syntaxes/bpl.tmLanguage.json`: TextMate grammar for syntax highlighting.
- `src/extension.ts`: LSP Client entry point.
- `src/server.ts`: LSP Server implementation (handles hover, definition, completion).
