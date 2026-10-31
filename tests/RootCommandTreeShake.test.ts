import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SOURCE = `import [Array] from "std";
import printf from "std/c.bpl";

frame main() ret int {
    local values: Array<int> = Array<int>.new(4);
    values.push(7);
    printf("%d\\n", values.len());
    values.destroy();
    return 0;
}
`;

function defines(ir: string): number {
  return ir.match(/^define /gm)?.length ?? 0;
}

// `bpl file.bpl` defaults --emit to llvm; that default used to disable
// tree shaking, so importing `std` compiled the whole library.
test("the root command tree-shakes unless --emit llvm is explicit", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-root-shake-"));
  try {
    const source = join(dir, "main.bpl");
    writeFileSync(source, SOURCE);
    const build = (output: string, ...flags: string[]) => {
      const result = spawnSync(
        "bun",
        [resolve("index.ts"), source, "-o", join(dir, output), ...flags],
        { encoding: "utf8", timeout: 120000 },
      );
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const run = spawnSync(join(dir, output), { encoding: "utf8" });
      expect(run.stdout).toBe("1\n");
      return defines(readFileSync(join(dir, `${output}.ll`), "utf8"));
    };

    const pruned = build("plain");
    const full = build("explicit", "--emit", "llvm");
    expect(pruned).toBeLessThan(200);
    expect(full).toBeGreaterThan(pruned * 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 180000);
