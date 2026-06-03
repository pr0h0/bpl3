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
}

describe("CodeGenerator", () => {
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

      expect(readFileSync(targetPath, "utf8")).toBe("original\n");
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

  it("prunes unused internal runtime helper declarations from simple IR", () => {
    const ir = compile("frame main() ret int { return 0; }", {
      optimizationLevel: 3,
    });

    expect(ir).toContain("call void @__bpl_enter_stack_frame()");
    expect(ir).toContain("declare void @__bpl_enter_stack_frame()");
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
    expect(ir).not.toContain("@__bpl_stack_depth = external global");
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
    expect(ir).toContain(
      'source_filename = "unknown"\n\ndeclare void @__bpl_enter_stack_frame()',
    );
    expect(ir).toContain(
      "declare void @__bpl_exit_stack_frame()\n\ndefine dso_local i32 @main",
    );
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
    expect(ir).toContain("declare i8* @malloc(i64)");
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

    expect(ir).toContain("call void @__bpl_enter_stack_frame()");
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
    const source = readFileSync(
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

  it("reuses the generated body string across final runtime pruning passes", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/backend/CodeGenerator.ts"),
      "utf8",
    );
    const outputJoinCount =
      source.match(/this\.output\.join\("\\n"\)/g)?.length ?? 0;

    expect(source).toContain(
      "this.pruneUnusedInternalRuntimeDeclarations(generatedBody)",
    );
    expect(source).toContain(
      "this.pruneUnusedBuiltinPrimitiveMetadata(generatedBody)",
    );
    expect(source).toContain(
      "this.appendResultSection(resultSections, generatedBody)",
    );
    expect(outputJoinCount).toBe(1);
  });

  it("keeps final IR section assembly off the map/filter allocation path", () => {
    const source = readFileSync(
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

  it("keeps generated blank-line compaction on an exact-empty fast path", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/backend/CodeGenerator.ts"),
      "utf8",
    );
    const start = source.indexOf("private compactBlankLines");
    const end = source.indexOf("private referencesLlvmSymbol", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const methodSource = source.slice(start, end);
    expect(methodSource).toContain("line.length === 0");
    expect(methodSource).not.toContain("line.trim()");
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
