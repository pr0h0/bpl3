import * as fs from "fs";
import * as path from "path";
import * as AST from "../common/AST";
import {
  createTypeStructDecl,
  createIntStructDecl,
  createBoolStructDecl,
  createDoubleStructDecl,
  createStringStructDecl,
} from "../middleend/BuiltinTypes";
import { StatementGenerator } from "./codegen/StatementGenerator";
import { CompilerError } from "../common/CompilerError";
import { codeGenLog } from "../common/Logger";
import { walkAST } from "../common/ASTTraversal";
import { DebugInfoGenerator } from "./codegen/DebugInfoGenerator";
import { getDataLayoutForTarget } from "./codegen/BaseCodeGenerator";
import { findSymlinkedPathComponent } from "../common/PathSafety";

export const CODEGEN_DEBUG_IR_PATH_SYMLINK_CODE =
  "BPL_CODEGEN_DEBUG_IR_PATH_SYMLINK";
export const CODEGEN_DEBUG_IR_PATH_EMPTY_CODE =
  "BPL_CODEGEN_DEBUG_IR_PATH_EMPTY";
export const CODEGEN_DEBUG_IR_PATH_NOT_FILE_CODE =
  "BPL_CODEGEN_DEBUG_IR_PATH_NOT_FILE";
export const CODEGEN_DEBUG_IR_PARENT_NOT_FOUND_CODE =
  "BPL_CODEGEN_DEBUG_IR_PARENT_NOT_FOUND";
export const CODEGEN_DEBUG_IR_PARENT_SYMLINK_CODE =
  "BPL_CODEGEN_DEBUG_IR_PARENT_SYMLINK";
export const CODEGEN_DEBUG_IR_PARENT_NOT_DIRECTORY_CODE =
  "BPL_CODEGEN_DEBUG_IR_PARENT_NOT_DIRECTORY";

export const CODEGEN_JSON_ERROR_CODES = [
  CODEGEN_DEBUG_IR_PATH_EMPTY_CODE,
  CODEGEN_DEBUG_IR_PATH_SYMLINK_CODE,
  CODEGEN_DEBUG_IR_PATH_NOT_FILE_CODE,
  CODEGEN_DEBUG_IR_PARENT_NOT_FOUND_CODE,
  CODEGEN_DEBUG_IR_PARENT_SYMLINK_CODE,
  CODEGEN_DEBUG_IR_PARENT_NOT_DIRECTORY_CODE,
] as const;

const PRUNABLE_INTERNAL_RUNTIME_DECLARATIONS = new Set([
  "__bpl_argc",
  "__bpl_argv_get",
  "__bpl_throw_stack_overflow",
  "__bpl_throw_null_access",
  "__bpl_throw_division_by_zero",
  "__bpl_throw_integer_overflow",
  "__bpl_throw_index_out_of_bounds",
  "__bpl_enter_stack_frame",
  "__bpl_exit_stack_frame",
  "__bpl_check_null",
  "__bpl_mem_is_zero",
  "__bpl_strlen",
]);

const PRUNABLE_INTERNAL_RUNTIME_GLOBALS = new Set([
  "defer_top",
  "exception_top",
  "exception_value",
  "exception_type",
  "__bpl_stack_depth",
  "__bpl_stack_limit",
  "__bpl_argc_value",
  "__bpl_argv_value",
]);

const PRUNABLE_INTERNAL_RUNTIME_STRUCTS = new Set([
  "DeferNode",
  "ExceptionFrame",
  "DivisionByZeroError",
  "NullAccessError",
  "IndexOutOfBoundsError",
]);

const PRUNABLE_IMPLICIT_C_STRUCTS = new Set(["_IO_FILE"]);

const PRUNABLE_BUILTIN_PRIMITIVE_STRUCTS = new Set([
  "Type",
  "Int",
  "Bool",
  "Double",
  "String",
]);

const PRUNABLE_BUILTIN_PRIMITIVE_DECLARATIONS = new Set([
  "Type_getTypeName_Type_ptr",
  "Type_toString_Type_ptr",
  "Type_destroy_Type_ptr",
]);

const PRUNABLE_BUILTIN_PRIMITIVE_GLOBALS = new Set(["Type_vtable"]);

type LlvmReferences = {
  symbols: Set<string>;
  structs: Set<string>;
};

/**
 * Main entry point for LLVM IR code generation.
 *
 * This is the final class in a 14-level inheritance chain that transforms
 * type-checked BPL AST nodes into LLVM IR text format.
 *
 * @example
 * ```typescript
 * const generator = new CodeGenerator({ target: "x86_64-linux-gnu" });
 * const llvmIR = generator.generate(typedAST, "main.bpl");
 * ```
 *
 * @see compiler/backend/codegen/ARCHITECTURE.md for the full inheritance hierarchy
 *
 * Inheritance chain:
 * - BaseCodeGenerator → StructEnumGenerator → TypeGenerator → ReflectionGenerator
 * - → AddressExpressionGenerator → BinaryExpressionGenerator → CallExpressionGenerator
 * - → MatchExpressionGenerator → UnaryExpressionGenerator → ExpressionGenerator
 * - → ExceptionGenerator → AsmGenerator → StatementGenerator → **CodeGenerator**
 */
export class CodeGenerator extends StatementGenerator {
  private prunableImplicitCDeclarations: Set<string> = new Set();
  private generatedBodyUsesArgcRuntimeHelper = false;
  private generatedBodyUsesArgvRuntimeHelper = false;
  private generatedArgcStoreOutputIndex: number | undefined;
  private generatedArgvStoreOutputIndex: number | undefined;

  constructor(
    options: {
      stdLibPath?: string;
      useLinkOnceOdrForStdLib?: boolean;
      target?: string;
      dwarf?: boolean;
      optimizationLevel?: number;
      treeShakeTopLevelFunctions?: boolean;
      debugIrPath?: string | false;
    } = {},
  ) {
    super(options);
  }

  generate(program: AST.Program, filePath?: string): string {
    if (filePath) {
      this.currentFilePath = filePath;
    }

    if (this.generateDwarf) {
      this.debugInfoGenerator = new DebugInfoGenerator(
        filePath || "unknown.bpl",
        ".",
        this.target,
      );
      this.debugInfoGenerator.createCompileUnit();
    }

    this.output = [];
    this.declarationsOutput = [];
    this.prunableImplicitCDeclarations.clear();
    this.generatedBodyUsesArgcRuntimeHelper = false;
    this.generatedBodyUsesArgvRuntimeHelper = false;
    this.generatedArgcStoreOutputIndex = undefined;
    this.generatedArgvStoreOutputIndex = undefined;
    this.stringLiterals.clear();
    this.structLayouts.clear();
    this.structMap.clear();
    this.structFieldListCache.clear();
    this.sortedStructLayoutEntriesCache.clear();
    this.structFieldByNameCache.clear();
    this.clearDefaultValueCaches();
    this.registerBuiltinLayouts();
    this.loopStack = [];
    this.declaredFunctions.clear();
    this.definedFunctions.clear();
    this.emittedFunctions.clear();
    this.globals.clear();
    this.locals.clear();
    this.generatedStructs.clear();
    this.typeIdMap.clear();
    this.nextTypeId = 10; // Start from 10 to avoid conflicts
    this.emittedMemIsZero = false;
    this.enumVariants.clear();
    this.enumDataSizes.clear();
    this.definedFunctions.clear();
    this.emittedFunctions.clear();
    this.typeAliasMap.clear();
    this.specMap.clear();
    this.usedLlvmMemIntrinsics.clear();
    this.resetLlvmAttributeGroups();

    // Populate structMap and enumDeclMap with user-defined types first
    for (const stmt of program.statements) {
      if (stmt.kind === "StructDecl") {
        this.structMap.set(
          (stmt as AST.StructDecl).name,
          stmt as AST.StructDecl,
        );
      } else if (stmt.kind === "EnumDecl") {
        this.enumDeclMap.set((stmt as AST.EnumDecl).name, stmt as AST.EnumDecl);
      } else if (stmt.kind === "SpecDecl") {
        this.specMap.set((stmt as AST.SpecDecl).name, stmt as AST.SpecDecl);
      } else if (stmt.kind === "TypeAlias") {
        this.typeAliasMap.set(
          (stmt as AST.TypeAliasDecl).name,
          stmt as AST.TypeAliasDecl,
        );
      }
    }

    // Collect defined functions to avoid unnecessary declarations
    for (const stmt of program.statements) {
      if (stmt.kind === "TypeAlias") {
        const decl = stmt as AST.TypeAliasDecl;
        this.typeAliasMap.set(decl.name, decl);
      }
    }

    // Index Structs for inheritance lookup
    for (const stmt of program.statements) {
      if (stmt.kind === "StructDecl") {
        this.structMap.set(
          (stmt as AST.StructDecl).name,
          stmt as AST.StructDecl,
        );
      } else if (stmt.kind === "SpecDecl") {
        const spec = stmt as AST.SpecDecl;
        this.emitDeclaration(`%struct.${spec.name} = type opaque`);
      }
    }

    // Emitting layouts for built-ins is required even if we don't emit their methods.
    // This allows LLVM to know the size and fields of these structs.

    // 1. Primitives
    const builtinPrimitives = [
      createTypeStructDecl(),
      createIntStructDecl(),
      createBoolStructDecl(),
      createDoubleStructDecl(),
      createStringStructDecl(), // Let String be generated from stdlib source
    ];
    for (const decl of builtinPrimitives) {
      if (!this.structMap.has(decl.name)) {
        this.registerBuiltinLayout(decl);
      }
      this.generateStruct(this.structMap.get(decl.name)!);
    }

    // 2. Errors
    const builtinErrorNames = [
      "DivisionByZeroError",
      "NullAccessError",
      "IndexOutOfBoundsError",
    ];

    this.computeVTableLayouts(program);
    this.collectStructLayouts(program);

    for (const name of builtinErrorNames) {
      if (this.structMap.has(name)) {
        this.generateStruct(this.structMap.get(name)!);
      }
    }

    const reachableTopLevelFunctions =
      this.collectReachableTopLevelFunctions(program);
    for (const stmt of program.statements) {
      if (
        reachableTopLevelFunctions &&
        stmt.kind === "FunctionDecl" &&
        !reachableTopLevelFunctions.has(stmt as AST.FunctionDecl)
      ) {
        continue;
      }
      this.generateTopLevel(stmt);
    }

    // Standard library declarations - Emitted AFTER user code to avoid collisions
    if (!this.declaredFunctions.has("malloc")) {
      this.emitPrunableImplicitCDeclaration("declare i8* @malloc(i64)");
      this.declaredFunctions.add("malloc");
    }
    if (!this.declaredFunctions.has("free")) {
      this.emitPrunableImplicitCDeclaration("declare void @free(i8*)");
      this.declaredFunctions.add("free");
    }
    if (!this.declaredFunctions.has("exit")) {
      this.emitPrunableImplicitCDeclaration("declare void @exit(i32)");
      this.declaredFunctions.add("exit");
    }
    if (!this.declaredFunctions.has("memcmp")) {
      this.emitPrunableImplicitCDeclaration("declare i32 @memcmp(i8*, i8*, i64)");
      this.declaredFunctions.add("memcmp");
    }
    if (!this.declaredFunctions.has("strcmp")) {
      this.emitPrunableImplicitCDeclaration("declare i32 @strcmp(i8*, i8*)");
      this.declaredFunctions.add("strcmp");
    }

    // fprintf and stderr for null trap error messages (kept for backward compatibility)
    this.emitPrunableImplicitCDeclaration("%struct._IO_FILE = type opaque");
    this.emitPrunableImplicitCDeclaration(
      "@stderr = external global %struct._IO_FILE*",
    );
    if (!this.declaredFunctions.has("fprintf")) {
      this.emitPrunableImplicitCDeclaration(
        "declare i32 @fprintf(%struct._IO_FILE*, i8*, ...)",
      );
      this.declaredFunctions.add("fprintf");
    }

    // Exception Handling Primitives
    // Defer Node
    this.emitDeclaration(
      `%struct.DeferNode = type { i8*, i8*, %struct.DeferNode* }`,
    );
    this.emitDeclaration(`@defer_top = external global %struct.DeferNode*`);

    // jmp_buf is platform dependent. [32 x i64] is 256 bytes, sufficient for x64.
    // Added saved_defer_top to restore defer stack on catch
    this.emitDeclaration(
      `%struct.ExceptionFrame = type { [32 x i64], %struct.ExceptionFrame*, %struct.DeferNode* }`,
    );
    this.emitDeclaration(
      `@exception_top = external global %struct.ExceptionFrame*`,
    );
    this.emitDeclaration(`@exception_value = external global i64`);
    this.emitDeclaration(`@exception_type = external global i32`);
    this.emitDeclaration(`@__bpl_stack_depth = external global i32`);
    this.emitDeclaration(`@__bpl_stack_limit = external global i8*`);

    // Global argc/argv for Args library
    this.emitDeclaration(`@__bpl_argc_value = external global i32`);
    this.emitDeclaration(`@__bpl_argv_value = external global i8**`);

    if (!this.declaredFunctions.has("setjmp")) {
      this.emitPrunableImplicitCDeclaration(
        `declare i32 @setjmp(i8*) returns_twice`,
      );
      this.declaredFunctions.add("setjmp");
    }
    if (!this.declaredFunctions.has("longjmp")) {
      this.emitPrunableImplicitCDeclaration(
        `declare void @longjmp(i8*, i32) noreturn`,
      );
      this.declaredFunctions.add("longjmp");
    }

    // Helper functions for accessing argc/argv
    if (!this.declaredFunctions.has("__bpl_argc")) {
      this.emitDeclaration(`declare i32 @__bpl_argc()`);
      this.declaredFunctions.add("__bpl_argc");
    }
    if (!this.declaredFunctions.has("__bpl_argv_get")) {
      this.emitDeclaration(`declare i8* @__bpl_argv_get(i32)`);
      this.declaredFunctions.add("__bpl_argv_get");
    }

    // Throw Helpers
    // These internal functions are safe to emit unconditionally (namespaced)
    this.emitDeclaration(`declare void @__bpl_throw_stack_overflow()`);
    this.declaredFunctions.add("__bpl_throw_stack_overflow");
    this.emitDeclaration(
      `declare void @__bpl_throw_null_access(i8*, i8*, i32, i32)`,
    );
    this.declaredFunctions.add("__bpl_throw_null_access");
    this.emitDeclaration(
      `declare void @__bpl_throw_division_by_zero(i8*, i32, i32)`,
    );
    this.declaredFunctions.add("__bpl_throw_division_by_zero");
    this.emitDeclaration(
      `declare void @__bpl_throw_integer_overflow(i8*, i32, i32)`,
    );
    this.declaredFunctions.add("__bpl_throw_integer_overflow");
    this.emitDeclaration(
      `declare void @__bpl_throw_index_out_of_bounds(i32, i32, i8*, i32, i32)`,
    );
    this.declaredFunctions.add("__bpl_throw_index_out_of_bounds");

    // Runtime Checks Declarations
    this.emitDeclaration(`declare void @__bpl_enter_stack_frame()`);
    this.declaredFunctions.add("__bpl_enter_stack_frame");

    this.emitDeclaration(`declare void @__bpl_exit_stack_frame()`);
    this.declaredFunctions.add("__bpl_exit_stack_frame");

    this.emitDeclaration(
      `declare void @__bpl_check_null(i8*, i8*, i8*, i32, i32)`,
    );
    this.declaredFunctions.add("__bpl_check_null");

    this.emitDeclaration("");

    // Helper: memory zero-check function used for 'struct == null' comparisons
    this.emitDeclaration("declare i1 @__bpl_mem_is_zero(i8*, i64)");
    if (this.target?.toLowerCase().includes("wasm")) {
      this.emitDeclaration("declare i64 @__bpl_strlen(i8*)");
    }

    // Process pending lambdas and monomorphized functions iteratively
    // This is necessary because monomorphized functions might generate lambdas,
    // and lambdas might trigger new monomorphizations.
    let iterationCount = 0;
    while (
      this.pendingLambdas.length > 0 ||
      this.pendingGenerations.length > 0
    ) {
      if (this.pendingGenerations.length > 0) {
        iterationCount++;
      }

      if (iterationCount > 50) {
        throw new CompilerError(
          "Infinite monomorphization detected (exceeded 50 generation batches)",
          "Generic recursion depth limit exceeded. Check for infinite recursive generic instantiations.",
          program.location || {
            file: "unknown",
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
        );
      }
      this.processPendingLambdas();

      // Process one batch of pending generations
      // We use a while loop here to process all currently pending generations
      // before checking lambdas again, but we could also do one by one.
      const currentGenerations = [...this.pendingGenerations];
      this.pendingGenerations = [];
      for (const task of currentGenerations) {
        task();
      }
    }

    if (this.usedLlvmMemIntrinsics.has("memcpy")) {
      this.emitDeclaration(
        "declare void @llvm.memcpy.p0i8.p0i8.i64(i8*, i8*, i64, i1)",
      );
    }
    if (this.usedLlvmMemIntrinsics.has("memmove")) {
      this.emitDeclaration(
        "declare void @llvm.memmove.p0i8.p0i8.i64(i8*, i8*, i64, i1)",
      );
    }
    if (this.usedLlvmMemIntrinsics.has("memset")) {
      this.emitDeclaration(
        "declare void @llvm.memset.p0i8.i64(i8*, i8, i64, i1)",
      );
    }

    if (this.generateDwarf) {
      const metadata = this.debugInfoGenerator.generateMetadataOutput();
      this.output.push(...metadata);
    }

    let header = "";
    if (this.target) {
      const datalayout = getDataLayoutForTarget(this.target);
      header += `target datalayout = "${datalayout}"\n`;
      header += `target triple = "${this.target}"\n`;
    }
    if (this.currentFilePath) {
      const filename = this.currentFilePath.split("/").pop() || "unknown";
      header += `source_filename = "${filename}"\n`;
    }

    for (const [content, varName] of this.stringLiterals) {
      // BUG-118: Use UTF-8 byte length, not JavaScript string length
      const len = this.getUtf8ByteLength(content) + 1; // +1 for null terminator
      const escaped = this.escapeString(content);
      header += `${varName} = private unnamed_addr constant [${len} x i8] c"${escaped}\\00", align 1\n`;
    }

    // Emit opaque declarations for skipped structs that were never generated
    for (const structName of this.skippedStructs) {
      if (!this.generatedStructs.has(structName)) {
        this.declarationsOutput.push(`%struct.${structName} = type opaque`);
      }
    }

    this.pruneUnusedRuntimeArgStores();
    const generatedBody = this.joinCompactedLines(this.output);
    const generatedBodyReferences =
      this.collectLlvmReferences(generatedBody);
    this.pruneUnusedInternalRuntimeDeclarations(generatedBodyReferences);
    this.pruneUnusedBuiltinPrimitiveMetadata(generatedBodyReferences);

    const resultSections: string[] = [];
    this.appendResultSection(resultSections, header);
    this.appendResultSection(
      resultSections,
      this.joinCompactedLines(this.declarationsOutput),
    );
    this.appendResultSection(resultSections, generatedBody);
    this.appendResultSection(
      resultSections,
      this.getLlvmAttributeGroupOutput(),
    );

    const result = `${resultSections.join("\n\n")}\n`;

    if (this.debugIrPath !== false) {
      this.writeDebugIr(result);
    }

    return result;
  }

  protected override noteDirectFunctionCall(name: string): void {
    if (name === "__bpl_argc") {
      this.generatedBodyUsesArgcRuntimeHelper = true;
      return;
    }
    if (name === "__bpl_argv_get") {
      this.generatedBodyUsesArgvRuntimeHelper = true;
    }
  }

  protected override noteGeneratedMainArgcStore(): void {
    this.generatedArgcStoreOutputIndex = this.output.length - 1;
  }

  protected override noteGeneratedMainArgvStore(): void {
    this.generatedArgvStoreOutputIndex = this.output.length - 1;
  }

  private pruneUnusedRuntimeArgStores(): void {
    if (!this.generatedBodyUsesArgvRuntimeHelper) {
      this.removeGeneratedRuntimeArgStore(this.generatedArgvStoreOutputIndex);
    }
    if (!this.generatedBodyUsesArgcRuntimeHelper) {
      this.removeGeneratedRuntimeArgStore(this.generatedArgcStoreOutputIndex);
    }
  }

  private removeGeneratedRuntimeArgStore(index: number | undefined): void {
    if (index !== undefined) {
      this.output.splice(index, 1);
    }
  }

  private pruneUnusedInternalRuntimeDeclarations(
    generatedBodyReferences: LlvmReferences,
  ): void {
    this.declarationsOutput = this.declarationsOutput.filter((line) => {
      const name = this.getDeclaredFunctionName(line);
      if (
        name === null ||
        !PRUNABLE_INTERNAL_RUNTIME_DECLARATIONS.has(name)
      ) {
        return true;
      }
      return generatedBodyReferences.symbols.has(name);
    });
    this.declarationsOutput = this.declarationsOutput.filter((line) => {
      if (!this.prunableImplicitCDeclarations.has(line)) {
        return true;
      }
      const name = this.getDeclaredFunctionName(line);
      if (name === null) {
        return true;
      }
      return generatedBodyReferences.symbols.has(name);
    });
    this.declarationsOutput = this.declarationsOutput.filter((line) => {
      const name = this.getDeclaredGlobalName(line);
      if (name === null || !PRUNABLE_INTERNAL_RUNTIME_GLOBALS.has(name)) {
        return true;
      }
      return generatedBodyReferences.symbols.has(name);
    });
    this.declarationsOutput = this.declarationsOutput.filter((line) => {
      if (!this.prunableImplicitCDeclarations.has(line)) {
        return true;
      }
      const name = this.getDeclaredGlobalName(line);
      if (name === null) {
        return true;
      }
      return generatedBodyReferences.symbols.has(name);
    });

    this.pruneUnusedInternalRuntimeStructs(generatedBodyReferences);
    this.pruneUnusedImplicitCStructs(generatedBodyReferences);
  }

  private emitPrunableImplicitCDeclaration(line: string): void {
    this.prunableImplicitCDeclarations.add(line);
    this.emitDeclaration(line);
  }

  private getDeclaredFunctionName(line: string): string | null {
    return line.match(/^declare\b.*@([A-Za-z0-9_]+)\(/)?.[1] ?? null;
  }

  private getDeclaredGlobalName(line: string): string | null {
    return line.match(/^@([A-Za-z0-9_]+) = external global\b/)?.[1] ?? null;
  }

  private getDefinedGlobalName(line: string): string | null {
    return line.match(/^@([A-Za-z0-9_]+)\s*=/)?.[1] ?? null;
  }

  private getDeclaredStructName(line: string): string | null {
    return line.match(/^%struct\.([A-Za-z0-9_]+) = type\b/)?.[1] ?? null;
  }

  private pruneUnusedInternalRuntimeStructs(
    generatedBodyReferences: LlvmReferences,
  ): void {
    const structDeclarations = new Map<string, string>();
    for (const line of this.declarationsOutput) {
      const name = this.getDeclaredStructName(line);
      if (name !== null && PRUNABLE_INTERNAL_RUNTIME_STRUCTS.has(name)) {
        structDeclarations.set(name, line);
      }
    }

    if (structDeclarations.size === 0) {
      return;
    }

    const rootReferences =
      this.cloneLlvmReferences(generatedBodyReferences);
    const retained = new Set<string>();
    const declarationReferences = new Map<string, LlvmReferences>();

    for (const line of this.declarationsOutput) {
      const name = this.getDeclaredStructName(line);
      if (name === null || !PRUNABLE_INTERNAL_RUNTIME_STRUCTS.has(name)) {
        this.addLlvmReferencesFromText(rootReferences, line);
      } else {
        declarationReferences.set(name, this.collectLlvmReferences(line));
      }
    }

    for (const name of structDeclarations.keys()) {
      if (rootReferences.structs.has(name)) {
        retained.add(name);
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const name of [...retained]) {
        if (!structDeclarations.has(name)) continue;
        const references = declarationReferences.get(name);
        if (references === undefined) continue;
        for (const dependency of structDeclarations.keys()) {
          if (!retained.has(dependency) && references.structs.has(dependency)) {
            retained.add(dependency);
            changed = true;
          }
        }
      }
    }

    this.declarationsOutput = this.declarationsOutput.filter((line) => {
      const name = this.getDeclaredStructName(line);
      return (
        name === null ||
        !PRUNABLE_INTERNAL_RUNTIME_STRUCTS.has(name) ||
        retained.has(name)
      );
    });
  }

  private pruneUnusedImplicitCStructs(
    generatedBodyReferences: LlvmReferences,
  ): void {
    const rootReferences =
      this.cloneLlvmReferences(generatedBodyReferences);

    for (const line of this.declarationsOutput) {
      const name = this.getDeclaredStructName(line);
      if (
        name === null ||
        !this.prunableImplicitCDeclarations.has(line) ||
        !PRUNABLE_IMPLICIT_C_STRUCTS.has(name)
      ) {
        this.addLlvmReferencesFromText(rootReferences, line);
      }
    }

    this.declarationsOutput = this.declarationsOutput.filter((line) => {
      if (!this.prunableImplicitCDeclarations.has(line)) {
        return true;
      }

      const name = this.getDeclaredStructName(line);
      return (
        name === null ||
        !PRUNABLE_IMPLICIT_C_STRUCTS.has(name) ||
        rootReferences.structs.has(name)
      );
    });
  }

  private pruneUnusedBuiltinPrimitiveMetadata(
    generatedBodyReferences: LlvmReferences,
  ): void {
    const candidateDeclarations = this.declarationsOutput.filter((line) =>
      this.isPrunableBuiltinPrimitiveMetadata(line),
    );

    if (candidateDeclarations.length === 0) {
      return;
    }

    const rootReferences =
      this.cloneLlvmReferences(generatedBodyReferences);
    const retainedReferences = this.createLlvmReferences();
    const retained = new Set<string>();
    const candidateReferences = new Map<string, LlvmReferences>();

    for (const line of this.declarationsOutput) {
      if (this.isPrunableBuiltinPrimitiveMetadata(line)) {
        candidateReferences.set(line, this.collectLlvmReferences(line));
      } else {
        this.addLlvmReferencesFromText(rootReferences, line);
      }
    }

    const markRetained = (line: string): void => {
      if (retained.has(line)) return;
      retained.add(line);
      const references = candidateReferences.get(line);
      if (references !== undefined) {
        this.addLlvmReferences(retainedReferences, references);
      }
    };

    const retainCandidateIfReferencedBy = (
      line: string,
      references: LlvmReferences,
    ) => {
      const structName = this.getDeclaredStructName(line);
      if (
        structName !== null &&
        PRUNABLE_BUILTIN_PRIMITIVE_STRUCTS.has(structName) &&
        references.structs.has(structName)
      ) {
        markRetained(line);
        return;
      }

      const declarationName = this.getDeclaredFunctionName(line);
      if (
        declarationName !== null &&
        PRUNABLE_BUILTIN_PRIMITIVE_DECLARATIONS.has(declarationName) &&
        references.symbols.has(declarationName)
      ) {
        markRetained(line);
        return;
      }

      const globalName = this.getDefinedGlobalName(line);
      if (
        globalName !== null &&
        PRUNABLE_BUILTIN_PRIMITIVE_GLOBALS.has(globalName) &&
        references.symbols.has(globalName)
      ) {
        markRetained(line);
      }
    };

    for (const line of candidateDeclarations) {
      retainCandidateIfReferencedBy(line, rootReferences);
    }

    let changed = true;
    while (changed) {
      changed = false;
      const retainedBefore = retained.size;

      for (const line of candidateDeclarations) {
        if (!retained.has(line)) {
          retainCandidateIfReferencedBy(line, retainedReferences);
        }
      }

      changed = retained.size !== retainedBefore;
    }

    this.declarationsOutput = this.declarationsOutput.filter(
      (line) =>
        !this.isPrunableBuiltinPrimitiveMetadata(line) || retained.has(line),
    );
  }

  private isPrunableBuiltinPrimitiveMetadata(line: string): boolean {
    const structName = this.getDeclaredStructName(line);
    if (
      structName !== null &&
      PRUNABLE_BUILTIN_PRIMITIVE_STRUCTS.has(structName)
    ) {
      return true;
    }

    const declarationName = this.getDeclaredFunctionName(line);
    if (
      declarationName !== null &&
      PRUNABLE_BUILTIN_PRIMITIVE_DECLARATIONS.has(declarationName)
    ) {
      return true;
    }

    const globalName = this.getDefinedGlobalName(line);
    return (
      globalName !== null && PRUNABLE_BUILTIN_PRIMITIVE_GLOBALS.has(globalName)
    );
  }

  private joinCompactedLines(lines: string[]): string {
    let result = "";
    let previousWasBlank = true;
    let hasOutput = false;

    for (const line of lines) {
      const isBlank = line.length === 0;
      if (isBlank && previousWasBlank) {
        continue;
      }

      if (hasOutput) {
        result += "\n";
      }
      result += line;
      hasOutput = true;
      previousWasBlank = isBlank;
    }

    if (previousWasBlank && hasOutput) {
      result = result.slice(0, -1);
    }

    return result;
  }

  private appendResultSection(sections: string[], section: string): void {
    const trimmed = section.trimEnd();
    if (trimmed.length > 0) {
      sections.push(trimmed);
    }
  }

  private createLlvmReferences(): LlvmReferences {
    return {
      symbols: new Set(),
      structs: new Set(),
    };
  }

  private cloneLlvmReferences(references: LlvmReferences): LlvmReferences {
    return {
      symbols: new Set(references.symbols),
      structs: new Set(references.structs),
    };
  }

  private addLlvmReferences(
    target: LlvmReferences,
    source: LlvmReferences,
  ): void {
    for (const symbol of source.symbols) {
      target.symbols.add(symbol);
    }
    for (const struct of source.structs) {
      target.structs.add(struct);
    }
  }

  private collectLlvmReferences(llvmBody: string): LlvmReferences {
    const references = this.createLlvmReferences();
    this.addLlvmReferencesFromText(references, llvmBody);
    return references;
  }

  private addLlvmReferencesFromText(
    references: LlvmReferences,
    llvmBody: string,
  ): void {
    this.addLlvmSymbolReferencesFromText(references, llvmBody);
    this.addLlvmStructReferencesFromText(references, llvmBody);
  }

  private addLlvmSymbolReferencesFromText(
    references: LlvmReferences,
    llvmBody: string,
  ): void {
    let index = 0;
    while (true) {
      const symbolIndex = llvmBody.indexOf("@", index);
      if (symbolIndex === -1) break;

      const start = symbolIndex + 1;
      const end = this.scanLlvmReferenceNameEnd(llvmBody, start);
      if (end > start) {
        references.symbols.add(llvmBody.slice(start, end));
        index = end;
      } else {
        index = start;
      }
    }
  }

  private addLlvmStructReferencesFromText(
    references: LlvmReferences,
    llvmBody: string,
  ): void {
    let index = 0;
    while (true) {
      const structIndex = llvmBody.indexOf("%struct.", index);
      if (structIndex === -1) break;

      const start = structIndex + "%struct.".length;
      const end = this.scanLlvmReferenceNameEnd(llvmBody, start);
      if (end > start) {
        references.structs.add(llvmBody.slice(start, end));
        index = end;
      } else {
        index = start + 1;
      }
    }
  }

  private scanLlvmReferenceNameEnd(llvmBody: string, start: number): number {
    let end = start;
    while (end < llvmBody.length) {
      const code = llvmBody.charCodeAt(end);
      if (
        !(
          (code >= 48 && code <= 57) ||
          (code >= 65 && code <= 90) ||
          (code >= 97 && code <= 122) ||
          code === 95 ||
          code === 46 ||
          code === 36
        )
      ) {
        break;
      }
      end++;
    }
    return end;
  }

  private writeDebugIr(result: string): void {
    if (this.debugIrPath === false) return;

    if (this.debugIrPath.trim().length === 0) {
      throw this.createDebugIrPathError(
        "Debug IR path is empty.",
        "Choose a non-empty debug IR file path or use BPL_DEBUG_IR=0/false to disable diagnostic IR output.",
        CODEGEN_DEBUG_IR_PATH_EMPTY_CODE,
        this.currentFilePath || "<debug-ir-path>",
      );
    }

    let existingPath: fs.Stats | undefined;
    try {
      existingPath = fs.lstatSync(this.debugIrPath);
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }

    if (existingPath?.isSymbolicLink()) {
      throw this.createDebugIrPathError(
        `Debug IR path is a symbolic link: ${this.debugIrPath}`,
        "Choose a real debug IR file path, not a symbolic link.",
        CODEGEN_DEBUG_IR_PATH_SYMLINK_CODE,
        this.debugIrPath,
      );
    }
    if (existingPath && !existingPath.isFile()) {
      throw this.createDebugIrPathError(
        `Debug IR path is not a file: ${this.debugIrPath}`,
        "Choose a regular .ll file path or remove the existing non-file path.",
        CODEGEN_DEBUG_IR_PATH_NOT_FILE_CODE,
        this.debugIrPath,
      );
    }

    const debugIrParent = path.dirname(path.resolve(this.debugIrPath));
    let parentPath: fs.Stats;
    try {
      parentPath = fs.lstatSync(debugIrParent);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "ENOENT" || error.code === "ENOTDIR")
      ) {
        throw this.createDebugIrPathError(
          `Debug IR parent path does not exist: ${debugIrParent}`,
          "Create the parent directory or choose an existing output directory.",
          CODEGEN_DEBUG_IR_PARENT_NOT_FOUND_CODE,
          debugIrParent,
        );
      }
      throw error;
    }
    if (parentPath.isSymbolicLink()) {
      throw this.createDebugIrPathError(
        `Debug IR parent path is a symbolic link: ${debugIrParent}`,
        "Choose a debug IR output directory whose parent path contains only real directories.",
        CODEGEN_DEBUG_IR_PARENT_SYMLINK_CODE,
        debugIrParent,
      );
    }
    if (!parentPath.isDirectory()) {
      throw this.createDebugIrPathError(
        `Debug IR parent path is not a directory: ${debugIrParent}`,
        "Move the file out of the way or choose a directory parent.",
        CODEGEN_DEBUG_IR_PARENT_NOT_DIRECTORY_CODE,
        debugIrParent,
      );
    }
    const symlinkedParent = findSymlinkedPathComponent(debugIrParent);
    if (symlinkedParent) {
      throw this.createDebugIrPathError(
        `Debug IR parent path contains a symbolic link: ${symlinkedParent}`,
        "Choose a debug IR output directory whose ancestor path contains only real directories.",
        CODEGEN_DEBUG_IR_PARENT_SYMLINK_CODE,
        symlinkedParent,
      );
    }

    fs.writeFileSync(this.debugIrPath, result);
  }

  private createDebugIrPathError(
    message: string,
    hint: string,
    code: string,
    filePath: string,
  ): CompilerError {
    return new CompilerError(
      message,
      hint,
      {
        file: filePath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
      code,
    );
  }

  private collectReachableTopLevelFunctions(
    program: AST.Program,
  ): Set<AST.FunctionDecl> | undefined {
    if (!this.treeShakeTopLevelFunctions || this.generateDwarf) {
      return undefined;
    }

    // Inline assembly can reference generated symbols by textual name, so keep
    // the full function set whenever top-level asm is present.
    if (program.statements.some((stmt) => stmt.kind === "Asm")) {
      return undefined;
    }

    const topLevelFunctions = new Set<AST.FunctionDecl>();
    const functionsByName = new Map<string, AST.FunctionDecl[]>();

    for (const stmt of program.statements) {
      if (stmt.kind !== "FunctionDecl") continue;

      const decl = stmt as AST.FunctionDecl;
      topLevelFunctions.add(decl);
      const overloads = functionsByName.get(decl.name) ?? [];
      overloads.push(decl);
      functionsByName.set(decl.name, overloads);
    }

    if (topLevelFunctions.size === 0) {
      return undefined;
    }

    const reachable = new Set<AST.FunctionDecl>();
    const queue: AST.FunctionDecl[] = [];

    const mark = (decl: AST.FunctionDecl | undefined): void => {
      if (!decl || !topLevelFunctions.has(decl) || reachable.has(decl)) {
        return;
      }
      reachable.add(decl);
      queue.push(decl);
    };

    const markByName = (name: string): void => {
      for (const decl of functionsByName.get(name) ?? []) {
        mark(decl);
      }
    };

    markByName("main");
    for (const stmt of program.statements) {
      if (stmt.kind !== "Export") continue;

      for (const item of (stmt as AST.ExportStmt).items) {
        if (!item.isType) {
          markByName(item.name);
        }
      }
    }

    if (queue.length === 0) {
      return undefined;
    }

    const markResolvedFunction = (
      decl:
        | AST.IdentifierExpr["resolvedDeclaration"]
        | AST.FunctionDecl
        | AST.ExternDecl
        | undefined,
    ): void => {
      if (decl?.kind === "FunctionDecl") {
        mark(decl);
      }
    };

    const markCalleeBySyntax = (callee: AST.Expression): void => {
      if (callee.kind === "Identifier") {
        markByName((callee as AST.IdentifierExpr).name);
        return;
      }

      if (callee.kind === "GenericInstantiation") {
        const base = (callee as AST.GenericInstantiationExpr).base;
        if (base.kind === "Identifier") {
          markByName((base as AST.IdentifierExpr).name);
        }
      }
    };

    while (queue.length > 0) {
      const decl = queue.shift()!;
      walkAST(decl.body, (node) => {
        switch (node.kind) {
          case "Identifier":
            markResolvedFunction(
              (node as AST.IdentifierExpr).resolvedDeclaration,
            );
            break;
          case "Call": {
            const call = node as AST.CallExpr;
            markResolvedFunction(call.resolvedDeclaration);
            markResolvedFunction(call.operatorOverload?.methodDeclaration);
            markCalleeBySyntax(call.callee);
            break;
          }
          case "Binary":
            markResolvedFunction(
              (node as AST.BinaryExpr).operatorOverload?.methodDeclaration,
            );
            break;
          case "Unary":
            markResolvedFunction(
              (node as AST.UnaryExpr).operatorOverload?.methodDeclaration,
            );
            break;
          case "Index":
            markResolvedFunction(
              (node as AST.IndexExpr).operatorOverload?.methodDeclaration,
            );
            break;
        }
      });
    }

    return reachable;
  }

  private generateTopLevel(node: AST.ASTNode) {
    switch (node.kind) {
      case "FunctionDecl":
        this.generateFunction(node as AST.FunctionDecl);
        break;
      case "StructDecl":
        const structDecl = node as AST.StructDecl;
        // Only generate struct if it is NOT generic.
        // Generic structs are templates and generated on-demand.
        if (structDecl.genericParams.length === 0) {
          this.generateStruct(structDecl);
        }
        break;
      case "EnumDecl":
        const enumDecl = node as AST.EnumDecl;
        // Store enum declaration for later use
        this.enumDeclMap.set(enumDecl.name, enumDecl);
        // Only generate enum if it is NOT generic.
        // Generic enums are templates and generated on-demand.
        if (enumDecl.genericParams.length === 0) {
          this.generateEnum(enumDecl);
        }
        break;
      case "Extern":
        this.generateExtern(node as AST.ExternDecl);
        break;
      case "VariableDecl":
        this.generateGlobalVariable(node as AST.VariableDecl);
        break;
      case "TypeAlias":
        // Type aliases are handled by the TypeChecker and don't generate code directly
        break;
      case "Import":
        // Imports are resolved by ModuleResolver and don't generate code directly
        break;
      case "Export":
        // Exports are metadata for module resolution and don't generate code directly
        break;
      case "SpecDecl":
        // Specs are handled by TypeGenerator (fat pointers) and ExpressionGenerator (vtables)
        // No code generation needed at top level.
        break;
      case "Asm":
        this.generateAsm(node as AST.AsmBlockStmt);
        break;
      default:
        codeGenLog.warn(`Unhandled top-level node kind: ${node.kind}`);
        break;
    }
  }

  private generateExtern(decl: AST.ExternDecl) {
    const name = decl.name;
    if (
      ["memcpy", "memmove", "memset"].includes(name) &&
      decl.params.length >= 3
    ) {
      return;
    }
    if (this.target?.toLowerCase().includes("wasm") && name === "strlen") {
      return;
    }

    if (this.declaredFunctions.has(name)) return;
    this.declaredFunctions.add(name);

    const funcType = decl.resolvedType as AST.FunctionTypeNode;
    const retType = this.resolveType(funcType.returnType);

    const params = funcType.paramTypes.map((p) => this.resolveType(p));
    if (decl.isVariadic) {
      params.push("...");
    }

    const paramStr = params.join(", ");
    this.emitDeclaration(`declare ${retType} @${name}(${paramStr})`);
    this.emitDeclaration("");
  }

  private generateGlobalVariable(decl: AST.VariableDecl) {
    if (typeof decl.name !== "string") {
      throw new CompilerError(
        "Destructuring not supported for global variables",
        "Global variables can't be of type Tuple",
        decl.location,
      );
    }
    this.globals.add(decl.name);

    const type = this.resolveType(decl.typeAnnotation!);
    let init = "zeroinitializer";
    if (decl.initializer) {
      if (decl.initializer.kind === "Literal") {
        init = this.generateLiteral(decl.initializer as AST.LiteralExpr);
      } else {
        throw new CompilerError(
          "Global variables must be initialized with literals",
          "Global variables must be initialized with literals",
          decl.location,
        );
      }
    } else if (
      type === "i64" ||
      type === "i32" ||
      type === "i16" ||
      type === "i8" ||
      type === "i1"
    )
      init = "0";
    else if (type === "double") init = "0.0";
    else if (type.endsWith("*")) init = "null";
    const keyword = decl.isConst ? "constant" : "global";

    let dbgSuffix = "";
    if (this.generateDwarf) {
      const typeNode = decl.typeAnnotation!;
      const typeId = this.getDwarfTypeId(typeNode);
      const fileId = this.debugInfoGenerator.getFileNodeId(decl.location.file);
      const globalVarId = this.debugInfoGenerator.createGlobalVariable({
        name: decl.name,
        linkageName: decl.name,
        fileId,
        line: decl.location.startLine,
        typeId,
        isLocal: false,
        isDefinition: true,
      });
      dbgSuffix = `, !dbg !${globalVarId}`;
    }

    this.emitDeclaration(
      `@${decl.name} = ${keyword} ${type} ${init}${dbgSuffix}`,
    );
    this.emitDeclaration("");
  }

  private processPendingLambdas() {
    while (this.pendingLambdas.length > 0) {
      const { name, expr, typeMap } = this.pendingLambdas.shift()!;
      const oldMap = this.currentTypeMap;
      this.currentTypeMap = typeMap;
      try {
        this.generateLambdaFunction(name, expr);
      } finally {
        this.currentTypeMap = oldMap;
      }
    }
  }

  private generateLambdaFunction(name: string, expr: AST.LambdaExpr) {
    const funcType = expr.resolvedType as AST.FunctionTypeNode;
    const funcDecl: AST.FunctionDecl = {
      kind: "FunctionDecl",
      name: name,
      isFrame: true,
      isStatic: true,
      genericParams: [],
      attributes: [],
      params: expr.params.map((p) => ({
        kind: "Parameter",
        name: p.name,
        type: p.type!,
        location: p.location,
      })),
      returnType: funcType.returnType,
      body: expr.body,
      location: expr.location,
      resolvedType: funcType,
    };

    let captureInfo:
      | { name: string; fields: { name: string; type: string }[] }
      | undefined;
    const captureStructName = expr.captureStructName;

    if (captureStructName && expr.capturedVariables) {
      captureInfo = {
        name: captureStructName,
        fields: expr.capturedVariables.map((decl) => ({
          name: decl.name as string,
          type: this.resolveType(
            (("typeAnnotation" in decl ? decl.typeAnnotation : undefined) ||
              ("type" in decl ? decl.type : undefined) ||
              decl.resolvedType)!,
          ),
        })),
      };
    }

    this.generateFunction(funcDecl, undefined, captureInfo);
  }
}
