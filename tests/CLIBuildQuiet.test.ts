import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

test("quiet frontend/full builds preserve requested output and report generic failures", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-quiet-build-"));
  const source = "frame main() ret int { return 0; }";
  const file = join(directory, "main.bpl");
  const config = join(directory, ".bplfmt.json");
  writeFileSync(file, source);
  const run = (args: string[]) =>
    Bun.spawnSync([process.execPath, resolve("index.ts"), ...args], {
      env: { ...process.env, NO_COLOR: "1" },
      timeout: 15000,
    });
  const routes = [
    ["build", file, "--quiet", "--emit", "formatted"],
    ["--quiet", "build", file, "--emit", "formatted"],
    ["build", file, "--emit", "formatted", "-O", "1", "--quiet"],
    ["--quiet", "build", file, "--emit", "formatted", "-O", "1"],
    [file, "--emit", "formatted", "--quiet"],
    ["--quiet", file, "--emit", "formatted"],
  ];
  try {
    for (const args of routes) {
      const success = run(args);
      expect(success.exitCode).toBe(0);
      expect(success.stderr.toString()).toBe("");
      expect(success.stdout.toString()).toContain("frame main() ret int");
    }
    writeFileSync(config, "{");
    for (const args of routes) {
      const result = run(args);
      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toContain(
        "Invalid formatter configuration",
      );
      expect(result.stderr.toString()).toContain(config);
    }
    expect(readFileSync(file, "utf8")).toBe(source);
    rmSync(config);
    writeFileSync(file, "frame main() ret int { return unknownValue; }");
    const compilerError = run(["build", file, "--quiet", "--emit", "llvm"]);
    expect(compilerError.exitCode).toBe(1);
    expect(compilerError.stderr.toString()).toContain(
      "Undefined symbol 'unknownValue'",
    );
    const json = run(["build", file, "--quiet", "--json", "--emit", "llvm"]);
    expect(json.exitCode).toBe(1);
    expect(json.stderr.toString()).toBe("");
    expect(JSON.parse(json.stdout.toString())).toMatchObject({
      check: "build",
      success: false,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
