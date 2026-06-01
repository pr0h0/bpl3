import { describe, expect, test } from "bun:test";

import {
  formatIntegrationExitCodeMismatch,
  formatIntegrationTimeout,
  getIntegrationJobs,
} from "./helpers/integrationRunner";

describe("integration runner helpers", () => {
  test("honors positive integer BPL_INTEGRATION_JOBS values", () => {
    const warnings: string[] = [];

    expect(
      getIntegrationJobs(
        { BPL_INTEGRATION_JOBS: "3" } as NodeJS.ProcessEnv,
        {
          warn: (message) => warnings.push(message),
        },
      ),
    ).toBe(3);
    expect(warnings).toEqual([]);
  });

  test("rejects malformed BPL_INTEGRATION_JOBS values with fallback guidance", () => {
    const fallbackJobs = getIntegrationJobs({} as NodeJS.ProcessEnv);

    for (const raw of ["0", "1.5", "not-a-number"]) {
      const warnings: string[] = [];

      expect(
        getIntegrationJobs(
          { BPL_INTEGRATION_JOBS: raw } as NodeJS.ProcessEnv,
          {
            warn: (message) => warnings.push(message),
          },
        ),
      ).toBe(fallbackJobs);
      expect(warnings).toEqual([
        `Ignoring invalid BPL_INTEGRATION_JOBS=${raw}; expected a positive integer; using ${fallbackJobs} integration job(s)`,
      ]);
    }
  });

  test("formats exit-code mismatches with process streams and command context", () => {
    const message = formatIntegrationExitCodeMismatch({
      example: "diagnostic_example",
      expectedStatus: 0,
      actualStatus: 7,
      signal: null,
      command: "bun",
      args: ["index.ts", "run", "examples/diagnostic_example/main.bpl"],
      stdout: "visible stdout\n",
      stderr: "visible stderr\n",
    });

    expect(message).toContain('Example "diagnostic_example" failed');
    expect(message).toContain("Expected exit status: 0");
    expect(message).toContain("Actual exit status: 7");
    expect(message).toContain(
      "Command: bun index.ts run examples/diagnostic_example/main.bpl",
    );
    expect(message).toContain("stdout:\nvisible stdout");
    expect(message).toContain("stderr:\nvisible stderr");
  });

  test("formats timeouts with process streams and command context", () => {
    const message = formatIntegrationTimeout({
      example: "slow_example",
      timeoutMs: 1250,
      command: "bun",
      args: ["index.ts", "run", "examples/slow_example/main.bpl"],
      stdout: "partial stdout\n",
      stderr: "",
    });

    expect(message).toContain('Example "slow_example" timed out after 1250ms');
    expect(message).toContain(
      "Command: bun index.ts run examples/slow_example/main.bpl",
    );
    expect(message).toContain("stdout:\npartial stdout");
    expect(message).toContain("stderr:\n(empty)");
  });
});
