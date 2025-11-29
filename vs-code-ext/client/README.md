# BPL Language Support

Official VS Code extension for BPL (Basic Programming Language).

## Features

### 🎨 Syntax Highlighting

Comprehensive syntax highlighting for `.x` files, including:

- Keywords and Control Flow
- Types and Structs
- Functions and Variables
- Strings, Numbers, and Comments
- Inline Assembly blocks

### 🧠 IntelliSense & Code Completion

- **Keywords**: Context-aware suggestions for BPL keywords.
- **Variables & Functions**: Auto-completion for defined variables and functions in the current scope.
- **Struct Fields**: Suggestions for struct members.

### 🔍 Navigation

- **Go to Definition**:
  - Ctrl+Click on variables, functions, and types to jump to their declaration.
  - Ctrl+Click on `import` paths to open the imported file.
  - Ctrl+Click on imported symbols to jump to their definition in the source file.

### ℹ️ Hover Information

Hover over any symbol to see detailed information:

- **Type Information**: See the type of variables and return types of functions.
- **Struct Layout**: View struct fields, offsets, size, and alignment.
- **Source Location**: See where a symbol is defined (file and line number).
- **Argument Highlighting**: Distinguishes between local variables and function arguments.

### 🛡️ Diagnostics

- **Syntax Errors**: Real-time reporting of parsing errors.
- **Semantic Errors**: Detection of undefined variables, type mismatches, and more.

## Installation

1. Clone the repository.
2. Navigate to `vs-code-ext`.
3. Run `./build_extension.sh` to build the extension package.
4. Install the generated `.vsix` file from `vs-code-ext/client/` into VS Code.
   - You can use the command: `code --install-extension vs-code-ext/client/bpl-vscode-0.1.0.vsix`
   - Or in VS Code: Extensions View -> "..." menu -> "Install from VSIX..."

## Requirements

- Node.js and npm (for building the extension)
