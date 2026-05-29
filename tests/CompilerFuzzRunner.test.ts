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
  minimizeFuzzFailure,
  replayFuzzFailureArtifact,
  replayFuzzCrashArtifact,
  runBplDifferentialPipeline,
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

  test("generates differential runtime inputs that exercise checked failures", () => {
    const inputs = Array.from({ length: 40 }, (_, iteration) =>
      generateFuzzInput(0xd1ff0, iteration, { enableDifferential: true }),
    );
    const differentialSources = inputs
      .filter((input) => input.kind === "differential")
      .map((input) => input.source)
      .join("\n");

    expect(differentialSources).toContain("10 / zero");
    expect(differentialSources).toContain("node.value");
    expect(differentialSources).toContain("values[index]");
  });

  test(
    "treats equivalent checked runtime failures as stable differential behavior",
    () => {
      const outcome = runBplDifferentialPipeline(
        `
          frame main() ret int {
            local zero: int = 0;
            return 10 / zero;
          }
        `,
        "differential_division_by_zero.bpl",
      );

      expect(outcome).toMatchObject({
        ok: true,
        stage: "codegen",
      });
      expect(outcome.mismatch).toBeUndefined();
    },
    60000,
  );

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
          mismatches: 0,
        },
        {
          seed: 0x2222,
          totalIterations: 3,
          validPrograms: 2,
          expectedErrors: 0,
          crashes: 1,
          mismatches: 0,
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

  test("automatically minimizes failure artifacts and records replay metadata", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-auto-min-"));
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
        seeds: [0x4444],
        iterationsPerSeed: 1,
        crashDir,
        minimizeFailures: true,
        runner,
        inputForIteration: ({ seed, iteration }) => ({
          seed,
          iteration,
          kind: "tokens",
          filePath: `synthetic_${seed}_${iteration}.bpl`,
          source: "noise trigger removable crash tail",
        }),
      });

      const artifact = summary.failureArtifacts[0]!;
      const metadata = JSON.parse(readFileSync(artifact.metadataPath, "utf8"));

      expect(metadata).toMatchObject({
        seed: 0x4444,
        pass: 0,
        failureKind: "crash",
        failure: {
          kind: "crash",
          stage: "codegen",
          message: "synthetic crash",
        },
        minimization: {
          originalTokenCount: 5,
          minimizedTokenCount: 2,
          changed: true,
        },
      });
      expect(metadata.minimizedSourcePath).toBe(
        artifact.sourcePath.replace(/\.bpl$/, ".min.bpl"),
      );
      expect(metadata.replayCommand).toContain("bun run fuzz:replay --");
      expect(metadata.replayCommand).toContain("--metadata");
      expect(readFileSync(metadata.minimizedSourcePath, "utf8")).toBe(
        "trigger crash",
      );
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("records differential mismatch artifacts separately from crashes", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-mismatch-"));
    const runner = (source: string): PipelineOutcome => {
      if (source === "trigger mismatch") {
        return {
          ok: false,
          stage: "codegen",
          message: "O0/O3 behavior mismatch",
          mismatch: {
            o0: { exitCode: 0, stdout: "left\n", stderr: "" },
            o3: { exitCode: 0, stdout: "right\n", stderr: "" },
          },
        };
      }

      return { ok: true, stage: "codegen" };
    };

    try {
      const summary = runFuzzCampaign({
        seeds: [0x5151],
        iterationsPerSeed: 2,
        crashDir,
        runner,
        inputForIteration: ({ seed, iteration }) => ({
          seed,
          iteration,
          kind: "differential",
          filePath: `synthetic_${seed}_${iteration}.bpl`,
          source:
            iteration === 1
              ? "trigger mismatch"
              : "frame main() ret int { return 0; }",
        }),
      });

      expect(summary.validPrograms).toBe(1);
      expect(summary.expectedErrors).toBe(0);
      expect(summary.crashes).toBe(0);
      expect(summary.mismatches).toBe(1);
      expect(summary.seedSummaries[0]).toMatchObject({
        seed: 0x5151,
        totalIterations: 2,
        validPrograms: 1,
        expectedErrors: 0,
        crashes: 0,
        mismatches: 1,
      });

      const files = readdirSync(crashDir);
      const sourceFile = files.find((file) => file.endsWith(".bpl"));
      const metadataFile = files.find((file) => file.endsWith(".json"));

      expect(sourceFile).toStartWith("mismatch_");
      expect(metadataFile).toStartWith("mismatch_");

      const metadata = JSON.parse(
        readFileSync(join(crashDir, metadataFile!), "utf8"),
      );

      expect(metadata).toMatchObject({
        pass: 1,
        failureKind: "mismatch",
        failure: {
          kind: "mismatch",
          stage: "codegen",
          message: "O0/O3 behavior mismatch",
        },
        optimizationLevels: [0, 3],
        expected: { optimizationLevel: 0, stdout: "left\n", stderr: "" },
        actual: { optimizationLevel: 3, stdout: "right\n", stderr: "" },
        stage: "codegen",
        mismatch: {
          o0: { exitCode: 0, stdout: "left\n", stderr: "" },
          o3: { exitCode: 0, stdout: "right\n", stderr: "" },
        },
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

  test("replays and minimizes differential mismatch artifacts", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-mismatch-replay-"));
    const runner = (source: string): PipelineOutcome => {
      if (source.includes("left") && source.includes("right")) {
        return {
          ok: false,
          stage: "codegen",
          message: "O0/O3 behavior mismatch",
          mismatch: {
            o0: { exitCode: 0, stdout: "left\n", stderr: "" },
            o3: { exitCode: 0, stdout: "right\n", stderr: "" },
          },
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
        seeds: [0x6161],
        iterationsPerSeed: 1,
        crashDir,
        runner,
        inputForIteration: ({ seed, iteration }) => ({
          seed,
          iteration,
          kind: "differential",
          filePath: `synthetic_${seed}_${iteration}.bpl`,
          source: "noise left removable right tail",
        }),
      });

      const artifact = summary.failureArtifacts[0]!;
      const replay = replayFuzzFailureArtifact({
        metadataPath: artifact.metadataPath,
        runner,
      });

      expect(replay.failed).toBe(true);
      expect(replay.signatureMatches).toBe(true);
      expect(replay.outcome.mismatch?.o0.stdout).toBe("left\n");

      const minimized = minimizeFuzzFailure({
        source: readFileSync(artifact.sourcePath, "utf8"),
        filePath: artifact.sourcePath,
        expectedFailureKind: "mismatch",
        expectedStage: replay.outcome.stage,
        expectedMessageIncludes: "O0/O3 behavior mismatch",
        runner,
      });

      expect(minimized.minimizedSource).toBe("left right");
      expect(minimized.minimizedTokenCount).toBe(2);
      expect(minimized.changed).toBe(true);
      expect(minimized.outcome.mismatch?.o3.stdout).toBe("right\n");
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
    expect(result.stdout).toContain("--mode");
    expect(result.stdout).toContain(
      "parser,typecheck,codegen,runtime,differential,sanitizer",
    );
  });

  test("replay CLI can run explicit compiler modes from one artifact", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-replay-modes-"));
    const sourcePath = join(crashDir, "replay_modes.bpl");
    const metadataPath = join(crashDir, "replay_modes.json");

    try {
      writeFileSync(sourcePath, "frame main() ret int { return 0; }\n");
      writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            seed: 0x7777,
            iteration: 3,
            kind: "structured",
            filePath: "replay_modes.bpl",
            sourcePath,
          },
          null,
          2,
        ),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "fuzz:replay",
          "--",
          "--metadata",
          metadataPath,
          "--mode",
          "parser,typecheck,codegen",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Mode parser: ok at parser");
      expect(result.stdout).toContain("Mode typecheck: ok at typecheck");
      expect(result.stdout).toContain("Mode codegen: ok at codegen");
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
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
      expect(JSON.parse(readFileSync(metadataPath, "utf8"))).toMatchObject({
        promotedTo: promotedPath,
      });
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
      rmSync(corpusDir, { recursive: true, force: true });
    }
  });

  test("promotes minimized differential mismatch artifacts into a correctness corpus", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-diff-promote-"));
    const corpusDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-diff-corpus-"));
    const sourcePath = join(
      crashDir,
      "mismatch_seed-abcd_iter-7_differential.bpl",
    );
    const minPath = join(
      crashDir,
      "mismatch_seed-abcd_iter-7_differential.min.bpl",
    );
    const metadataPath = join(
      crashDir,
      "mismatch_seed-abcd_iter-7_differential.json",
    );

    try {
      writeFileSync(sourcePath, "frame main() ret int { return 1; }\n");
      writeFileSync(minPath, "frame main() ret int { return 0; }\n");
      writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            seed: 0xabcd,
            iteration: 7,
            kind: "differential",
            failureKind: "mismatch",
            sourcePath,
            stage: "codegen",
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
          "Bug 456: O3 Wrong Code",
          "--corpus-dir",
          corpusDir,
          "--differential",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      const promotedPath = join(corpusDir, "bug-456-o3-wrong-code.bpl");

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Outcome: differential");
      expect(readFileSync(promotedPath, "utf8")).toBe(
        "frame main() ret int { return 0; }\n",
      );
      expect(JSON.parse(readFileSync(metadataPath, "utf8"))).toMatchObject({
        promotedTo: promotedPath,
      });
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
