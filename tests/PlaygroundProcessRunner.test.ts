import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  runProcessFile,
  type RunProcessFileError,
} from "../playground/backend/processRunner";

async function expectRunProcessFileError(
  run: Promise<unknown>,
): Promise<RunProcessFileError> {
  try {
    await run;
  } catch (error) {
    return error as RunProcessFileError;
  }

  throw new Error("Expected runProcessFile to reject");
}

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

  test("attaches stdout, stderr, and exit code to nonzero exit errors", async () => {
    const error = await expectRunProcessFileError(
      runProcessFile(
        process.execPath,
        [
          "-e",
          [
            'process.stdout.write("partial stdout");',
            'process.stderr.write("partial stderr");',
            "process.exit(7);",
          ].join(""),
        ],
        { timeout: 5000 },
      ),
    );

    expect(error.message).toContain("code 7");
    expect(error.code).toBe(7);
    expect(error.signal).toBeNull();
    expect(error.stdout).toBe("partial stdout");
    expect(error.stderr).toBe("partial stderr");
  });

  test("marks timeout errors as killed and keeps captured output", async () => {
    const error = await expectRunProcessFileError(
      runProcessFile(
        process.execPath,
        [
          "-e",
          [
            'process.stdout.write("started");',
            'process.stderr.write("waiting");',
            "setTimeout(() => {}, 1000);",
          ].join(""),
        ],
        { timeout: 50 },
      ),
    );

    expect(error.message).toBe("Process timed out after 50ms");
    expect(error.killed).toBe(true);
    expect(error.stdout).toBe("started");
    expect(error.stderr).toBe("waiting");
  });

  test("rejects when combined output exceeds maxBuffer", async () => {
    const error = await expectRunProcessFileError(
      runProcessFile(
        process.execPath,
        ["-e", 'process.stdout.write("abcdef");'],
        { maxBuffer: 3, timeout: 5000 },
      ),
    );

    expect(error.message).toBe("Process output exceeded maxBuffer 3");
    expect(error.stdout).toBe("abcdef");
    expect(error.stderr).toBe("");
  });

  test("does not surface stdin pipe errors after a successful child exit", async () => {
    const result = await runProcessFile(
      process.execPath,
      [
        "-e",
        [
          "process.stdin.destroy();",
          'process.stdout.write("ok");',
          "process.exit(0);",
        ].join(""),
      ],
      { input: "x".repeat(1024 * 1024), timeout: 5000 },
    );

    expect(result.stdout).toBe("ok");
    expect(result.stderr).toBe("");
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
