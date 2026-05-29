import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createReleaseManifest } from "../tools/release_manifest";

describe("Release metadata", () => {
  test("package metadata exposes a release check and stable CLI entrypoint", () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(packageJson.name).toBe("bpl-v3");
    expect(packageJson.private).toBe(false);
    expect(packageJson.license).toBe("Apache-2.0");
    expect(packageJson.main).toBeUndefined();
    expect(packageJson.bin).toEqual({ bpl: "./bpl" });
    expect(packageJson.files).toEqual(
      expect.arrayContaining([
        "bpl",
        "bpl-wrapper.sh",
        "completions",
        "docs",
        "examples",
        "grammar",
        "lib",
        "README.md",
        "LICENSE",
      ]),
    );
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
    expect(packageJson.scripts["release:manifest"]).toBe(
      "bun tools/release_manifest.ts --out dist/release-manifest.json --pack-npm",
    );
  });

  test("release manifest records checksums for shipped artifacts", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-release-manifest-test-"));

    try {
      mkdirSync(join(tempRoot, "lib"), { recursive: true });
      writeFileSync(
        join(tempRoot, "package.json"),
        JSON.stringify(
          {
            name: "bpl-v3",
            version: "9.9.9",
            license: "Apache-2.0",
            bin: { bpl: "./bpl" },
          },
          null,
          2,
        ),
      );
      writeFileSync(join(tempRoot, "bpl"), "standalone compiler\n");
      writeFileSync(join(tempRoot, "lib", "runtime.ll"), "runtime ir\n");
      writeFileSync(
        join(tempRoot, "lib", "runtime_wasm.ll"),
        "wasm runtime ir\n",
      );
      writeFileSync(
        join(tempRoot, "lib", "runtime_wasm_host.ll"),
        "wasm host runtime ir\n",
      );
      writeFileSync(
        join(tempRoot, "lib", "runtime_support.o"),
        "runtime support\n",
      );

      const tarballPath = join(tempRoot, "bpl-v3-9.9.9.tgz");
      writeFileSync(tarballPath, "packed npm tarball\n");

      const manifest = createReleaseManifest({
        repoRoot: tempRoot,
        generatedAt: "2026-05-29T00:00:00.000Z",
        npmPackage: {
          path: tarballPath,
          metadata: {
            filename: "bpl-v3-9.9.9.tgz",
            integrity: "sha512-test",
            shasum: "abc123",
          },
        },
      });

      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.package).toEqual({
        name: "bpl-v3",
        version: "9.9.9",
        license: "Apache-2.0",
      });
      expect(manifest.generatedAt).toBe("2026-05-29T00:00:00.000Z");

      const byPath = new Map(
        manifest.artifacts.map((artifact) => [artifact.path, artifact]),
      );
      expect(byPath.get("bpl")?.sha256).toBe(
        createHash("sha256").update("standalone compiler\n").digest("hex"),
      );
      expect(byPath.get("lib/runtime.ll")?.sha256).toBe(
        createHash("sha256").update("runtime ir\n").digest("hex"),
      );
      expect(byPath.get("lib/runtime_wasm.ll")?.sha256).toBe(
        createHash("sha256").update("wasm runtime ir\n").digest("hex"),
      );
      expect(byPath.get("lib/runtime_wasm_host.ll")?.sha256).toBe(
        createHash("sha256").update("wasm host runtime ir\n").digest("hex"),
      );
      expect(byPath.get("lib/runtime_support.o")?.sha256).toBe(
        createHash("sha256").update("runtime support\n").digest("hex"),
      );
      expect(byPath.get("bpl-v3-9.9.9.tgz")).toMatchObject({
        kind: "npm-package",
        npmIntegrity: "sha512-test",
        npmShasum: "abc123",
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
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
