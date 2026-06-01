import { describe, expect, test } from "bun:test";
import {
  formatPlaygroundTimeoutDuration,
  runPlaygroundNativeBinary,
} from "../playground/backend/nativeExecution";

describe("Playground native execution response shaping", () => {
  test("formats timeout durations for milliseconds and singular or plural seconds", () => {
    expect(formatPlaygroundTimeoutDuration(25)).toBe("25ms");
    expect(formatPlaygroundTimeoutDuration(1000)).toBe("1 second");
    expect(formatPlaygroundTimeoutDuration(2000)).toBe("2 seconds");
    expect(formatPlaygroundTimeoutDuration(5000)).toBe("5 seconds");
  });

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
      timeoutMs: 250,
    });

    expect(result).toEqual({
      success: false,
      error: "Execution timeout (250ms)",
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
