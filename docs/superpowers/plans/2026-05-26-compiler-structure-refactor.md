# Compiler Structure Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract focused helper modules from the largest compiler files without changing language behavior or generated LLVM semantics.

**Architecture:** Keep the existing compiler pipeline and codegen inheritance chain. Move cohesive function-attribute validation, LLVM attribute group management, and virtual-call codegen into focused modules that are called from the current classes.

**Tech Stack:** TypeScript compiler codebase, Bun test runner, Peggy parser-generated AST, LLVM IR string generation.

---

## File Structure

- Create `compiler/middleend/validators/FunctionAttributeValidator.ts`: owns supported function attribute names, conflict groups, duplicate detection, unknown-name diagnostics, and the `noreturn` return-type rule.
- Create `compiler/backend/codegen/attributes/FunctionAttributeGroups.ts`: owns BPL-to-LLVM attribute spelling, deterministic group registration, default frame-pointer group registration, and attribute-group rendering.
- Create `compiler/backend/codegen/calls/VirtualCallEmitter.ts`: owns virtual receiver preparation, primitive boxing, vtable method loading, virtual method lookup, parent lookup, and virtual-call argument preparation.
- Modify `compiler/middleend/TypeChecker.ts`: delegate function attribute checks to `validateFunctionAttributes`.
- Modify `compiler/backend/codegen/BaseCodeGenerator.ts`: delegate LLVM function attribute group state to `FunctionAttributeGroups`.
- Modify `compiler/backend/codegen/CallExpressionGenerator.ts`: delegate virtual method call emission to `emitVirtualCall`.
- Use existing tests: `tests/FunctionAttributes.test.ts`, `tests/TypeCheckerExtended.test.ts`, `tests/CodeGeneratorExtended.test.ts`, `tests/GoldenLLVMShapes.test.ts`, `tests/FunctionPointers.test.ts`, and `tests/OOP.test.ts`.

### Task 1: Extract Function Attribute Helpers

**Files:**
- Create: `compiler/middleend/validators/FunctionAttributeValidator.ts`
- Create: `compiler/backend/codegen/attributes/FunctionAttributeGroups.ts`
- Modify: `compiler/middleend/TypeChecker.ts`
- Modify: `compiler/backend/codegen/BaseCodeGenerator.ts`
- Test: `tests/FunctionAttributes.test.ts`
- Test: `tests/TypeCheckerExtended.test.ts`
- Test: `tests/GoldenLLVMShapes.test.ts`

- [ ] **Step 1: Run current attribute characterization tests**

Run:

```bash
bun test tests/FunctionAttributes.test.ts tests/TypeCheckerExtended.test.ts tests/GoldenLLVMShapes.test.ts
```

Expected: PASS. This establishes that the current behavior is preserved by the extraction.

- [ ] **Step 2: Create semantic attribute validator**

Create `compiler/middleend/validators/FunctionAttributeValidator.ts`:

```ts
import * as AST from "../../common/AST";
import { CompilerError } from "../../common/CompilerError";

export interface FunctionAttributeValidationContext {
  addError(error: CompilerError): void;
  resolveType(type: AST.TypeNode): AST.TypeNode;
}

const ALLOWED_FUNCTION_ATTRIBUTES = new Set([
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

const FUNCTION_ATTRIBUTE_CONFLICT_GROUPS = [
  ["inline", "always_inline", "noinline"],
  ["hot", "cold"],
  ["optsize", "minsize"],
  ["optnone", "inline"],
  ["optnone", "always_inline"],
  ["optnone", "optsize"],
  ["optnone", "minsize"],
];

export function validateFunctionAttributes(
  context: FunctionAttributeValidationContext,
  decl: AST.FunctionDecl,
): void {
  const attributes = decl.attributes ?? [];
  const seen = new Set<string>();

  for (const attr of attributes) {
    if (!ALLOWED_FUNCTION_ATTRIBUTES.has(attr.name)) {
      context.addError(
        new CompilerError(
          `Unknown function attribute '${attr.name}'`,
          "Only compiler-known LLVM function attributes are supported.",
          attr.location,
        ),
      );
      continue;
    }

    if (seen.has(attr.name)) {
      context.addError(
        new CompilerError(
          `Duplicate function attribute '${attr.name}'`,
          "Remove the duplicate attribute.",
          attr.location,
        ),
      );
    }

    seen.add(attr.name);
  }

  for (const group of FUNCTION_ATTRIBUTE_CONFLICT_GROUPS) {
    const present = group.filter((name) => seen.has(name));
    if (present.length > 1) {
      context.addError(
        new CompilerError(
          `Conflicting function attributes: ${present.join(", ")}`,
          "Remove one of the conflicting attributes.",
          decl.location,
        ),
      );
    }
  }

  if (!seen.has("noreturn")) return;

  const returnType = context.resolveType(decl.returnType);
  if (
    returnType.kind !== "BasicType" ||
    returnType.name !== "void" ||
    returnType.pointerDepth !== 0
  ) {
    context.addError(
      new CompilerError(
        "Function attribute 'noreturn' requires a void return type",
        "Use 'ret void' or remove the noreturn attribute.",
        decl.location,
      ),
    );
  }
}
```

- [ ] **Step 3: Wire `TypeChecker` to the validator**

In `compiler/middleend/TypeChecker.ts`, add:

```ts
import { validateFunctionAttributes } from "./validators/FunctionAttributeValidator";
```

Replace the body of `private checkFunctionAttributes(decl: AST.FunctionDecl): void` with:

```ts
  private checkFunctionAttributes(decl: AST.FunctionDecl): void {
    validateFunctionAttributes(this, decl);
  }
```

- [ ] **Step 4: Create LLVM attribute group registry**

Create `compiler/backend/codegen/attributes/FunctionAttributeGroups.ts`:

```ts
import * as AST from "../../../common/AST";

const FRAME_POINTER_ATTRIBUTE = `"frame-pointer"="all"`;

const LLVM_FUNCTION_ATTRIBUTE_MAP = new Map([
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

export class FunctionAttributeGroups {
  private groupIds: Map<string, number> = new Map();
  private groups: Map<number, string[]> = new Map();

  reset(): void {
    this.groupIds.clear();
    this.groups.clear();
    this.register([FRAME_POINTER_ATTRIBUTE]);
  }

  getFunctionGroupId(decl: AST.FunctionDecl): number {
    return this.register(this.getLlvmFunctionAttributes(decl));
  }

  render(): string {
    return Array.from(this.groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([id, attrs]) => `attributes #${id} = { ${attrs.join(" ")} }`)
      .join("\n");
  }

  private register(attrs: string[]): number {
    const key = attrs.join("\0");
    const existing = this.groupIds.get(key);
    if (existing !== undefined) return existing;

    const id = this.groupIds.size;
    this.groupIds.set(key, id);
    this.groups.set(id, attrs);
    return id;
  }

  private getLlvmFunctionAttributes(decl: AST.FunctionDecl): string[] {
    const attrs = Array.from(
      new Set(
        (decl.attributes ?? [])
          .map((attr) => LLVM_FUNCTION_ATTRIBUTE_MAP.get(attr.name))
          .filter((attr): attr is string => !!attr),
      ),
    ).sort();

    return [...attrs, FRAME_POINTER_ATTRIBUTE];
  }
}
```

- [ ] **Step 5: Wire `BaseCodeGenerator` to the registry**

In `compiler/backend/codegen/BaseCodeGenerator.ts`, add:

```ts
import { FunctionAttributeGroups } from "./attributes/FunctionAttributeGroups";
```

Replace the two LLVM attribute maps with:

```ts
  protected functionAttributeGroups = new FunctionAttributeGroups();
```

Replace the four LLVM attribute helper methods with:

```ts
  protected resetLlvmAttributeGroups(): void {
    this.functionAttributeGroups.reset();
  }

  protected getFunctionAttributeGroupId(decl: AST.FunctionDecl): number {
    return this.functionAttributeGroups.getFunctionGroupId(decl);
  }

  protected getLlvmAttributeGroupOutput(): string {
    return this.functionAttributeGroups.render();
  }
```

- [ ] **Step 6: Run targeted verification**

Run:

```bash
bun test tests/FunctionAttributes.test.ts tests/TypeCheckerExtended.test.ts tests/GoldenLLVMShapes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit attribute helper extraction**

Run:

```bash
git add compiler/middleend/validators/FunctionAttributeValidator.ts compiler/backend/codegen/attributes/FunctionAttributeGroups.ts compiler/middleend/TypeChecker.ts compiler/backend/codegen/BaseCodeGenerator.ts
git commit -m "refactor: extract function attribute helpers"
```

### Task 2: Extract Virtual Call Emitter

**Files:**
- Create: `compiler/backend/codegen/calls/VirtualCallEmitter.ts`
- Modify: `compiler/backend/codegen/CallExpressionGenerator.ts`
- Test: `tests/CodeGeneratorExtended.test.ts`
- Test: `tests/GoldenLLVMShapes.test.ts`
- Test: `tests/FunctionPointers.test.ts`
- Test: `tests/OOP.test.ts`

- [ ] **Step 1: Run current virtual-call characterization tests**

Run:

```bash
bun test tests/CodeGeneratorExtended.test.ts tests/GoldenLLVMShapes.test.ts tests/FunctionPointers.test.ts tests/OOP.test.ts
```

Expected: PASS.

- [ ] **Step 2: Create virtual call helper module**

Create `compiler/backend/codegen/calls/VirtualCallEmitter.ts`. Move the current logic from `generateVirtualCall`, `prepareVirtualCallObject`, `isAddressableVirtualReceiver`, `boxPrimitiveForVirtualCall`, `loadVTableMethod`, `resolveVirtualMethodSignature`, `findVirtualMethod`, `findMethodInDecl`, `getParentDecl`, and `prepareVirtualCallArgs` into this module as exported `emitVirtualCall(host, ...)` plus private helper functions.

The module starts with this host interface:

```ts
import * as AST from "../../../common/AST";
import { CompilerError } from "../../../common/CompilerError";
import { PRIMITIVE_STRUCT_MAP } from "../../../middleend/BuiltinTypes";

export interface VirtualCallHost {
  labelCount: number;
  vtableLayouts: Map<string, string[]>;
  structMap: Map<string, AST.StructDecl>;
  generateExpression(expr: AST.Expression): string;
  resolveType(type: AST.TypeNode): string;
  generateAddress(expr: AST.Expression): string;
  allocateStack(name: string, type: string): string;
  emit(line: string): void;
  newRegister(): string;
  substituteType(
    type: AST.TypeNode,
    map: Map<string, AST.TypeNode>,
  ): AST.TypeNode;
  getMangledName(
    name: string,
    type: AST.FunctionTypeNode,
    isExtern?: boolean,
    genericArgs?: AST.TypeNode[],
  ): string;
  emitCast(
    val: string,
    srcType: string,
    destType: string,
    srcTypeNode: AST.TypeNode,
    destTypeNode: AST.TypeNode,
  ): string;
}
```

The exported function signature is:

```ts
export function emitVirtualCall(
  host: VirtualCallHost,
  callExpr: AST.CallExpr,
  memberExpr: AST.MemberExpr,
  structName: string,
  methodIndex: number,
  argsToGenerate: AST.Expression[],
): string
```

- [ ] **Step 3: Wire `CallExpressionGenerator` to `emitVirtualCall`**

In `compiler/backend/codegen/CallExpressionGenerator.ts`, add:

```ts
import {
  emitVirtualCall,
  type VirtualCallHost,
} from "./calls/VirtualCallEmitter";
```

Replace `generateVirtualCall` with:

```ts
  protected generateVirtualCall(
    callExpr: AST.CallExpr,
    memberExpr: AST.MemberExpr,
    structName: string,
    methodIndex: number,
    argsToGenerate: AST.Expression[],
  ): string {
    return emitVirtualCall(
      this as unknown as VirtualCallHost,
      callExpr,
      memberExpr,
      structName,
      methodIndex,
      argsToGenerate,
    );
  }
```

Remove the helper methods that were moved into `VirtualCallEmitter.ts`.

- [ ] **Step 4: Run targeted virtual-call verification**

Run:

```bash
bun test tests/CodeGeneratorExtended.test.ts tests/GoldenLLVMShapes.test.ts tests/FunctionPointers.test.ts tests/OOP.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run type check**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 6: Commit virtual call extraction**

Run:

```bash
git add compiler/backend/codegen/calls/VirtualCallEmitter.ts compiler/backend/codegen/CallExpressionGenerator.ts
git commit -m "refactor: extract virtual call emitter"
```

### Task 3: Final Verification

**Files:**
- All files modified above.

- [ ] **Step 1: Run focused compiler subset**

Run:

```bash
bun test tests/FunctionAttributes.test.ts tests/TypeCheckerExtended.test.ts tests/CodeGeneratorExtended.test.ts tests/GoldenLLVMShapes.test.ts tests/FunctionPointers.test.ts tests/OOP.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full suite**

Run:

```bash
bun test tests/
```

Expected: PASS with the existing skipped `web_server_demo` integration test.

- [ ] **Step 3: Record file-size impact**

Run:

```bash
find compiler -type f -name '*.ts' -print0 | xargs -0 wc -l | sort -nr | head -20
```

Expected: `CallExpressionGenerator.ts`, `TypeChecker.ts`, and `BaseCodeGenerator.ts` have moved responsibility-specific logic into focused helper modules.

- [ ] **Step 4: Review branch status**

Run:

```bash
git status --short --branch
git log --oneline --decorate --max-count=8
```

Expected: clean working tree on `refactor/compiler-structure` with docs and refactor commits.
