import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Compiler } from "../compiler";
import { verifyLlvmFile } from "../compiler/common/LlvmVerifier";
import { spawnSync } from "node:child_process";

const source = `extern puts(text:string)ret int;
frame helper(x:int)ret int{local y:int=x+1;defer puts("cleanup");return y;}
frame main()ret int{return helper(41)-42;}`;

test("DWARF survives LLVM verification and native compilation with runtime calls and defer", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-dwarf-runtime-"));
  try {
    const filePath = join(dir, "main.bpl");
    writeFileSync(filePath, source);
    for (const optimizationLevel of [0, 3]) {
      const result = new Compiler({
        filePath,
        emitType: "llvm",
        resolveImports: true,
        dwarf: true,
        optimizationLevel,
      }).compile(source);
      expect(
        result.success,
        result.errors?.map((error) => error.message).join("\n"),
      ).toBe(true);
      const ir = join(dir, `main-${optimizationLevel}.ll`);
      writeFileSync(ir, result.output!);
      const verified = verifyLlvmFile(ir);
      expect(verified.exitCode, verified.stderr).toBe(0);
      expect(verified.stderr).not.toMatch(
        /invalid debug|inlinable call|ignoring invalid/i,
      );
      const output = join(dir, `native-${optimizationLevel}.bc`);
      const compiled = spawnSync(
        process.env.BPL_CC || "clang",
        ["-Wno-override-module", "-emit-llvm", "-c", ir, "-o", output],
        { encoding: "utf8", timeout: 30000 },
      );
      expect(compiled.status, compiled.stderr).toBe(0);
      expect(compiled.stderr).not.toMatch(
        /invalid debug|inlinable call|ignoring invalid/i,
      );
      const disassembled = spawnSync(
        process.env.BPL_CC || "clang",
        ["-S", "-emit-llvm", output, "-o", "-"],
        { encoding: "utf8", timeout: 30000 },
      );
      expect(disassembled.status, disassembled.stderr).toBe(0);
      expect(disassembled.stdout).toContain("!DICompileUnit");
      expect(disassembled.stdout).toContain("!DISubprogram");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
