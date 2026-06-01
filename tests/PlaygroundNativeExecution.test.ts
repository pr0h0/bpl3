import { describe, expect, test } from "bun:test";
import { runPlaygroundNativeBinary } from "../playground/backend/nativeExecution";

describe("Playground native execution response shaping", () => {
  test("combines stdout and stderr for successful runs", async () => {
    const result = await runPlaygroundNativeBinary(process.execPath, {
      args: [
        "-e",
        [
          'process.stdout.write("ok");',
          'process.stderr.write("warn");',
        ].join(""),
      ],
    });

    expect(result).toEqual({
      success: true,
      output: "ok\nSTDERR:\nwarn",
    });
  });

  test("preserves stdout and stderr for nonzero runtime failures", async () => {
    const result = await runPlaygroundNativeBinary(process.execPath, {
      args: [
        "-e",
        [
          'process.stdout.write("partial output");',
          'process.stderr.write("runtime stderr");',
          "process.exit(9);",
        ].join(""),
      ],
    });

    expect(result).toEqual({
      success: false,
      error: "Runtime error: runtime stderr",
      output: "partial output",
    });
  });

  test("formats timeout failures using the configured timeout", async () => {
    const result = await runPlaygroundNativeBinary(process.execPath, {
      args: [
        "-e",
        [
          'process.stdout.write("started");',
          "setTimeout(() => {}, 1000);",
        ].join(""),
      ],
      timeoutMs: 25,
    });

    expect(result).toEqual({
      success: false,
      error: "Execution timeout (25ms)",
      output: "started",
    });
  });

  test("returns output-limit failures as runtime errors with captured output", async () => {
    const result = await runPlaygroundNativeBinary(process.execPath, {
      args: ["-e", 'process.stdout.write("abcdef");'],
      maxBuffer: 3,
    });

    expect(result).toEqual({
      success: false,
      error: "Runtime error: Process output exceeded maxBuffer 3",
      output: "abcdef",
    });
  });
});
