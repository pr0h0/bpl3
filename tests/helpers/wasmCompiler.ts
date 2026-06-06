import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { getCompilerDriver } from "../../compiler/common/CompilerDriver";

const WASM_TARGET = "wasm32-unknown-unknown";

export function hasWasmCompilerTarget(): boolean {
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-compiler-probe-"));
  const irPath = join(dir, "probe.ll");
  const objectPath = join(dir, "probe.o");

  try {
    writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
    const result = spawnSync(
      getCompilerDriver(WASM_TARGET),
      ["-target", WASM_TARGET, "-c", irPath, "-o", objectPath],
      { stdio: "ignore" },
    );
    return result.status === 0 && existsSync(objectPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
