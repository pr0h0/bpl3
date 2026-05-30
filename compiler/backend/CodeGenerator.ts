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
import { DebugInfoGenerator } from "./codegen/DebugInfoGenerator";
import { getDataLayoutForTarget } from "./codegen/BaseCodeGenerator";

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
  constructor(
    options: {
      stdLibPath?: string;
      useLinkOnceOdrForStdLib?: boolean;
      target?: string;
      dwarf?: boolean;
      optimizationLevel?: number;
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
    this.stringLiterals.clear();
    this.structLayouts.clear();
    this.structMap.clear();
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

    for (const stmt of program.statements) {
      this.generateTopLevel(stmt);
    }

    // Standard library declarations - Emitted AFTER user code to avoid collisions
    if (!this.declaredFunctions.has("malloc")) {
      this.emitDeclaration("declare i8* @malloc(i64)");
      this.declaredFunctions.add("malloc");
    }
    if (!this.declaredFunctions.has("free")) {
      this.emitDeclaration("declare void @free(i8*)");
      this.declaredFunctions.add("free");
    }
    if (!this.declaredFunctions.has("exit")) {
      this.emitDeclaration("declare void @exit(i32)");
      this.declaredFunctions.add("exit");
    }
    if (!this.declaredFunctions.has("memcmp")) {
      this.emitDeclaration("declare i32 @memcmp(i8*, i8*, i64)");
      this.declaredFunctions.add("memcmp");
    }
    if (!this.declaredFunctions.has("strcmp")) {
      this.emitDeclaration("declare i32 @strcmp(i8*, i8*)");
      this.declaredFunctions.add("strcmp");
    }

    // fprintf and stderr for null trap error messages (kept for backward compatibility)
    this.emitDeclaration("%struct._IO_FILE = type opaque");
    this.emitDeclaration("@stderr = external global %struct._IO_FILE*");
    if (!this.declaredFunctions.has("fprintf")) {
      this.emitDeclaration("declare i32 @fprintf(%struct._IO_FILE*, i8*, ...)");
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

    // Global argc/argv for Args library
    this.emitDeclaration(`@__bpl_argc_value = external global i32`);
    this.emitDeclaration(`@__bpl_argv_value = external global i8**`);

    if (!this.declaredFunctions.has("setjmp")) {
      this.emitDeclaration(`declare i32 @setjmp(i8*) returns_twice`);
      this.declaredFunctions.add("setjmp");
    }
    if (!this.declaredFunctions.has("longjmp")) {
      this.emitDeclaration(`declare void @longjmp(i8*, i32) noreturn`);
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

    const result =
      header +
      "\n" +
      this.declarationsOutput.join("\n") +
      "\n" +
      this.output.join("\n") +
      `\n${this.getLlvmAttributeGroupOutput()}\n`;

    if (this.debugIrPath) {
      try {
        this.writeDebugIr(result);
      } catch (e) {
        codeGenLog.debug("Failed to write debug IR file:", {
          error: String(e),
        });
      }
    }

    return result;
  }

  private writeDebugIr(result: string): void {
    if (!this.debugIrPath) return;

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
      throw new Error(`Debug IR path is a symbolic link: ${this.debugIrPath}`);
    }
    if (existingPath && !existingPath.isFile()) {
      throw new Error(`Debug IR path is not a file: ${this.debugIrPath}`);
    }

    const debugIrParent = path.dirname(path.resolve(this.debugIrPath));
    const parentPath = fs.lstatSync(debugIrParent);
    if (parentPath.isSymbolicLink()) {
      throw new Error(
        `Debug IR parent path is a symbolic link: ${debugIrParent}`,
      );
    }
    if (!parentPath.isDirectory()) {
      throw new Error(`Debug IR parent path is not a directory: ${debugIrParent}`);
    }

    fs.writeFileSync(this.debugIrPath, result);
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
