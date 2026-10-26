import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

test("JSON artifact builds preserve raw output and report failures on stderr", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-json-artifacts-"));
  const file = join(directory, "main.bpl");
  const source = "frame main() ret int { return 0; }";
  const config = join(directory, ".bplfmt.json");
  const run = (prefix: string[], input: string, emit: string) =>
    Bun.spawnSync(
      [
        process.execPath,
        resolve("index.ts"),
        ...prefix,
        input,
        "--emit",
        emit,
        "--json",
        "--quiet",
      ],
      { env: { ...process.env, NO_COLOR: "1" }, timeout: 15000 },
    );
  try {
    for (const prefix of [["build"], ["build", "-O", "1"], []]) {
      for (const emit of ["ast", "tokens", "formatted"]) {
        const missing = run(prefix, file, emit);
        expect(missing.exitCode).toBe(1);
        expect(missing.stdout.toString()).toBe("");
        expect(missing.stderr.toString()).toContain("File not found");
        expect(missing.stderr.toString()).toContain(file);
      }
    }
    writeFileSync(file, source);
    for (const prefix of [["build"], ["build", "-O", "1"], []]) {
      for (const emit of ["ast", "tokens", "formatted"]) {
        const success = run(prefix, file, emit);
        expect(success.exitCode).toBe(0);
        expect(success.stderr.toString()).toBe("");
        const output = success.stdout.toString();
        if (emit === "tokens")
          expect(Array.isArray(JSON.parse(output))).toBe(true);
        else if (emit === "ast")
          expect(JSON.parse(output).kind).toBe("Program");
        else expect(output).toContain("frame main() ret int");
      }
      writeFileSync(config, "{");
      const invalidConfig = run(prefix, file, "formatted");
      expect(invalidConfig.exitCode).toBe(1);
      expect(invalidConfig.stdout.toString()).toBe("");
      expect(invalidConfig.stderr.toString()).toContain(
        "Invalid formatter configuration",
      );
      expect(invalidConfig.stderr.toString()).toContain(config);
      expect(readFileSync(file, "utf8")).toBe(source);
      rmSync(config);
    }
    writeFileSync(file, "frame main( {");
    for (const prefix of [["build"], ["build", "-O", "1"], []]) {
      const invalidSyntax = run(prefix, file, "ast");
      expect(invalidSyntax.exitCode).toBe(1);
      expect(invalidSyntax.stdout.toString()).toBe("");
      expect(invalidSyntax.stderr.toString()).not.toBe("");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 60000);
