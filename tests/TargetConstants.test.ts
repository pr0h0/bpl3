import { describe, expect, it } from "bun:test";

import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { compileAndRun, compileToLLVM, parseSource } from "./helpers";

// BUG-827: built-in constants describe the target, and an `if` on them keeps
// only the branch that runs.
// spec: R-DECL-11
describe("target constants", () => {
  const PROBE = `
    frame probe() ret int {
        local value: int = 0;
        if (__TARGET_WASM__) {
            value = value + 1;
        }
        if (__TARGET_LINUX__) {
            value = value + 10;
        }
        if (__TARGET_MACOS__) {
            value = value + 100;
        }
        if (__TARGET_WINDOWS__) {
            value = value + 1000;
        }
        return value + __TARGET_POINTER_BITS__ * 10000;
    }

    frame main() ret int {
        return probe();
    }
  `;

  const targets: [string, number, number][] = [
    ["wasm32-unknown-unknown", 1, 32],
    ["x86_64-unknown-linux-gnu", 10, 64],
    ["i686-unknown-linux-gnu", 10, 32],
    ["aarch64-apple-darwin", 100, 64],
    ["x86_64-pc-windows-msvc", 1000, 64],
  ];
  for (const [target, flag, bits] of targets) {
    it(`gives the values for ${target}`, () => {
      const ir = compileToLLVM(PROBE, "target_constants.bpl", { target });
      const body = ir.match(/^define[^\n]*@probe_[\s\S]*?^\}/m)![0];
      // Only the taken branch is emitted.
      const added = [...body.matchAll(/add i32 %\d+, (\d+)/g)].map((match) =>
        Number(match[1]),
      );
      expect(added).toEqual([flag]);
      expect(body).toContain(`mul i32 ${bits}, 10000`);
      expect(body).not.toContain("br i1 1");
      expect(body).not.toContain("br i1 0");
    });
  }

  it("folds conditions combining constants and literals", () => {
    const ir = compileToLLVM(
      `
      extern onlyOnWindows() ret int;

      frame pick() ret int {
          if (!__TARGET_WINDOWS__ && __TARGET_POINTER_BITS__ >= 64) {
              return 1;
          } else if (__TARGET_WINDOWS__ || false) {
              return onlyOnWindows();
          }
          return 3;
      }

      frame main() ret int {
          return pick();
      }
    `,
      "target_constants.bpl",
      { target: "x86_64-unknown-linux-gnu" },
    );
    expect(ir).not.toContain("onlyOnWindows");
    const body = ir.match(/^define[^\n]*@pick_[\s\S]*?^\}/m)![0];
    expect(body).toContain("ret i32 1");
  });

  it("keeps a runtime branch when the condition is not constant", () => {
    const ir = compileToLLVM(
      `
      frame pick(n: int) ret int {
          if (__TARGET_WASM__ || n > 2) {
              return 1;
          }
          return 2;
      }

      frame main() ret int {
          return pick(3);
      }
    `,
      "target_constants.bpl",
      { target: "x86_64-unknown-linux-gnu" },
    );
    const body = ir.match(/^define[^\n]*@pick_[\s\S]*?^\}/m)![0];
    expect(body).toContain("icmp sgt");
  });

  it("uses the constants as values", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      frame main() ret int {
          local wasm: bool = __TARGET_WASM__;
          local bits: int = __TARGET_POINTER_BITS__;
          local linux: bool = __TARGET_LINUX__;
          printf("%d %d %d\\n", cast<int>(wasm), bits, cast<int>(linux));
          return 0;
      }
    `);
    expect(output).toBe(`0 64 ${process.platform === "linux" ? 1 : 0}\n`);
  });

  it("rejects taking the address of a target constant", () => {
    const checker = new TypeChecker();
    checker.checkProgram(
      parseSource(
        "frame main() { local p: *bool = &__TARGET_LINUX__; p = nullptr; }",
      ),
    );
    expect(checker.getErrors().map((error) => error.code)).toContain(
      "BPL_ADDRESS_OF_CONSTANT",
    );
  });

  it("rejects assignment to a target constant", () => {
    const checker = new TypeChecker();
    checker.checkProgram(
      parseSource("frame main() { __TARGET_WASM__ = true; }"),
    );
    expect(checker.getErrors().map((error) => error.message)).toEqual([
      "Cannot assign to constant '__TARGET_WASM__'",
    ]);
  });
});
