# Compiler Options

The BPL compiler (`bpl`) provides a comprehensive command-line interface with various commands and flags.

## Commands

### `bpl run <file> [args...]`

Compile and execute a BPL program.

**Examples:**

```bash
# Run a program
bpl run hello.bpl

# Pass arguments to the program
bpl run hello.bpl arg1 arg2

# Run with optimization
bpl run hello.bpl -O 2
```

### `bpl dev <file> [args...]`

Development mode with watch and auto-run.

**Options:**

- `--clear`: Clear screen on each recompile
- `--no-run`: Only compile, don't execute

**Examples:**

```bash
# Watch and run
bpl dev main.bpl

# Watch with screen clearing
bpl dev main.bpl --clear

# Watch but only compile
bpl dev main.bpl --no-run
```

### `bpl build <file>`

Explicitly compile a program.

**Examples:**

```bash
# Basic compilation
bpl build hello.bpl

# Specify output file
bpl build hello.bpl -o myprogram
```

### `bpl check <files...>`

Type check files without generating code (fast).

**Examples:**

```bash
# Check single file
bpl check main.bpl

# Check multiple files
bpl check src/*.bpl

# JSON output
bpl check main.bpl --json
```

### `bpl new <name>`

Create a new BPL project.

**Examples:**

```bash
bpl new my-project
```

### `bpl clean`

Remove build artifacts.

**Options:**

- `--dry-run`: Show what would be deleted
- `-v, --verbose`: Verbose output

**Examples:**

```bash
bpl clean
bpl clean --dry-run
```

### `bpl format [files...]`

Format BPL source files.

**Options:**

- `-w, --write`: Write formatted output back to files

**Examples:**

```bash
bpl format main.bpl
bpl format -w main.bpl
```

## Common Flags

Flag availability depends on the command; run `bpl <command> --help` for the exact set.

- `-o <file>`: Output file name on the default compile command and `bpl build`
- `-v, --verbose`: Verbose compiler output
- `-q, --quiet`: Suppress non-error output
- `-O <level>`: Optimization level (0, 1, 2, or 3)
- `-d, --dwarf`: Generate DWARF debug information on the default compile command
- `--debug`: Generate DWARF debug information on `run`, `dev`, and `build`
- `--time`: Show compilation time statistics
- `--cache`: Enable incremental compilation
- `--json`: Output in JSON format where supported, especially `bpl check`
- `--color`: Force colored output
- `--no-color`: Disable colored output

## Direct Code Compilation

For quick testing without files:

- `-e, --eval <code>`: Compile code passed directly on the command line
- `--stdin`: Compile code read from standard input

**Examples:**

```bash
# Evaluate code directly
bpl -e 'frame main() ret int { return 0; }'

# Read from stdin
cat hello.bpl | bpl --stdin

# Emit AST from eval
bpl -e 'frame main() { }' --emit ast
```

## Development Mode

The `bpl dev` command provides watch mode for rapid development. It monitors your BPL source files for changes and automatically recompiles and optionally runs them.

### Features

- **Automatic Recompilation**: Detects changes to `.bpl` files and recompiles automatically
- **Auto-Run**: Executes your program after successful compilation (use `--no-run` to disable)
- **Error Recovery**: Continues watching even if compilation fails
- **Debouncing**: Prevents excessive recompilation from rapid file changes (100ms delay)
- **Recursive Watching**: Watches all `.bpl` files in the directory tree
- **Smart Filtering**: Ignores `node_modules`, `.git`, `bpl_modules`, and hidden directories
- **Screen Clearing**: Optional screen clear on recompile with `--clear`

### Usage

```bash
# Basic watch and run
bpl dev main.bpl

# Watch and run with screen clearing
bpl dev main.bpl --clear

# Watch but only compile (don't run)
bpl dev main.bpl --no-run

# Watch with verbose output
bpl dev main.bpl -v
```

### Example Session

```bash
$ bpl dev main.bpl
[Watch] Starting watch mode...
[Watch] Watching directory: /path/to/project
[Watch] Entry point: main.bpl
[Watch] Press Ctrl+C to stop

[12:00:00] Compiling /path/to/project/main.bpl...
Hello, World!
[12:00:00] ✓ Compilation successful

[Watch] Found 3 BPL files to watch

[Watch] Watching for changes...

# (File is edited and saved)
[Watch] File changed: /path/to/project/main.bpl
[12:00:15] Compiling /path/to/project/main.bpl...
Hello, BPL!
[12:00:15] ✓ Compilation successful
```

### Error Handling

If your code has errors, watch mode will display them and continue watching:

```bash
[12:01:00] Compiling /path/to/project/main.bpl...
error[main.bpl:5:5]: Undefined symbol 'foo'
     3 | frame main() ret int {
     4 |     local x: int = 10;
>    5 |     foo();
       |      ^^^
     6 |     return 0;
     7 | }

help: Check if the symbol is declared.

1 error
[12:01:00] ✗ Compilation failed

# Still watching - fix the error and it will recompile
```

### Limitations

- Development mode only supports a single entry file (not multiple files at once)
- Use Ctrl+C to stop watching

## Emit Types

Control what the compiler outputs:

- `llvm` (default): Generate LLVM IR
- `ast`: Output Abstract Syntax Tree as JSON
- `tokens`: Output lexical tokens
- `formatted`: Format the source code (same as `bpl format`)

**Examples:**

```bash
# Generate LLVM IR
bpl build main.bpl --emit llvm

# Output AST for tooling
bpl build main.bpl --emit ast > ast.json

# View tokens
bpl build main.bpl --emit tokens
```

## Optimization Levels

Control code optimization with `-O`:

- `-O 0`: No optimization (default, fastest compilation)
- `-O 1`: Basic optimization
- `-O 2`: Moderate optimization (recommended for production)
- `-O 3`: Aggressive optimization (may increase compilation time)

**Examples:**

```bash
# Development build (fast compilation)
bpl run main.bpl -O 0

# Production build (optimized)
bpl build main.bpl -O 2 -o myapp
```

## Debug Information

Generate DWARF debug information for debugging with gdb/lldb:

```bash
# Enable debug info
bpl build main.bpl --debug
```

## Cross-Compilation

Compile for different target platforms:

**Flags:**

- `--target <triple>`: Target platform triple
- `--march <arch>`: Target architecture
- `--cpu <cpu>`: Specific CPU model
- `--sysroot <path>`: Sysroot for cross-compilation
- `--clang-flag <flag>`: Pass additional flags to clang

**Supported Targets:**

- `x86_64-pc-linux-gnu` (Linux x64)
- `aarch64-unknown-linux-gnu` (Linux ARM64)
- `arm64-apple-darwin` (macOS ARM64)
- `x86_64-apple-darwin` (macOS x64)
- `x86_64-pc-windows-gnu` (Windows x64)

**Examples:**

```bash
# Cross-compile for ARM64 Linux
bpl build main.bpl --target aarch64-unknown-linux-gnu

# Cross-compile for Windows from Linux
bpl build main.bpl --target x86_64-pc-windows-gnu

# Specify architecture details
bpl build main.bpl --target aarch64-unknown-linux-gnu --march=armv8-a

# Use custom sysroot
bpl build main.bpl \\
  --target aarch64-unknown-linux-gnu \\
  --sysroot /opt/cross/aarch64-linux-gnu
```

## Linking Options

Control library linking:

- `-l, --lib <lib>`: Link with a library
- `-L, --lib-path <path>`: Add library search path
- `--object <file>`: Link with object file

**Examples:**

```bash
# Link with math library
bpl build main.bpl -l m

# Add library search path
bpl build main.bpl -L /usr/local/lib -l mylib

# Link with object files
bpl build main.bpl --object utils.o --object helpers.o
```

## Output Control

- `-q, --quiet`: Suppress non-error messages
- `-v, --verbose`: Show detailed compilation steps
- `--json`: Output results in JSON format (useful for tooling)
- `--time`: Show compilation time statistics
- `--color`: Force colored output
- `--no-color`: Disable colored output

**Examples:**

```bash
# Quiet compilation
bpl build main.bpl -q

# Verbose output for debugging
bpl build main.bpl -v

# Time the compilation
bpl build main.bpl --time

# JSON output for CI/CD
bpl check main.bpl --json
```

## Caching

Enable incremental compilation with module caching:

```bash
# Enable caching for faster rebuilds
bpl build main.bpl --cache
```

Cached modules are stored in `bpl_modules/.cache/`. Use `bpl clean` to clear cache.

## Complete Examples

### Development Workflow

```bash
# Start development with watch mode
bpl dev main.bpl --clear

# In another terminal, format on save
bpl format -w main.bpl

# Check types without full compilation
bpl check main.bpl
```

### Production Build

```bash
# Build optimized release binary
bpl build main.bpl -O 2 -o myapp

# Build with debug symbols for debugging
bpl build main.bpl -O 0 --debug -o myapp-debug

# Cross-compile for multiple platforms
bpl build main.bpl -O 2 --target x86_64-pc-linux-gnu -o myapp-linux
bpl build main.bpl -O 2 --target x86_64-pc-windows-gnu -o myapp.exe
bpl build main.bpl -O 2 --target arm64-apple-darwin -o myapp-macos
```

### CI/CD Integration

```bash
# Type check all files
bpl check src/*.bpl --json --quiet

# Build with timing
bpl build main.bpl -O 2 --time --json

# Clean before build
bpl clean && bpl build main.bpl -O 2
```
