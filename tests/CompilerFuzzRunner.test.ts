import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import {
  generateFuzzInput,
  minimizeFuzzCrash,
  replayFuzzCrashArtifact,
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

  test("replays crash artifacts and minimizes sources while preserving crash signature", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-replay-"));
    const runner = (source: string): PipelineOutcome => {
      if (source.includes("trigger") && source.includes("crash")) {
        return {
          ok: false,
          stage: "codegen",
          crash: new Error("synthetic crash"),
          message: "synthetic crash",
        };
      }

      return {
        ok: false,
        stage: "parser",
        expectedError: true,
        message: "synthetic parse rejection",
      };
    };

    try {
      const summary = runFuzzCampaign({
        seeds: [0x3333],
        iterationsPerSeed: 1,
        crashDir,
        runner,
        inputForIteration: ({ seed, iteration }) => ({
          seed,
          iteration,
          kind: "tokens",
          filePath: `synthetic_${seed}_${iteration}.bpl`,
          source: "noise trigger removable crash tail",
        }),
      });

      const artifact = summary.crashArtifacts[0]!;
      const replay = replayFuzzCrashArtifact({
        metadataPath: artifact.metadataPath,
        runner,
      });

      expect(replay.crashed).toBe(true);
      expect(replay.signatureMatches).toBe(true);
      expect(replay.outcome.stage).toBe("codegen");

      const minimized = minimizeFuzzCrash({
        source: readFileSync(artifact.sourcePath, "utf8"),
        filePath: artifact.sourcePath,
        expectedStage: replay.outcome.stage,
        expectedMessageIncludes: "synthetic crash",
        runner,
      });

      expect(minimized.minimizedSource).toBe("trigger crash");
      expect(minimized.minimizedTokenCount).toBe(2);
      expect(minimized.originalTokenCount).toBe(5);
      expect(minimized.changed).toBe(true);
      expect(minimized.outcome.stage).toBe("codegen");
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("exposes a fuzz crash replay CLI with minimization help", () => {
    const result = spawnSync("bun", ["run", "fuzz:replay", "--", "--help"], {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: bun fuzz/replay_crash.ts");
    expect(result.stdout).toContain("--metadata");
    expect(result.stdout).toContain("--minimize");
    expect(result.stdout).toContain("--out");
  });

  test("promotes minimized fuzz artifacts into the regression corpus", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-promote-"));
    const corpusDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-corpus-"));
    const sourcePath = join(crashDir, "crash_seed-abcd_iter-7_tokens.bpl");
    const minPath = join(crashDir, "crash_seed-abcd_iter-7_tokens.min.bpl");
    const metadataPath = join(crashDir, "crash_seed-abcd_iter-7_tokens.json");

    try {
      writeFileSync(sourcePath, "frame main() ret int { return 0; }\n");
      writeFileSync(
        minPath,
        'frame main() ret int {\n  return "not an int";\n}\n',
      );
      writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            seed: 0xabcd,
            iteration: 7,
            kind: "tokens",
            sourcePath,
            stage: "typecheck",
          },
          null,
          2,
        ),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "fuzz:promote",
          "--",
          "--metadata",
          metadataPath,
          "--name",
          "Bug 123: Return String",
          "--corpus-dir",
          corpusDir,
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const promotedPath = join(corpusDir, "bug-123-return-string.bpl");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(promotedPath);
      expect(readFileSync(promotedPath, "utf8")).toBe(
        'frame main() ret int {\n  return "not an int";\n}\n',
      );
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
      rmSync(corpusDir, { recursive: true, force: true });
    }
  });

  test("refuses to overwrite promoted fuzz regression names without force", () => {
    const corpusDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-corpus-"));
    const sourcePath = join(corpusDir, "source.bpl");
    const promotedPath = join(corpusDir, "duplicate-name.bpl");

    try {
      writeFileSync(sourcePath, "frame main() ret int { return 0; }\n");
      writeFileSync(promotedPath, "frame main() ret int { return 1; }\n");

      const result = spawnSync(
        "bun",
        [
          "run",
          "fuzz:promote",
          "--",
          "--source",
          sourcePath,
          "--name",
          "duplicate name",
          "--corpus-dir",
          corpusDir,
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("already exists");
      expect(readFileSync(promotedPath, "utf8")).toBe(
        "frame main() ret int { return 1; }\n",
      );
    } finally {
      rmSync(corpusDir, { recursive: true, force: true });
    }
  });

  test("replays downloaded crash artifacts when metadata source paths are stale", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-downloaded-"));
    const sourcePath = join(crashDir, "crash_seed-4444_iter-0_tokens.bpl");
    const metadataPath = join(crashDir, "crash_seed-4444_iter-0_tokens.json");
    const runner = (source: string): PipelineOutcome =>
      source === "trigger crash"
        ? {
            ok: false,
            stage: "codegen",
            crash: new Error("synthetic crash"),
            message: "synthetic crash",
          }
        : {
            ok: false,
            stage: "parser",
            expectedError: true,
            message: "synthetic parse rejection",
          };

    try {
      writeFileSync(sourcePath, "trigger crash");
      writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            seed: 0x4444,
            iteration: 0,
            kind: "tokens",
            filePath: "synthetic.bpl",
            stage: "codegen",
            sourcePath: "/stale/ci/workspace/crash_seed-4444_iter-0_tokens.bpl",
          },
          null,
          2,
        ),
      );

      const replay = replayFuzzCrashArtifact({ metadataPath, runner });

      expect(replay.sourcePath).toBe(sourcePath);
      expect(replay.crashed).toBe(true);
      expect(replay.signatureMatches).toBe(true);
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("keeps original source text when crash minimization cannot remove tokens", () => {
    const runner = (source: string): PipelineOutcome =>
      source.includes("trigger") && source.includes("crash")
        ? {
            ok: false,
            stage: "codegen",
            crash: new Error("synthetic crash"),
            message: "synthetic crash",
          }
        : {
            ok: false,
            stage: "parser",
            expectedError: true,
            message: "synthetic parse rejection",
          };

    const source = "trigger    crash";
    const minimized = minimizeFuzzCrash({
      source,
      expectedStage: "codegen",
      expectedMessageIncludes: "synthetic crash",
      runner,
    });

    expect(minimized.minimizedSource).toBe(source);
    expect(minimized.changed).toBe(false);
  });
});
