import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { compileAndRun } from "./helpers/compileAndRun";

// BUG-426: `p += n` passed the checker but emitted `add i32* ...`.
function check(source: string) {
  const dir = mkdtempSync(join(tmpdir(), "bpl-pointer-compound-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(file, source);
    const result = Bun.spawnSync(
      [process.execPath, resolve("index.ts"), "check", file],
      { env: { ...process.env, NO_COLOR: "1" } },
    );
    return { status: result.exitCode, stderr: result.stderr.toString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("pointer compound assignment", () => {
  test("+= and -= step by elements for any integer offset width", () => {
    const output = compileAndRun(`import printf from "std/c.bpl";
frame main() ret int {
    local arr: long[4] = [1, 2, 3, 4];
    local p: *long = &arr[0];
    p += 3;
    printf("%ld ", *p);
    local k: u8 = 2;
    p -= k;
    printf("%ld ", *p);
    local ps: *long[2] = [&arr[0], &arr[1]];
    local i: int = 0;
    ps[i] += 3;
    printf("%ld\\n", *ps[0]);
    return 0;
}
`);
    expect(output).toBe("4 2 4\n");
  });

  test("rejects other operators, non-integer offsets and void pointers", () => {
    const result = check(`frame main() ret int {
    local x: int = 1;
    local q: *int = &x;
    q *= 2;
    q += 1.5;
    local v: *void = cast<*void>(&x);
    v += 1;
    return 0;
}
`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Operator '*=' is not supported on pointers",
    );
    expect(result.stderr).toContain(
      "Pointer offset must be an integer, got float",
    );
    expect(result.stderr).toContain(
      "Cannot perform pointer arithmetic on void pointer",
    );
  });
});
