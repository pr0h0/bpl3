import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
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

    // Discovery failures are not empty inputs.
    mkdirSync(join(root, "negated"));
    writeFileSync(join(root, "negated", ".bplignore"), "!keep.bpl\n");
    const negated = JSON.parse(run([join(root, "negated")]).stdout.toString());
    expect(negated.errorCode).toBe("BPL_CHECK_PROCESSING_ERROR");

    // A missing input is not deduplicated into an existing one.
    const main = join(root, "src", "main.bpl");
    const missing = run([`${root}/missing/../src/main.bpl`, main]);
    expect(missing.exitCode).toBe(1);
    const missingReport = JSON.parse(missing.stdout.toString());
    expect(missingReport.totalFiles).toBe(2);
    expect(missingReport.files[0].errorCode).toBe("BPL_CHECK_INPUT_NOT_FOUND");

    // `link/../main.bpl` is another file than `src/main.bpl` when `link`
    // points elsewhere; both are checked.
    mkdirSync(join(root, "other", "deep"), { recursive: true });
    writeFileSync(
      join(root, "other", "main.bpl"),
      "frame main() ret int { return x; }\n",
    );
    symlinkSync(join(root, "other", "deep"), join(root, "src", "link"));
    const linked = run([main, `${root}/src/link/../main.bpl`]);
    const linkedReport = JSON.parse(linked.stdout.toString());
    expect(linkedReport.totalFiles).toBe(2);
    expect(linkedReport.errorCount).toBe(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("check reads `-` from standard input", () => {
  const run = (args: string[], input: string) =>
    Bun.spawnSync([process.execPath, resolve("index.ts"), "check", ...args], {
      env: { ...process.env, NO_COLOR: "1" },
      stdin: new TextEncoder().encode(input),
    });
  const ok = run(
    ["--stdin-filepath", "app.bpl", "-"],
    "frame main() ret int { return 0; }\n",
  );
  expect(ok.exitCode).toBe(0);
  expect(ok.stdout.toString()).toContain("✓ app.bpl");
  const bad = run(["-"], "frame main() ret int { return missing; }\n");
  expect(bad.exitCode).toBe(1);
  expect(bad.stderr.toString()).toContain(
    "error[BPL_SYMBOL_NOT_FOUND][stdin.bpl:1:31]",
  );

  // Snippets come from standard input, not from the file that
  // --stdin-filepath names.
  const dir = mkdtempSync(join(tmpdir(), "bpl-check-stdin-"));
  try {
    const named = join(dir, "named.bpl");
    writeFileSync(named, "frame main() ret int { return 0; }\n");
    const source = "frame main() ret int {\n    return missing;\n}\n";
    const human = run(["--stdin-filepath", named, "-"], source);
    expect(human.stderr.toString()).toContain("2 |     return missing;");
    const json = JSON.parse(
      run(["--json", "--stdin-filepath", named, "-"], source).stdout.toString(),
    );
    expect(json.files[0].diagnostics[0].source.preview).toBe(
      "    return missing;",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
