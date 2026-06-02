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

describe("CodeGenerator", () => {
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
