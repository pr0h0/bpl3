import { describe, expect, it } from "bun:test";

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

    expect(errors.join("\n")).toContain("Duplicate function attribute 'inline'");
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
});
