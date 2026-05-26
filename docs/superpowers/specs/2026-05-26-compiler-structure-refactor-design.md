# Compiler Structure Refactor Design

## Purpose

Reduce the maintenance cost of the largest compiler files while preserving current compiler behavior. The refactor should make future codegen and type-checking feature work easier, make semantic checks easier to reason about, and reduce the size of the most overloaded files without creating a broad rewrite.

## Goals

- Split the largest files along existing responsibility boundaries.
- Keep public compiler entry points and AST semantics unchanged.
- Preserve the current inheritance-based codegen architecture during this pass.
- Move cohesive helper logic into focused modules with explicit names.
- Land changes in small, reviewable phases with targeted verification after each phase.
- Run the full suite after the major structure changes are complete.

## Non-Goals

- No language behavior changes.
- No parser, AST, type-system, or LLVM IR semantic changes.
- No replacement of the current codegen inheritance chain in this pass.
- No broad formatting-only churn across unrelated compiler files.
- No test snapshot updates unless the refactor reveals an existing deterministic output dependency.

## Current Pressure Points

The largest source files are concentrated in codegen and semantic checking:

- `compiler/backend/codegen/CallExpressionGenerator.ts`: call dispatch, virtual calls, spec dispatch, enum constructors, operator calls, direct calls, indirect calls, and argument lowering.
- `compiler/backend/codegen/TypeGenerator.ts`: LLVM type string resolution, DWARF debug type emission, mangling, generic instantiation, substitution, method owner lookup, and array/slice lowering.
- `compiler/middleend/TypeChecker.ts`: program passes, declaration hoisting, statement/expression delegation, function validation, struct validation, enum validation, spec validation, type aliases, imports, assignment checking, generic instantiation, overload resolution, and pattern checking.
- `compiler/backend/codegen/BinaryExpressionGenerator.ts`, `MatchExpressionGenerator.ts`, `StatementGenerator.ts`, `ExpressionChecker.ts`, and `Formatter.ts` are also large, but they should be secondary targets after the first three pressure points.

## Refactor Strategy

Use a phased boundary refactor. Each phase extracts cohesive logic to a small module while leaving call sites and generated behavior intact. The first phases should avoid changing the shape of the compiler pipeline because the current tests validate behavior at a high level and the inheritance chain still carries substantial protected state.

The first three phases are:

1. Extract function attribute validation and LLVM attribute group handling.
2. Extract codegen call-dispatch helpers from `CallExpressionGenerator.ts`.
3. Extract declaration validators from `TypeChecker.ts`.

`TypeGenerator.ts` should follow after these phases because it mixes several deeper concerns. It needs a separate plan once the first phases establish the extraction pattern and verification cadence.

## Architecture

### Semantic Validation Modules

Create focused modules under `compiler/middleend/validators/` for declaration-specific validation. These modules should export functions that accept the existing `TypeChecker` or a narrow context object only when they need checker state such as `resolveType` or `addError`.

Initial module:

- `FunctionAttributeValidator.ts`: owns the supported function attribute list, conflict rules, duplicate detection, unknown-name diagnostics, and `noreturn` return-type check.

Future modules:

- `FunctionValidator.ts`: parameter uniqueness, generic parameter validation, return-type setup helpers.
- `StructValidator.ts`: duplicate fields and methods, inheritance cycles, method override checks.
- `EnumValidator.ts`: duplicate variants, empty enum checks, recursive enum checks.
- `SpecValidator.ts`: duplicate method signatures, self-extension and extension cycle checks.

### Codegen Attribute Modules

Create focused modules under `compiler/backend/codegen/attributes/` for LLVM attribute concerns. These modules should be pure where possible and should not depend on codegen mutable state except through an owning registry object.

Initial module:

- `FunctionAttributeGroups.ts`: owns BPL-to-LLVM function attribute mapping, deterministic group registration, default frame-pointer group registration, and attribute group rendering.

`BaseCodeGenerator` keeps the protected methods used by subclasses, but delegates storage and rendering to the registry. This keeps the inheritance surface stable while shrinking base state logic.

### Codegen Call Modules

Create focused helper classes under `compiler/backend/codegen/calls/`. A helper class can accept a host object typed by a local interface containing the protected operations it needs. This avoids introducing static utility functions that would require passing dozens of loose arguments.

Initial modules:

- `VirtualCallEmitter.ts`: virtual receiver preparation, primitive boxing, vtable method load, method signature lookup, parent lookup, and virtual-call argument preparation.
- `SpecMethodCallEmitter.ts`: spec method signature lookup and vtable dispatch.
- `CallArgumentLowering.ts`: argument type normalization, implicit conversion lowering, and vararg-friendly coercions.

The first call-codegen phase should extract `VirtualCallEmitter` only. It is a cohesive block near the top of `CallExpressionGenerator.ts` and has a clear public operation: emit a virtual call. Later phases can extract spec dispatch and argument lowering once the helper-host pattern is proven.

### Type Generation Modules

`TypeGenerator.ts` should be split after the first phases. Candidate modules:

- `TypeMangler.ts`: `mangleType`, generic-name mangling, and function-name mangling helpers.
- `DwarfTypeEmitter.ts`: debug type ID generation and DWARF-specific type metadata.
- `GenericTypeInstantiator.ts`: generic struct/enum instantiation and substitution helpers.
- `ArraySliceLowering.ts`: array-to-slice and array-to-pointer lowering helpers.
- `TypeResolver.ts`: LLVM type string resolution.

This phase needs extra care because `resolveType` and monomorphization are high-risk shared paths.

## Data Flow

Semantic validation remains:

```text
Parser -> AST -> TypeChecker.checkProgram -> declaration validators -> expression/statement checkers
```

Code generation remains:

```text
Typed AST -> CodeGenerator.generate -> StatementGenerator -> ExpressionGenerator -> call/type helpers -> LLVM IR
```

The refactor changes where helper logic lives, not when it runs. Existing diagnostics should keep their current wording and source locations unless the extracted module can preserve them exactly.

## Error Handling

Extracted semantic validators must continue to report through `TypeChecker.addError` or throw `CompilerError` exactly where the current implementation does. Extracted codegen helpers should preserve current thrown `CompilerError` messages and locations.

If a helper needs to report a new internal invariant failure, it should use the existing error style and include enough context for the call site. The refactor should not convert user-facing compile errors into generic runtime exceptions.

## Testing Strategy

Each phase uses targeted tests for touched behavior, then a wider compiler subset:

- Function attributes and type-checking phase:
  `bun test tests/FunctionAttributes.test.ts tests/TypeCheckerExtended.test.ts`
- Codegen call phase:
  `bun test tests/CodeGeneratorExtended.test.ts tests/GoldenLLVMShapes.test.ts tests/FunctionPointers.test.ts tests/OOP.test.ts`
- Type generation phase:
  `bun test tests/GoldenLLVMShapes.test.ts tests/CodeGeneratorExtended.test.ts tests/TypeCheckerExtended.test.ts tests/FunctionAttributes.test.ts`

After all planned phase changes are complete:

```bash
bun test tests/
```

The baseline before this refactor was:

```text
bun test tests/FunctionAttributes.test.ts tests/CodeGeneratorExtended.test.ts tests/TypeCheckerExtended.test.ts tests/GoldenLLVMShapes.test.ts
114 pass, 0 fail
```

## Rollout

Use one branch:

```text
refactor/compiler-structure
```

Use small commits:

1. `docs: design compiler structure refactor`
2. `docs: plan compiler structure refactor`
3. `refactor: extract function attribute helpers`
4. `refactor: extract virtual call emitter`

Later commits should continue the same pattern for spec dispatch, type generation, and declaration validators.

## Acceptance Criteria

- `TypeChecker.ts`, `BaseCodeGenerator.ts`, and `CallExpressionGenerator.ts` lose meaningful responsibility-specific code without behavior changes.
- New modules have clear names and narrow responsibilities.
- Existing tests for function attributes, type checking, codegen, function pointers, and OOP pass.
- Full `bun test tests/` passes before merging the branch.
- The refactor creates a pattern that can be repeated for `TypeGenerator.ts` and the remaining large files.
