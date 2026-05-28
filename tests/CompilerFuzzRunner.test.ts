import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  generateFuzzInput,
  runFuzzCampaign,
  type PipelineOutcome,
} from "../fuzz/compilerFuzz";

describe("Compiler fuzz runner", () => {
  test("generates deterministic mixed fuzz inputs for a seed", () => {
    const firstRun = Array.from({ length: 12 }, (_, iteration) =>
      generateFuzzInput(0x1234abcd, iteration),
    );
    const secondRun = Array.from({ length: 12 }, (_, iteration) =>
      generateFuzzInput(0x1234abcd, iteration),
    );

    expect(secondRun).toEqual(firstRun);
    expect(firstRun.map((input) => input.kind)).toContain("structured");
    expect(firstRun.map((input) => input.kind)).toContain("mutated");
    expect(firstRun.map((input) => input.kind)).toContain("tokens");
  });

  test("records crash repro source and metadata during a campaign", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-crashes-"));
    const runner = (source: string): PipelineOutcome => {
      if (source === "trigger internal crash") {
        return {
          ok: false,
          stage: "codegen",
          crash: new Error("synthetic crash"),
          message: "synthetic crash",
        };
      }

      return { ok: true, stage: "codegen" };
    };

    try {
      const summary = runFuzzCampaign({
        seeds: [0x1111, 0x2222],
        iterationsPerSeed: 3,
        crashDir,
        runner,
        inputForIteration: ({ seed, iteration }) => ({
          seed,
          iteration,
          kind: "tokens",
          filePath: `synthetic_${seed}_${iteration}.bpl`,
          source:
            seed === 0x2222 && iteration === 1
              ? "trigger internal crash"
              : `frame main() ret int { return ${iteration}; }`,
        }),
      });

      expect(summary.totalIterations).toBe(6);
      expect(summary.validPrograms).toBe(5);
      expect(summary.crashes).toBe(1);
      expect(summary.seedSummaries).toEqual([
        {
          seed: 0x1111,
          totalIterations: 3,
          validPrograms: 3,
          expectedErrors: 0,
          crashes: 0,
        },
        {
          seed: 0x2222,
          totalIterations: 3,
          validPrograms: 2,
          expectedErrors: 0,
          crashes: 1,
        },
      ]);

      const files = readdirSync(crashDir);
      const sourceFile = files.find((file) => file.endsWith(".bpl"));
      const metadataFile = files.find((file) => file.endsWith(".json"));

      expect(sourceFile).toBeDefined();
      expect(metadataFile).toBeDefined();

      const sourcePath = join(crashDir, sourceFile!);
      const metadataPath = join(crashDir, metadataFile!);
      const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));

      expect(existsSync(sourcePath)).toBe(true);
      expect(readFileSync(sourcePath, "utf8")).toBe("trigger internal crash");
      expect(metadata).toMatchObject({
        seed: 0x2222,
        iteration: 1,
        kind: "tokens",
        stage: "codegen",
        message: "synthetic crash",
      });
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });
});
