import * as AST from "../common/AST";
import {
  createTypeStructDecl,
  createIntStructDecl,
  createBoolStructDecl,
  createDoubleStructDecl,
  createStringStructDecl,
  PRIMITIVE_STRUCT_MAP,
} from "../middleend/BuiltinTypes";
import { TokenType } from "../frontend/TokenType";
import { StatementGenerator } from "./codegen/StatementGenerator";
import { CompilerError } from "../common/CompilerError";
import { DebugInfoGenerator } from "./codegen/DebugInfoGenerator";

export class CodeGenerator extends StatementGenerator {
  constructor(
    options: {
      stdLibPath?: string;
      useLinkOnceOdrForStdLib?: boolean;
      target?: string;
      dwarf?: boolean;
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
      );
      this.debugInfoGenerator.createCompileUnit();
    }

    this.output = [];
    this.declarationsOutput = [];
    this.stringLiterals.clear();
    this.structLayouts.clear();
    this.structMap.clear();
    this.loopStack = [];
    this.declaredFunctions.clear();
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

    // Populate structMap and enumDeclMap with user-defined types first
    for (const stmt of program.statements) {
      if (stmt.kind === "StructDecl") {
        this.structMap.set(
          (stmt as AST.StructDecl).name,
          stmt as AST.StructDecl,
        );
      } else if (stmt.kind === "EnumDecl") {
        this.enumDeclMap.set((stmt as AST.EnumDecl).name, stmt as AST.EnumDecl);
      }
    }

    // Inject built-in Type struct
    if (!this.structMap.has("Type")) {
      const typeDecl = createTypeStructDecl();
      this.structMap.set("Type", typeDecl);

      // Compute vtables early to ensure StackOverflowError has correct layout if it has methods
      // This is necessary because StackOverflowError is generated before Type, but might depend on vtable layout
      this.computeVTableLayouts(program);

      // Ensure built-in errors are generated first if present, as they are used in code generation
      // This ensures structLayouts has the correct layout (including vtable) before generating Type methods or other code
      const builtinErrors = [
        "StackOverflowError",
        "DivisionByZeroError",
        "NullAccessError",
        "IndexOutOfBoundsError",
        "EmptyError",
      ];

      for (const errorName of builtinErrors) {
        if (this.structMap.has(errorName)) {
          this.generateStruct(this.structMap.get(errorName)!);
        }
      }

      this.generateStruct(typeDecl);
    }

    // Inject built-in primitive wrapper structs
    if (!this.structMap.has("Int")) {
      const intDecl = createIntStructDecl();
      this.structMap.set("Int", intDecl);
      this.generateStruct(intDecl);
    }

    if (!this.structMap.has("Bool")) {
      const boolDecl = createBoolStructDecl();
      this.structMap.set("Bool", boolDecl);
      this.generateStruct(boolDecl);
    }

    if (!this.structMap.has("Double")) {
      const doubleDecl = createDoubleStructDecl();
      this.structMap.set("Double", doubleDecl);
      this.generateStruct(doubleDecl);
    }

    if (!this.structMap.has("String")) {
      const stringDecl = createStringStructDecl();
      this.structMap.set("String", stringDecl);
      this.generateStruct(stringDecl);
    }

    // Collect defined functions to avoid unnecessary declarations
    for (const stmt of program.statements) {
      if (stmt.kind === "TypeAlias") {
        const decl = stmt as AST.TypeAliasDecl;
        this.typeAliasMap.set(decl.name, decl);
      }
      // We do NOT add to definedFunctions here anymore.
      // definedFunctions should only track what has actually been emitted by generateFunction.
      // This allows generateFunction to check for redefinitions and skip if already emitted.
    }

    // Register built-in NullAccessError struct
    const internalLoc = {
      file: "internal",
      startLine: 0,
      startColumn: 0,
      endLine: 0,
      endColumn: 0,
    };

    if (!this.structMap.has("NullAccessError")) {
      const nullAccessErrorDecl: AST.StructDecl = {
        kind: "StructDecl",
        name: "NullAccessError",
        genericParams: [],
        inheritanceList: [],
        members: [
          {
            kind: "StructField",
            name: "message",
            type: {
              kind: "BasicType",
              name: "i8",
              genericArgs: [],
              pointerDepth: 1,
              arrayDimensions: [],
              location: internalLoc,
            },
            location: internalLoc,
          },
          {
            kind: "StructField",
            name: "function",
            type: {
              kind: "BasicType",
              name: "i8",
              genericArgs: [],
              pointerDepth: 1,
              arrayDimensions: [],
              location: internalLoc,
            },
            location: internalLoc,
          },
          {
            kind: "StructField",
            name: "expression",
            type: {
              kind: "BasicType",
              name: "i8",
              genericArgs: [],
              pointerDepth: 1,
              arrayDimensions: [],
              location: internalLoc,
            },
            location: internalLoc,
          },
          {
            kind: "StructField",
            name: "line",
            type: {
              kind: "BasicType",
              name: "int",
              genericArgs: [],
              pointerDepth: 0,
              arrayDimensions: [],
              location: internalLoc,
            },
            location: internalLoc,
          },
          {
            kind: "StructField",
            name: "column",
            type: {
              kind: "BasicType",
              name: "int",
              genericArgs: [],
              pointerDepth: 0,
              arrayDimensions: [],
              location: internalLoc,
            },
            location: internalLoc,
          },
        ],
        location: internalLoc,
      };
      this.structMap.set("NullAccessError", nullAccessErrorDecl);

      //  Add NullAccessError to struct layouts
      const nullAccessErrorLayout = new Map<string, number>();
      nullAccessErrorLayout.set("message", 0);
      nullAccessErrorLayout.set("function", 1);
      nullAccessErrorLayout.set("expression", 2);
      nullAccessErrorLayout.set("line", 3);
      nullAccessErrorLayout.set("column", 4);
      this.structLayouts.set("NullAccessError", nullAccessErrorLayout);
    }

    // Register built-in IndexOutOfBoundsError struct
    if (!this.structMap.has("IndexOutOfBoundsError")) {
      const indexOutOfBoundsErrorDecl: AST.StructDecl = {
        kind: "StructDecl",
        name: "IndexOutOfBoundsError",
        genericParams: [],
        inheritanceList: [],
        members: [
          {
            kind: "StructField",
            name: "index",
            type: {
              kind: "BasicType",
              name: "i32",
              genericArgs: [],
              pointerDepth: 0,
              arrayDimensions: [],
              location: internalLoc,
            },
            location: internalLoc,
          },
          {
            kind: "StructField",
            name: "size",
            type: {
              kind: "BasicType",
              name: "i32",
              genericArgs: [],
              pointerDepth: 0,
              arrayDimensions: [],
              location: internalLoc,
            },
            location: internalLoc,
          },
        ],
        location: internalLoc,
      };
      this.structMap.set("IndexOutOfBoundsError", indexOutOfBoundsErrorDecl);

      // Add IndexOutOfBoundsError to struct layouts
      const indexOutOfBoundsErrorLayout = new Map<string, number>();
      indexOutOfBoundsErrorLayout.set("index", 0);
      indexOutOfBoundsErrorLayout.set("size", 1);
      this.structLayouts.set(
        "IndexOutOfBoundsError",
        indexOutOfBoundsErrorLayout,
      );
    }

    // Register built-in DivisionByZeroError struct
    if (!this.structMap.has("DivisionByZeroError")) {
      const divisionByZeroErrorDecl: AST.StructDecl = {
        kind: "StructDecl",
        name: "DivisionByZeroError",
        genericParams: [],
        inheritanceList: [],
        members: [
          {
            kind: "StructField",
            name: "dummy",
            type: {
              kind: "BasicType",
              name: "i8",
              genericArgs: [],
              pointerDepth: 0,
              arrayDimensions: [],
              location: internalLoc,
            },
            location: internalLoc,
          },
        ],
        location: internalLoc,
      };
      this.structMap.set("DivisionByZeroError", divisionByZeroErrorDecl);

      // Add DivisionByZeroError to struct layouts
      const divisionByZeroErrorLayout = new Map<string, number>();
      divisionByZeroErrorLayout.set("dummy", 0);
      this.structLayouts.set("DivisionByZeroError", divisionByZeroErrorLayout);
    }

    // Register built-in StackOverflowError struct
    if (!this.structMap.has("StackOverflowError")) {
      const stackOverflowErrorDecl: AST.StructDecl = {
        kind: "StructDecl",
        name: "StackOverflowError",
        genericParams: [],
        inheritanceList: [],
        members: [
          {
            kind: "StructField",
            name: "dummy",
            type: {
              kind: "BasicType",
              name: "i8",
              genericArgs: [],
              pointerDepth: 0,
              arrayDimensions: [],
              location: internalLoc,
            },
            location: internalLoc,
          },
        ],
        location: internalLoc,
      };
      this.structMap.set("StackOverflowError", stackOverflowErrorDecl);

      // Add StackOverflowError to struct layouts
      const stackOverflowErrorLayout = new Map<string, number>();
      stackOverflowErrorLayout.set("dummy", 0);
      this.structLayouts.set("StackOverflowError", stackOverflowErrorLayout);
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

    this.computeVTableLayouts(program);
    this.collectStructLayouts(program);

    // Standard library declarations
    this.emitDeclaration("declare i8* @malloc(i64)");
    this.declaredFunctions.add("malloc");
    this.emitDeclaration("declare void @free(i8*)");
    this.declaredFunctions.add("free");
    this.emitDeclaration("declare void @exit(i32)");
    this.declaredFunctions.add("exit");
    this.emitDeclaration("declare i32 @memcmp(i8*, i8*, i64)");
    this.declaredFunctions.add("memcmp");

    // NullAccessError struct for null object access exceptions
    if (
      !this.structMap.has("NullAccessError") ||
      this.structMap.get("NullAccessError")!.location.file === "internal"
    ) {
      this.emitDeclaration(
        "%struct.NullAccessError = type { i8*, i8*, i8*, i32, i32 }",
      );
      this.structLayouts.set(
        "NullAccessError",
        new Map([
          ["message", 0],
          ["function", 1],
          ["expression", 2],
          ["line", 3],
          ["column", 4],
        ]),
      );
    }

    // IndexOutOfBoundsError struct for array access exceptions
    if (
      !this.structMap.has("IndexOutOfBoundsError") ||
      this.structMap.get("IndexOutOfBoundsError")!.location.file === "internal"
    ) {
      this.emitDeclaration("%struct.IndexOutOfBoundsError = type { i32, i32 }");
      this.structLayouts.set(
        "IndexOutOfBoundsError",
        new Map([
          ["index", 0],
          ["size", 1],
        ]),
      );
    }

    // DivisionByZeroError struct
    if (
      !this.structMap.has("DivisionByZeroError") ||
      this.structMap.get("DivisionByZeroError")!.location.file === "internal"
    ) {
      this.emitDeclaration("%struct.DivisionByZeroError = type { i8 }");
      this.structLayouts.set("DivisionByZeroError", new Map([["dummy", 0]]));
    }

    // StackOverflowError struct
    if (
      !this.structMap.has("StackOverflowError") ||
      this.structMap.get("StackOverflowError")!.location.file === "internal"
    ) {
      this.emitDeclaration("%struct.StackOverflowError = type { i8 }");
      this.structLayouts.set("StackOverflowError", new Map([["dummy", 0]]));
    }

    // fprintf and stderr for null trap error messages (kept for backward compatibility)
    this.emitDeclaration("%struct._IO_FILE = type opaque");
    this.emitDeclaration("@stderr = external global %struct._IO_FILE*");
    this.emitDeclaration("declare i32 @fprintf(%struct._IO_FILE*, i8*, ...)");
    this.declaredFunctions.add("fprintf");

    // Exception Handling Primitives
    // jmp_buf is platform dependent. [32 x i64] is 256 bytes, sufficient for x64.
    this.emitDeclaration(
      `%struct.ExceptionFrame = type { [32 x i64], %struct.ExceptionFrame* }`,
    );
    this.emitDeclaration(
      `@exception_top = weak global %struct.ExceptionFrame* null`,
    );
    this.emitDeclaration(`@exception_value = weak global i64 0`);
    this.emitDeclaration(`@exception_type = weak global i32 0`);
    this.emitDeclaration(`@__bpl_stack_depth = weak global i32 0`);

    // Global argc/argv for Args library
    this.emitDeclaration(`@__bpl_argc_value = weak global i32 0`);
    this.emitDeclaration(`@__bpl_argv_value = weak global i8** null`);

    this.emitDeclaration(`declare i32 @setjmp(i8*) returns_twice`);
    this.declaredFunctions.add("setjmp");
    this.emitDeclaration(`declare void @longjmp(i8*, i32) noreturn`);
    this.declaredFunctions.add("longjmp");

    // Helper functions for accessing argc/argv
    this.emitDeclaration(`define linkonce_odr i32 @__bpl_argc() {`);
    this.emitDeclaration(`  %1 = load i32, i32* @__bpl_argc_value`);
    this.emitDeclaration(`  ret i32 %1`);
    this.emitDeclaration(`}`);
    this.emitDeclaration(``);
    this.emitDeclaration(
      `define linkonce_odr i8* @__bpl_argv_get(i32 %index) {`,
    );
    this.emitDeclaration(`  %1 = load i8**, i8*** @__bpl_argv_value`);
    this.emitDeclaration(`  %2 = getelementptr i8*, i8** %1, i32 %index`);
    this.emitDeclaration(`  %3 = load i8*, i8** %2`);
    this.emitDeclaration(`  ret i8* %3`);
    this.emitDeclaration(`}`);
    this.declaredFunctions.add("__bpl_argc");
    this.declaredFunctions.add("__bpl_argv_get");

    this.emitDeclaration("");

    // Helper: memory zero-check function used for 'struct == null' comparisons
    if (!this.emittedMemIsZero) {
      this.emitDeclaration(
        "define linkonce_odr i1 @__bpl_mem_is_zero(i8* %ptr, i64 %n) {",
      );
      this.emitDeclaration("entry:");
      this.emitDeclaration("  %end = getelementptr i8, i8* %ptr, i64 %n");
      this.emitDeclaration("  br label %loop");
      this.emitDeclaration("loop:");
      this.emitDeclaration(
        "  %curr = phi i8* [ %ptr, %entry ], [ %next, %cont ]",
      );
      this.emitDeclaration("  %done = icmp eq i8* %curr, %end");
      this.emitDeclaration("  br i1 %done, label %ret_true, label %check");
      this.emitDeclaration("check:");
      this.emitDeclaration("  %byte = load i8, i8* %curr");
      this.emitDeclaration("  %isnz = icmp ne i8 %byte, 0");
      this.emitDeclaration("  br i1 %isnz, label %ret_false, label %cont");
      this.emitDeclaration("cont:");
      this.emitDeclaration("  %next = getelementptr i8, i8* %curr, i64 1");
      this.emitDeclaration("  br label %loop");
      this.emitDeclaration("ret_true:");
      this.emitDeclaration("  ret i1 1");
      this.emitDeclaration("ret_false:");
      this.emitDeclaration("  ret i1 0");
      this.emitDeclaration("}");
      this.emitDeclaration("");
      this.emittedMemIsZero = true;
    }

    for (const stmt of program.statements) {
      this.generateTopLevel(stmt);
    }

    // Process pending lambdas
    this.processPendingLambdas();

    // Process pending monomorphized functions
    while (this.pendingGenerations.length > 0) {
      const task = this.pendingGenerations.shift()!;
      task();
    }

    if (this.generateDwarf) {
      const metadata = this.debugInfoGenerator.generateMetadataOutput();
      this.output.push(...metadata);
    }

    let header = "";
    if (this.target) {
      // TODO: Check if it can be dynamic
      header += `target datalayout = "e-m:e-p270:32:32-p271:32:32-p272:64:64-i64:64-i128:128-f80:128-n8:16:32:64-S128"\n`;
      header += `target triple = "${this.target}"\n`;
    }
    if (this.currentFilePath) {
      const filename = this.currentFilePath.split("/").pop() || "unknown";
      header += `source_filename = "${filename}"\n`;
    }

    for (const [content, varName] of this.stringLiterals) {
      const len = content.length + 1;
      const escaped = this.escapeString(content);
      header += `${varName} = private unnamed_addr constant [${len} x i8] c"${escaped}\\00", align 1\n`;
    }

    const result =
      header +
      "\n" +
      this.declarationsOutput.join("\n") +
      "\n" +
      this.output.join("\n");

    try {
      const fs = require("fs");
      fs.writeFileSync("ir.ll", result);
    } catch (e) {}

    return result;
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
        const spec = node as AST.SpecDecl;
        for (const method of spec.methods) {
          const funcName = `${spec.name}_${method.name}`;
          if (this.declaredFunctions.has(funcName)) continue;
          this.declaredFunctions.add(funcName);
          this.emitDeclaration(
            `define void @${funcName}(%struct.${spec.name}* %this) { ret void }`,
          );
        }
        break;
      case "Asm":
        this.generateAsm(node as AST.AsmBlockStmt);
        break;
      default:
        console.warn(`Unhandled top-level node kind: ${node.kind}`);
        break;
    }
  }

  private generateExtern(decl: AST.ExternDecl) {
    const name = decl.name;
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
    } else {
      if (
        type === "i64" ||
        type === "i32" ||
        type === "i16" ||
        type === "i8" ||
        type === "i1"
      )
        init = "0";
      else if (type === "double") init = "0.0";
      else if (type.endsWith("*")) init = "null";
    }
    const keyword = decl.isConst ? "constant" : "global";

    let dbgSuffix = "";
    if (this.generateDwarf) {
      const typeNode = decl.typeAnnotation!;
      const typeId = this.getDwarfTypeId(typeNode);
      const fileId = this.debugInfoGenerator.getFileNodeId(decl.location.file);
      const globalVarId = this.debugInfoGenerator.createGlobalVariable(
        decl.name,
        decl.name,
        fileId,
        decl.location.startLine,
        typeId,
        false,
        true,
      );
      dbgSuffix = `, !dbg !${globalVarId}`;
    }

    this.emitDeclaration(
      `@${decl.name} = ${keyword} ${type} ${init}${dbgSuffix}`,
    );
    this.emitDeclaration("");
  }

  private processPendingLambdas() {
    while (this.pendingLambdas.length > 0) {
      const { name, expr } = this.pendingLambdas.shift()!;
      this.generateLambdaFunction(name, expr);
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
      params: expr.params.map((p) => ({
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
    const captureStructName = (expr as any).captureStructName;

    if (captureStructName && expr.capturedVariables) {
      captureInfo = {
        name: captureStructName,
        fields: expr.capturedVariables.map((decl) => ({
          name: decl.name as string,
          type: this.resolveType(
            decl.typeAnnotation || (decl as any).type || decl.resolvedType,
          ),
        })),
      };
    }

    this.generateFunction(funcDecl, undefined, captureInfo);
  }
}
