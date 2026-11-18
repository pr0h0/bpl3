import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import type * as AST from "../compiler/common/AST";
import { Formatter } from "../compiler/formatter/Formatter";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { compileToLLVM, parseSource } from "./helpers";

function checkSource(source: string): string[] {
  const program = parseSource(source);
  const checker = new TypeChecker();
  checker.checkProgram(program);
  return checker.getErrors().map((error) => error.message);
}

describe("Function Attributes", () => {
  it("parses attributes before function declarations", () => {
    const program = parseSource(`
      @[inline, cold]
      frame f() {}
    `);

    const func = program.statements.find(
      (statement): statement is AST.FunctionDecl =>
        statement.kind === "FunctionDecl",
    );

    expect(func?.attributes.map((attr) => attr.name)).toEqual([
      "inline",
      "cold",
    ]);
    expect(func?.attributes[0]?.location.startLine).toBe(2);
  });

  it("rejects unknown function attributes", () => {
    const errors = checkSource(`
      @[trace]
      frame f() {}
    `);

    expect(errors.join("\n")).toContain("Unknown function attribute 'trace'");
  });

  it("rejects duplicate function attributes", () => {
    const errors = checkSource(`
      @[inline, inline]
      frame f() {}
    `);

    expect(errors.join("\n")).toContain(
      "Duplicate function attribute 'inline'",
    );
  });

  it("rejects conflicting function attributes", () => {
    const errors = checkSource(`
      @[always_inline, noinline]
      frame f() {}
    `);

    expect(errors.join("\n")).toContain("Conflicting function attributes");
  });

  it("rejects noreturn on functions that return values", () => {
    const errors = checkSource(`
      @[noreturn]
      frame f() ret int {
        return 1;
      }
    `);

    expect(errors.join("\n")).toContain("noreturn");
  });

  it("rejects auto_destroy on free functions", () => {
    const errors = checkSource(`
      @[auto_destroy]
      frame destroy() ret void {}
    `);

    expect(errors.join("\n")).toContain(
      "Function attribute 'auto_destroy' is only valid on destroy methods",
    );
  });

  it("rejects auto_destroy on methods not named destroy", () => {
    const errors = checkSource(`
      struct Resource {
        @[auto_destroy]
        frame cleanup(this: *Resource) ret void {}
      }
    `);

    expect(errors.join("\n")).toContain(
      "Function attribute 'auto_destroy' requires method name 'destroy'",
    );
  });

  it("rejects auto_destroy without a this receiver", () => {
    const errors = checkSource(`
      struct Resource {
        @[auto_destroy]
        frame destroy(resource: *Resource) ret void {}
      }
    `);

    expect(errors.join("\n")).toContain(
      "Function attribute 'auto_destroy' requires first parameter named 'this'",
    );
  });

  it("rejects auto_destroy when the receiver is not a pointer to the parent type", () => {
    const errors = checkSource(`
      struct Other {}

      struct Resource {
        @[auto_destroy]
        frame destroy(this: *Other) ret void {}
      }
    `);

    expect(errors.join("\n")).toContain(
      "Function attribute 'auto_destroy' requires receiver type '*Resource'",
    );
  });

  it("rejects auto_destroy methods that return values", () => {
    const errors = checkSource(`
      struct Resource {
        @[auto_destroy]
        frame destroy(this: *Resource) ret int {
          return 1;
        }
      }
    `);

    expect(errors.join("\n")).toContain(
      "Function attribute 'auto_destroy' requires a void return type",
    );
  });

  it("formats function attributes above declarations", () => {
    const program = parseSource(
      `@[always_inline, hot] frame f(value:int)ret int{return value;}`,
    );
    const formatted = new Formatter().format(program);

    expect(formatted).toContain(
      `@[always_inline, hot]\nframe f(value: int) ret int`,
    );
  });

  // spec: R-FN-12
  it("emits LLVM attributes for attributed functions", () => {
    const ir = compileToLLVM(`
      @[inline]
      frame add_one(value: int) ret int {
        return value + 1;
      }
    `);

    expect(ir).toMatch(/define i32 @add_one_[^(]+\(i32 %value\) #\d+ \{/);
    expect(ir).toMatch(
      /attributes #\d+ = \{ inlinehint "frame-pointer"="all" \}/,
    );
  });

  it("uses deterministic separate groups for different attribute sets", () => {
    const ir = compileToLLVM(`
      @[always_inline, nounwind]
      frame fast(value: int) ret int {
        return value + 1;
      }

      frame plain(value: int) ret int {
        return value;
      }
    `);

    expect(ir).toMatch(/define i32 @fast_[^(]+\(i32 %value\) #\d+ \{/);
    expect(ir).toMatch(/define i32 @plain_[^(]+\(i32 %value\) #\d+ \{/);
    expect(ir).toContain("alwaysinline");
    expect(ir).toContain("nounwind");
    expect(ir).toContain('"frame-pointer"="all"');
  });

  it("keeps unannotated functions on a cached default attribute group path", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "compiler/backend/codegen/attributes/FunctionAttributeGroups.ts",
      ),
      "utf8",
    );
    const start = source.indexOf("getFunctionGroupId");
    const end = source.indexOf("render()", start);

    expect(source).toContain("private defaultGroupId");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const methodSource = source.slice(start, end);
    expect(methodSource).toContain("decl.attributes?.length");
    expect(methodSource).toContain("this.defaultGroupId");
  });

  it("omits frame pointers and marks local definitions for optimized non-debug builds", () => {
    const ir = compileToLLVM(
      `
        frame add_one(value: int) ret int {
          return value + 1;
        }
      `,
      "optimized_attributes_test.bpl",
      { optimizationLevel: 3 },
    );

    expect(ir).toMatch(
      /define dso_local i32 @add_one_[^(]+\(i32 %value\)(?: #\d+)? align 64 \{/,
    );
    expect(ir).not.toContain('"frame-pointer"="all"');
  });

  it("aligns optimized function definitions for stable hot-loop layout", () => {
    const ir = compileToLLVM(
      `
        frame fib(n: i64) ret i64 {
          if (n < 2) {
            return n;
          }
          return fib(n - 1) + fib(n - 2);
        }
      `,
      "optimized_alignment_test.bpl",
      { optimizationLevel: 3 },
    );

    expect(ir).toMatch(/define dso_local i64 @fib_i64\(i64 %n\) align 64 \{/);
  });

  it("keeps frame pointers for optimized DWARF builds", () => {
    const ir = compileToLLVM(
      `
        frame add_one(value: int) ret int {
          return value + 1;
        }
      `,
      "debug_optimized_attributes_test.bpl",
      { optimizationLevel: 3, dwarf: true },
    );

    expect(ir).toContain('"frame-pointer"="all"');
  });

  // spec: R-FN-11
  describe("unchecked", () => {
    function functionBody(ir: string, name: string): string {
      const match = ir.match(
        new RegExp(`^define[^\\n]*@${name}[^\\n]*\\{[\\s\\S]*?^\\}`, "m"),
      );
      expect(match).not.toBeNull();
      return match![0];
    }
    const runtimeChecks =
      /__bpl_check_null|__bpl_throw_index_out_of_bounds|__bpl_stack_depth|__bpl_enter_stack_frame|__bpl_stack_limit/;

    it("accepts the attribute", () => {
      expect(
        checkSource(`
          @[unchecked, hot]
          frame f() {}
        `),
      ).toEqual([]);
    });

    for (const optimizationLevel of [0, 2, 3]) {
      it(`omits bounds, null and stack checks at -O${optimizationLevel}`, () => {
        const source = `
          frame callee(n: int) ret int {
            return n;
          }

          @[unchecked]
          frame fast(values: *int, table: int[8], n: int) ret int {
            local total: int = 0;
            loop (local i: int = 0; i < n; i = i + 1) {
              total = total + values[i] + table[i & 7] + callee(i);
            }
            return total;
          }

          frame checked(values: *int, table: int[8], n: int) ret int {
            local total: int = 0;
            loop (local i: int = 0; i < n; i = i + 1) {
              total = total + values[i] + table[i & 7] + callee(i);
            }
            return total;
          }
        `;
        const ir = compileToLLVM(source, "unchecked_test.bpl", {
          optimizationLevel,
        });
        expect(functionBody(ir, "fast_")).not.toMatch(runtimeChecks);
        const checked = functionBody(ir, "checked_");
        expect(checked).toContain("__bpl_throw_index_out_of_bounds");
        expect(checked).toContain("__bpl_check_null");
      });
    }

    it("applies to generic instantiations and methods", () => {
      const ir = compileToLLVM(
        `
          struct Table {
            cells: int[4],

            @[unchecked]
            frame at(this: *Table, i: int) ret int {
              return this.cells[i];
            }
          }

          @[unchecked]
          frame first<T>(values: *T) ret T {
            return values[0];
          }

          frame main() ret int {
            local t: Table = Table { cells: [1, 2, 3, 4] };
            local v: int[2] = [5, 6];
            return t.at(2) + first<int>(&v[0]);
          }
        `,
        "unchecked_generic_test.bpl",
      );
      expect(functionBody(ir, "Table_at")).not.toMatch(runtimeChecks);
      expect(functionBody(ir, "first_")).not.toMatch(runtimeChecks);
    });

    it("does not extend to lambdas declared inside", () => {
      const ir = compileToLLVM(
        `
          @[unchecked]
          frame make() ret Lambda<int>(*int) {
            return |p: *int| ret int {
              return p[0];
            };
          }
        `,
        "unchecked_lambda_test.bpl",
      );
      expect(functionBody(ir, "make_")).not.toMatch(runtimeChecks);
      expect(ir).toContain("call void @__bpl_check_null");
    });
  });

  // spec: R-FN-14
  describe("nsw", () => {
    function functionBody(ir: string, name: string): string {
      const match = ir.match(
        new RegExp(`^define[^\\n]*@${name}[^\\n]*\\{[\\s\\S]*?^\\}`, "m"),
      );
      expect(match).not.toBeNull();
      return match![0];
    }

    const source = `
      @[nsw]
      frame fast(a: int, b: long, c: u32, d: double, n: int) ret long {
        local x: int = a + n;
        x = x - 1;
        x = x * 3;
        x = x << 2;
        x += 5;
        x++;
        local y: long = -b;
        local z: u32 = c + c;
        local w: double = d + d;
        return cast<long>(x) + y + cast<long>(z) + cast<long>(w);
      }

      frame wrapping(a: int, n: int) ret int {
        return a * n + 1;
      }

      @[unchecked]
      frame stillWraps(a: int, n: int) ret int {
        return a * n + 1;
      }
    `;

    it("marks signed integer arithmetic nsw only in @[nsw] functions", () => {
      const ir = compileToLLVM(source, "nsw_test.bpl", {
        optimizationLevel: 0,
      });
      const fast = functionBody(ir, "fast_");
      expect(fast).toMatch(/= add nsw i32 /);
      expect(fast).toMatch(/= sub nsw i32 /);
      expect(fast).toMatch(/= mul nsw i32 /);
      expect(fast).toMatch(/= shl nsw i32 /);
      expect(fast).toMatch(/= sub nsw i64 0, /);
      expect(fast).toMatch(/= add nsw i64 /);
      // Unsigned and floating-point arithmetic keep their usual flags.
      expect(fast).toMatch(/= add i32 /);
      expect(fast).toMatch(/= fadd double /);
      for (const name of ["wrapping_", "stillWraps_"]) {
        expect(functionBody(ir, name)).not.toContain(" nsw ");
      }
    });

    it("lets LLVM drop the sign extension of int loop indexes", () => {
      const loops = (attribute: string) => `
        ${attribute}
        frame sub(m: *double, col: *double, n: int) {
          loop (local j: int = 1; j < n; j = j + 1) {
            loop (local k: int = 1; k <= j; k = k + 1) {
              m[j * 40 + k] = m[j * 40 + k] - 0.5 * col[k];
            }
          }
        }
      `;
      // Count the sign extensions left in `sub` after clang optimizes it.
      const optimizedSext = (attribute: string, file: string) => {
        const dir = mkdtempSync(join(tmpdir(), "bpl-nsw-"));
        const input = join(dir, "in.ll");
        const output = join(dir, "out.ll");
        writeFileSync(
          input,
          compileToLLVM(loops(attribute), file, { optimizationLevel: 3 }),
        );
        const result = spawnSync(
          process.env.BPL_CC ?? "clang",
          ["-O3", "-S", "-emit-llvm", "-x", "ir", input, "-o", output],
          { encoding: "utf8" },
        );
        expect(result.stderr).not.toContain("error");
        expect(result.status).toBe(0);
        const body = functionBody(readFileSync(output, "utf8"), "sub_");
        return (body.match(/= sext i32 /g) ?? []).length;
      };
      const plain = optimizedSext("@[unchecked]", "nsw_loop_a.bpl");
      const nsw = optimizedSext("@[unchecked, nsw]", "nsw_loop_b.bpl");
      expect(plain).toBeGreaterThan(0);
      expect(nsw).toBe(0);
    });

    it("does not extend to lambdas declared inside", () => {
      const ir = compileToLLVM(
        `
          @[nsw]
          frame make(k: int) ret Lambda<int>(int) {
            local _scaled: int = k * 2;
            return |v: int| ret int {
              return v * 3;
            };
          }
        `,
        "nsw_lambda_test.bpl",
        { optimizationLevel: 0 },
      );
      expect(functionBody(ir, "make_")).toContain("mul nsw i32");
      expect(ir.match(/= mul nsw i32 /g)?.length).toBe(1);
    });
  });

  it("gives call-free loops no stack guard at -O2", () => {
    const ir = compileToLLVM(
      `
        frame countBits(x: u32) ret int {
          local count: int = 0;
          local value: u32 = x;
          loop (value != 0) {
            count = count + cast<int>(value & 1);
            value = value >> 1;
          }
          return count;
        }

        frame countCalls(x: int) ret int {
          local count: int = 0;
          loop (local i: int = 0; i < x; i = i + 1) {
            count = count + countBits(cast<u32>(i));
          }
          return count;
        }
      `,
      "call_free_loop_test.bpl",
      { optimizationLevel: 2 },
    );
    const stackGuard = /__bpl_stack_depth|__bpl_stack_limit/;
    const body = (name: string) =>
      ir.match(new RegExp(`^define[^\\n]*@${name}[\\s\\S]*?^\\}`, "m"))![0];
    expect(body("countBits_")).not.toMatch(stackGuard);
    expect(body("countCalls_")).toMatch(stackGuard);
  });
});
