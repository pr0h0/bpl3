# BPL3 VS Code Extension

This extension provides comprehensive language support for the BPL3 programming language, including syntax highlighting, code completion, and advanced navigation features.

## Features

- **Syntax Highlighting**:

  - Full highlighting for keywords, control flow, types, and literals.
  - Distinct colors for variable declarations (`local`, `global`) and function definitions.
  - Support for BPL3 specific constructs like `frame`, `struct`, `import`, and `asm` blocks.

- **IntelliSense & Tooltips**:

  - **Hover Information**: View full signatures for functions and structs by hovering over them.
  - **Member Access**: Hover over object properties (e.g., `obj.field`) to see the field's type and definition.
  - **Keyword Documentation**: Explanations for standard BPL3 keywords and built-in types.

- **Navigation**:

  - **Go to Definition**: Jump to the definition of symbols (functions, structs, variables) within the current file or across imported files.
  - **Import Resolution**: Click on import paths to open the referenced file.

- **Code Completion**:
  - Suggestions for keywords (`if`, `loop`, `struct`, etc.) and built-in types (`int`, `bool`, `string`, etc.).

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

## Structure

- `package.json`: Extension manifest and configuration.
- `language-configuration.json`: Language configuration (comments, brackets, auto-closing).
- `syntaxes/bpl.tmLanguage.json`: TextMate grammar for syntax highlighting.
- `src/extension.ts`: LSP Client entry point.
- `src/server.ts`: LSP Server implementation (handles hover, definition, completion).
