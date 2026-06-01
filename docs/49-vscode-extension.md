# VS Code Extension

BPL has a comprehensive VS Code extension that provides full language server protocol (LSP) support, making development fast and productive.

## Features

### Syntax Highlighting

Advanced TextMate grammar with support for:

- **Keywords**: Control flow (`if`, `loop`, `match`), declarations (`struct`, `enum`, `frame`), modifiers (`export`, `extern`)
- **Types**: Built-in types (`int`, `bool`, `string`) and user-defined types
- **Comments**: Line comments (`#`) and block comments (`/#...#/`)
- **String Interpolation**: Embedded expressions with `${...}` syntax
- **Operators**: All arithmetic, comparison, logical, and bitwise operators
- **Literals**: Numbers (decimal, hex, binary, octal), booleans, strings

### IntelliSense & Code Completion

Smart, context-aware autocompletion powered by the compiler's type checker:

- **Member Access**: Type `user.` to see all methods and fields
- **Partial Matching**: Type `user.getNa` to filter to `getName`, `getAge`, etc.
- **Method Signatures**: See parameter names and types as snippets
- **Import Completions**: Autocomplete imported symbols from packages and stdlib
- **Import Path Completions**: Complete `std`, `std/string.bpl`, and nearby relative `.bpl` files while typing `from "..."`
- **Generic Types**: Full support for `Array<int>.` completions
- **Enum Variants**: Type `Status.` to see `Active`, `Inactive`, etc.
- **Keyword Suggestions**: All BPL keywords available in appropriate contexts

### Snippets

The extension ships snippets for common source shapes:

- `main`: executable entry point
- `frame`, `struct`, `enum`, `spec`: declarations
- `match`, `match-type`: value and type matching
- `package-main`: small exported package entry point
- `try`, `defer`, `throw`: error-handling and cleanup patterns

These snippets are intentionally source-level only. Shell workflows such as
`bpl doctor`, `bpl build --cache-stats`, and `bpl new --template library` remain
CLI commands rather than editor snippets.

### Hover Information

Rich tooltips with full type information:

- **Functions**: See full signatures with parameter names and return types
- **Structs**: View all fields and methods at a glance
- **Enums**: See all variants with their payload types
- **Specs (Interfaces)**: View method signatures and implementation relationships
- **Variables**: Hover to see inferred types
- **Methods**: See which spec/interface they implement
- **Cross-File Support**: Works across imports and packages

### Go to Definition

Jump to symbol definitions:

- **Local Symbols**: Functions, structs, enums, variables in the current file
- **Imported Symbols**: Navigate to definitions in imported modules
- **Stdlib Symbols**: Jump to standard library implementations
- **Package Symbols**: Navigate into installed packages
- **Clickable Imports**: Import string paths are document links with exact ranges

### Inlay Hints

Inline type annotations for:

- **Parameter Names**: See parameter names in function calls: `calculate(→base: 10, →power: 2)`
- **Return Types**: Hover over function declarations to see return types
- **Type Parameters**: Generic type arguments in complex expressions

### Diagnostics

Real-time error checking:

- **Type Errors**: Catch type mismatches before compilation
- **Syntax Errors**: Immediate feedback on invalid syntax
- **Import Errors**: Detect missing or invalid imports
- **Unsaved Buffers**: Hover, completion, definition, and rename use the current document text rather than stale disk contents
- **Location Information**: Click to jump to error locations

## Installation

### Quick Install

Use the automated install script:

```bash
cd vscode-ext
./install.sh
```

This will:

1. Install npm dependencies
2. Compile TypeScript to JavaScript
3. Package the extension as `.vsix`
4. Install into VS Code

### Manual Installation

If you prefer manual steps:

```bash
cd vscode-ext
npm install
npm run compile
npx @vscode/vsce package
code --install-extension bpl3-vscode-*.vsix
```

### Marketplace (Coming Soon)

The extension will be published to the VS Code Marketplace for one-click installation.

## Usage

### Basic Navigation

1. **Open a BPL file** (`.bpl` extension) - syntax highlighting activates automatically
2. **Hover over symbols** - see type information and documentation
3. **Ctrl/Cmd + Click** - go to definition
4. **Ctrl/Cmd + Space** - trigger code completion

### IntelliSense Examples

**Member Access:**

```bpl
struct User {
    name: string,
    age: int,
    frame getName(this: *User) ret string {
        return this.name;
    }
}

frame main() ret int {
    local user: User;
    user.   # <- Type here to see: getName, name, age
    return 0;
}
```

**Import Completions:**

```bpl
import [Array] from "std/array.bpl";

frame main() ret int {
    local arr: Array<int>;
    arr.    # <- See: push, pop, len, get, set, map, filter...
    return 0;
}
```

**Enum Completions:**

```bpl
enum Status {
    Active,
    Inactive,
    Pending
}

frame main() ret int {
    local status: Status = Status.  # <- See: Active, Inactive, Pending
    return 0;
}
```

## Development

To work on the extension:

1. Open the `vscode-ext/` folder in VS Code
2. Install dependencies: `npm install`
3. Press `F5` to launch Extension Development Host
4. Open a `.bpl` file to test features
5. Make changes and reload the extension window

### Project Structure

```
vscode-ext/
├── src/
│   ├── extension.ts          # LSP client entry point
│   ├── server.ts             # LSP server implementation
│   ├── services/
│   │   ├── ASTCompletionHandler.ts  # Code completion
│   │   ├── ASTHoverHandler.ts       # Hover tooltips
│   │   ├── ASTDefinitionHandler.ts  # Go-to-definition
│   │   ├── InlayHintProvider.ts     # Parameter hints
│   │   ├── ASTResolver.ts           # Type resolution
│   │   └── SymbolIndex.ts           # Symbol indexing
│   └── test/                 # Test suite
├── syntaxes/
│   └── bpl.tmLanguage.json   # TextMate grammar
├── language-configuration.json
└── package.json
```

### Testing

From the repository root, run the full extension validation path:

```bash
npm run compile:test --prefix vscode-ext
npm test --prefix vscode-ext
npm run compile --prefix vscode-ext
```

`npm run compile:test --prefix vscode-ext` type-checks the extension test
sources under `vscode-ext/src/test` with strict settings before CI. `npm test
--prefix vscode-ext` runs that type-check first and then runs the Bun language
server tests. `npm run compile --prefix vscode-ext` remains the production
extension compile used for packaging.

VS Code type-check failures map to these same focused commands in `bun run
ci:triage`, including missing `vscode-languageserver-textdocument` declarations
and implicit-any diagnostics in extension tests.

When already inside `vscode-ext/`, the equivalent full test command is:

```bash
npm test
```

Tests cover:

- Code completion (member access, imports, generics)
- Hover information (functions, structs, enums)
- Go-to-definition navigation
- Symbol resolution across files
- Type inference and checking
- Snippet JSON validity for package and type-match snippets

## Troubleshooting

### Extension Not Activating

- Check that files have `.bpl` extension
- Reload VS Code window: `Ctrl/Cmd + Shift + P` → "Reload Window"
- Check Output panel: View → Output → "BPL Language Server"

### Completions Not Working

- Ensure the file is saved (or use in-memory parsing)
- Check for syntax errors that prevent parsing
- Verify imports are correct (stdlib and package paths)

### Hover Not Showing Information

- Hover directly over the symbol name
- Wait a moment for the parser to index the file
- Check that the symbol is defined in the workspace

## Contributing

Contributions to the extension are welcome! Please:

1. Fork the repository
2. Make changes in the `vscode-ext/` directory
3. Run tests: `npm test --prefix vscode-ext`
4. Test manually in Extension Development Host
5. Submit a pull request

Open a pull request after running the extension tests listed above.

## License

The VS Code extension is part of the BPL project and is licensed under the Apache-2.0 License.
