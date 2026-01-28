# Enhanced Error Messages - Implementation Summary

## Overview

The BPL compiler now provides comprehensive, informative error messages with proper formatting, code context, and developer-friendly features. All errors display precise location information in `file:row:column` format along with code snippets and helpful hints.

## Features Implemented

### 1. **Precise Location Information**

Every error message displays the exact location where the problem occurs:

```
error[filename.bpl:4:18]: Error description
```

- **file**: The source file name
- **row**: The line number (1-based)
- **column**: The character position (1-based)

### 2. **Code Snippet Context**

When available, errors show the problematic code with surrounding context:

```
     3 | fn main() {
     4 |   let result = calc(10, 20);
       |                   ^^^^^^^^^^^^
     5 |   println(result);
```

Features:

- Source code displayed with line numbers
- Error highlighted with context lines (default: 2 before, 2 after)
- Visual `^^^^` pointer under exact error location
- Configurable number of context lines

### 3. **Error Severity Levels**

Errors support severity categorization:

- **Error**: Critical compilation failures
- **Warning**: Issues that don't prevent compilation but may cause problems
- **Note**: Informational messages
- **Help**: Suggestions for fixing the issue

### 4. **Helpful Hints and Suggestions**

Each error can include actionable guidance:

```
help: Consider casting the value using 'cast<string>(x)' or using string conversion
```

### 5. **Related Locations**

Link related errors or previous declarations:

```
related locations:
  main.bpl:1:9: Function imported from here
  lib.bpl:5:4: Original declaration here
```

Useful for:

- Pointing to conflicting declarations
- Linking to the source of imported symbols
- Showing multiple related issues

### 6. **Error Summary**

When multiple errors occur, a summary is provided:

```
2 errors
```

### 7. **Colorized Terminal Output**

Terminal output uses ANSI colors for better readability:

- Red for error messages
- Yellow for warnings
- Blue for notes
- Green for help text
- Cyan for file locations

Colors respect the `NO_COLOR` environment variable for CI/CD compatibility.

## API

### CompilerError Class

```typescript
class CompilerError extends Error {
  // Constructor
  constructor(message: string, hint: string, location: SourceLocation);

  // Methods
  toString(): string; // Format for terminal/console
  toDiagnostic(): Diagnostic; // Format for IDE/LSP
  addRelatedLocation(location, message): CompilerError;
  setSeverity(severity): CompilerError;
}
```

### DiagnosticFormatter Class

```typescript
class DiagnosticFormatter {
  constructor(config?: Partial<FormatterConfig>);

  // Methods
  formatError(error: CompilerError, severity?: DiagnosticSeverity): string;
  formatErrors(errors: CompilerError[]): string;
  formatAsJSON(errors: CompilerError[]): string;
  setConfig(config: Partial<FormatterConfig>): void;
}
```

### Configuration Options

```typescript
interface FormatterConfig {
  colorize: boolean; // Enable ANSI colors (default: true)
  contextLines: number; // Lines before/after error (default: 2)
  maxLineLength: number; // Max line length before truncation (default: 200)
  showCodeSnippets: boolean; // Show code snippets (default: true)
  machineReadable: boolean; // JSON output only (default: false)
}
```

## Usage Examples

### CLI Usage

```bash
# Compile with enhanced error messages
$ bpl main.bpl

# Example output with colored errors and code context
error[main.bpl:5:10]: Type mismatch
     3 | fn main() {
     4 |   let x: i32 = 10;
     5 |   let y: string = x;
       |             ^^^^
     6 |   println(y);
     7 | }

help: Consider casting the value using 'cast<string>(x)' or using string conversion

1 error
```

### Programmatic Usage

```typescript
import { CompilerError, DiagnosticFormatter } from "./compiler/common";

// Create error
const error = new CompilerError("Type mismatch", "Expected i32 but got f64", {
  file: "main.bpl",
  startLine: 5,
  startColumn: 10,
  endLine: 5,
  endColumn: 15,
});

// Format with context
const formatter = new DiagnosticFormatter({
  colorize: true,
  contextLines: 3,
});

console.error(formatter.formatError(error));
```

### IDE Integration (LSP)

```typescript
const diagnostic = error.toDiagnostic();
// Returns structured diagnostic compatible with Language Server Protocol
{
  severity: "error",
  message: "Type mismatch",
  location: {
    file: "main.bpl",
    start: { line: 5, column: 10 },
    end: { line: 5, column: 15 }
  },
  hint: "Expected i32 but got f64"
}
```

## Error Types Demonstrated

The error formatting system handles all compiler error types:

1. **Syntax Errors** - Unknown tokens, missing semicolons, invalid syntax
2. **Type Errors** - Type mismatches, incompatible operations
3. **Semantic Errors** - Undefined variables, missing declarations
4. **Structural Errors** - Invalid member access, missing fields
5. **Function Errors** - Argument count mismatches, return type errors
6. **Declaration Errors** - Duplicate declarations, conflicting names

## Integration Points

### 1. **CLI (index.ts)**

- Uses `DiagnosticFormatter` for console output
- Respects `NO_COLOR` environment variable
- Provides colored output in terminal

### 2. **Compiler (compiler/index.ts)**

- `CompilerError` thrown throughout compilation pipeline
- Frontend (Parser): Syntax errors
- Middleend (TypeChecker, ModuleResolver): Type and semantic errors
- Backend (CodeGenerator): Code generation errors

### 3. **Playground Server**

- Uses formatter with `colorize: false` for JSON API
- Includes error snippets in API responses
- Supports debugging in web interface

### 4. **VSCode LSP Server**

- Converts errors to LSP diagnostics
- Highlights errors in editor
- Shows hints on hover
- Supports code navigation to error location

## Testing

Comprehensive test suites validate error formatting:

1. **ErrorMessaging.test.ts** - Unit tests for error formatting
2. **ErrorFormattingDemo.test.ts** - Integration tests with real compilation errors
3. **Integration tests** - Full compilation pipeline error handling

Run tests:

```bash
bun test ./tests/ErrorMessaging.test.ts
bun test ./tests/ErrorFormattingDemo.test.ts
```

## Performance Considerations

- **Lazy Loading**: Source files only read when error is displayed
- **Caching**: Source lines cached to avoid redundant reads
- **Graceful Fallback**: Works without source files (shows location only)
- **Configurable**: Can disable snippets for better performance

## Future Enhancements

Potential improvements:

1. **Multi-line Error Pointers**
   - Better visualization for multi-line errors
   - Contextual arrows showing error extent

2. **Error Codes**
   - Numbered error codes for quick reference
   - Machine-readable error codes

3. **Fix Suggestions**
   - Automatic fixes via code actions
   - Quick-fix proposals for common errors

4. **Error Statistics**
   - Count errors by category
   - Show most common error types

5. **Error Context**
   - Show variable types at error location
   - Display type inference chains

## Configuration

### Environment Variables

```bash
NO_COLOR=1     # Disable ANSI colors in output
```

### Formatter Configuration

```typescript
const formatter = new DiagnosticFormatter({
  colorize: false, // No colors
  contextLines: 5, // Show more context
  showCodeSnippets: false, // No code snippets
  machineReadable: true, // JSON output
});
```

## References

- `compiler/common/CompilerError.ts` - Error class implementation
- `compiler/common/DiagnosticFormatter.ts` - Formatting utilities
- `index.ts` - CLI integration
- `tests/ErrorMessaging.test.ts` - Unit tests
- `tests/ErrorFormattingDemo.test.ts` - Integration tests
