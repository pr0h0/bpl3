import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";

import {
  buildFuzzArtifactReproPlan,
  formatFuzzArtifactReproPlan,
} from "../tools/fuzz_artifact_repro";

describe("Fuzz artifact repro helper", () => {
  test("builds deterministic repro commands for a downloaded mismatch directory", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-repro-"));
    const metadataName = "mismatch_seed-abcd_iter-7_differential.json";
    const metadataPath = join(crashDir, metadataName);
    const sourcePath = join(
      crashDir,
      "mismatch_seed-abcd_iter-7_differential.bpl",
    );
    const minimizedPath = join(
      crashDir,
      "mismatch_seed-abcd_iter-7_differential.min.bpl",
    );

    try {
      writeFileSync(sourcePath, "frame main() ret int { return 1; }\n");
      writeFileSync(minimizedPath, "frame main() ret int { return 0; }\n");
      writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            seed: 0xabcd,
            iteration: 7,
            kind: "differential",
            failureKind: "mismatch",
            stage: "codegen",
            sourcePath: "/home/runner/work/bpl3/bpl3/fuzz/crashes/stale.bpl",
            minimizedSourcePath:
              "/home/runner/work/bpl3/bpl3/fuzz/crashes/stale.min.bpl",
          },
          null,
          2,
        ),
      );

      const plan = buildFuzzArtifactReproPlan(crashDir, {
        repoRoot: crashDir,
      });

      expect(plan.entries).toHaveLength(1);
      expect(plan.entries[0]?.seedHex).toBe("0xabcd");
      expect(plan.entries[0]?.iteration).toBe(7);
      expect(plan.entries[0]?.failureKind).toBe("mismatch");
      expect(plan.entries[0]?.commands).toEqual([
        `bun run fuzz:replay -- --metadata ${metadataName}`,
        `bun run fuzz:replay -- --metadata ${metadataName} --mode parser,typecheck,codegen,runtime,differential,sanitizer`,
        `bun run fuzz:replay -- --metadata ${metadataName} --minimize --out mismatch_seed-abcd_iter-7_differential.min.bpl`,
        `bun run fuzz -- --iterations 8 --seeds 0xabcd --minimize true --minimize-passes 8 --differential`,
        `bun run fuzz:promote -- --metadata ${metadataName} --differential --name mismatch-seed-abcd-iter-7-differential`,
        "bun run fuzz:validate-artifacts",
      ]);

      const formatted = formatFuzzArtifactReproPlan(plan);
      expect(formatted).toContain("Fuzz artifact repro plan");
      expect(formatted).toContain("failure: mismatch at codegen");
      expect(formatted).toContain("source: mismatch_seed-abcd_iter-7_differential.bpl");
      expect(formatted).toContain(
        "minimized: mismatch_seed-abcd_iter-7_differential.min.bpl",
      );
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("accepts a single crash metadata file and derives source/minimized siblings", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-repro-file-"));
    const metadataName = "crash_seed-1234_iter-2_tokens.json";
    const metadataPath = join(crashDir, metadataName);

    try {
      writeFileSync(
        join(crashDir, "crash_seed-1234_iter-2_tokens.bpl"),
        "frame main() ret int { return 0; }\n",
      );
      writeFileSync(
        join(crashDir, "crash_seed-1234_iter-2_tokens.min.bpl"),
        "return",
      );
      writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            seed: 0x1234,
            iteration: 2,
            kind: "tokens",
            failureKind: "crash",
            stage: "typecheck",
            message: "synthetic crash",
          },
          null,
          2,
        ),
      );

      const plan = buildFuzzArtifactReproPlan(metadataPath, {
        repoRoot: crashDir,
      });

      expect(plan.entries).toHaveLength(1);
      expect(plan.entries[0]?.commands).toContain(
        `bun run fuzz -- --iterations 3 --seeds 0x1234 --minimize true --minimize-passes 8`,
      );
      expect(plan.entries[0]?.commands).toContain(
        `bun run fuzz:promote -- --metadata ${metadataName} --name crash-seed-1234-iter-2-tokens`,
      );
      expect(plan.entries[0]?.commands.at(-1)).toBe(
        "bun run fuzz:validate-artifacts",
      );
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("omits deterministic rerun commands for invalid seed metadata", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-repro-seeds-"));
    const cases = [
      {
        name: "crash_seed-badhex_iter-2_tokens.json",
        metadata: { seedHex: "not-a-seed", iteration: 2 },
      },
      {
        name: "crash_seed-negative_iter-2_tokens.json",
        metadata: { seed: -1, iteration: 2 },
      },
      {
        name: "crash_seed-overflow_iter-2_tokens.json",
        metadata: { seedHex: "0x100000000", iteration: 2 },
      },
    ];

    try {
      for (const testCase of cases) {
        writeFileSync(
          join(crashDir, testCase.name),
          JSON.stringify(
            {
              ...testCase.metadata,
              kind: "tokens",
              failureKind: "crash",
              stage: "parser",
              message: "synthetic invalid seed metadata",
            },
            null,
            2,
          ),
        );
      }

      const plan = buildFuzzArtifactReproPlan(crashDir, {
        repoRoot: crashDir,
      });

      expect(plan.entries).toHaveLength(cases.length);
      for (const entry of plan.entries) {
        expect(entry.seedHex).toBeUndefined();
        expect(
          entry.commands.some((command) => command.startsWith("bun run fuzz --")),
        ).toBe(false);
        expect(entry.commands).toContain(
          `bun run fuzz:replay -- --metadata ${entry.metadataPath}`,
        );
      }
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("fails clearly for malformed metadata", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-repro-bad-"));
    const metadataPath = join(crashDir, "crash_seed-bad_iter-0_tokens.json");

    try {
      writeFileSync(metadataPath, "{not-json");

      expect(() => buildFuzzArtifactReproPlan(metadataPath)).toThrow(
        "Failed to parse fuzz artifact metadata",
      );
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("rejects symlinked fuzz artifact metadata files", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-repro-link-"));
    const targetMetadataPath = join(crashDir, "outside-metadata.json");
    const metadataPath = join(crashDir, "crash_seed-link_iter-0_tokens.json");

    try {
      writeFileSync(
        targetMetadataPath,
        JSON.stringify(
          {
            seed: 0x5151,
            iteration: 0,
            kind: "tokens",
            failureKind: "crash",
            stage: "codegen",
          },
          null,
          2,
        ),
      );
      symlinkSync(targetMetadataPath, metadataPath, "file");

      expect(() =>
        buildFuzzArtifactReproPlan(metadataPath, { repoRoot: crashDir }),
      ).toThrow("Fuzz artifact metadata path is a symbolic link");
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("rejects fuzz artifact metadata through symlinked ancestors", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-repro-parent-link-"));

    try {
      const realRoot = join(crashDir, "real-root");
      const linkedRoot = join(crashDir, "linked-root");
      const metadataPath = join(linkedRoot, "crash_seed-link_iter-0_tokens.json");
      mkdirSync(realRoot);
      writeFileSync(
        join(realRoot, "crash_seed-link_iter-0_tokens.json"),
        JSON.stringify(
          {
            seed: 0x6262,
            iteration: 0,
            kind: "tokens",
            failureKind: "crash",
            stage: "codegen",
          },
          null,
          2,
        ),
      );
      symlinkSync(realRoot, linkedRoot, "dir");

      expect(() =>
        buildFuzzArtifactReproPlan(metadataPath, { repoRoot: crashDir }),
      ).toThrow("Fuzz artifact metadata parent contains a symbolic link");
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("exposes a CLI script through package scripts", () => {
    const result = spawnSync("bun", ["run", "fuzz:repro", "--", "--help"], {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: bun tools/fuzz_artifact_repro.ts");
    expect(result.stdout).toContain("fuzz/crashes");
  });

  test("prints a versioned JSON repro plan for automation", () => {
    const crashDir = mkdtempSync(join(tmpdir(), "bpl-fuzz-repro-json-"));
    const metadataName = "crash_seed-feed_iter-4_tokens.json";
    const metadataPath = join(crashDir, metadataName);

    try {
      writeFileSync(
        join(crashDir, "crash_seed-feed_iter-4_tokens.bpl"),
        "frame main() ret int { return 0; }\n",
      );
      writeFileSync(
        metadataPath,
        JSON.stringify(
          {
            seedHex: "feed",
            pass: 4,
            kind: "tokens",
            failure: {
              kind: "crash",
              stage: "parser",
              message: "synthetic parser crash",
            },
          },
          null,
          2,
        ),
      );

      const result = spawnSync(
        "bun",
        [
          "run",
          "fuzz:repro",
          "--",
          "--input",
          metadataPath,
          "--repo-root",
          crashDir,
          "--json",
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      const plan = JSON.parse(result.stdout);
      expect(plan).toMatchObject({
        schemaVersion: 1,
        inputPath: metadataName,
        entries: [
          {
            metadataPath: metadataName,
            sourcePath: "crash_seed-feed_iter-4_tokens.bpl",
            seedHex: "0xfeed",
            iteration: 4,
            inputKind: "tokens",
            failureKind: "crash",
            stage: "parser",
            message: "synthetic parser crash",
          },
        ],
      });
      expect(plan.entries[0].commands).toEqual([
        `bun run fuzz:replay -- --metadata ${metadataName}`,
        `bun run fuzz:replay -- --metadata ${metadataName} --mode parser,typecheck,codegen,runtime,differential,sanitizer`,
        `bun run fuzz:replay -- --metadata ${metadataName} --minimize --out crash_seed-feed_iter-4_tokens.min.bpl`,
        `bun run fuzz -- --iterations 5 --seeds 0xfeed --minimize true --minimize-passes 8`,
        `bun run fuzz:promote -- --metadata ${metadataName} --name crash-seed-feed-iter-4-tokens`,
        "bun run fuzz:validate-artifacts",
      ]);
    } finally {
      rmSync(crashDir, { recursive: true, force: true });
    }
  });

  test("rejects missing CLI option values as usage errors", () => {
    const cases: Array<[string[], string]> = [
      [["--input", "--json"], "--input requires a value"],
      [["--repo-root", "--json", "fuzz/crashes"], "--repo-root requires a value"],
    ];

    for (const [args, expectedError] of cases) {
      const result = spawnSync("bun", ["run", "fuzz:repro", "--", ...args], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("Fuzz artifact path does not exist");
      expect(result.stderr).not.toContain("No fuzz artifact metadata found");
    }
  });

  test("rejects malformed CLI option values before artifact discovery", () => {
    const cases: Array<[string[], string]> = [
      [["--json=true", "fuzz/crashes"], "--json does not accept a value"],
      [["--input="], "--input requires a non-empty value"],
      [["--repo-root=", "fuzz/crashes"], "--repo-root requires a non-empty value"],
      [
        ["--input", "fuzz/crashes", "other-artifacts"],
        "Pass artifact path either positionally or with --input, not both.",
      ],
    ];

    for (const [args, expectedError] of cases) {
      const result = spawnSync("bun", ["run", "fuzz:repro", "--", ...args], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("Fuzz artifact path does not exist");
      expect(result.stderr).not.toContain("No fuzz artifact metadata found");
      expect(result.stdout).toBe("");
    }
  });

  test("rejects unknown CLI options as usage errors", () => {
    const cases: Array<[string[], string]> = [
      [["--unknown", "value", "fuzz/crashes"], "Unknown option --unknown"],
      [["--unknown=value", "fuzz/crashes"], "Unknown option --unknown"],
    ];

    for (const [args, expectedError] of cases) {
      const result = spawnSync("bun", ["run", "fuzz:repro", "--", ...args], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("Fuzz artifact path does not exist");
      expect(result.stderr).not.toContain("No fuzz artifact metadata found");
    }
  });
});
