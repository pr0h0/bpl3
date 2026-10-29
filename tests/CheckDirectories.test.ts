import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

// BUG-443: `bpl check` rejected directories that `format` and `lint` expand.
test("check expands directories and honors .bplignore", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-check-dirs-"));
  try {
    mkdirSync(join(root, "src", "nested"), { recursive: true });
    mkdirSync(join(root, "src", "skipped"));
    writeFileSync(
      join(root, "src", "main.bpl"),
      "frame main() ret int { return 0; }\n",
    );
    writeFileSync(
      join(root, "src", "nested", "util.bpl"),
      "frame util() ret int { return missing; }\n",
    );
    writeFileSync(join(root, "src", "skipped", "bad.bpl"), "frame (\n");
    writeFileSync(join(root, "src", ".bplignore"), "skipped/\n");
    mkdirSync(join(root, "empty"));
    const run = (args: string[]) =>
      Bun.spawnSync(
        [process.execPath, resolve("index.ts"), "check", "--json", ...args],
        {
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

    const report = JSON.parse(run([join(root, "src")]).stdout.toString());
    expect(report.totalFiles).toBe(2);
    expect(report.errorCount).toBe(1);
    expect(
      report.files.map((f: { file: string }) => f.file.split("/").pop()).sort(),
    ).toEqual(["main.bpl", "util.bpl"]);

    const empty = JSON.parse(run([join(root, "empty")]).stdout.toString());
    expect(empty.errorCode).toBe("BPL_CHECK_NO_INPUTS");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
