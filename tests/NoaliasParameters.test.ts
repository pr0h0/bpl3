import { describe, expect, it } from "bun:test";

import type * as AST from "../compiler/common/AST";
import { Formatter } from "../compiler/formatter/Formatter";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { compileAndRun, compileToLLVM, parseSource } from "./helpers";

function diagnostics(source: string): { code?: string; message: string }[] {
  const checker = new TypeChecker();
  checker.checkProgram(parseSource(source));
  return checker
    .getErrors()
    .map((error) => ({ code: error.code, message: error.message }));
}

// BUG-825: `@[noalias]` on a pointer parameter emits LLVM `noalias`.
// spec: R-FN-13
describe("noalias parameters", () => {
  it("parses parameter attributes", () => {
    const program = parseSource(
      "frame f(@[noalias] a: *int, b: *int) { a[0] = b[0]; }",
    );
    const decl = program.statements[0] as AST.FunctionDecl;
    expect(decl.params[0]!.attributes?.map((attr) => attr.name)).toEqual([
      "noalias",
    ]);
    expect(decl.params[1]!.attributes).toBeUndefined();
  });

  it("emits noalias on the LLVM parameter", () => {
    const ir = compileToLLVM(`
      frame copy(@[noalias] out: *i16, @[noalias] input: *i16, n: int) {
        loop (local i: int = 0; i < n; i = i + 1) {
          out[i] = input[i];
        }
      }

      struct Mixer {
        gain: int,

        frame apply(this: *Mixer, @[noalias] w: *i16) {
          w[0] = cast<i16>(this.gain);
        }
      }

      frame main() ret int {
        local a: i16[2] = [1, 2];
        local b: i16[2] = [3, 4];
        copy(&a[0], &b[0], 2);
        local m: Mixer = Mixer { gain: 5 };
        m.apply(&a[0]);
        return 0;
      }
    `);
    expect(ir).toMatch(
      /define [^\n]*@copy_[^(]*\(i16\* noalias %out, i16\* noalias %input, i32 %n\)/,
    );
    expect(ir).toMatch(
      /define [^\n]*@Mixer_apply[^(]*\(%struct\.Mixer\* %this, i16\* noalias %w\)/,
    );
  });

  it("runs correctly", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      frame add(@[noalias] w: *int, @[noalias] st: *int) {
        w[0] = w[0] + st[0];
        w[1] = w[1] + st[1];
      }

      frame main() ret int {
        local w: int[2] = [1, 2];
        local st: int[2] = [10, 20];
        add(&w[0], &st[0]);
        printf("%d %d\\n", w[0], w[1]);
        return 0;
      }
    `);
    expect(output).toBe("11 22\n");
  });

  it("rejects noalias on a non-pointer parameter", () => {
    expect(
      diagnostics("frame f(@[noalias] n: int) ret int { return n; }"),
    ).toEqual([
      {
        code: "BPL_FUNCTION_ATTRIBUTE_PARAMETER_INVALID",
        message:
          "Parameter attribute 'noalias' requires a pointer parameter, but 'n' is not one",
      },
    ]);
  });

  it("rejects unknown and duplicate parameter attributes", () => {
    const errors = diagnostics(
      "frame f(@[restrict] a: *int, @[noalias, noalias] b: *int) { a[0] = b[0]; }",
    );
    expect(errors).toEqual([
      {
        code: "BPL_FUNCTION_ATTRIBUTE_UNKNOWN",
        message: "Unknown parameter attribute 'restrict'",
      },
      {
        code: "BPL_FUNCTION_ATTRIBUTE_DUPLICATE",
        message: "Duplicate parameter attribute 'noalias'",
      },
    ]);
  });

  it("rejects parameter attributes on externs and spec methods", () => {
    expect(
      diagnostics(
        "extern memcpy(@[noalias] d: *void, s: *void, n: ulong) ret *void;",
      ),
    ).toEqual([
      {
        code: "BPL_FUNCTION_ATTRIBUTE_PARAMETER_INVALID",
        message: "Parameter attributes are not allowed on extern declarations",
      },
    ]);
    expect(
      diagnostics("spec Sink { frame put(this: *Self, @[noalias] p: *int); }"),
    ).toEqual([
      {
        code: "BPL_FUNCTION_ATTRIBUTE_PARAMETER_INVALID",
        message:
          "Parameter attributes are not allowed on spec method declarations",
      },
    ]);
  });

  it("formats parameter attributes", () => {
    const source =
      "frame f(@[noalias]   a: *int,b: *int) {\n    a[0] = b[0];\n}\n";
    const formatted = new Formatter().format(parseSource(source), source);
    expect(formatted).toContain("frame f(@[noalias] a: *int, b: *int) {");
    expect(new Formatter().format(parseSource(formatted), formatted)).toBe(
      formatted,
    );
  });
});
