import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { Parser } from "../compiler/frontend/Parser";
import { LINT_RULE_CODES, Linter } from "../compiler/linter/Linter";

const SOURCE = `import printf from "std/c.bpl";

frame Helper() {}

frame main() ret int {
    local x: int = 1;
    if (x > 0) {
    }
    Helper();
    return 0;
}
`;

function lintCodes(disabled: string[] = []): string[] {
  return new Linter([], new Set(disabled))
    .lint(new Parser(SOURCE, "lint.bpl").parse(), SOURCE)
    .map((diagnostic) => diagnostic.code ?? "")
    .sort();
}

function runLint(args: string[]) {
  const directory = mkdtempSync(join(tmpdir(), "bpl-lint-disable-"));
  try {
    const file = join(directory, "main.bpl");
    writeFileSync(file, SOURCE);
    return Bun.spawnSync(
      [process.execPath, resolve("index.ts"), "lint", ...args, file],
      {
        cwd: process.cwd(),
        env: { ...process.env, NO_COLOR: "1" },
        timeout: 15000,
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("disabled codes are left out of the linter's results", () => {
  expect(lintCodes()).toEqual(["L001", "L002", "L008"]);
  expect(lintCodes(["L002", "L008"])).toEqual(["L001"]);
  expect(LINT_RULE_CODES).toContain("L008");
});

test("bpl lint --disable skips rules, case-insensitively and repeatably", () => {
  const all = runLint(["--json"]);
  expect(all.exitCode).toBe(1);
  const codes = (report: string) =>
    JSON.parse(report)
      .files[0].diagnostics.map((d: { code: string }) => d.code)
      .sort();
  expect(codes(all.stdout.toString())).toEqual(["L001", "L002", "L008"]);

  const some = runLint(["--json", "--disable", "l002, L008"]);
  expect(codes(some.stdout.toString())).toEqual(["L001"]);

  const none = runLint([
    "--json",
    "--disable",
    "L001,L002",
    "--disable",
    "L008",
  ]);
  expect(none.exitCode).toBe(0);
  expect(codes(none.stdout.toString())).toEqual([]);
}, 60000);

test("bpl lint --disable rejects unknown rule codes", () => {
  const result = runLint(["--json", "--disable", "L008,L099"]);
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stdout.toString())).toMatchObject({
    check: "lint",
    success: false,
    errorCode: "BPL_LINT_UNKNOWN_RULE",
  });
  expect(JSON.parse(result.stdout.toString()).error).toContain("L099");
}, 60000);
