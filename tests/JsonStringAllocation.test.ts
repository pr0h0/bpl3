import { expect, test } from "bun:test";
import { dirname } from "path";
import { rmSync } from "fs";
import { compileOnly } from "./helpers/compileAndRun";

// BUG-458: each parsed string reserved the whole remaining input, so many
// short strings exhausted memory (and the null malloc result was written to).
test("many short JSON strings parse under a memory limit", () => {
  const build = compileOnly(`import printf from "std/c.bpl";
import [JSON] from "std/json.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
frame main() ret int {
    local sb: String = String.new("[");
    local i: int = 0;
    loop (i < 20000) {
        if (i > 0) { sb << ","; }
        sb << "\\"a\\"";
        i = i + 1;
    }
    sb << "]";
    local items: *Array<string> = JSON.parse<Array<string>>(sb.cstr());
    printf("%d %s\\n", items.len(), items.get(19999));
    return 0;
}
`);
  expect(build.stderr).toBe("");
  expect(build.binaryPath).toBeDefined();
  try {
    // About 800 MB before the fix; well under 200 MB after it.
    // `ulimit -v` is enforced on Linux; elsewhere only the result is checked.
    const run =
      process.platform === "linux"
        ? Bun.spawnSync([
            "bash",
            "-c",
            `ulimit -v 400000 && "$0"`,
            build.binaryPath!,
          ])
        : Bun.spawnSync([build.binaryPath!]);
    expect(run.stdout.toString()).toBe("20000 a\n");
    expect(run.exitCode).toBe(0);
  } finally {
    rmSync(dirname(build.binaryPath!), { recursive: true, force: true });
  }
});
