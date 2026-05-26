# Function Attributes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@[...]` function attributes for compiler-known LLVM hints.

**Architecture:** Parse `@[...]` into `FunctionDecl.attributes`, validate known names and conflicts in the type checker, preserve attributes in formatting/docs, and emit deterministic LLVM attribute groups per function definition. Keep user decorators and attribute arguments unsupported.

**Tech Stack:** BPL compiler TypeScript, Peggy grammar in `grammar/bpl.peggy`, Bun test runner, LLVM IR text generation.

---

## File Structure

- Create `tests/FunctionAttributes.test.ts`: focused parser, semantic validation, formatter, and LLVM shape tests.
- Modify `compiler/common/AST.ts`: add `FunctionAttribute` and `FunctionDecl.attributes`.
- Modify `grammar/bpl.peggy`: parse optional `AttributeList` before `frame` declarations.
- Modify `compiler/backend/CodeGenerator.ts`: emit deterministic LLVM attribute groups instead of a single hard-coded group.
- Modify `compiler/backend/codegen/StatementGenerator.ts`: choose the right LLVM attribute group for each generated function.
- Modify `compiler/backend/codegen/StructEnumGenerator.ts`: no behavior change expected, but method generation must carry parsed attributes naturally through `FunctionDecl`.
- Modify `compiler/middleend/TypeChecker.ts`: validate known attributes, duplicates, conflicts, and `noreturn` return type.
- Modify `compiler/formatter/Formatter.ts`: print attributes above functions.
- Modify `compiler/docs/DocumentationGenerator.ts`: include attributes in generated function signatures.
- Modify `compiler/backend/CodeGenerator.ts` lambda helper: synthesized lambda `FunctionDecl`s receive `attributes: []`.
- Modify any builtin `FunctionDecl` literals in `compiler/middleend/BuiltinTypes.ts`: add `attributes: []`.

### Task 1: Parser And AST

**Files:**
- Modify: `compiler/common/AST.ts`
- Modify: `grammar/bpl.peggy`
- Test: `tests/FunctionAttributes.test.ts`

- [ ] **Step 1: Write failing parser test**

Add this test file:

```ts
import { describe, expect, it } from "bun:test";

import type * as AST from "../compiler/common/AST";
import { Formatter } from "../compiler/formatter/Formatter";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { compileToLLVM, parseSource } from "./helpers";

function checkSource(source: string): string[] {
  const program = parseSource(source);
  const checker = new TypeChecker();
  checker.checkProgram(program);
  return checker.getErrors().map((error) => error.message);
}

describe("Function Attributes", () => {
  it("parses attributes before function declarations", () => {
    const program = parseSource(`
      @[inline, cold]
      frame f() {}
    `);

    const func = program.statements.find(
      (statement): statement is AST.FunctionDecl =>
        statement.kind === "FunctionDecl",
    );

    expect(func?.attributes.map((attr) => attr.name)).toEqual([
      "inline",
      "cold",
    ]);
    expect(func?.attributes[0]?.location.startLine).toBe(2);
  });
});
```

- [ ] **Step 2: Run parser test to verify RED**

Run:

```bash
bun test tests/FunctionAttributes.test.ts
```

Expected: fail while parsing `@[inline, cold]` or while reading missing `FunctionDecl.attributes`.

- [ ] **Step 3: Implement AST and grammar support**

In `compiler/common/AST.ts`, add:

```ts
export interface FunctionAttribute extends ASTNode {
  kind: "FunctionAttribute";
  name: string;
}
```

Update `FunctionDecl`:

```ts
attributes: FunctionAttribute[];
```

In `grammar/bpl.peggy`, update the helper:

```js
function functionDecl(isFrame, isStatic, name, genericParams, params, returnType, body, loc, attributes) {
  return { kind: "FunctionDecl", isFrame, isStatic, name, genericParams, params, returnType, body, attributes: attributes || [], location: makeLoc(loc) };
}
```

Add grammar rules before `FunctionDeclaration`:

```peggy
AttributeList
  = "@[" _ head:FunctionAttribute tail:(_ "," _ FunctionAttribute)* _ ","? _ "]" {
      return [head, ...tail.map(t => t[3])];
    }

FunctionAttribute
  = name:Identifier {
      return { kind: "FunctionAttribute", name: name.name, location: makeLoc(location()) };
    }
```

Update `FunctionDeclaration`:

```peggy
FunctionDeclaration
  = attrs:(_ AttributeList _)? K_frame _ name:Identifier _ gen:GenericParamList? _ "(" _ params:ParameterList? _ ")" _ ret:ReturnType? _ body:Block {
      const genericParams = gen ? gen : [];
      const paramList = params ? params : [];
      const returnType = ret ? ret : voidType(location());
      const isStatic = !(paramList.length > 0 && paramList[0] && paramList[0].name === "this");
      const attributes = attrs ? attrs[1] : [];
      return functionDecl(true, isStatic, name.name, genericParams, paramList, returnType, body, location(), attributes);
    }
```

Update synthesized `FunctionDecl` literals in TypeScript to include `attributes: []`.

- [ ] **Step 4: Run parser test to verify GREEN**

Run:

```bash
bun test tests/FunctionAttributes.test.ts
```

Expected: parser test passes.

- [ ] **Step 5: Commit parser and AST support**

Run:

```bash
git add compiler/common/AST.ts grammar/bpl.peggy compiler/backend/CodeGenerator.ts compiler/middleend/BuiltinTypes.ts tests/FunctionAttributes.test.ts
git commit -m "feat: parse function attributes"
```

### Task 2: Semantic Validation

**Files:**
- Modify: `compiler/middleend/TypeChecker.ts`
- Test: `tests/FunctionAttributes.test.ts`

- [ ] **Step 1: Add failing validation tests**

Append inside `describe("Function Attributes", ...)`:

```ts
  it("rejects unknown function attributes", () => {
    const errors = checkSource(`
      @[trace]
      frame f() {}
    `);

    expect(errors.join("\n")).toContain("Unknown function attribute 'trace'");
  });

  it("rejects duplicate function attributes", () => {
    const errors = checkSource(`
      @[inline, inline]
      frame f() {}
    `);

    expect(errors.join("\n")).toContain("Duplicate function attribute 'inline'");
  });

  it("rejects conflicting function attributes", () => {
    const errors = checkSource(`
      @[always_inline, noinline]
      frame f() {}
    `);

    expect(errors.join("\n")).toContain("Conflicting function attributes");
  });

  it("rejects noreturn on functions that return values", () => {
    const errors = checkSource(`
      @[noreturn]
      frame f() ret int {
        return 1;
      }
    `);

    expect(errors.join("\n")).toContain("noreturn");
  });
```

- [ ] **Step 2: Run validation tests to verify RED**

Run:

```bash
bun test tests/FunctionAttributes.test.ts
```

Expected: validation tests fail because unknown/conflicting attributes are not checked yet.

- [ ] **Step 3: Implement validation**

In `compiler/middleend/TypeChecker.ts`, add a private method near other function validation:

```ts
  private checkFunctionAttributes(decl: AST.FunctionDecl): void {
    const attributes = decl.attributes ?? [];
    const allowed = new Set([
      "inline",
      "always_inline",
      "noinline",
      "cold",
      "hot",
      "noreturn",
      "nounwind",
      "optnone",
      "optsize",
      "minsize",
    ]);
    const seen = new Set<string>();

    for (const attr of attributes) {
      if (!allowed.has(attr.name)) {
        this.addError(
          new CompilerError(
            `Unknown function attribute '${attr.name}'`,
            "Only compiler-known LLVM function attributes are supported.",
            attr.location,
          ),
        );
        continue;
      }
      if (seen.has(attr.name)) {
        this.addError(
          new CompilerError(
            `Duplicate function attribute '${attr.name}'`,
            "Remove the duplicate attribute.",
            attr.location,
          ),
        );
      }
      seen.add(attr.name);
    }

    const conflictGroups = [
      ["inline", "always_inline", "noinline"],
      ["hot", "cold"],
      ["optsize", "minsize"],
      ["optnone", "inline"],
      ["optnone", "always_inline"],
      ["optnone", "optsize"],
      ["optnone", "minsize"],
    ];

    for (const group of conflictGroups) {
      const present = group.filter((name) => seen.has(name));
      if (present.length > 1) {
        this.addError(
          new CompilerError(
            `Conflicting function attributes: ${present.join(", ")}`,
            "Remove one of the conflicting attributes.",
            decl.location,
          ),
        );
      }
    }

    if (seen.has("noreturn")) {
      const returnType = this.resolveType(decl.returnType);
      if (
        returnType.kind !== "BasicType" ||
        returnType.name !== "void" ||
        returnType.pointerDepth !== 0
      ) {
        this.addError(
          new CompilerError(
            "Function attribute 'noreturn' requires a void return type",
            "Use 'ret void' or remove the noreturn attribute.",
            decl.location,
          ),
        );
      }
    }
  }
```

Call it from function symbol collection or function body checking for every `FunctionDecl`:

```ts
this.checkFunctionAttributes(stmt);
```

For struct and enum methods, call the same method while checking their member function bodies.

- [ ] **Step 4: Run validation tests to verify GREEN**

Run:

```bash
bun test tests/FunctionAttributes.test.ts
```

Expected: parser and validation tests pass.

- [ ] **Step 5: Commit semantic validation**

Run:

```bash
git add compiler/middleend/TypeChecker.ts tests/FunctionAttributes.test.ts
git commit -m "feat: validate function attributes"
```

### Task 3: Formatter And Documentation

**Files:**
- Modify: `compiler/formatter/Formatter.ts`
- Modify: `compiler/docs/DocumentationGenerator.ts`
- Test: `tests/FunctionAttributes.test.ts`

- [ ] **Step 1: Add failing formatter test**

Append inside `describe("Function Attributes", ...)`:

```ts
  it("formats function attributes above declarations", () => {
    const program = parseSource(`@[always_inline, hot] frame f(value:int)ret int{return value;}`);
    const formatted = new Formatter().format(program);

    expect(formatted).toContain(`@[always_inline, hot]\nframe f(value: int) ret int`);
  });
```

- [ ] **Step 2: Run formatter test to verify RED**

Run:

```bash
bun test tests/FunctionAttributes.test.ts
```

Expected: formatter test fails because attributes are not printed.

- [ ] **Step 3: Implement formatter and docs output**

In `compiler/formatter/Formatter.ts`, at the start of `formatFunctionDecl`, prepend attributes:

```ts
    let output = "";
    if (decl.attributes && decl.attributes.length > 0) {
      output += `${indent}@[${decl.attributes.map((attr) => attr.name).join(", ")}]\n`;
    }
    output += `${indent}frame ${decl.name}`;
```

In `compiler/docs/DocumentationGenerator.ts`, build an attribute prefix:

```ts
    const attrPrefix =
      func.attributes && func.attributes.length > 0
        ? `@[${func.attributes.map((attr) => attr.name).join(", ")}]\n`
        : "";
```

Then emit:

```ts
    this.output.push(`${attrPrefix}frame ${func.name}${genericStr}(${params}) ret ${ret}`);
```

- [ ] **Step 4: Run formatter tests to verify GREEN**

Run:

```bash
bun test tests/FunctionAttributes.test.ts
```

Expected: parser, validation, and formatter tests pass.

- [ ] **Step 5: Commit formatter and docs support**

Run:

```bash
git add compiler/formatter/Formatter.ts compiler/docs/DocumentationGenerator.ts tests/FunctionAttributes.test.ts
git commit -m "feat: format function attributes"
```

### Task 4: LLVM Attribute Groups

**Files:**
- Modify: `compiler/backend/CodeGenerator.ts`
- Modify: `compiler/backend/codegen/BaseCodeGenerator.ts`
- Modify: `compiler/backend/codegen/StatementGenerator.ts`
- Test: `tests/FunctionAttributes.test.ts`

- [ ] **Step 1: Add failing LLVM shape tests**

Append inside `describe("Function Attributes", ...)`:

```ts
  it("emits LLVM attributes for attributed functions", () => {
    const ir = compileToLLVM(`
      @[inline]
      frame add_one(value: int) ret int {
        return value + 1;
      }
    `);

    expect(ir).toMatch(/define i32 @add_one_[^(]+\(i32 %value\) #\d+ \{/);
    expect(ir).toMatch(/attributes #\d+ = \{ inlinehint "frame-pointer"="all" \}/);
  });

  it("uses deterministic separate groups for different attribute sets", () => {
    const ir = compileToLLVM(`
      @[always_inline, nounwind]
      frame fast(value: int) ret int {
        return value + 1;
      }

      frame plain(value: int) ret int {
        return value;
      }
    `);

    expect(ir).toMatch(/define i32 @fast_[^(]+\(i32 %value\) #\d+ \{/);
    expect(ir).toMatch(/define i32 @plain_[^(]+\(i32 %value\) #\d+ \{/);
    expect(ir).toContain("alwaysinline");
    expect(ir).toContain("nounwind");
    expect(ir).toContain('"frame-pointer"="all"');
  });
```

- [ ] **Step 2: Run LLVM tests to verify RED**

Run:

```bash
bun test tests/FunctionAttributes.test.ts
```

Expected: LLVM tests fail because codegen still emits only hard-coded `#0`.

- [ ] **Step 3: Implement deterministic attribute groups**

In `compiler/backend/codegen/BaseCodeGenerator.ts`, add fields and helpers:

```ts
  protected llvmAttributeGroupIds: Map<string, number> = new Map();
  protected llvmAttributeGroups: Map<number, string[]> = new Map();

  protected getFunctionAttributeGroupId(decl: AST.FunctionDecl): number {
    const llvmAttrs = this.getLlvmFunctionAttributes(decl);
    const key = llvmAttrs.join("\0");
    const existing = this.llvmAttributeGroupIds.get(key);
    if (existing !== undefined) return existing;
    const id = this.llvmAttributeGroupIds.size;
    this.llvmAttributeGroupIds.set(key, id);
    this.llvmAttributeGroups.set(id, llvmAttrs);
    return id;
  }

  private getLlvmFunctionAttributes(decl: AST.FunctionDecl): string[] {
    const attrMap = new Map([
      ["inline", "inlinehint"],
      ["always_inline", "alwaysinline"],
      ["noinline", "noinline"],
      ["cold", "cold"],
      ["hot", "hot"],
      ["noreturn", "noreturn"],
      ["nounwind", "nounwind"],
      ["optnone", "optnone"],
      ["optsize", "optsize"],
      ["minsize", "minsize"],
    ]);
    const attrs = (decl.attributes ?? [])
      .map((attr) => attrMap.get(attr.name))
      .filter((attr): attr is string => !!attr)
      .sort();
    return [...attrs, `"frame-pointer"="all"`];
  }
```

In `compiler/backend/CodeGenerator.ts`, reset the maps in `generate()`:

```ts
this.llvmAttributeGroupIds.clear();
this.llvmAttributeGroups.clear();
```

Replace the final hard-coded attributes string with deterministic emission:

```ts
    if (!this.llvmAttributeGroupIds.has(`"frame-pointer"="all"`)) {
      this.llvmAttributeGroupIds.set(`"frame-pointer"="all"`, 0);
      this.llvmAttributeGroups.set(0, [`"frame-pointer"="all"`]);
    }
    const attributeOutput = Array.from(this.llvmAttributeGroups.entries())
      .sort(([a], [b]) => a - b)
      .map(([id, attrs]) => `attributes #${id} = { ${attrs.join(" ")} }`)
      .join("\n");
```

Append `attributeOutput` instead of the hard-coded `attributes #0`.

In `compiler/backend/codegen/StatementGenerator.ts`, replace `#0` in function definitions:

```ts
      const attrGroupId = this.getFunctionAttributeGroupId(decl);
      this.emit(
        `define ${linkage}${retType} @${name}(${params}) #${attrGroupId}${dbgSuffix} {`,
      );
```

- [ ] **Step 4: Run LLVM tests to verify GREEN**

Run:

```bash
bun test tests/FunctionAttributes.test.ts
```

Expected: all focused function attribute tests pass.

- [ ] **Step 5: Commit LLVM codegen support**

Run:

```bash
git add compiler/backend/CodeGenerator.ts compiler/backend/codegen/BaseCodeGenerator.ts compiler/backend/codegen/StatementGenerator.ts tests/FunctionAttributes.test.ts
git commit -m "feat: emit LLVM function attributes"
```

### Task 5: Focused Regression And Final Verification

**Files:**
- Verify all files touched by Tasks 1-4.

- [ ] **Step 1: Run focused regression tests**

Run:

```bash
bun test tests/FunctionAttributes.test.ts tests/ASTValidator.test.ts tests/FormatterExtended.test.ts tests/TypeCheckerExtended.test.ts tests/GoldenLLVMShapes.test.ts tests/CodeGenerator.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run compiler type check**

Run:

```bash
bun run check
```

Expected: TypeScript exits 0.

- [ ] **Step 3: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: exit 0.

- [ ] **Step 4: Run full suite**

Run:

```bash
bun test tests/
```

Expected: all tests pass, with the existing skipped web server demo remaining skipped.

- [ ] **Step 5: Commit final verification/docs cleanup if needed**

If no cleanup is needed, do not create an empty commit. If verification-driven cleanup is needed:

```bash
git add <changed-files>
git commit -m "test: cover function attributes"
```
