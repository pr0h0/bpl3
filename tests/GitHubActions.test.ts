import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("GitHub Actions workflows", () => {
  test("nightly compiler fuzz workflow runs long fuzz and uploads crash artifacts", () => {
    const workflowPath = join(
      import.meta.dir,
      "../.github/workflows/compiler-fuzz.yml",
    );
    const workflow = readFileSync(workflowPath, "utf8");
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("oven-sh/setup-bun@v2");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("npm ci --prefix vscode-ext");
    expect(workflow).toContain("bun run check");
    expect(workflow).toContain("bun run fuzz:long");
    expect(workflow).toContain("FUZZ_SEEDS");
    expect(workflow).toContain("0x5eed1234,0xc0ffee,0xbad5eed");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("fuzz/crashes");
    expect(workflow).toContain("if: always()");
    expect(packageJson.scripts["fuzz:long"]).toContain("FUZZ_SEEDS");
    expect(packageJson.scripts["fuzz:replay"]).toContain("fuzz/replay_crash.ts");

    const runFuzzIndex = workflow.indexOf("Run deterministic compiler fuzz");
    const minimizeIndex = workflow.indexOf("Minimize fuzz crash artifacts");
    const uploadIndex = workflow.indexOf("Upload fuzz crash artifacts");

    expect(minimizeIndex).toBeGreaterThan(runFuzzIndex);
    expect(uploadIndex).toBeGreaterThan(minimizeIndex);
    expect(workflow).toContain("if: failure()");
    expect(workflow).toContain("shopt -s nullglob");
    expect(workflow).toContain('for metadata in "$FUZZ_CRASH_DIR"/*.json; do');
    expect(workflow).toContain(
      'bun run fuzz:replay -- --metadata "$metadata" --minimize --out "$out"',
    );
  });

  test("compiler correctness workflow runs on push and pull request", () => {
    const workflowPath = join(
      import.meta.dir,
      "../.github/workflows/compiler-correctness.yml",
    );
    const workflow = readFileSync(workflowPath, "utf8");
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(workflow).toContain("name: Compiler Correctness");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("oven-sh/setup-bun@v2");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("npm ci --prefix vscode-ext");
    expect(workflow).toContain("bun run check");
    expect(workflow).toContain("bun run test:correctness");
    expect(workflow).toContain("sudo apt-get install -y clang llvm");
    expect(packageJson.scripts["test:correctness"]).toContain(
      "CompilerCorrectnessCorpus.test.ts",
    );
    expect(packageJson.scripts["test:correctness"]).toContain(
      "FuzzRegressionCorpus.test.ts",
    );
    expect(packageJson.scripts["test:correctness"]).toContain(
      "CompilerCorrectnessSeededFuzz.test.ts",
    );
  });
});
