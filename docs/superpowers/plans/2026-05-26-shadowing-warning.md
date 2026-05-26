# Shadowing Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-fatal semantic warnings for ordinary local declarations that shadow outer variables or parameters.

**Architecture:** Keep errors and warnings separate in `TypeCheckerBase`. Add a non-mutating parent-scope lookup to `SymbolTable`, then have `StatementChecker.checkVariableDecl()` record warnings before defining the new symbol. Update `DiagnosticFormatter` so stored warning severity is displayed.

**Tech Stack:** Bun test runner, TypeScript, existing BPL3 lexer/parser/type checker.

---

## File Structure

- Create `tests/SemanticWarnings.test.ts` for focused warning behavior.
- Modify `compiler/middleend/SymbolTable.ts` to add non-mutating outer-scope lookup.
- Modify `compiler/middleend/TypeCheckerBase.ts` to store and expose warnings.
- Modify `compiler/middleend/CheckerContext.ts` to expose warning APIs to checker modules.
- Modify `compiler/middleend/StatementChecker.ts` to emit shadowing warnings.
- Modify `compiler/common/DiagnosticFormatter.ts` to preserve stored diagnostic severity.

---

### Task 1: Failing Warning Tests

**Files:**
- Create: `tests/SemanticWarnings.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "bun:test";

import { DiagnosticFormatter } from "../compiler/common/DiagnosticFormatter";
import { DiagnosticSeverity } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function check(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  return {
    errors: typeChecker.getErrors(),
    warnings: typeChecker.getWarnings(),
  };
}

describe("Semantic warnings", () => {
  it("warns when a block local shadows an outer local", () => {
    const result = check(`
      frame main() ret int {
        local value: int = 1;
        local total: int = value;
        {
          local value: int = 2;
          total = total + value;
        }
        return total;
      }
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.toDiagnostic().severity).toBe(
      DiagnosticSeverity.Warning,
    );
    expect(result.warnings[0]!.message).toContain(
      "shadows variable from an outer scope",
    );
    expect(result.warnings[0]!.relatedLocations).toHaveLength(1);
  });

  it("warns when a local shadows a function parameter", () => {
    const result = check(`
      frame identity(value: int) ret int {
        local total: int = value;
        {
          local value: int = 2;
          total = total + value;
        }
        return total;
      }
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain(
      "shadows parameter from an outer scope",
    );
  });

  it("keeps same-scope redeclarations as errors", () => {
    const result = check(`
      frame main() ret int {
        local value: int = 1;
        local value: int = 2;
        return value;
      }
    `);

    expect(result.errors.map((error) => error.message).join("\n")).toContain(
      "already declared in this scope",
    );
    expect(result.warnings).toHaveLength(0);
  });

  it("formats stored warning severity by default", () => {
    const result = check(`
      frame main() ret int {
        local value: int = 1;
        local total: int = value;
        {
          local value: int = 2;
          total = total + value;
        }
        return total;
      }
    `);

    const formatter = new DiagnosticFormatter({
      colorize: false,
      showCodeSnippets: false,
    });

    expect(formatter.formatError(result.warnings[0]!)).toContain("warning[");
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `bun test tests/SemanticWarnings.test.ts`

Expected: FAIL because `TypeChecker.getWarnings()` does not exist yet.

- [ ] **Step 3: Commit the failing tests if desired**

Keep this uncommitted until implementation if the project convention prefers atomic feature commits.

---

### Task 2: Warning Plumbing

**Files:**
- Modify: `compiler/middleend/TypeCheckerBase.ts`
- Modify: `compiler/middleend/CheckerContext.ts`

- [ ] **Step 1: Add warning state to `TypeCheckerBase`**

Add `public warnings: CompilerError[] = [];` near `errors`.

Add:

```ts
getWarnings(): CompilerError[] {
  return this.warnings;
}
```

Add:

```ts
public addWarning(warning: CompilerError): void {
  this.warnings.push(warning);
}
```

- [ ] **Step 2: Add warning methods to `CheckerContext`**

Add `warnings: CompilerError[];` beside `errors`.

Add `addWarning(warning: CompilerError): void;` beside `addError()`.

- [ ] **Step 3: Run focused tests**

Run: `bun test tests/SemanticWarnings.test.ts`

Expected: Tests still fail because no shadowing warnings are emitted.

---

### Task 3: Shadowing Detection

**Files:**
- Modify: `compiler/middleend/SymbolTable.ts`
- Modify: `compiler/middleend/StatementChecker.ts`

- [ ] **Step 1: Add non-mutating outer lookup**

Add this method to `SymbolTable`:

```ts
public findInOuterScopes(name: string): Symbol | undefined {
  let scope = this.parent;
  while (scope) {
    const symbol = scope.getInCurrentScope(name);
    if (symbol) return symbol;
    scope = scope.getParent();
  }
  return undefined;
}
```

- [ ] **Step 2: Emit the warning in `checkVariableDecl()`**

After the same-scope redeclaration check and before `this.defineSymbol(...)`, add:

```ts
  const shadowed = this.currentScope.findInOuterScopes(decl.name as string);
  if (
    shadowed &&
    (shadowed.kind === "Variable" || shadowed.kind === "Parameter")
  ) {
    this.addWarning(
      new CompilerError(
        `Variable '${decl.name}' shadows ${shadowed.kind.toLowerCase()} from an outer scope`,
        `Rename '${decl.name}' or the outer ${shadowed.kind.toLowerCase()} to make the scope relationship explicit.`,
        decl.location,
      )
        .setSeverity(DiagnosticSeverity.Warning)
        .addRelatedLocation(
          shadowed.declaration.location,
          `Outer ${shadowed.kind.toLowerCase()} '${shadowed.name}' declared here`,
        ),
    );
  }
```

- [ ] **Step 3: Run focused tests**

Run: `bun test tests/SemanticWarnings.test.ts`

Expected: Warning behavior tests pass except formatter severity if not updated yet.

---

### Task 4: Formatter Severity

**Files:**
- Modify: `compiler/common/DiagnosticFormatter.ts`

- [ ] **Step 1: Respect stored severity**

Change:

```ts
const effectiveSeverity = severity || DiagnosticSeverity.Error;
```

to:

```ts
const effectiveSeverity = severity || error.toDiagnostic().severity;
```

- [ ] **Step 2: Run focused tests**

Run: `bun test tests/SemanticWarnings.test.ts`

Expected: PASS.

---

### Task 5: Verification and Commit

**Files:**
- Review all changed files.

- [ ] **Step 1: Run focused semantic tests**

Run: `bun test tests/SemanticWarnings.test.ts tests/TypeCheckerExtended.test.ts tests/BugHunting.test.ts tests/MultipleErrors.test.ts`

Expected: PASS.

- [ ] **Step 2: Run compiler TypeScript check**

Run:

```bash
find compiler -type f -name '*.ts' -print > /tmp/bpl3-compiler-ts-files.txt
printf 'index.ts\n' >> /tmp/bpl3-compiler-ts-files.txt
bunx tsc --noEmit --lib ESNext --target ESNext --module ESNext --moduleResolution bundler --allowImportingTsExtensions --verbatimModuleSyntax --strict --skipLibCheck --noFallthroughCasesInSwitch --noUncheckedIndexedAccess @/tmp/bpl3-compiler-ts-files.txt
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add compiler/common/DiagnosticFormatter.ts compiler/middleend/CheckerContext.ts compiler/middleend/StatementChecker.ts compiler/middleend/SymbolTable.ts compiler/middleend/TypeCheckerBase.ts tests/SemanticWarnings.test.ts docs/superpowers/specs/2026-05-26-shadowing-warning-design.md docs/superpowers/plans/2026-05-26-shadowing-warning.md
git commit -m "feat: warn on outer scope shadowing"
```
