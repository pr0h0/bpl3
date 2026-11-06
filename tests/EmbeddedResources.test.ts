import { expect, test } from "bun:test";
import { resolve } from "path";

// A lone `bpl` executable compiles programs from the standard library bundled
// through this generated module, so it must list every current library file.
test("embedded standard library module is up to date", () => {
  const result = Bun.spawnSync(
    [process.execPath, "scripts/generate_embedded_resources.ts", "--check"],
    { cwd: resolve(import.meta.dir, "..") },
  );
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
});
