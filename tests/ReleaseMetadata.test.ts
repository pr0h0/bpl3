import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("Release metadata", () => {
  test("package metadata exposes a release check and stable CLI entrypoint", () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(packageJson.name).toBe("bpl-v3");
    expect(packageJson.private).toBe(false);
    expect(packageJson.license).toBe("Apache-2.0");
    expect(packageJson.bin).toEqual({ bpl: "./bpl" });
    expect(packageJson.scripts["release:check"]).toContain("bun run check");
    expect(packageJson.scripts["release:check"]).toContain(
      "tests/ReleaseMetadata.test.ts",
    );
    expect(packageJson.scripts["release:check"]).toContain(
      "bun run release:smoke",
    );
    expect(packageJson.scripts["release:check"]).toContain(
      "npm test --prefix vscode-ext",
    );
    expect(packageJson.scripts["release:smoke"]).toBe(
      "bun tools/release_smoke.ts",
    );
  });

  test("compiler workflows opt into Node 24 JavaScript actions", () => {
    const workflowNames = ["compiler-correctness.yml", "compiler-fuzz.yml"];

    for (const workflowName of workflowNames) {
      const workflow = readFileSync(
        join(import.meta.dir, "../.github/workflows", workflowName),
        "utf8",
      );

      expect(workflow).toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true");
      expect(workflow).toContain("actions/checkout@v6");
      expect(workflow).not.toContain("actions/checkout@v4");
    }
  });
});
