import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function compile(
  source: string,
  options: ConstructorParameters<typeof CodeGenerator>[0] = {},
): string {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const generator = new CodeGenerator(options);
  return generator.generate(program);
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
