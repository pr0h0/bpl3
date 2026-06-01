import { describe, expect, test } from "bun:test";

import {
  parseIntegrationExampleConfig,
  validateIntegrationExampleConfig,
} from "./helpers/integrationConfig";

describe("integration example config parser", () => {
  test("normalizes valid configs with explicit fields", () => {
    const config = parseIntegrationExampleConfig(
      "examples/demo/test_config.json",
      {
        expectedOutput: ["ok", "done"],
        exitCode: 2,
        args: ["--mode", "demo"],
        env: { BPL_DEMO: "1" },
        input: "stdin\n",
        timeout: 1234,
        skip_compilation: true,
      },
    );

    expect(config).toEqual({
      expectedOutput: ["ok", "done"],
      exitCode: 2,
      args: ["--mode", "demo"],
      env: { BPL_DEMO: "1" },
      input: "stdin\n",
      timeout: 1234,
      skipCompilation: true,
    });
  });

  test("normalizes optional fields to integration harness defaults", () => {
    const config = parseIntegrationExampleConfig(
      "examples/minimal/test_config.json",
      {},
    );

    expect(config).toEqual({
      expectedOutput: undefined,
      exitCode: 0,
      args: [],
      env: {},
      input: "",
      timeout: undefined,
      skipCompilation: false,
    });
  });

  test("reports unsupported and invalid fields with file context", () => {
    const errors = validateIntegrationExampleConfig(
      "examples/bad/test_config.json",
      {
        expected_output: ["legacy"],
        expectedOutput: ["ok", 42],
        exitCode: 1.5,
        args: ["--ok", 7],
        env: { GOOD: "yes", BAD: false },
        input: 123,
        timeout: 0,
        skip_compilation: "no",
      },
    );

    expect(errors).toEqual([
      "examples/bad/test_config.json: unsupported key expected_output",
      "examples/bad/test_config.json: expectedOutput[1] must be a string",
      "examples/bad/test_config.json: exitCode must be an integer",
      "examples/bad/test_config.json: args[1] must be a string",
      "examples/bad/test_config.json: env.BAD must be a string",
      "examples/bad/test_config.json: input must be a string",
      "examples/bad/test_config.json: timeout must be a positive integer",
      "examples/bad/test_config.json: skip_compilation must be a boolean",
    ]);
  });
});
