import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import path from "path";

import { compileAndRun, compileAndRunFull } from "./helpers";

function optimizedMainBody(source: string): string {
  const tempDir = mkdtempSync(path.join(tmpdir(), "bpl-v01-repro-"));
  const sourcePath = path.join(tempDir, "main.bpl");
  const irPath = path.join(tempDir, "main.ll");
  const optimizedIrPath = path.join(tempDir, "main.opt.ll");

  try {
    writeFileSync(sourcePath, source);

    const emit = spawnSync(
      "bun",
      [path.join(process.cwd(), "index.ts"), "--emit", "llvm", "-o", irPath, sourcePath],
      { encoding: "utf-8", timeout: 20000 },
    );
    expect(emit.status).toBe(0);
    expect(existsSync(irPath)).toBe(true);

    const optimize = spawnSync(
      "clang",
      ["-S", "-emit-llvm", "-O2", irPath, "-o", optimizedIrPath],
      { encoding: "utf-8", timeout: 20000 },
    );
    expect(optimize.status).toBe(0);

    const optimizedIr = readFileSync(optimizedIrPath, "utf-8");
    return optimizedIr.match(/define .* @main[\s\S]*?^}/m)?.[0] ?? "";
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("v0.1 Bug Regressions", () => {
  it("BUG-134: raw LLVM asm interpolates pointer parameters as pointer values", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      frame readShifted(value_ptr: *int) ret int {
        local out: int = 0;
        asm("llvm") {
          "%loaded = load i32, i32* (value_ptr)"
          "%shifted = shl i32 %loaded, 1"
          "store i32 %shifted, i32* (out)"
        }
        return out;
      }

      frame main() ret int {
        local value: int = 21;
        printf("%d\\n", readShifted(&value));
        return 0;
      }
    `);

    expect(output).toBe("42\n");
  });

  it("BUG-135: IO primitive print helpers do not append implicit newlines", () => {
    const output = compileAndRun(`
      import [IO] from "std/io.bpl";

      frame main() ret int {
        IO.print("A");
        IO.printInt(42);
        IO.print("B");
        IO.printFloat(1.5);
        IO.print("C");
        IO.printBool(true);
        IO.print("D");
        return 0;
      }
    `);

    expect(output).toBe("A42B1.500000CtrueD");
  });

  it("BUG-138: rejects invalid constant shift counts", () => {
    const negative = compileAndRunFull(`
      frame main() ret int {
        local value: int = 1 << -1;
        return value;
      }
    `);

    expect(negative.exitCode).not.toBe(0);
    expect((negative.stderr + negative.stdout).toLowerCase()).toContain(
      "negative shift",
    );

    const tooWide = compileAndRunFull(`
      frame main() ret int {
        local value: int = 1 << 32;
        return value;
      }
    `);

    expect(tooWide.exitCode).not.toBe(0);
    expect((tooWide.stderr + tooWide.stdout).toLowerCase()).toContain(
      "shift count",
    );
  });

  it("BUG-139: erases trivial wrapper stack-frame hooks after LLVM optimization", () => {
    const mainBody = optimizedMainBody(`
      frame square(x: int) ret int {
        return x * x;
      }

      frame main() ret int {
        return square(9);
      }
    `);

    const stackHookCalls =
      mainBody.match(/@__bpl_(enter|exit)_stack_frame/g)?.length ?? 0;

    expect(mainBody).toContain("ret i32 81");
    expect(stackHookCalls).toBeLessThanOrEqual(2);
  });
});
