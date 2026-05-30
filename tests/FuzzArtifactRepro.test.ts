import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
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
        `FUZZ_DIFFERENTIAL=1 FUZZ_ITERATIONS=8 FUZZ_SEEDS=0xabcd FUZZ_MINIMIZE=1 FUZZ_MINIMIZE_PASSES=8 bun fuzz/run_fuzz.ts`,
        `bun run fuzz:promote -- --metadata ${metadataName} --differential --name mismatch-seed-abcd-iter-7-differential`,
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
        `FUZZ_ITERATIONS=3 FUZZ_SEEDS=0x1234 FUZZ_MINIMIZE=1 FUZZ_MINIMIZE_PASSES=8 bun fuzz/run_fuzz.ts`,
      );
      expect(plan.entries[0]?.commands.at(-1)).toBe(
        `bun run fuzz:promote -- --metadata ${metadataName} --name crash-seed-1234-iter-2-tokens`,
      );
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

  test("exposes a CLI script through package scripts", () => {
    const result = spawnSync("bun", ["run", "fuzz:repro", "--", "--help"], {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: bun tools/fuzz_artifact_repro.ts");
    expect(result.stdout).toContain("fuzz/crashes");
  });
});
