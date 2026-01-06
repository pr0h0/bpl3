# BPL VS Code Extension - Test Suite

This directory contains automated tests for the BPL language server features.

## Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/test/languageServer.test.ts

# Watch mode (if needed)
bun test --watch
```

## Test Structure

### `fixtures/`

Contains test files written in BPL that serve as test data:

- **completion-test.bpl**: Contains various scenarios for testing autocompletion features

### `languageServer.test.ts`

Main test suite for language server features:

- **Completion tests**: Verify that completions work for struct members, local variables, and nested scopes
- **Hover tests**: (To be added) Test hover information
- **Definition tests**: (To be added) Test go-to-definition functionality

## Test Framework

We use **Bun's built-in test runner** (`bun:test`) which provides:

- `describe()` - Test suites
- `it()` - Individual test cases
- `expect()` - Assertions
- `beforeAll()` - Setup hooks

## Adding New Tests

1. **Create or update fixture files** in `fixtures/` with valid BPL code
2. **Add test cases** in `languageServer.test.ts`
3. **Calculate exact positions** for cursor placement (0-indexed lines and characters)
4. **Run tests** to verify

Example:

```typescript
it("completes User struct members", () => {
  const params: TextDocumentPositionParams = {
    textDocument: { uri: testDocument.uri },
    position: { line: 39, character: 26 }, // After "user."
  };
  const labels = completionHandler
    .handle(params, testDocument)
    .map((c) => c.label);
  expect(labels.includes("getName")).toBe(true);
});
```

## Notes

- **TypeScript compilation** excludes test files (see `tsconfig.json`)
- Tests use the actual compiler and language server infrastructure
- Character positions are **0-indexed**
- Test fixtures must contain **valid BPL syntax**

## Current Test Coverage

### Completion Tests ✅

- ✅ Member access completion on local variables (`user.`)
- ✅ Partial text filtering (`user.getNa` → suggests `getName`)
- ✅ Nested scope variable resolution (loops, if statements)
- ✅ Enum variant completion (`Status.Active`)
- ✅ General completions (structs, functions, enums)
- ✅ Chained member access (`app.router.`)

### Hover Tests ✅

- ✅ Hover on type names, structs, and declarations

### Definition Tests ✅

- ✅ Go-to-definition for types and symbols

### Edge Cases ✅

- ✅ Completion in nested scopes
- ✅ Invalid context handling (no crashes)

### Features Implemented

1. **Partial Completion**: Type `user.getNa` and get filtered suggestions starting with "getNa"
2. **Imported Function Resolution**: Functions imported from packages (like `sprintf`, `printf` from "bpl-express") are properly resolved
3. **Nested Scope Support**: Variables declared in loops are accessible and provide completions
4. **Robust Error Handling**: Invalid positions don't crash the language server

## Test Results

```bash
 10 pass
 0 fail
 20 expect() calls
Ran 10 tests across 2 files. [~900ms]
```
