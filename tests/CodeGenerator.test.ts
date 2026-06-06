import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import * as AST from "../compiler/common/AST";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function parseAndCheck(source: string): AST.Program {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  return program;
}

function readTextFile(path: string, encoding: BufferEncoding = "utf8"): string {
  return readFileSync(path, encoding).replace(/\r\n?/g, "\n");
}

function compile(
  source: string,
  options: ConstructorParameters<typeof CodeGenerator>[0] = {},
): string {
  const program = parseAndCheck(source);
  const generator = new CodeGenerator(options);
  return generator.generate(program);
}

function getOnlyReturnExpression(program: AST.Program): AST.Expression {
  const fn = program.statements[0] as AST.FunctionDecl;
  const ret = fn.body.statements[0] as AST.ReturnStmt;
  return ret.value!;
}

function captureError(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error("Expected action to throw");
}

function expectDebugIrError(
  action: () => void,
  code: string,
  message: RegExp,
): CompilerError {
  const error = captureError(action);
  expect(error).toBeInstanceOf(CompilerError);
  const compilerError = error as CompilerError;
  expect(compilerError.code).toBe(code);
  expect(compilerError.message).toMatch(message);
  return compilerError;
}

class InspectableCodeGenerator extends CodeGenerator {
  public allStructFields(decl: AST.StructDecl): AST.StructField[] {
    return this.getAllStructFields(decl);
  }

  public isIrTerminator(line: string): boolean {
    return this.isTerminator(line);
  }
}

describe("CodeGenerator", () => {
  it("keeps primitive LLVM type resolution on a no-recursion fast path", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/TypeGenerator.ts"),
      "utf8",
    );
    const helperStart = source.indexOf("function resolveSimpleBuiltinLlvmType");
    const methodStart = source.indexOf("protected resolveType");
    const depthStart = source.indexOf("this.resolveTypeDepth++", methodStart);

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(depthStart).toBeGreaterThan(methodStart);

    const methodPrefix = source.slice(methodStart, depthStart);
    const helperEnd = source.indexOf("\n/**", helperStart);
    const helperSource = source.slice(helperStart, helperEnd);

    expect(source).toContain("const SIMPLE_BUILTIN_LLVM_TYPES");
    expect(helperSource).toContain(
      "return SIMPLE_BUILTIN_LLVM_TYPES[basicType.name]",
    );
    expect(helperSource).not.toContain("switch (basicType.name)");
    expect(methodPrefix).toContain("resolveSimpleBuiltinLlvmType(type)");
    expect(methodPrefix).toContain("if (simpleBuiltinLlvmType)");
  });

  it("resolves standard binary right types only for shift masking", () => {
    const source = readTextFile(
      join(
        process.cwd(),
        "compiler/backend/codegen/BinaryExpressionGenerator.ts",
      ),
      "utf8",
    );
    const methodStart = source.indexOf("private generateStandardBinaryOp");
    const methodEnd = source.indexOf("\n  /**", methodStart);
    const methodSource = source.slice(methodStart, methodEnd);

    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(methodEnd).toBeGreaterThan(methodStart);
    expect(methodSource).not.toContain(
      "const rightType = this.resolveType(expr.right.resolvedType!)",
    );
    expect(
      methodSource.match(
        /this\.resolveType\(expr\.right\.resolvedType!\)/g,
      ),
    ).toHaveLength(2);
  });

  it("keeps hot type mangling list construction allocation-conscious", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/TypeGenerator.ts"),
      "utf8",
    );
    const getMangledNameStart = source.indexOf("protected getMangledName");
    const getDwarfTypeIdStart = source.indexOf("protected getDwarfTypeId");
    const getMangledNameSource = source.slice(
      getMangledNameStart,
      getDwarfTypeIdStart,
    );
    const mangleCallableStart = source.indexOf("private mangleCallableType");
    const mangleArraySuffixStart = source.indexOf("private mangleArraySuffix");
    const mangleCallableSource = source.slice(
      mangleCallableStart,
      mangleArraySuffixStart,
    );
    const mangleArraySuffixEnd = source.indexOf(
      "\n\n  protected checkInheritance",
      mangleArraySuffixStart,
    );
    const mangleArraySuffixSource = source.slice(
      mangleArraySuffixStart,
      mangleArraySuffixEnd,
    );

    expect(source).toContain("private mangleTypeList");
    expect(getMangledNameSource).toContain("this.mangleTypeList");
    expect(mangleCallableSource).toContain("this.mangleTypeList");
    expect(getMangledNameSource).not.toContain(".map((t) => this.mangleType(t))");
    expect(mangleCallableSource).not.toContain(
      ".map((t) => this.mangleType(t))",
    );
    expect(mangleArraySuffixSource).toContain("if (dimensions.length === 0)");
    expect(mangleArraySuffixSource).not.toContain("dimensions.map");
  });

  it("reuses simple struct field lists during repeated codegen lookups", () => {
    const program = parseAndCheck([
      "struct Point {",
      "  x: int,",
      "  y: int,",
      "}",
      "",
      "frame main() ret int {",
      "  return 0;",
      "}",
    ].join("\n"));
    const point = program.statements.find(
      (stmt): stmt is AST.StructDecl =>
        stmt.kind === "StructDecl" && stmt.name === "Point",
    );
    expect(point).toBeDefined();

    const generator = new InspectableCodeGenerator();

    expect(generator.allStructFields(point!)).toBe(
      generator.allStructFields(point!),
    );
  });

  it("caches struct literal layout and field metadata for repeated codegen", () => {
    const baseSource = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/BaseCodeGenerator.ts"),
      "utf8",
    );
    const generatorSource = readTextFile(
      join(process.cwd(), "compiler/backend/CodeGenerator.ts"),
      "utf8",
    );
    const expressionSource = readTextFile(
      join(
        process.cwd(),
        "compiler/backend/codegen/ExpressionGenerator.ts",
      ),
      "utf8",
    );

    expect(baseSource).toContain("sortedStructLayoutEntriesCache");
    expect(baseSource).toContain("structFieldByNameCache");
    expect(generatorSource).toContain(
      "this.sortedStructLayoutEntriesCache.clear()",
    );
    expect(generatorSource).toContain("this.structFieldByNameCache.clear()");

    const methodStart = expressionSource.indexOf(
      "protected generateStructLiteral",
    );
    const methodEnd = expressionSource.indexOf(
      "protected generateTupleLiteral",
      methodStart,
    );

    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(methodEnd).toBeGreaterThan(methodStart);

    const methodSource = expressionSource.slice(methodStart, methodEnd);
    expect(methodSource).toContain(
      "this.getSortedStructLayoutEntries(structName, layout)",
    );
    expect(methodSource).toContain("this.getStructFieldByName(");
    expect(methodSource).toContain("baseStructDef,");
    expect(methodSource).toContain("fieldName,");
    expect(methodSource).toContain("STRUCT_LITERAL_FIELD_MAP_THRESHOLD");
    expect(methodSource).toContain("expr.fields.length >");
    expect(methodSource).toContain("for (const field of expr.fields)");
    expect(methodSource).not.toContain("Array.from(layout.entries()).sort");
    expect(methodSource).not.toContain("baseStructDef.members.find");
  });

  it("indexes top-level codegen declarations in a single pre-layout pass", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/CodeGenerator.ts"),
      "utf8",
    );
    const generateStart = source.indexOf("  generate(program:");
    const layoutStart = source.indexOf("// Emitting layouts", generateStart);

    expect(generateStart).toBeGreaterThanOrEqual(0);
    expect(layoutStart).toBeGreaterThan(generateStart);

    const preLayoutSource = source.slice(generateStart, layoutStart);
    const statementPasses = preLayoutSource.match(
      /for \(const stmt of program\.statements\)/g,
    ) ?? [];

    expect(statementPasses.length).toBe(1);
    expect(preLayoutSource).toContain("this.specMap.set");
    expect(preLayoutSource).toContain(
      'this.emitDeclaration(`%struct.${spec.name} = type opaque`)',
    );
    expect(preLayoutSource).not.toContain("Collect defined functions");
    expect(preLayoutSource).not.toContain("Index Structs for inheritance lookup");
  });

  it("keeps function header generation off avoidable allocation paths", () => {
    const source = readTextFile(
      join(
        process.cwd(),
        "compiler/backend/codegen/StatementGenerator.ts",
      ),
      "utf8",
    );
    const start = source.indexOf("protected generateFunction");
    const end = source.indexOf("    } finally {", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const methodSource = source.slice(start, end);
    const initStart = methodSource.indexOf("const isInitMethod");
    const initEnd = methodSource.indexOf("if (isInitMethod)", initStart);
    const initSource = methodSource.slice(initStart, initEnd);

    expect(source).toContain("private buildFunctionParameterList");
    expect(source).toContain("private getMethodBaseName");
    expect(methodSource).toContain("this.buildFunctionParameterList(");
    expect(methodSource).not.toContain("decl.params\n          .map");
    expect(methodSource).not.toContain(".join(\", \")");
    expect(initStart).toBeGreaterThanOrEqual(0);
    expect(initEnd).toBeGreaterThan(initStart);
    expect(initSource).toContain("parentStruct &&");
    expect(initSource).toContain('this.getMethodBaseName(decl.name) === "init"');
    expect(methodSource).not.toContain('decl.name.split("_")');
  });

  it("builds nonempty function parameter lists without separator branches", () => {
    const source = readTextFile(
      join(
        process.cwd(),
        "compiler/backend/codegen/StatementGenerator.ts",
      ),
      "utf8",
    );
    const methodStart = source.indexOf("private buildFunctionParameterList");
    const methodEnd = source.indexOf("private getMethodBaseName", methodStart);
    const methodSource = source.slice(methodStart, methodEnd);

    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(methodEnd).toBeGreaterThan(methodStart);
    expect(methodSource).toContain('if (params.length === 0) return ""');
    expect(methodSource).toContain("const firstParam = params[0]!");
    expect(methodSource).toContain("for (let i = 1; i < params.length; i++)");
    expect(methodSource).not.toContain("if (result.length > 0)");
  });

  it("swaps function-local codegen state instead of cloning it per function", () => {
    const source = readTextFile(
      join(
        process.cwd(),
        "compiler/backend/codegen/StatementGenerator.ts",
      ),
      "utf8",
    );
    const start = source.indexOf("protected generateFunction");
    const end = source.indexOf("  protected generateArrayInitialization", start);
    const baseSource = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/BaseCodeGenerator.ts"),
      "utf8",
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const methodSource = source.slice(start, end);
    expect(methodSource).toContain("const prevLocals = this.locals");
    expect(methodSource).toContain("const prevLocalPointers = this.localPointers");
    expect(methodSource).toContain("const prevLocalTypes = this.localTypes");
    expect(methodSource).toContain("this.locals = new Set()");
    expect(methodSource).toContain("this.localPointers = new Map()");
    expect(baseSource).toContain("movedAutoDestroyAddresses?: Set<string>");
    expect(methodSource).toContain(
      "this.movedAutoDestroyAddresses = undefined",
    );
    expect(source).toContain(
      "(this.movedAutoDestroyAddresses ??= new Set<string>()).add",
    );
    expect(methodSource).not.toContain(
      "this.movedAutoDestroyAddresses = new Set()",
    );
    expect(methodSource).not.toContain("new Set(this.locals)");
    expect(methodSource).not.toContain("new Map(this.localPointers)");
    expect(methodSource).not.toContain("this.locals.clear()");
    expect(methodSource.indexOf("try {")).toBeLessThan(
      methodSource.indexOf("if (this.definedFunctions.has(name))"),
    );
  });

  it("does not allocate write-only local null tracking state", () => {
    const sources = [
      "AddressExpressionGenerator.ts",
      "BaseCodeGenerator.ts",
      "ExpressionGenerator.ts",
      "StatementGenerator.ts",
    ].map((file) =>
      readTextFile(
        join(process.cwd(), "compiler/backend/codegen", file),
        "utf8",
      ),
    );
    const combinedSource = sources.join("\n");

    expect(combinedSource).not.toContain("localNullFlags");
    expect(combinedSource).not.toContain("pointerToLocal");
  });

  it("keeps block scope snapshots lazy for declaration-free blocks", () => {
    const source = readTextFile(
      join(
        process.cwd(),
        "compiler/backend/codegen/StatementGenerator.ts",
      ),
      "utf8",
    );
    const start = source.indexOf("  protected generateBlock(");
    const end = source.indexOf("  protected generateStatement", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const methodSource = source.slice(start, end);
    expect(methodSource).toContain(
      "let declaredInBlock: Set<string> | undefined;",
    );
    expect(methodSource).toContain(
      "const declaredNames = (declaredInBlock ??= new Set<string>());",
    );
    expect(methodSource).toContain("if (declaredInBlock) {");
    expect(methodSource).not.toContain(
      "const declaredInBlock = new Set<string>();",
    );
  });

  it("keeps simple block declaration names off recursive collection", () => {
    const source = readTextFile(
      join(
        process.cwd(),
        "compiler/backend/codegen/StatementGenerator.ts",
      ),
      "utf8",
    );
    const start = source.indexOf("  protected generateBlock(");
    const end = source.indexOf("  protected generateStatement", start);
    const methodSource = source.slice(start, end);
    const simpleNameCheck = methodSource.indexOf(
      'if (typeof decl.name === "string")',
    );
    const recursiveCollection = methodSource.indexOf(
      "collectDestructuringNames(decl.name)",
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(simpleNameCheck).toBeGreaterThanOrEqual(0);
    expect(recursiveCollection).toBeGreaterThan(simpleNameCheck);
    expect(methodSource).not.toContain("collectDeclaredNames(decl.name)");
  });

  it("detects LLVM terminators without trimming generated lines", () => {
    const generator = new InspectableCodeGenerator();
    expect(generator.isIrTerminator("  ret i32 0")).toBe(true);
    expect(generator.isIrTerminator("\tbr label %done")).toBe(true);
    expect(generator.isIrTerminator("  switch i32 %x, label %d []")).toBe(true);
    expect(generator.isIrTerminator("  unreachable")).toBe(true);
    expect(generator.isIrTerminator("  %x = add i32 1, 2")).toBe(false);
    expect(generator.isIrTerminator("  ret")).toBe(false);
    expect(generator.isIrTerminator("  break")).toBe(false);
    expect(generator.isIrTerminator("  switcheroo")).toBe(false);

    const source = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/BaseCodeGenerator.ts"),
      "utf8",
    );
    const start = source.indexOf("protected isTerminator");
    const end = source.indexOf("\n}", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const methodSource = source.slice(start, end);
    expect(methodSource).toContain("line.charCodeAt(index)");
    expect(methodSource).toContain("switch (line.charCodeAt(index))");
    expect(methodSource).toContain("case 114:");
    expect(methodSource).toContain("case 98:");
    expect(methodSource).toContain("case 115:");
    expect(methodSource).toContain("case 117:");
    expect(methodSource).toContain('line.startsWith("ret ", index)');
    expect(methodSource).not.toContain('line.startsWith("ret ", index) ||');
    expect(methodSource).not.toContain(".trim()");
  });

  it("keeps simple struct member address generation on a direct layout path", () => {
    const source = readTextFile(
      join(
        process.cwd(),
        "compiler/backend/codegen/AddressExpressionGenerator.ts",
      ),
      "utf8",
    );
    const helperStart = source.indexOf(
      "private getDirectStructMemberAddressName",
    );
    const helperEnd = source.indexOf(
      "private generateMemberAddress",
      helperStart,
    );
    const methodStart = source.indexOf("private generateMemberAddress");
    const methodEnd = source.indexOf(
      "private generateIndexAddress",
      methodStart,
    );

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);
    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(methodEnd).toBeGreaterThan(methodStart);

    const helperSource = source.slice(helperStart, helperEnd);
    const methodSource = source.slice(methodStart, methodEnd);
    expect(helperSource).toContain("type.pointerDepth !== 0");
    expect(helperSource).toContain("this.typeAliasMap.has(type.name)");
    expect(methodSource).toContain(
      "const directStructName = this.getDirectStructMemberAddressName(objType)",
    );
    expect(methodSource).toContain("if (directStructName === undefined)");

    const ir = compile(`
      struct Point {
        x: int,
        y: int,
      }

      frame main() ret int {
        local p: Point;
        p.x = 4;
        return p.x;
      }
    `);
    expect(ir).toMatch(
      /getelementptr inbounds %struct\.Point, %struct\.Point\* %p_ptr(?:\.\d+)?, i32 0, i32 0/,
    );
  });

  it("keeps direct struct member address lookup off LLVM type string parsing", () => {
    const source = readTextFile(
      join(
        process.cwd(),
        "compiler/backend/codegen/AddressExpressionGenerator.ts",
      ),
      "utf8",
    );
    const methodStart = source.indexOf("private generateMemberAddress");
    const methodEnd = source.indexOf(
      "private generateIndexAddress",
      methodStart,
    );

    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(methodEnd).toBeGreaterThan(methodStart);

    const methodSource = source.slice(methodStart, methodEnd);
    expect(methodSource).toContain(
      "let llvmType: string | undefined = undefined",
    );
    expect(methodSource).toContain("if (directStructName === undefined)");
    expect(methodSource).toContain(
      "let structName = directStructName ?? objType.name",
    );

    const directStart = methodSource.indexOf(
      "let structName = directStructName ?? objType.name",
    );
    const fallbackStart = methodSource.indexOf(
      "if (directStructName === undefined)",
    );
    const fallbackEnd = methodSource.indexOf("}", fallbackStart);

    expect(fallbackStart).toBeGreaterThan(directStart);
    expect(fallbackEnd).toBeGreaterThan(fallbackStart);
    expect(methodSource.slice(directStart, fallbackStart)).not.toContain(
      "llvmType.startsWith",
    );
  });

  it("keeps primitive-only struct defaults on a cached undef fast path", () => {
    const statementGeneratorSource = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/StatementGenerator.ts"),
      "utf8",
    );
    const codeGeneratorSource = readTextFile(
      join(process.cwd(), "compiler/backend/CodeGenerator.ts"),
      "utf8",
    );
    const helperStart = statementGeneratorSource.indexOf(
      "private structNeedsDefaultInitialization",
    );
    const helperEnd = statementGeneratorSource.indexOf(
      "protected generateDefaultValue",
      helperStart,
    );

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);

    const helperSource = statementGeneratorSource.slice(
      helperStart,
      helperEnd,
    );
    const defaultStart = statementGeneratorSource.indexOf(
      "protected generateDefaultValue",
    );
    const defaultEnd = statementGeneratorSource.indexOf(
      "protected generateVariableDecl",
      defaultStart,
    );
    const defaultSource = statementGeneratorSource.slice(
      defaultStart,
      defaultEnd,
    );

    expect(statementGeneratorSource).toContain(
      "private structDefaultInitializationRequiredCache",
    );
    expect(statementGeneratorSource).toContain(
      "private autoDestroyMethodCache",
    );
    expect(statementGeneratorSource).toContain(
      "protected clearDefaultValueCaches",
    );
    expect(statementGeneratorSource).toContain(
      "this.autoDestroyMethodCache.clear()",
    );
    expect(statementGeneratorSource).toContain(
      "this.autoDestroyMethodCache.get(structDecl)",
    );
    expect(statementGeneratorSource).toContain(
      "this.autoDestroyMethodCache.set(structDecl, method ?? null)",
    );
    expect(codeGeneratorSource).toContain("this.clearDefaultValueCaches()");
    expect(helperSource).toContain('layout.has("__vtable__")');
    expect(helperSource).toContain('fieldLlvmType.startsWith("%enum.")');
    expect(defaultSource).toContain(
      "if (!this.structNeedsDefaultInitialization(structName))",
    );
    expect(defaultSource.indexOf("structNeedsDefaultInitialization")).toBeLessThan(
      defaultSource.indexOf("Array.from(layout.entries())"),
    );
  });

  it("preserves required struct default initialization values", () => {
    const vtableIr = compile(`
      struct Animal {
        frame speak(this: Animal) ret int { return 1; }
      }

      frame main() ret int {
        local animal: Animal;
        return 0;
      }
    `);
    expect(vtableIr).toMatch(
      /insertvalue %struct\.Animal undef, i8\* bitcast \(\[4 x i8\*\]\* @Animal_vtable to i8\*\), 0/,
    );

    const enumFieldIr = compile(`
      enum Color {
        Red,
        Green,
      }

      struct Paint {
        color: Color,
      }

      frame main() ret int {
        local paint: Paint;
        return 0;
      }
    `);
    expect(enumFieldIr).toContain(
      "insertvalue %struct.Paint undef, %enum.Color zeroinitializer, 0",
    );
  });

  it("does not write debug IR files by default", () => {
    const cwd = process.cwd();
    const dir = mkdtempSync(join(tmpdir(), "bpl-codegen-"));

    try {
      process.chdir(dir);
      compile("frame main() { return; }");

      expect(existsSync(join(dir, "ir.ll"))).toBe(false);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes debug IR files when explicitly requested", () => {
    const cwd = process.cwd();
    const dir = mkdtempSync(join(tmpdir(), "bpl-codegen-"));
    const debugIrPath = join(dir, "debug.ll");

    try {
      process.chdir(dir);
      compile("frame main() { return; }", { debugIrPath });

      expect(existsSync(debugIrPath)).toBe(true);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects empty debug IR paths", () => {
    expectDebugIrError(
      () => compile("frame main() { return; }", { debugIrPath: "" }),
      "BPL_CODEGEN_DEBUG_IR_PATH_EMPTY",
      /Debug IR path is empty/,
    );
  });

  it("rejects empty debug IR environment values", () => {
    const previousDebugIr = process.env.BPL_DEBUG_IR;

    try {
      process.env.BPL_DEBUG_IR = "";
      expectDebugIrError(
        () => compile("frame main() { return; }"),
        "BPL_CODEGEN_DEBUG_IR_PATH_EMPTY",
        /Debug IR path is empty/,
      );
    } finally {
      if (previousDebugIr === undefined) {
        delete process.env.BPL_DEBUG_IR;
      } else {
        process.env.BPL_DEBUG_IR = previousDebugIr;
      }
    }
  });

  it("does not write debug IR through symbolic links", () => {
    const cwd = process.cwd();
    const dir = mkdtempSync(join(tmpdir(), "bpl-codegen-"));
    const targetPath = join(dir, "outside.ll");
    const debugIrPath = join(dir, "debug.ll");

    try {
      process.chdir(dir);
      writeFileSync(targetPath, "original\n");
      symlinkSync(targetPath, debugIrPath, "file");

      expectDebugIrError(
        () => compile("frame main() { return; }", { debugIrPath }),
        "BPL_CODEGEN_DEBUG_IR_PATH_SYMLINK",
        /Debug IR path is a symbolic link/,
      );

      expect(readTextFile(targetPath, "utf8")).toBe("original\n");
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not write debug IR through symlinked parent directories", () => {
    const cwd = process.cwd();
    const dir = mkdtempSync(join(tmpdir(), "bpl-codegen-"));
    const realParent = join(dir, "real-parent");
    const linkedParent = join(dir, "linked-parent");
    const debugIrPath = join(linkedParent, "debug.ll");

    try {
      process.chdir(dir);
      mkdirSync(realParent);
      symlinkSync(realParent, linkedParent, "dir");

      expectDebugIrError(
        () => compile("frame main() { return; }", { debugIrPath }),
        "BPL_CODEGEN_DEBUG_IR_PARENT_SYMLINK",
        /Debug IR parent path is a symbolic link/,
      );

      expect(existsSync(join(realParent, "debug.ll"))).toBe(false);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not write debug IR through symlinked ancestor directories", () => {
    const cwd = process.cwd();
    const dir = mkdtempSync(join(tmpdir(), "bpl-codegen-"));
    const realRoot = join(dir, "real-root");
    const linkedRoot = join(dir, "linked-root");
    const realNested = join(realRoot, "nested");
    const debugIrPath = join(linkedRoot, "nested", "debug.ll");

    try {
      process.chdir(dir);
      mkdirSync(realNested, { recursive: true });
      symlinkSync(realRoot, linkedRoot, "dir");

      expectDebugIrError(
        () => compile("frame main() { return; }", { debugIrPath }),
        "BPL_CODEGEN_DEBUG_IR_PARENT_SYMLINK",
        /Debug IR parent path contains a symbolic link/,
      );

      expect(existsSync(join(realNested, "debug.ll"))).toBe(false);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports missing debug IR parent directories", () => {
    const cwd = process.cwd();
    const dir = mkdtempSync(join(tmpdir(), "bpl-codegen-"));
    const debugIrPath = join(dir, "missing", "debug.ll");

    try {
      process.chdir(dir);

      expectDebugIrError(
        () => compile("frame main() { return; }", { debugIrPath }),
        "BPL_CODEGEN_DEBUG_IR_PARENT_NOT_FOUND",
        /Debug IR parent path does not exist/,
      );
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid optimization levels before generating IR", () => {
    expect(() =>
      compile("frame main() { return; }", { optimizationLevel: 4 }),
    ).toThrow(/Invalid optimization level "4"/);
  });

  it("rejects unsupported target triples before generating IR", () => {
    expect(() =>
      compile("frame main() { return; }", {
        target: "mips64-unknown-bpl",
      }),
    ).toThrow(/Unsupported target triple "mips64-unknown-bpl"/);
  });

  it("rejects empty target triples before generating IR", () => {
    expect(() =>
      compile("frame main() { return; }", {
        target: "",
      }),
    ).toThrow(/Unsupported target triple ""/);
  });

  it("rejects whitespace-padded target triples before generating IR", () => {
    expect(() =>
      compile("frame main() { return; }", {
        target: " x86_64-pc-linux-gnu ",
      }),
    ).toThrow(/Unsupported target triple " x86_64-pc-linux-gnu "/);
  });

  it("rejects target triples that only contain supported components as substrings", () => {
    expect(() =>
      compile("frame main() { return; }", {
        target: "x86_64-unknown-notlinux-gnu",
      }),
    ).toThrow(/Unsupported target triple "x86_64-unknown-notlinux-gnu"/);

    expect(() =>
      compile("frame main() { return; }", {
        target: "notwasm32-unknown-unknown",
      }),
    ).toThrow(/Unsupported target triple "notwasm32-unknown-unknown"/);
  });

  it("rejects target triples with empty components", () => {
    expect(() =>
      compile("frame main() { return; }", {
        target: "x86_64--linux",
      }),
    ).toThrow(/Unsupported target triple "x86_64--linux"/);

    expect(() =>
      compile("frame main() { return; }", {
        target: "wasm32-",
      }),
    ).toThrow(/Unsupported target triple "wasm32-"/);
  });

  it("uses the selected compiler driver for DWARF producer metadata", () => {
    const previousBplCc = process.env.BPL_CC;
    process.env.BPL_CC = join(
      tmpdir(),
      `definitely-missing-dwarf-cc-${process.pid}`,
    );

    try {
      const ir = compile("frame main() { return; }", { dwarf: true });

      expect(ir).toContain('producer: "BPL compiler"');
      expect(ir).toContain('!{!"BPL compiler"}');
      expect(ir).not.toContain("Debian clang version 21.1.6 (3)");
    } finally {
      if (previousBplCc === undefined) {
        delete process.env.BPL_CC;
      } else {
        process.env.BPL_CC = previousBplCc;
      }
    }
  });

  it("throws instead of emitting a placeholder for unsupported binary operators", () => {
    const program = parseAndCheck(`
      frame bad(a: int, b: int) ret int {
        return a + b;
      }
    `);
    const expr = getOnlyReturnExpression(program) as AST.BinaryExpr;
    (expr.operator as any).type = 999999;
    (expr.operator as any).lexeme = "??";

    expect(() => new CodeGenerator().generate(program)).toThrow(
      /Unsupported binary operator '\?\?'/,
    );
  });

  it("throws instead of emitting a placeholder for unsupported unary operators", () => {
    const program = parseAndCheck(`
      frame bad(a: int) ret int {
        return -a;
      }
    `);
    const expr = getOnlyReturnExpression(program) as AST.UnaryExpr;
    (expr.operator as any).type = 999999;
    (expr.operator as any).lexeme = "@";

    expect(() => new CodeGenerator().generate(program)).toThrow(
      /Unsupported unary operator '@'/,
    );
  });

  it("throws instead of emitting a placeholder for unknown expression kinds", () => {
    const program = parseAndCheck(`
      frame bad() ret int {
        return 1;
      }
    `);
    const expr = getOnlyReturnExpression(program);
    (expr as any).kind = "UnknownExpression";

    expect(() => new CodeGenerator().generate(program)).toThrow(
      /Unhandled expression kind during code generation: UnknownExpression/,
    );
  });

  it("throws instead of emitting a placeholder for unknown literal types", () => {
    const program = parseAndCheck(`
      frame bad() ret int {
        return 1;
      }
    `);
    const expr = getOnlyReturnExpression(program) as AST.LiteralExpr;
    (expr as any).type = "vector";

    expect(() => new CodeGenerator().generate(program)).toThrow(
      /Unsupported literal type during code generation: vector/,
    );
  });

  it("emits separator-free decimal integers before BigInt normalization", () => {
    const source = readTextFile(
      join(
        process.cwd(),
        "compiler/backend/codegen/ExpressionGenerator.ts",
      ),
      "utf8",
    );
    const start = source.indexOf("  protected generateLiteral(");
    const end = source.indexOf("  protected generateIdentifier(", start);
    const methodSource = source.slice(start, end);
    const decimalFastPath = methodSource.indexOf(
      'raw.indexOf("_") === -1',
    );
    const bigintNormalization = methodSource.indexOf("BigInt(cleaned)");

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(decimalFastPath).toBeGreaterThanOrEqual(0);
    expect(bigintNormalization).toBeGreaterThan(decimalFastPath);
    expect(compile("frame main() ret int { return 2147483647; }")).toContain(
      "ret i32 2147483647",
    );
  });

  it("prunes unused internal runtime helper declarations from simple IR", () => {
    const ir = compile("frame main() ret int { return 0; }", {
      optimizationLevel: 3,
    });

    expect(ir).not.toContain(
      "@__bpl_stack_limit = external dso_local global i8*",
    );
    expect(ir).not.toContain("declare void @__bpl_throw_stack_overflow()");
    expect(ir).not.toContain("call void @__bpl_throw_stack_overflow()");
    expect(ir).not.toContain("alloca i8");
    expect(ir).not.toContain("call void @__bpl_enter_stack_frame()");
    expect(ir).not.toContain("call void @__bpl_exit_stack_frame()");
    expect(ir).not.toContain("declare void @__bpl_enter_stack_frame()");
    expect(ir).not.toContain("declare void @__bpl_exit_stack_frame()");
    expect(ir).not.toContain("stack_ok");
    expect(ir).not.toMatch(/br label %stack_ok/);
    expect(ir).not.toContain("declare i32 @__bpl_argc()");
    expect(ir).not.toContain("declare i8* @__bpl_argv_get(i32)");
    expect(ir).not.toContain("@__bpl_argc_value = external global i32");
    expect(ir).not.toContain("@__bpl_argv_value = external global i8**");
    expect(ir).not.toContain("store i32 %argc, i32* @__bpl_argc_value");
    expect(ir).not.toContain("store i8** %argv, i8*** @__bpl_argv_value");
    expect(ir).not.toContain("declare void @__bpl_throw_division_by_zero");
    expect(ir).not.toContain("declare void @__bpl_throw_integer_overflow");
    expect(ir).not.toContain("declare void @__bpl_check_null");
    expect(ir).not.toContain("declare i1 @__bpl_mem_is_zero");
    expect(ir).not.toContain("%struct.DivisionByZeroError = type");
    expect(ir).not.toContain("%struct.NullAccessError = type");
    expect(ir).not.toContain("%struct.IndexOutOfBoundsError = type");
    expect(ir).not.toContain("%struct.DeferNode = type");
    expect(ir).not.toContain("%struct.ExceptionFrame = type");
    expect(ir).not.toContain("@defer_top = external global");
    expect(ir).not.toContain("@exception_top = external global");
    expect(ir).not.toContain("@exception_value = external global");
    expect(ir).not.toContain("@exception_type = external global");
    expect(ir).not.toContain("@__bpl_stack_depth = external global i32");
    expect(ir).not.toContain(
      "@__bpl_stack_limit = external dso_local global i8*",
    );
    expect(ir).not.toContain("declare i8* @malloc(i64)");
    expect(ir).not.toContain("declare void @free(i8*)");
    expect(ir).not.toContain("declare void @exit(i32)");
    expect(ir).not.toContain("declare i32 @memcmp(i8*, i8*, i64)");
    expect(ir).not.toContain("declare i32 @strcmp(i8*, i8*)");
    expect(ir).not.toContain("%struct._IO_FILE = type opaque");
    expect(ir).not.toContain("@stderr = external global");
    expect(ir).not.toContain("declare i32 @fprintf(%struct._IO_FILE*, i8*, ...)");
    expect(ir).not.toContain("declare i32 @setjmp(i8*) returns_twice");
    expect(ir).not.toContain("declare void @longjmp(i8*, i32) noreturn");
    expect(ir).not.toContain("%struct.Type = type");
    expect(ir).not.toContain("@Type_vtable =");
    expect(ir).not.toContain("declare i8* @Type_getTypeName_Type_ptr");
    expect(ir).not.toContain("declare i8* @Type_toString_Type_ptr");
    expect(ir).not.toContain("declare void @Type_destroy_Type_ptr");
    expect(ir).not.toContain("%struct.Int = type");
    expect(ir).not.toContain("%struct.Bool = type");
    expect(ir).not.toContain("%struct.Double = type");
    expect(ir).not.toContain("%struct.String = type");
    expect(ir).not.toMatch(/\n{3,}/);
    expect(ir).toContain('source_filename = "unknown"\n\ndefine dso_local i32 @main');
  });

  it("keeps builtin-named struct declarations when generated IR references them", () => {
    const ir = compile(
      `
        struct String {
          data: string,
          length: int,
        }

        frame main() ret int {
          local value: String;
          value.length = 3;
          return value.length;
        }
      `,
      { optimizationLevel: 3 },
    );

    expect(ir).toContain("%struct.String = type");
    expect(ir).toContain("alloca %struct.String");
    expect(ir).toContain("getelementptr inbounds %struct.String");
  });

  it("keeps Type vtable metadata when generated IR references it", () => {
    const ir = compile(
      `
        struct Type {
          frame getTypeName(this: *Type) ret string {
            return "Type";
          }

          frame toString(this: *Type) ret string {
            return this.getTypeName();
          }

          frame destroy(this: *Type) {
          }
        }

        frame main() ret int {
          local value: Type = Type {};
          return 0;
        }
      `,
      { optimizationLevel: 3 },
    );

    expect(ir).toContain("%struct.Type = type");
    expect(ir).toContain("@Type_vtable =");
    expect(ir).toContain("bitcast ([3 x i8*]* @Type_vtable to i8*)");
    expect(ir).toContain("define linkonce_odr dso_local i8* @Type_getTypeName_Type_ptr");
  });

  it("keeps internal runtime helper declarations when generated IR uses them", () => {
    const ir = compile(
      `
        frame main(a: i32, b: i32) ret i32 {
          return a / b;
        }
      `,
      { optimizationLevel: 3 },
    );

    expect(ir).toContain("call void @__bpl_throw_division_by_zero");
    expect(ir).toContain("declare void @__bpl_throw_division_by_zero");
    expect(ir).toContain("call void @__bpl_throw_integer_overflow");
    expect(ir).toContain("declare void @__bpl_throw_integer_overflow");
  });

  it("keeps internal runtime state declarations when generated IR uses them", () => {
    const tryIr = compile(
      `
        frame main() ret int {
          try {
            throw 1;
          } catch (e: int) {
            return e;
          }
          return 0;
        }
      `,
      { optimizationLevel: 3 },
    );

    expect(tryIr).toContain("%struct.ExceptionFrame = type");
    expect(tryIr).toContain("%struct.DeferNode = type");
    expect(tryIr).toContain("@exception_top = external global");
    expect(tryIr).toContain("@exception_value = external global");
    expect(tryIr).toContain("@exception_type = external global");
    expect(tryIr).toContain("@defer_top = external global");
    expect(tryIr).toContain("declare i32 @setjmp(i8*) returns_twice");
    expect(tryIr).toContain("declare void @longjmp(i8*, i32) noreturn");

    const deferIr = compile(
      `
        frame cleanup() {
        }

        frame main() {
          defer cleanup();
        }
      `,
      { optimizationLevel: 3 },
    );

    expect(deferIr).toContain("%struct.DeferNode = type");
    expect(deferIr).toContain("@defer_top = external global");
  });

  it("keeps implicit C prelude declarations when generated IR uses them", () => {
    const ir = compile(
      `
        extern malloc(size: long) ret *void;

        frame main() ret int {
          local ptr: *void = malloc(8);
          if (ptr == nullptr) {
            return 1;
          }
          return 0;
        }
      `,
      { optimizationLevel: 3 },
    );

    expect(ir).toContain("call i8* @malloc");
    expect(ir).toContain("declare noalias i8* @malloc(i64) allocsize(0)");
  });

  it("adds allocator facts to compatible malloc extern declarations", () => {
    const ir = compile(
      `
        extern malloc(size: long) ret *void;

        frame main() ret int {
          local ptr: *void = malloc(8);
          if (ptr == nullptr) {
            return 1;
          }
          return 0;
        }
      `,
      { optimizationLevel: 3 },
    );

    expect(ir).toContain("call i8* @malloc");
    expect(ir).toContain("declare noalias i8* @malloc(i64) allocsize(0)");
  });

  it("omits repeated null checks for the same pointer inside one basic block", () => {
    const ir = compile(
      `
        extern malloc(size: int) ret *void;

        struct Node {
          value: int,
          left: *Node,
          right: *Node,
        }

        frame create_node(value: int) ret *Node {
          local node: *Node = cast<*Node>(malloc(sizeof(Node)));
          node.value = value;
          node.left = nullptr;
          node.right = nullptr;
          return node;
        }
      `,
      { optimizationLevel: 3 },
    );

    const createNode = ir.match(
      /define dso_local %struct\.Node\* @create_node_i32[\s\S]*?\n}\n/,
    )?.[0];
    expect(createNode).toBeDefined();
    expect(createNode!.match(/@__bpl_check_null/g)?.length ?? 0).toBe(1);
  });

  it("uses terminating nullptr guards to skip later member null checks", () => {
    const ir = compile(
      `
        struct Node {
          value: int,
        }

        frame value_after_guard(root: *Node) ret int {
          if (root == nullptr) {
            return 0;
          }
          return root.value;
        }
      `,
      { optimizationLevel: 3 },
    );

    const valueAfterGuard = ir.match(
      /define dso_local i32 @value_after_guard_Node_ptr[\s\S]*?\n}\n/,
    )?.[0];
    expect(valueAfterGuard).toBeDefined();
    expect(valueAfterGuard!.match(/@__bpl_check_null/g)?.length ?? 0).toBe(0);
  });

  it("keeps null checks when an else branch can invalidate a guarded pointer", () => {
    const ir = compile(
      `
        struct Node {
          value: int,
        }

        frame value_after_else_assignment(root: *Node) ret int {
          if (root == nullptr) {
            return 0;
          } else {
            root = nullptr;
          }
          return root.value;
        }
      `,
      { optimizationLevel: 3 },
    );

    const valueAfterElseAssignment = ir.match(
      /define dso_local i32 @value_after_else_assignment_Node_ptr[\s\S]*?\n}\n/,
    )?.[0];
    expect(valueAfterElseAssignment).toBeDefined();
    expect(
      valueAfterElseAssignment!.match(/@__bpl_check_null/g)?.length ?? 0,
    ).toBe(1);
  });

  it("carries terminating nullptr guard proofs through branch labels without calls", () => {
    const ir = compile(
      `
        struct Node {
          value: int,
        }

        frame value_after_guard_branch(root: *Node, use_first: bool) ret int {
          if (root == nullptr) {
            return 0;
          }
          if (use_first) {
            return root.value;
          }
          return root.value + 1;
        }
      `,
      { optimizationLevel: 3 },
    );

    const valueAfterGuardBranch = ir.match(
      /define dso_local i32 @value_after_guard_branch_Node_ptr_i1[\s\S]*?\n}\n/,
    )?.[0];
    expect(valueAfterGuardBranch).toBeDefined();
    expect(
      valueAfterGuardBranch!.match(/@__bpl_check_null/g)?.length ?? 0,
    ).toBe(0);
  });

  it("retains local pointer null guard proofs across intervening calls", () => {
    const ir = compile(
      `
        struct Node {
          value: int,
          left: *Node,
        }

        frame touch(node: *Node) ret int {
          return 1;
        }

        frame value_after_guard_call(root: *Node) ret int {
          if (root == nullptr) {
            return 0;
          }
          local seen: int = touch(root.left);
          return seen + root.value;
        }
      `,
      { optimizationLevel: 3 },
    );

    const valueAfterGuardCall = ir.match(
      /define dso_local i32 @value_after_guard_call_Node_ptr[\s\S]*?\n}\n/,
    )?.[0];
    expect(valueAfterGuardCall).toBeDefined();
    expect(
      valueAfterGuardCall!.match(/@__bpl_check_null/g)?.length ?? 0,
    ).toBe(0);
  });

  it("does not retain global pointer null guard proofs across intervening calls", () => {
    const ir = compile(
      `
        struct Node {
          value: int,
        }

        global current: *Node = nullptr;

        frame clear_current() {
          current = nullptr;
        }

        frame value_after_global_guard_call() ret int {
          if (current == nullptr) {
            return 0;
          }
          clear_current();
          return current.value;
        }
      `,
      { optimizationLevel: 3 },
    );

    const valueAfterGlobalGuardCall = ir.match(
      /define dso_local i32 @value_after_global_guard_call[\s\S]*?\n}\n/,
    )?.[0];
    expect(valueAfterGlobalGuardCall).toBeDefined();
    expect(
      valueAfterGlobalGuardCall!.match(/@__bpl_check_null/g)?.length ?? 0,
    ).toBe(1);
  });

  it("does not retain address-escaped local pointer null guard proofs across intervening calls", () => {
    const ir = compile(
      `
        struct Node {
          value: int,
        }

        frame clear_slot(slot: **Node) {
          *slot = nullptr;
        }

        frame value_after_escaped_guard_call(root: *Node) ret int {
          if (root == nullptr) {
            return 0;
          }
          clear_slot(&root);
          return root.value;
        }
      `,
      { optimizationLevel: 3 },
    );

    const valueAfterEscapedGuardCall = ir.match(
      /define dso_local i32 @value_after_escaped_guard_call_Node_ptr[\s\S]*?\n}\n/,
    )?.[0];
    expect(valueAfterEscapedGuardCall).toBeDefined();
    expect(
      valueAfterEscapedGuardCall!.match(/@__bpl_check_null/g)?.length ?? 0,
    ).toBe(1);
  });

  it("does not retain member pointer null proofs across intervening calls", () => {
    const ir = compile(
      `
        struct Node {
          value: int,
        }

        struct Holder {
          node: *Node,
        }

        frame touch(holder: *Holder) ret int {
          return 1;
        }

        frame value_after_member_guard_call(holder: *Holder) ret int {
          if (holder == nullptr) {
            return 0;
          }
          local first: int = holder.node.value;
          touch(holder);
          return first + holder.node.value;
        }
      `,
      { optimizationLevel: 3 },
    );

    const valueAfterMemberGuardCall = ir.match(
      /define dso_local i32 @value_after_member_guard_call_Holder_ptr[\s\S]*?\n}\n/,
    )?.[0];
    expect(valueAfterMemberGuardCall).toBeDefined();
    expect(
      valueAfterMemberGuardCall!.match(/@__bpl_check_null/g)?.length ?? 0,
    ).toBe(2);
  });

  it("does not leak nested null guard proofs through unrelated predecessors", () => {
    const ir = compile(
      `
        struct Node {
          value: int,
        }

        frame value_after_nested_guard(root: *Node, guard: bool) ret int {
          if (guard) {
            if (root == nullptr) {
              return 0;
            }
          }
          return root.value;
        }
      `,
      { optimizationLevel: 3 },
    );

    const valueAfterNestedGuard = ir.match(
      /define dso_local i32 @value_after_nested_guard_Node_ptr_i1[\s\S]*?\n}\n/,
    )?.[0];
    expect(valueAfterNestedGuard).toBeDefined();
    expect(
      valueAfterNestedGuard!.match(/@__bpl_check_null/g)?.length ?? 0,
    ).toBe(1);
  });

  it("keeps pointer-proof boundary detection off allocation-heavy string trimming", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/BaseCodeGenerator.ts"),
      "utf8",
    );
    const start = source.indexOf("private isBasicBlockPointerBoundaryLine");
    const end = source.indexOf("\n  protected emitDeclaration", start);
    const emitStart = source.indexOf("protected emit(line: string");
    const emitEnd = source.indexOf(
      "\n\n  protected currentStatementLocation",
      emitStart,
    );
    const methodSource = source.slice(start, end);
    const emitSource = source.slice(emitStart, emitEnd);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(emitStart).toBeGreaterThanOrEqual(0);
    expect(emitEnd).toBeGreaterThan(emitStart);
    expect(emitSource).not.toContain("PointerFacts");
    expect(methodSource).not.toContain(".trim()");
    expect(methodSource).toContain("charCodeAt");
  });

  it("keeps address-escape tracking off eager function-body AST walks", () => {
    const statementSource = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/StatementGenerator.ts"),
      "utf8",
    );
    const unarySource = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/UnaryExpressionGenerator.ts"),
      "utf8",
    );
    const functionStart = statementSource.indexOf(
      "protected generateFunction(",
    );
    const functionEnd = statementSource.indexOf(
      "\n  protected generateArrayInitialization",
      functionStart,
    );
    const functionSource = statementSource.slice(functionStart, functionEnd);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(functionEnd).toBeGreaterThan(functionStart);
    expect(statementSource).not.toContain("collectAddressEscapedLocalNames");
    expect(functionSource).not.toContain("walkAST");
    expect(unarySource).toContain("noteAddressEscapedLocalPointer");
  });

  it("keeps direct recursion detection off generic AST traversal", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/StatementGenerator.ts"),
      "utf8",
    );
    const methodStart = source.indexOf("private hasDirectRecursiveCall(");
    const methodEnd = source.indexOf(
      "\n  private isDirectSelfCallExpression",
      methodStart,
    );
    const methodSource = source.slice(methodStart, methodEnd);

    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(methodEnd).toBeGreaterThan(methodStart);
    expect(methodSource).not.toContain("walkAST");
  });

  it("keeps direct recursion stack-probe scans behind hook emission gates", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/StatementGenerator.ts"),
      "utf8",
    );
    const start = source.indexOf("protected generateFunction");
    const end = source.indexOf("      // Special handling for main function", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const functionSource = source.slice(start, end);
    const hookAssignment = functionSource.indexOf(
      "this.currentFunctionEmitsStackFrameHooks =",
    );
    const probeGate = functionSource.indexOf(
      "this.currentFunctionEmitsStackFrameHooks &&\n        this.shouldUseStackLimitProbe()",
    );
    const recursionScan = functionSource.indexOf(
      "const hasDirectRecursiveCall = this.hasDirectRecursiveCall(decl);",
    );

    expect(hookAssignment).toBeGreaterThanOrEqual(0);
    expect(probeGate).toBeGreaterThan(hookAssignment);
    expect(recursionScan).toBeGreaterThan(probeGate);
  });

  it("keeps nonzero divisor proof tracking lazy for division-free codegen", () => {
    const baseSource = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/BaseCodeGenerator.ts"),
      "utf8",
    );
    const statementSource = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/StatementGenerator.ts"),
      "utf8",
    );

    expect(baseSource).toContain(
      "protected basicBlockNonZeroIntegerExpressions?: Map<string, number>;",
    );
    expect(baseSource).toContain(
      "this.basicBlockNonZeroIntegerExpressions ??= new Map();",
    );
    expect(baseSource).not.toContain(
      "protected basicBlockNonZeroIntegerExpressions: Map<string, number> =",
    );
    expect(statementSource).toContain(
      "this.basicBlockNonZeroIntegerExpressions = undefined;",
    );
    expect(statementSource).not.toContain(
      "this.basicBlockNonZeroIntegerExpressions = new Map();",
    );
  });

  it("keeps empty branch proof propagation off per-if allocation paths", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/StatementGenerator.ts"),
      "utf8",
    );
    const start = source.indexOf("protected generateIf");
    const end = source.indexOf(
      "\n\n  private intersectPointerExpressionProofs",
      start,
    );
    const generateIfSource = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(source).toContain(
      "const EMPTY_POINTER_EXPRESSION_PROOFS: readonly string[] = [];",
    );
    expect(generateIfSource).toContain(
      "this.basicBlockNonNullPointerExpressions.size === 0",
    );
    expect(generateIfSource).toContain("tracksPointerExpressionProofs");
    expect(generateIfSource).not.toContain(
      "const fallthroughPointerExpressionProofs: string[][] = [];",
    );
  });

  it("keeps bounded stack-hook elision expression analysis single-pass", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/codegen/StatementGenerator.ts"),
      "utf8",
    );
    const start = source.indexOf(
      "private isBoundedCallFreeStackHookElisionCandidate",
    );
    const end = source.indexOf("\n  private hasDirectTailRecursiveReturn", start);
    const elisionSource = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(elisionSource).toContain("expressionBlocksStackHookElision");
    expect(elisionSource).not.toContain("expressionMayEmitCall");
    expect(elisionSource).not.toContain("expressionMayEmitCheckedRuntimeFailure");
  });

  it("omits dead stack_ok branch scaffolding from multi-function IR", () => {
    const ir = compile(
      `
        frame helper(value: int) ret int {
          return value + 1;
        }

        frame main() ret int {
          return helper(41);
        }
      `,
      { optimizationLevel: 3 },
    );

    expect(ir).toContain(
      "@__bpl_stack_limit = external dso_local global i8*",
    );
    expect(ir).toContain("call void @__bpl_throw_stack_overflow()");
    expect(ir).not.toContain("call void @__bpl_enter_stack_frame()");
    expect(ir).not.toContain("call void @__bpl_exit_stack_frame()");
    expect(ir).toContain("define dso_local i32 @helper_i32");
    expect(ir).toContain("define dso_local i32 @main");
    expect(ir).not.toContain("stack_ok");
    expect(ir).not.toMatch(/br label %stack_ok/);
  });

  it("keeps argc/argv runtime setup when generated IR uses runtime arg helpers", () => {
    const ir = compile(
      `
        extern __bpl_argc() ret int;
        extern __bpl_argv_get(index: int) ret string;

        frame main() ret int {
          local first: string = __bpl_argv_get(0);
          if (first == nullptr) {
            return 1;
          }
          return __bpl_argc();
        }
      `,
      { optimizationLevel: 3 },
    );

    expect(ir).toContain("@__bpl_argc_value = external global i32");
    expect(ir).toContain("@__bpl_argv_value = external global i8**");
    expect(ir).toContain("store i32 %argc, i32* @__bpl_argc_value");
    expect(ir).toContain("store i8** %argv, i8*** @__bpl_argv_value");
    expect(ir).toContain("call i32 @__bpl_argc()");
    expect(ir).toMatch(/call i8\* @__bpl_argv_get\(i32 (?:0|zeroinitializer)\)/);
  });

  it("tracks runtime arg helper usage before final pruning scans output", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/CodeGenerator.ts"),
      "utf8",
    );
    const start = source.indexOf("private pruneUnusedRuntimeArgStores");
    const end = source.indexOf(
      "private pruneUnusedInternalRuntimeDeclarations",
      start,
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const methodSource = source.slice(start, end);
    expect(source).toContain("private generatedArgcStoreOutputIndex");
    expect(source).toContain("protected override noteGeneratedMainArgcStore");
    expect(source).toContain("protected override noteGeneratedMainArgvStore");
    expect(source).not.toContain("protected override emit");
    expect(methodSource).toContain("this.removeGeneratedRuntimeArgStore");
    expect(methodSource).toContain("this.generatedBodyUsesArgcRuntimeHelper");
    expect(methodSource).toContain("this.generatedBodyUsesArgvRuntimeHelper");
    expect(methodSource).not.toContain("this.output.filter");
    expect(methodSource).not.toContain("outputReferencesLlvmFunction");
    expect(methodSource).not.toContain("this.output.join");
  });

  it("reuses generated body references across final runtime pruning passes", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/CodeGenerator.ts"),
      "utf8",
    );
    const outputJoinCount =
      source.match(/this\.output\.join\("\\n"\)/g)?.length ?? 0;

    expect(source).toMatch(
      /const generatedBody\s*=\s*this\.joinCompactedLines\(this\.output\)/,
    );
    expect(source).toMatch(
      /const generatedBodyReferences\s*=\s*this\.collectFinalPruningLlvmReferences\(generatedBody\)/,
    );
    expect(source).toContain(
      "this.pruneUnusedInternalRuntimeDeclarations(generatedBodyReferences)",
    );
    expect(source).toContain(
      "this.pruneUnusedBuiltinPrimitiveMetadata(generatedBodyReferences)",
    );
    expect(source).toContain(
      "this.appendResultSection(resultSections, generatedBody)",
    );
    expect(outputJoinCount).toBe(0);
  });

  it("uses targeted LLVM reference collection for final pruning roots", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/CodeGenerator.ts"),
      "utf8",
    );
    const finalPruningStart = source.indexOf("const generatedBody =");
    const finalPruningEnd = source.indexOf(
      "const resultSections",
      finalPruningStart,
    );
    const collectorStart = source.indexOf(
      "private collectFinalPruningLlvmReferences",
    );
    const collectorEnd = source.indexOf(
      "private collectLlvmReferences",
      collectorStart,
    );
    const matcherStart = source.indexOf(
      "private addTargetedLlvmReference",
      collectorStart,
    );

    expect(finalPruningStart).toBeGreaterThanOrEqual(0);
    expect(finalPruningEnd).toBeGreaterThan(finalPruningStart);
    expect(collectorStart).toBeGreaterThanOrEqual(0);
    expect(collectorEnd).toBeGreaterThan(collectorStart);
    expect(matcherStart).toBeGreaterThan(collectorStart);

    const finalPruningSource = source.slice(
      finalPruningStart,
      finalPruningEnd,
    );
    const collectorSource = source.slice(collectorStart, collectorEnd);
    const matcherSource = source.slice(matcherStart, collectorEnd);
    expect(finalPruningSource).toContain(
      "this.collectFinalPruningLlvmReferences(generatedBody)",
    );
    expect(finalPruningSource).not.toContain(
      "this.collectLlvmReferences(generatedBody)",
    );
    expect(collectorSource).toContain(
      "this.createFinalPruningLlvmReferenceTargets()",
    );
    expect(collectorSource).toContain(
      "this.scanTargetedLlvmReferencesFromText",
    );
    expect(source).toContain("private createLlvmReferenceNameTargets");
    expect(source).toContain("private scanTargetedLlvmReferencesFromText");
    expect(source).toContain("private addTargetedLlvmReference");
    expect(collectorSource).toContain(
      "targets.symbols.get(llvmBody.charCodeAt(start))",
    );
    expect(collectorSource).toContain(
      "targets.structs.get(llvmBody.charCodeAt(start))",
    );
    expect(collectorSource).not.toContain("targets.symbols.has");
    expect(collectorSource).not.toContain("targets.structs.has");
    expect(matcherSource).not.toContain("targets.get");
  });

  it("keeps final IR section assembly off the map/filter allocation path", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/CodeGenerator.ts"),
      "utf8",
    );
    const start = source.indexOf("const resultSections");
    const end = source.indexOf("const result =", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const assemblySource = source.slice(start, end);
    expect(source).toContain("private appendResultSection");
    expect(assemblySource).toContain(
      "this.appendResultSection(resultSections, header)",
    );
    expect(assemblySource).not.toContain(".map((section) => section.trimEnd())");
    expect(assemblySource).not.toContain(
      ".filter((section) => section.length > 0)",
    );
  });

  it("keeps generated blank-line joining on a single-pass exact-empty fast path", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/CodeGenerator.ts"),
      "utf8",
    );
    const start = source.indexOf("private joinCompactedLines");
    const end = source.indexOf("private appendResultSection", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const methodSource = source.slice(start, end);
    expect(methodSource).toContain("line.length === 0");
    expect(methodSource).toContain("for (let index = 0; index < lines.length; index++)");
    expect(methodSource).toContain("const line = lines[index]!");
    expect(methodSource).toContain('result += "\\n" + line');
    expect(methodSource).toContain("result = line");
    expect(methodSource).toContain("result = result.slice(0, -1)");
    expect(methodSource).not.toContain("for (const line of lines)");
    expect(methodSource).not.toContain("result += line;");
    expect(methodSource).not.toContain("const compacted: string[] = []");
    expect(methodSource).not.toContain("compacted.push");
    expect(methodSource).not.toContain("line.trim()");
    expect(methodSource).not.toContain("lines.length =");
  });

  it("uses grouped direct LLVM reference scanners during final pruning", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/CodeGenerator.ts"),
      "utf8",
    );
    const collectStart = source.indexOf("private collectLlvmReferences");
    const collectEnd = source.indexOf("private writeDebugIr", collectStart);

    expect(collectStart).toBeGreaterThanOrEqual(0);
    expect(collectEnd).toBeGreaterThan(collectStart);

    const referenceSource = source.slice(collectStart, collectEnd);
    expect(source).not.toContain("llvmSymbolReferencePatterns");
    expect(source).not.toContain("llvmStructReferencePatterns");
    expect(referenceSource).toContain("scanLlvmReferencesFromText");
    expect(referenceSource).toContain(
      'while ((symbolIndex = llvmBody.indexOf("@", symbolIndex)) !== -1)',
    );
    expect(referenceSource).toMatch(
      /while\s*\(\s*\(structIndex = llvmBody\.indexOf\("%struct\.", structIndex\)\) !== -1\s*\)/,
    );
    expect(referenceSource).toContain("references.symbols.add");
    expect(referenceSource).toContain("references.structs.add");
    expect(referenceSource).toContain("llvmBody.charCodeAt(end)");
    expect(referenceSource).not.toContain("symbolIndex < structIndex");
    expect(referenceSource).not.toContain(
      "addLlvmSymbolReferencesFromText(references, llvmBody)",
    );
    expect(referenceSource).not.toContain(
      "addLlvmStructReferencesFromText(references, llvmBody)",
    );
    expect(referenceSource).not.toContain(
      "for (let index = 0; index < llvmBody.length; index++)",
    );
    expect(referenceSource).not.toContain(
      "this.isLlvmReferenceNameCharacter",
    );
    expect(referenceSource).not.toContain("RegExp");
  });

  it("keeps LLVM reference collection exact for prefix-like symbols", () => {
    const ir = compile(
      `
        extern malloc_extra(size: long) ret *void;

        frame main() ret int {
          local ptr: *void = malloc_extra(8);
          if (ptr == nullptr) {
            return 1;
          }
          return 0;
        }
      `,
      { optimizationLevel: 3 },
    );

    expect(ir).toContain("call i8* @malloc_extra");
    expect(ir).toContain("declare i8* @malloc_extra(i64)");
    expect(ir).not.toContain("declare i8* @malloc(i64)");
  });

  it("keeps explicit main argc argv parameters without runtime helper globals", () => {
    const ir = compile(
      `
        frame main(argc: int, argv: **char) ret int {
          if (argc > 1) {
            return 0;
          }
          if (argv == nullptr) {
            return 2;
          }
          return 1;
        }
      `,
      { optimizationLevel: 3 },
    );

    expect(ir).toMatch(/store i32 %argc, i32\* %argc_ptr\.\d+/);
    expect(ir).toMatch(/store i8\*\* %argv, i8\*\*\* %argv_ptr\.\d+/);
    expect(ir).not.toContain("@__bpl_argc_value = external global i32");
    expect(ir).not.toContain("@__bpl_argv_value = external global i8**");
    expect(ir).not.toContain("store i32 %argc, i32* @__bpl_argc_value");
    expect(ir).not.toContain("store i8** %argv, i8*** @__bpl_argv_value");
  });

  it("mangles tuple parameter overloads by element types", () => {
    const ir = compile(`
      frame pick(p: (int, int)) ret int {
        return p.0;
      }

      frame pick(p: (int, bool)) ret int {
        return p.0;
      }

      frame main() ret int {
        return pick((1, 2)) + pick((3, true));
      }
    `);

    expect(ir).not.toContain("@pick_unknown");
    expect(ir).toContain("define i32 @pick_tuple_i32_i32({ i32, i32 } %p)");
    expect(ir).toContain("define i32 @pick_tuple_i32_i1({ i32, i1 } %p)");
    expect(ir).toContain("call i32 @pick_tuple_i32_i32({ i32, i32 }");
    expect(ir).toContain("call i32 @pick_tuple_i32_i1({ i32, i1 }");
  });

  it("mangles function pointer parameter overloads by signatures", () => {
    const ir = compile(`
      frame inc(value: int) ret int {
        return value + 1;
      }

      frame flag(value: bool) ret int {
        return value ? 10 : 0;
      }

      frame apply(callback: Func<int>(int), value: int) ret int {
        return callback(value);
      }

      frame apply(callback: Func<int>(bool), value: bool) ret int {
        return callback(value);
      }

      frame main() ret int {
        return apply(inc, 2) + apply(flag, true);
      }
    `);

    expect(ir).toContain(
      "define i32 @apply_fn_i32_ret_i32_i32(i32 (i32)* %callback, i32 %value)",
    );
    expect(ir).toContain(
      "define i32 @apply_fn_i1_ret_i32_i1(i32 (i1)* %callback, i1 %value)",
    );
    expect(ir).toContain("call i32 @apply_fn_i32_ret_i32_i32");
    expect(ir).toContain("call i32 @apply_fn_i1_ret_i32_i1");
  });

  it("tree-shakes unreachable top-level free functions while keeping function values", () => {
    const ir = compile(
      `
        frame used() ret int {
          return 2;
        }

        frame dead() ret int {
          return 99;
        }

        frame keepValue() ret int {
          return 7;
        }

        frame main() ret int {
          local f: Func<int>() = keepValue;
          return used() + f();
        }
      `,
      { optimizationLevel: 3, treeShakeTopLevelFunctions: true },
    );

    expect(ir).toMatch(/define .* @main\(/);
    expect(ir).toMatch(/define .* @used_/);
    expect(ir).toMatch(/define .* @keepValue_/);
    expect(ir).not.toMatch(/define .* @dead_/);
    expect(ir).not.toContain("ret i32 99");
  });

  it("keeps top-level helpers called from generated methods during tree shaking", () => {
    const ir = compile(
      `
        struct Runner {
          frame run(this: *Runner) ret int {
            return helper();
          }
        }

        frame helper() ret int {
          return 42;
        }

        frame dead() ret int {
          return 99;
        }

        frame main() ret int {
          local runner: Runner = Runner {};
          return runner.run();
        }
      `,
      { optimizationLevel: 3, treeShakeTopLevelFunctions: true },
    );

    expect(ir).toMatch(/define .* @main\(/);
    expect(ir).toMatch(/define .* @Runner_run_/);
    expect(ir).toMatch(/define .* @helper_/);
    expect(ir).not.toMatch(/define .* @dead_/);
    expect(ir).not.toContain("ret i32 99");
  });

  it("uses an index cursor for tree-shake reachability queues", () => {
    const source = readTextFile(
      join(process.cwd(), "compiler/backend/CodeGenerator.ts"),
      "utf-8",
    );
    const collectorSource =
      source.match(
        /private collectReachableTopLevelFunctions[\s\S]*?\n  private generateTopLevel/,
      )?.[0] ?? "";

    expect(collectorSource).not.toContain("queue.shift()");
    expect(collectorSource).toMatch(/let queueIndex = 0;/);
    expect(collectorSource).toMatch(
      /while \(queueIndex < queue\.length\) \{\s+const decl = queue\[queueIndex\+\+\]!;/,
    );
  });

  it("rejects unsupported memory intrinsic return types", () => {
    expect(() =>
      compile(`
        extern memcpy(dest: *void, src: *void, len: long, is_volatile: bool) ret int;

        frame bad() ret int {
          local src: int = 1;
          local dest: int = 0;
          return memcpy(cast<*void>(&dest), cast<*void>(&src), 4, false);
        }
      `),
    ).toThrow(/Unsupported return type 'i32' for memcpy intrinsic lowering/);
  });

  it("should generate code for a simple function", () => {
    const source = "frame main() { return; }";
    const ir = compile(source);
    // main() with no return type is treated as void but returns i32 0 for exit code
    expect(ir).toContain("define i32 @main(i32 %argc, i8** %argv) #0 {");
    expect(ir).toContain("ret i32 0");
  });

  it("should generate code for arithmetic", () => {
    const source = `
      frame add(a: int, b: int) ret int {
        return a + b;
      }
    `;
    const ir = compile(source);
    expect(ir).toContain("define i32 @add_i32_i32(i32 %a, i32 %b)");
    expect(ir).toContain("add i32");
    expect(ir).toContain("ret i32");
  });

  it("should generate code for struct methods", () => {
    const source = `
      struct Point {
        x: int,
        y: int,
        frame sum(this: Point) ret int {
          return this.x + this.y;
        }
      }
    `;
    const ir = compile(source);
    expect(ir).toContain("%struct.Point = type { i8*, i32, i32 }");
    // Check for mangled name
    expect(ir).toContain("define i32 @Point_sum_Point(%struct.Point %this)");
  });
});
