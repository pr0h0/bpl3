import { describe, expect, test } from "bun:test";

import { getIntegrationJobs } from "./helpers/integrationRunner";

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
});
