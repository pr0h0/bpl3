import { describe, expect, test } from "bun:test";

import {
  loadPlaygroundExamples,
  validatePlaygroundExampleContract,
} from "./helpers/playgroundExamples";

describe("playground example contract parser", () => {
  test("reports invalid example metadata with file context", () => {
    const errors = validatePlaygroundExampleContract(
      "playground/examples/bad.json",
      {
        order: 1.5,
        title: "",
        snippet: 7,
        description: false,
        code: ["ok", 42],
        input: 123,
        args: ["browser", 7],
        expectedOutput: ["ok", false],
        wasm: {
          mode: "web",
          reason: "",
          browserRuntime: "yes",
          canonicalMatrixFile: 123,
          expectedReturn: 0.5,
          expectedStdout: [],
          expectedStderr: null,
        },
      },
    );

    expect(errors).toEqual([
      "playground/examples/bad.json: order must be an integer",
      "playground/examples/bad.json: title must be a non-empty string",
      "playground/examples/bad.json: snippet must be a string",
      "playground/examples/bad.json: description must be a string",
      "playground/examples/bad.json: code[1] must be a string",
      "playground/examples/bad.json: input must be a string",
      "playground/examples/bad.json: args[1] must be a string",
      "playground/examples/bad.json: expectedOutput[1] must be a string",
      "playground/examples/bad.json: wasm.mode must be one of wasm-freestanding, wasm-hosted, blocked-by-host-api, native-only",
      "playground/examples/bad.json: wasm.reason must be a non-empty string",
      "playground/examples/bad.json: wasm.browserRuntime must be a boolean",
      "playground/examples/bad.json: wasm.canonicalMatrixFile must be a string",
      "playground/examples/bad.json: wasm.expectedReturn must be an integer",
      "playground/examples/bad.json: wasm.expectedStdout must be a string",
      "playground/examples/bad.json: wasm.expectedStderr must be a string",
    ]);
  });

  test("loads every playground example through the validated contract", () => {
    const examples = loadPlaygroundExamples();

    expect(examples.length).toBeGreaterThanOrEqual(70);
    expect(examples.map((example) => example.file)).toContain(
      "playground/examples/70-browser-wasm-showcase.json",
    );
  });
});
