# Installation

This guide will help you install the BPL compiler and set up your development environment.

## Prerequisites

Before installing BPL, ensure you have the following installed:

### Required

1. **Clang/LLVM** (version 11 or higher)

   - Used to compile LLVM IR to native executables
   - Provides the LLVM toolchain

2. **Bun** or **Node.js**
   - Bun (recommended): https://bun.sh
   - Node.js (v16+): https://nodejs.org

### Platform-Specific Instructions

#### Linux (Ubuntu/Debian)

```bash
# Install Clang/LLVM
sudo apt-get update
sudo apt-get install clang llvm

# Install Bun (recommended)
curl -fsSL https://bun.sh/install | bash

# Or install Node.js
sudo apt-get install nodejs npm
```

#### Linux (Fedora/RHEL)

```bash
# Install Clang/LLVM
sudo dnf install clang llvm

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Or install Node.js
sudo dnf install nodejs npm
```

#### macOS

```bash
# Install Clang (comes with Xcode Command Line Tools)
xcode-select --install

# Or install via Homebrew
brew install llvm

# Install Bun (recommended)
curl -fsSL https://bun.sh/install | bash

# Or install Node.js
brew install node
```

#### Windows

1. **Install Clang/LLVM**

   - Download from: https://releases.llvm.org/
   - Or use Chocolatey: `choco install llvm`

2. **Install Bun or Node.js**

   ```powershell
   # Install Bun
   irm bun.sh/install.ps1 | iex

   # Or install Node.js from https://nodejs.org
   ```

3. **Windows Subsystem for Linux (WSL) Recommended**
   For the best experience on Windows, consider using WSL:
   ```powershell
   wsl --install
   ```
   Then follow the Linux installation instructions inside WSL.

## Installing BPL

### Method 1: Install from npm/Bun (Recommended)

```bash
# Using npm
npm install -g the-best-programming-language-v3

# Or using Bun
bun install -g the-best-programming-language-v3
```

After installation, the `bpl` command should be available:

```bash
bpl --version
```

### Method 2: Build from Source

This method gives you the latest development version:

```bash
# Clone the repository
git clone https://github.com/pr0h0/bpl3.git
cd bpl3

# Install dependencies
bun install
# Or: npm install

# Build the compiler
bun run build
# Or: npm run build

# The executable will be created as './bpl'
./bpl --version

# Optionally, add to PATH or create symlink
sudo ln -s $(pwd)/bpl /usr/local/bin/bpl
```

## Verifying Installation

Test your installation with a simple program:

```bash
# Create a test file
cat > test.bpl << 'EOF'
extern printf(fmt: string, ...);

frame main() ret int {
    printf("BPL is working!\n");
    return 0;
}
EOF

# Compile and run
bpl test.bpl --run
```

You should see:

```
BPL is working!
```

## Editor Setup

### VS Code (Recommended)

1. **Install the Extension**

   ```bash
   cd bpl3/vscode-ext
   npm install
   npm run build
   code --install-extension vscode-bpl-*.vsix
   ```

2. **Features**
   - Syntax highlighting
   - Code snippets
   - Auto-formatting
   - Error diagnostics (partial)

### Vim/Neovim

Create a syntax file at `~/.vim/syntax/bpl.vim`:

```vim
" BPL syntax highlighting
if exists("b:current_syntax")
  finish
endif

" Keywords
syn keyword bplKeyword frame local global import export extern return if else loop switch case default try catch catchOther throw break continue cast sizeof match type struct
syn keyword bplType int uint float bool char void string
syn keyword bplBoolean true false
syn keyword bplNull null nullptr

" Comments
syn match bplComment "#.*$"
syn region bplMultiComment start="###" end="###"

" Strings
syn region bplString start='"' end='"'
syn region bplChar start="'" end="'"

" Numbers
syn match bplNumber '\d\+'
syn match bplFloat '\d\+\.\d\+'

" Operators
syn match bplOperator "+\|-\|*\|/\|%\|&\||\|^\|~\|<<\|>>"
syn match bplOperator "==\|!=\|<\|>\|<=\|>="
syn match bplOperator "&&\|||\|!"

hi def link bplKeyword Keyword
hi def link bplType Type
hi def link bplBoolean Boolean
hi def link bplNull Constant
hi def link bplComment Comment
hi def link bplMultiComment Comment
hi def link bplString String
hi def link bplChar Character
hi def link bplNumber Number
hi def link bplFloat Float
hi def link bplOperator Operator

let b:current_syntax = "bpl"
```

Add to `~/.vim/ftdetect/bpl.vim`:

```vim
au BufRead,BufNewFile *.bpl set filetype=bpl
```

### Sublime Text

Create `BPL.sublime-syntax` in your User packages directory:

```yaml
%YAML 1.2
---
name: BPL
file_extensions: [bpl]
scope: source.bpl

contexts:
  main:
    - match: '\b(frame|local|global|import|export|extern|return|if|else|loop|switch|case|default|try|catch|catchOther|throw|break|continue|cast|sizeof|match|type|struct)\b'
      scope: keyword.control.bpl
    - match: '\b(int|uint|float|bool|char|void|string)\b'
      scope: storage.type.bpl
    - match: '\b(true|false)\b'
      scope: constant.language.bpl
    - match: "#.*$"
      scope: comment.line.bpl
    - match: '"'
      push: string
    - match: "'"
      push: char
    - match: '\b\d+\.?\d*\b'
      scope: constant.numeric.bpl

  string:
    - meta_scope: string.quoted.double.bpl
    - match: '\\.'
      scope: constant.character.escape.bpl
    - match: '"'
      pop: true

  char:
    - meta_scope: string.quoted.single.bpl
    - match: "'"
      pop: true
```

## Troubleshooting

### "bpl: command not found"

**Solution**: Ensure the installation directory is in your PATH.

```bash
# For npm global installs, check npm prefix
npm config get prefix

# Add to PATH in ~/.bashrc or ~/.zshrc
export PATH="$PATH:$(npm config get prefix)/bin"
```

### "clang: command not found"

**Solution**: Clang is not installed or not in PATH.

```bash
# Verify clang installation
which clang

# If not found, install as described in prerequisites
```

### Compilation errors with LLVM IR

**Solution**: Your LLVM version might be incompatible.

```bash
# Check LLVM version
llvm-config --version

# BPL requires LLVM 11 or higher
# Upgrade if necessary
```

### Windows: "Unable to compile LLVM IR"

**Solution**: Use WSL or ensure MinGW/MSYS2 is properly installed.

Alternatively, compile LLVM IR manually:

```bash
bpl main.bpl  # Generates main.ll
clang main.ll -o main.exe
```

## Updating BPL

### Global Installation

```bash
# Using npm
npm update -g the-best-programming-language-v3

# Or using Bun
bun update -g the-best-programming-language-v3
```

### Source Build

```bash
cd bpl3
git pull
bun install
bun run build
```

## Uninstalling

### Global Installation

```bash
# Using npm
npm uninstall -g the-best-programming-language-v3

# Or using Bun
bun remove -g the-best-programming-language-v3
```

### Source Build

```bash
# Remove symlink (if created)
sudo rm /usr/local/bin/bpl

# Delete the cloned directory
rm -rf bpl3
```

## Next Steps

Now that you have BPL installed, continue to:

- [Quick Start Guide](03-quick-start.md) - Write your first program
- [Syntax and Comments](04-syntax-comments.md) - Learn the language basics

## Getting Help

If you encounter issues:

1. Check the [Common Pitfalls](42-common-pitfalls.md) guide
2. Search existing [GitHub Issues](https://github.com/pr0h0/bpl3/issues)
3. Create a new issue with:
   - Your operating system and version
   - BPL version (`bpl --version`)
   - Clang version (`clang --version`)
   - The complete error message
   - A minimal reproduction example
