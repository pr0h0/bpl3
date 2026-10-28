import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { compileAndRun } from "./helpers/compileAndRun";

// BUG-434: the unreachable-code warning failed `check` and blocked builds, and
// checker warnings (including shadowing) were never shown.
const SOURCE = `import printf from "std/c.bpl";
frame value() ret int {
    return 3;
    printf("never\\n");
}
frame main() ret int {
    local x: int = value();
    if (x > 0) {
        local x: int = 2;
        printf("%d\\n", x);
    }
    return 0;
}
`;

test("check reports warnings without failing", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-check-warnings-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(file, SOURCE);
    const run = (args: string[]) =>
      Bun.spawnSync([process.execPath, resolve("index.ts"), ...args], {
        env: { ...process.env, NO_COLOR: "1" },
      });

    const human = run(["check", file]);
    expect(human.exitCode).toBe(0);
    const stderr = human.stderr.toString();
    expect(stderr).toContain(
      "warning[main.bpl:4:5]: Unreachable code detected.",
    );
    expect(stderr).toContain("Variable 'x' shadows variable");
    expect(stderr).toContain("2 warnings");

    const json = JSON.parse(run(["check", "--json", file]).stdout.toString());
    expect(json.success).toBe(true);
    expect(json.errorCount).toBe(0);
    expect(json.warningCount).toBe(2);
    expect(
      json.files[0].diagnostics.map((d: { severity: string }) => d.severity),
    ).toEqual(["warning", "warning"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("programs with unreachable code still build and run", () => {
  expect(compileAndRun(SOURCE)).toBe("2\n");
});
