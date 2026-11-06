import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { unifiedDiff } from "../cli/FormatDiff";

test("writes a unified diff with context, and nothing for equal text", () => {
  expect(unifiedDiff("a.bpl", "x\n", "x\n")).toBe("");
  expect(
    unifiedDiff(
      "a.bpl",
      "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n",
      "1\n2\n3\n4\nfive\n6\n7\n8\n9\n10\n",
    ),
  ).toBe(
    "--- a.bpl\n+++ a.bpl (formatted)\n@@ -2,7 +2,7 @@\n 2\n 3\n 4\n-5\n+five\n 6\n 7\n 8\n",
  );
  expect(unifiedDiff("a.bpl", "", "x\n")).toBe(
    "--- a.bpl\n+++ a.bpl (formatted)\n@@ -0,0 +1,1 @@\n+x\n",
  );
});

test("marks a missing final newline on either side", () => {
  expect(unifiedDiff("a.bpl", "a\nb", "a\nb\n")).toBe(
    "--- a.bpl\n+++ a.bpl (formatted)\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n",
  );
});

test("every diff applies with patch to give the formatted text", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-format-diff-"));
  try {
    let seed = 11;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let t = 0; t < 200; t++) {
      const lines = Array.from({ length: rand(40) }, () => `L${rand(6)}`);
      const edited = lines.flatMap((line) => {
        const r = rand(10);
        return r === 0
          ? []
          : r === 1
            ? [line, `N${rand(4)}`]
            : r === 2
              ? [`X${rand(3)}`]
              : [line];
      });
      const before =
        lines.join("\n") + (rand(4) === 0 || !lines.length ? "" : "\n");
      const after =
        edited.join("\n") + (rand(4) === 0 || !edited.length ? "" : "\n");
      if (before === after) continue;
      const file = join(directory, "f.txt");
      writeFileSync(file, before);
      writeFileSync(
        join(directory, "p.diff"),
        unifiedDiff("f.txt", before, after),
      );
      const result = spawnSync("patch", [
        "-s",
        "-u",
        file,
        join(directory, "p.diff"),
      ]);
      expect(result.status).toBe(0);
      expect(readFileSync(file, "utf8")).toBe(after);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 60000);

test("bpl format --diff prints the diff and fails without writing", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-format-diff-cli-"));
  try {
    const file = join(directory, "main.bpl");
    const source =
      "frame main() ret int {\n  local x: int=1;\n    return x;\n}\n";
    writeFileSync(file, source);
    const result = Bun.spawnSync(
      [process.execPath, resolve("index.ts"), "format", "--diff", file],
      { cwd: process.cwd(), env: { ...process.env, NO_COLOR: "1" } },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain(
      "@@ -1,4 +1,4 @@\n frame main() ret int {\n-  local x: int=1;\n+    local x: int = 1;\n",
    );
    expect(readFileSync(file, "utf8")).toBe(source);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 60000);
