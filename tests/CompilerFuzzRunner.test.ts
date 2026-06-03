import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
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
  runBplLlvmVerifierPipeline,
  runFuzzCampaign,
  type FuzzCampaignOptions,
  type PipelineOutcome,
} from "../fuzz/compilerFuzz";
import { runFuzzReplayCli } from "../fuzz/replay_crash";

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
    const inputs = Array.from({ length: 48 }, (_, iteration) =>
      generateFuzzInput(0xd1ff0, iteration, { enableDifferential: true }),
    );
    const differentialSources = inputs
      .filter((input) => input.kind === "differential")
      .map((input) => input.source)
      .join("\n");

    expect(differentialSources).toContain("10 / zero");
    expect(differentialSources).toContain("min / negativeOne");
    expect(differentialSources).toContain("node.value");
    expect(differentialSources).toContain("values[index]");
    expect(differentialSources).toContain("type Row = int[3]");
    expect(differentialSources).toContain("*(rows + row)");
    expect(differentialSources).toContain("diff pointer-array");
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

  test(
    "verifies generated LLVM IR for differential fuzz inputs",
    () => {
      const outcome = runBplLlvmVerifierPipeline(
        `
          extern printf(fmt: string, ...);

          frame main() ret int {
            local value: int = 40 + 2;
            printf("value=%d\\n", value);
            return 0;
          }
        `,
        "differential_verifier.bpl",
      );

      expect(outcome).toMatchObject({
        ok: true,
        stage: "codegen",
      });
      expect(outcome.message).toBeUndefined();
    },
    60000,
  );

  test("rejects invalid fuzz campaign options before running inputs", () => {
    const baseOptions: FuzzCampaignOptions = {
      seeds: [0x1234],
      iterationsPerSeed: 1,
      progressInterval: 1,
      maxMinimizePasses: 1,
      runner: () => ({ ok: true, stage: "codegen" }),
      inputForIteration: ({ seed, iteration }) => ({
        seed,
        iteration,
        kind: "tokens",
        filePath: `synthetic_${seed}_${iteration}.bpl`,
        source: "frame main() ret int { return 0; }",
      }),
    };
    const cases: Array<{
      options: Partial<FuzzCampaignOptions>;
      expectedError: string;
    }> = [
      {
        options: { seeds: [] },
        expectedError: "seeds must contain at least one seed",
      },
      {
        options: { seeds: [-1] },
        expectedError: "seeds must be unsigned 32-bit integers",
      },
      {
        options: { seeds: [0x100000000] },
        expectedError: "seeds must be unsigned 32-bit integers",
      },
      {
        options: { iterationsPerSeed: 0 },
        expectedError: "iterationsPerSeed must be a positive integer",
      },
      {
        options: { progressInterval: 0 },
        expectedError: "progressInterval must be a positive integer",
      },
      {
        options: { maxMinimizePasses: 0 },
        expectedError: "maxMinimizePasses must be a positive integer",
      },
    ];

    for (const { options, expectedError } of cases) {
      let runnerCalls = 0;
      let inputCalls = 0;

      expect(() =>
        runFuzzCampaign({
          ...baseOptions,
          ...options,
          runner: () => {
            runnerCalls++;
            return { ok: true, stage: "codegen" };
          },
          inputForIteration: ({ seed, iteration }) => {
            inputCalls++;
            return {
              seed,
              iteration,
              kind: "tokens",
              filePath: `synthetic_${seed}_${iteration}.bpl`,
              source: "frame main() ret int { return 0; }",
            };
          },
        }),
      ).toThrow(expectedError);
      expect(inputCalls).toBe(0);
      expect(runnerCalls).toBe(0);
    }
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

  test("refuses to record crash artifacts through symlinked crash directory ancestors", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-fuzz-crashdir-link-"));

    try {
      const realRoot = join(tempRoot, "real-root");
      const linkedRoot = join(tempRoot, "linked-root");
      const realCrashDir = join(realRoot, "crashes");
      const crashDir = join(linkedRoot, "crashes");
      mkdirSync(realCrashDir, { recursive: true });
      symlinkSync(realRoot, linkedRoot, "dir");

      expect(() =>
        runFuzzCampaign({
          seeds: [0x7171],
          iterationsPerSeed: 1,
          crashDir,
          runner: () => ({
            ok: false,
            stage: "codegen",
            crash: new Error("synthetic crash"),
            message: "synthetic crash",
          }),
          inputForIteration: ({ seed, iteration }) => ({
            seed,
            iteration,
            kind: "tokens",
            filePath: `synthetic_${seed}_${iteration}.bpl`,
            source: "trigger internal crash",
          }),
        }),
      ).toThrow(/Fuzz crash artifact directory parent contains a symbolic link/);
      expect(readdirSync(realCrashDir)).toEqual([]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
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

  test("replay CLI rejects malformed usage before artifact replay", () => {
    const cases: Array<[string[], string]> = [
      [["--unknown", "value"], "Unknown option --unknown"],
      [["--metadata", "--mode", "parser"], "--metadata requires a value"],
      [["--metadata="], "--metadata requires a non-empty value"],
      [["--stage", "middle"], "--stage must be one of"],
      [["--failure-kind", "oops"], "--failure-kind must be one of"],
      [["--mode", "parser,oops"], "--mode must include"],
      [["--mode", "parser,,codegen"], "--mode must not contain empty entries"],
      [["--mode", "all,parser"], "--mode all must be used alone"],
      [["--=value"], "Missing option name"],
      [["one.bpl", "two.bpl"], "Unexpected argument: two.bpl"],
    ];

    for (const [args, expectedError] of cases) {
      const result = spawnSync("bun", ["run", "fuzz:replay", "--", ...args], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("Either sourcePath or metadataPath");
      expect(result.stderr).not.toContain("No source artifact found");
    }
  });

  test("replay CLI refuses minimized output paths through symlinked ancestors", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-fuzz-replay-out-link-"));
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
      const sourcePath = join(tempRoot, "crash.bpl");
      const metadataPath = join(tempRoot, "crash.json");
      const realRoot = join(tempRoot, "real-root");
      const linkedRoot = join(tempRoot, "linked-root");
      const realOutDir = join(realRoot, "out");
      const outPath = join(linkedRoot, "out", "crash.min.bpl");

      writeFileSync(sourcePath, "noise trigger removable crash tail");
      writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            seed: 0x7777,
            iteration: 4,
            kind: "tokens",
            sourcePath,
            stage: "codegen",
            failureKind: "crash",
          },
          null,
          2,
        ),
      );
      mkdirSync(realOutDir, { recursive: true });
      symlinkSync(realRoot, linkedRoot, "dir");

      const replayWithOutput = (minimizedOutPath: string) => () =>
        runFuzzReplayCli(
          [
            "--metadata",
            metadataPath,
            "--minimize",
            "--out",
            minimizedOutPath,
          ],
          {
            runner,
            stdout: () => {},
          },
        );

      expect(replayWithOutput(outPath)).toThrow(
        "Fuzz replay output parent contains a symbolic link",
      );
      expect(existsSync(join(realOutDir, "crash.min.bpl"))).toBe(false);

      const targetOutputPath = join(tempRoot, "target.min.bpl");
      const linkedOutputPath = join(tempRoot, "linked.min.bpl");
      writeFileSync(targetOutputPath, "stale");
      symlinkSync(targetOutputPath, linkedOutputPath, "file");

      expect(replayWithOutput(linkedOutputPath)).toThrow(
        "Fuzz replay output path is a symbolic link",
      );
      expect(readFileSync(targetOutputPath, "utf8")).toBe("stale");

      const fileParentPath = join(tempRoot, "not-a-directory");
      writeFileSync(fileParentPath, "plain file");
      expect(replayWithOutput(join(fileParentPath, "crash.min.bpl"))).toThrow(
        "Fuzz replay output parent is not a directory",
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
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

  test(
    "promotes minimized differential mismatch artifacts into a correctness corpus",
    () => {
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
    },
    60000,
  );

  test("promote CLI refuses corpus directories through symlinked ancestors", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-fuzz-promote-link-"));

    try {
      const sourcePath = join(tempRoot, "source.bpl");
      const realRoot = join(tempRoot, "real-root");
      const linkedRoot = join(tempRoot, "linked-root");
      const realCorpusDir = join(realRoot, "corpus");
      const corpusDir = join(linkedRoot, "corpus");
      writeFileSync(sourcePath, "frame main() ret int { return 0; }\n");
      mkdirSync(realCorpusDir, { recursive: true });
      symlinkSync(realRoot, linkedRoot, "dir");

      const result = spawnSync(
        "bun",
        [
          "run",
          "fuzz:promote",
          "--",
          "--source",
          sourcePath,
          "--name",
          "linked corpus",
          "--corpus-dir",
          corpusDir,
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Fuzz regression corpus directory parent contains a symbolic link",
      );
      expect(readdirSync(realCorpusDir)).toEqual([]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("promote CLI rejects symlinked metadata paths before updating crash metadata", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-fuzz-promote-metadata-link-"),
    );

    try {
      const sourcePath = join(tempRoot, "source.bpl");
      const corpusDir = join(tempRoot, "corpus");
      const targetMetadataPath = join(tempRoot, "outside-metadata.json");
      const metadataPath = join(tempRoot, "crash.json");
      writeFileSync(sourcePath, "frame main() ret int { return 0; }\n");
      mkdirSync(corpusDir);
      writeFileSync(
        targetMetadataPath,
        JSON.stringify(
          {
            seed: 0xbeef,
            iteration: 3,
            kind: "tokens",
            sourcePath,
            stage: "codegen",
          },
          null,
          2,
        ),
      );
      symlinkSync(targetMetadataPath, metadataPath, "file");

      const result = spawnSync(
        "bun",
        [
          "run",
          "fuzz:promote",
          "--",
          "--metadata",
          metadataPath,
          "--name",
          "metadata link",
          "--corpus-dir",
          corpusDir,
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Fuzz crash metadata path is a symbolic link",
      );
      expect(
        JSON.parse(readFileSync(targetMetadataPath, "utf8")),
      ).not.toHaveProperty("promotedTo");
      expect(readdirSync(corpusDir)).toEqual([]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("promote CLI rejects metadata paths through symlinked ancestors", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-fuzz-promote-metadata-parent-link-"),
    );

    try {
      const sourcePath = join(tempRoot, "source.bpl");
      const corpusDir = join(tempRoot, "corpus");
      const realRoot = join(tempRoot, "real-root");
      const linkedRoot = join(tempRoot, "linked-root");
      const targetMetadataPath = join(realRoot, "crash.json");
      const metadataPath = join(linkedRoot, "crash.json");
      writeFileSync(sourcePath, "frame main() ret int { return 0; }\n");
      mkdirSync(corpusDir);
      mkdirSync(realRoot);
      writeFileSync(
        targetMetadataPath,
        JSON.stringify(
          {
            seed: 0xcafe,
            iteration: 4,
            kind: "tokens",
            sourcePath,
            stage: "codegen",
          },
          null,
          2,
        ),
      );
      symlinkSync(realRoot, linkedRoot, "dir");

      const result = spawnSync(
        "bun",
        [
          "run",
          "fuzz:promote",
          "--",
          "--metadata",
          metadataPath,
          "--name",
          "metadata parent link",
          "--corpus-dir",
          corpusDir,
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Fuzz crash metadata parent contains a symbolic link",
      );
      expect(
        JSON.parse(readFileSync(targetMetadataPath, "utf8")),
      ).not.toHaveProperty("promotedTo");
      expect(readdirSync(corpusDir)).toEqual([]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("promote CLI rejects symlinked source paths before reading source", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-fuzz-promote-source-link-"));

    try {
      const targetSourcePath = join(tempRoot, "outside-source.bpl");
      const sourcePath = join(tempRoot, "source.bpl");
      const corpusDir = join(tempRoot, "corpus");
      mkdirSync(corpusDir);
      writeFileSync(targetSourcePath, "frame main() ret int { return 0; }\n");
      symlinkSync(targetSourcePath, sourcePath, "file");

      const result = spawnSync(
        "bun",
        [
          "run",
          "fuzz:promote",
          "--",
          "--source",
          sourcePath,
          "--name",
          "source link",
          "--corpus-dir",
          corpusDir,
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Fuzz regression source path is a symbolic link",
      );
      expect(readdirSync(corpusDir)).toEqual([]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("promote CLI rejects source paths through symlinked ancestors", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-fuzz-promote-source-parent-link-"),
    );

    try {
      const realRoot = join(tempRoot, "real-root");
      const linkedRoot = join(tempRoot, "linked-root");
      const sourcePath = join(linkedRoot, "source.bpl");
      const targetSourcePath = join(realRoot, "source.bpl");
      const corpusDir = join(tempRoot, "corpus");
      mkdirSync(realRoot);
      mkdirSync(corpusDir);
      writeFileSync(targetSourcePath, "frame main() ret int { return 0; }\n");
      symlinkSync(realRoot, linkedRoot, "dir");

      const result = spawnSync(
        "bun",
        [
          "run",
          "fuzz:promote",
          "--",
          "--source",
          sourcePath,
          "--name",
          "source parent link",
          "--corpus-dir",
          corpusDir,
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Fuzz regression source parent contains a symbolic link",
      );
      expect(readdirSync(corpusDir)).toEqual([]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
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

  test("promote CLI rejects malformed usage before corpus promotion", () => {
    const cases: Array<[string[], string]> = [
      [["--unknown", "value"], "Unknown option --unknown"],
      [["--metadata", "--name", "bug"], "--metadata requires a value"],
      [["--source="], "--source requires a non-empty value"],
      [["--metadata="], "--metadata requires a non-empty value"],
      [["--name="], "--name requires a non-empty value"],
      [["--corpus-dir="], "--corpus-dir requires a non-empty value"],
      [["--=value"], "Missing option name"],
      [["one.bpl", "two.bpl"], "Unexpected argument: two.bpl"],
    ];

    for (const [args, expectedError] of cases) {
      const result = spawnSync("bun", ["run", "fuzz:promote", "--", ...args], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("Either --source or --metadata");
      expect(result.stderr).not.toContain("No source artifact found");
    }
  });

  test("direct promote CLI rejects empty option values before corpus promotion", () => {
    const cases: Array<[string[], string]> = [
      [["--source="], "--source requires a non-empty value"],
      [["--metadata="], "--metadata requires a non-empty value"],
      [["--name="], "--name requires a non-empty value"],
      [["--corpus-dir="], "--corpus-dir requires a non-empty value"],
    ];

    for (const [args, expectedError] of cases) {
      const result = spawnSync("bun", ["fuzz/promote_regression.ts", ...args], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("Either --source or --metadata");
      expect(result.stderr).not.toContain("No source artifact found");
    }
  });

  test("fuzz runner CLI rejects malformed usage before starting a campaign", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-cli-usage-"));
    const cases: Array<[string[], string]> = [
      [["--unknown", "value", "--iterations", "1"], "Unknown option --unknown"],
      [
        ["--iterations", "--crash-dir", crashDir],
        "--iterations requires a value",
      ],
      [["--iterations", "0"], "iterations must be a positive integer"],
      [
        [
          "--iterations",
          "9007199254740992",
          "--seeds",
          "0x1",
          "--crash-dir",
          crashDir,
        ],
        "iterations must be a positive integer",
      ],
      [["--progress=0"], "progress must be a positive integer"],
      [
        [
          "--progress",
          "9007199254740992",
          "--iterations",
          "1",
          "--seeds",
          "0x1",
          "--crash-dir",
          crashDir,
        ],
        "progress must be a positive integer",
      ],
      [
        ["--minimize-passes", "not-a-number"],
        "minimize-passes must be a positive integer",
      ],
      [
        [
          "--minimize-passes",
          "9007199254740992",
          "--iterations",
          "1",
          "--seeds",
          "0x1",
          "--crash-dir",
          crashDir,
        ],
        "minimize-passes must be a positive integer",
      ],
      [["--seeds="], "--seeds requires a non-empty value"],
      [
        [
          "--seeds",
          "0x1,,0x2",
          "--iterations",
          "1",
          "--progress",
          "1",
          "--crash-dir",
          crashDir,
        ],
        "seeds must not contain empty entries",
      ],
      [
        [
          "--seeds",
          "-1",
          "--iterations",
          "1",
          "--progress",
          "1",
          "--crash-dir",
          crashDir,
        ],
        "seeds must be unsigned 32-bit integers",
      ],
      [
        [
          "--seeds",
          "0x100000000",
          "--iterations",
          "1",
          "--progress",
          "1",
          "--crash-dir",
          crashDir,
        ],
        "seeds must be unsigned 32-bit integers",
      ],
      [["--differential=maybe"], "differential must be a boolean value"],
      [
        ["--minimize="],
        "--minimize requires a non-empty boolean value",
      ],
      [["--=value"], "Missing option name"],
      [["input.bpl"], "Unexpected argument: input.bpl"],
    ];

    try {
      for (const [args, expectedError] of cases) {
        const result = spawnSync("bun", ["fuzz/run_fuzz.ts", ...args], {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        });

        expect(result.status).toBe(2);
        expect(result.stderr).toContain(expectedError);
        expect(result.stdout).not.toContain("Starting compiler fuzz campaign");
      }
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("fuzz runner help describes unsigned 32-bit seed values", () => {
    const expectedLine =
      "  --seeds <list>      Comma-separated unsigned 32-bit decimal or 0x-prefixed seeds";
    const commands: string[][] = [
      ["fuzz/run_fuzz.ts", "--help"],
      ["tools/fuzz_script_wrapper.ts", "run", "--help"],
    ];

    for (const args of commands) {
      const result = spawnSync("bun", args, {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(expectedLine);
      expect(result.stderr).toBe("");
    }
  });

  test("fuzz runner CLI prints the effective progress interval at startup", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-cli-progress-"));

    try {
      const result = spawnSync(
        "bun",
        [
          "fuzz/run_fuzz.ts",
          "--iterations",
          "1",
          "--seeds",
          "0xd1ff0",
          "--progress",
          "7",
          "--crash-dir",
          crashDir,
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Starting compiler fuzz campaign");
      expect(result.stdout).toContain("Iterations per seed: 1");
      expect(result.stdout).toContain("Progress interval: 7 iterations");
      expect(result.stdout).toContain("Total iterations: 1");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("fuzz package wrappers reject malformed option values before delegation", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-wrapper-usage-"));
    const cases: Array<{
      script: string;
      args: string[];
      expectedError: string;
      forbiddenOutput: string[];
    }> = [
      {
        script: "fuzz",
        args: [
          "--minimize",
          "maybe",
          "--iterations",
          "1",
          "--crash-dir",
          crashDir,
        ],
        expectedError: "minimize must be a boolean value",
        forbiddenOutput: [
          "Starting compiler fuzz campaign",
          "requires a source checkout",
        ],
      },
      {
        script: "fuzz",
        args: [
          "--differential=maybe",
          "--iterations",
          "1",
          "--crash-dir",
          crashDir,
        ],
        expectedError: "differential must be a boolean value",
        forbiddenOutput: [
          "Starting compiler fuzz campaign",
          "requires a source checkout",
        ],
      },
      {
        script: "fuzz",
        args: ["--iterations="],
        expectedError: "--iterations requires a non-empty value",
        forbiddenOutput: [
          "Starting compiler fuzz campaign",
          "requires a source checkout",
        ],
      },
      {
        script: "fuzz:replay",
        args: ["--minimize=true"],
        expectedError: "--minimize does not accept a value",
        forbiddenOutput: [
          "Either sourcePath or metadataPath",
          "No source artifact found",
        ],
      },
      {
        script: "fuzz:promote",
        args: ["--force=true"],
        expectedError: "--force does not accept a value",
        forbiddenOutput: [
          "Either --source or --metadata",
          "No source artifact found",
        ],
      },
    ];

    try {
      for (const testCase of cases) {
        const result = spawnSync(
          "bun",
          ["run", testCase.script, "--", ...testCase.args],
          {
            cwd: join(import.meta.dir, ".."),
            encoding: "utf8",
          },
        );

        expect(result.status).toBe(2);
        expect(result.stderr).toContain(testCase.expectedError);
        for (const forbidden of testCase.forbiddenOutput) {
          expect(result.stdout).not.toContain(forbidden);
          expect(result.stderr).not.toContain(forbidden);
        }
      }
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("fuzz package wrapper rejects malformed seeds before requiring source checkout", () => {
    const packedRoot = mkdtempSync(join(tmpdir(), "bpl-fuzz-wrapper-packed-"));
    const packedToolsDir = join(packedRoot, "tools");
    const wrapperPath = join(packedToolsDir, "fuzz_script_wrapper.ts");
    const cases: Array<[string[], string]> = [
      [
        ["run", "--seeds", "0x1,,0x2"],
        "seeds must not contain empty entries",
      ],
      [
        ["run", "--seeds", "0x100000000"],
        "seeds must be unsigned 32-bit integers",
      ],
    ];

    try {
      mkdirSync(packedToolsDir, { recursive: true });
      writeFileSync(
        wrapperPath,
        readFileSync(
          join(import.meta.dir, "..", "tools", "fuzz_script_wrapper.ts"),
          "utf8",
        ),
      );

      for (const [args, expectedError] of cases) {
        const result = spawnSync("bun", [wrapperPath, ...args], {
          cwd: packedRoot,
          encoding: "utf8",
        });

        expect(result.status).toBe(2);
        expect(result.stderr).toContain(expectedError);
        expect(result.stderr).not.toContain("requires a source checkout");
      }
    } finally {
      rmSync(packedRoot, { recursive: true, force: true });
    }
  });

  test("fuzz package wrapper rejects unsafe numeric values before requiring source checkout", () => {
    const packedRoot = mkdtempSync(join(tmpdir(), "bpl-fuzz-wrapper-packed-"));
    const packedToolsDir = join(packedRoot, "tools");
    const wrapperPath = join(packedToolsDir, "fuzz_script_wrapper.ts");
    const cases: Array<[string[], string]> = [
      [
        ["run", "--iterations", "9007199254740992"],
        "iterations must be a positive integer",
      ],
      [
        ["run", "--progress", "9007199254740992"],
        "progress must be a positive integer",
      ],
      [
        ["run", "--minimize-passes", "9007199254740992"],
        "minimize-passes must be a positive integer",
      ],
    ];

    try {
      mkdirSync(packedToolsDir, { recursive: true });
      writeFileSync(
        wrapperPath,
        readFileSync(
          join(import.meta.dir, "..", "tools", "fuzz_script_wrapper.ts"),
          "utf8",
        ),
      );

      for (const [args, expectedError] of cases) {
        const result = spawnSync("bun", [wrapperPath, ...args], {
          cwd: packedRoot,
          encoding: "utf8",
        });

        expect(result.status).toBe(2);
        expect(result.stderr).toContain(expectedError);
        expect(result.stderr).not.toContain("requires a source checkout");
      }
    } finally {
      rmSync(packedRoot, { recursive: true, force: true });
    }
  });

  test("fuzz package wrapper rejects invalid replay enum values before requiring source checkout", () => {
    const packedRoot = mkdtempSync(join(tmpdir(), "bpl-fuzz-wrapper-packed-"));
    const packedToolsDir = join(packedRoot, "tools");
    const wrapperPath = join(packedToolsDir, "fuzz_script_wrapper.ts");
    const cases: Array<[string[], string]> = [
      [["replay", "--stage", "middle"], "--stage must be one of"],
      [["replay", "--failure-kind", "oops"], "--failure-kind must be one of"],
      [["replay", "--mode", "parser,oops"], "--mode must include"],
      [["replay", "--mode", "all,parser"], "--mode all must be used alone"],
      [
        ["replay", "--mode", "parser,,codegen"],
        "--mode must not contain empty entries",
      ],
    ];

    try {
      mkdirSync(packedToolsDir, { recursive: true });
      writeFileSync(
        wrapperPath,
        readFileSync(
          join(import.meta.dir, "..", "tools", "fuzz_script_wrapper.ts"),
          "utf8",
        ),
      );

      for (const [args, expectedError] of cases) {
        const result = spawnSync("bun", [wrapperPath, ...args], {
          cwd: packedRoot,
          encoding: "utf8",
        });

        expect(result.status).toBe(2);
        expect(result.stderr).toContain(expectedError);
        expect(result.stderr).not.toContain("requires a source checkout");
      }
    } finally {
      rmSync(packedRoot, { recursive: true, force: true });
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
