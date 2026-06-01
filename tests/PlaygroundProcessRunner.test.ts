import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runProcessFile } from "../playground/backend/processRunner";

describe("Playground process runner", () => {
  test("passes shell metacharacter args literally and preserves stdin", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-playground-process-"));
    const scriptPath = join(tempDir, "argv-stdin.js");
    const argv = [
      "space value",
      "semi;colon",
      "$(echo shell)",
      "`echo shell`",
      'quote"value',
    ];

    try {
      writeFileSync(
        scriptPath,
        [
          'process.stdin.setEncoding("utf8");',
          'let stdin = "";',
          'process.stdin.on("data", (chunk) => { stdin += chunk; });',
          'process.stdin.on("end", () => {',
          "  console.log(JSON.stringify({ argv: process.argv.slice(2), stdin }));",
          "});",
        ].join("\n"),
      );

      const result = await runProcessFile(process.execPath, [
        scriptPath,
        ...argv,
      ], {
        input: "stdin line\n",
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      });

      expect(JSON.parse(result.stdout)).toEqual({
        argv,
        stdin: "stdin line\n",
      });
      expect(result.stderr).toBe("");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("backend server runs compiled programs through argv-vector execution", () => {
    const serverSource = readFileSync(
      join(import.meta.dir, "../playground/backend/server.ts"),
      "utf8",
    );

    expect(serverSource).toContain("runProcessFile(binFile, args");
    expect(serverSource).not.toContain("const argsStr =");
    expect(serverSource).not.toContain("execAsync(cmd");
  });
});
