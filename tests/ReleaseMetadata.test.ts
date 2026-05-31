import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  PACKAGE_HELPER_DEPENDENCIES,
  createReleaseManifest,
  discoverPackageHelperDependencyFiles,
  writeReleaseManifest,
} from "../tools/release_manifest";
import {
  assertStandaloneCompilerArtifact,
  discoverDedicatedWasmExampleFiles,
} from "../tools/release_smoke";

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
        "compiler/common/PathSafety.ts",
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

  test("package helper scripts reference helpers shipped with the npm package", () => {
    const repoRoot = join(import.meta.dir, "..");
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    );
    const helperScripts = new Map([
      ["release:smoke", "tools/release_smoke.ts"],
      ["release:manifest", "tools/release_manifest.ts"],
      ["ci:triage", "tools/ci_triage.ts"],
      ["fuzz", "tools/fuzz_script_wrapper.ts"],
      ["fuzz:long", "tools/fuzz_script_wrapper.ts"],
      ["fuzz:differential", "tools/fuzz_script_wrapper.ts"],
      ["fuzz:promote", "tools/fuzz_script_wrapper.ts"],
      ["fuzz:replay", "tools/fuzz_script_wrapper.ts"],
      ["fuzz:repro", "tools/fuzz_artifact_repro.ts"],
    ]);

    expect(packageJson.files).toContain("tools");
    expect(packageJson.files).toContain("compiler/common/PathSafety.ts");
    expect(
      existsSync(join(repoRoot, "compiler/common/PathSafety.ts")),
    ).toBe(true);
    for (const [scriptName, helperPath] of helperScripts) {
      expect(packageJson.scripts[scriptName]).toContain(helperPath);
      expect(existsSync(join(repoRoot, helperPath))).toBe(true);
    }
  });

  test("package helper dependency inventory is explicit and narrow", () => {
    const repoRoot = join(import.meta.dir, "..");
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    );

    expect(PACKAGE_HELPER_DEPENDENCIES).toEqual([
      {
        importedBy: [
          "tools/fuzz_artifact_repro.ts",
          "tools/release_manifest.ts",
        ],
        path: "compiler/common/PathSafety.ts",
        reason:
          "Packed helper scripts share symlink-safe path validation without shipping broad compiler sources.",
      },
    ]);
    expect(discoverPackageHelperDependencyFiles(repoRoot)).toEqual([
      "compiler/common/PathSafety.ts",
    ]);
    expect(packageJson.files).toContain("compiler/common/PathSafety.ts");
    expect(packageJson.files).not.toContain("compiler");
    expect(packageJson.files).not.toContain("compiler/common");
  });

  test("release smoke discovers package script helper files dynamically", async () => {
    const releaseSmoke = (await import("../tools/release_smoke")) as {
      discoverPackageScriptHelperFiles?: (repoRoot: string) => string[];
    };
    const discoverPackageScriptHelperFiles =
      releaseSmoke.discoverPackageScriptHelperFiles;

    if (typeof discoverPackageScriptHelperFiles !== "function") {
      expect(typeof discoverPackageScriptHelperFiles).toBe("function");
      return;
    }

    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-helper-script-test-"));

    try {
      mkdirSync(join(tempRoot, "tools"), { recursive: true });
      writeFileSync(
        join(tempRoot, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "ci:triage": "bun tools/ci_triage.ts",
              "custom:helper": "NO_COLOR=1 bun tools/custom_helper.ts --flag",
              "not-a-helper": "echo tools/not_a_script.ts",
              "not-tools": "bun index.ts",
            },
          },
          null,
          2,
        ),
      );
      writeFileSync(join(tempRoot, "tools", "ci_triage.ts"), "");
      writeFileSync(join(tempRoot, "tools", "custom_helper.ts"), "");

      expect(discoverPackageScriptHelperFiles(tempRoot)).toEqual([
        "tools/ci_triage.ts",
        "tools/custom_helper.ts",
      ]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("release smoke rejects package helper scripts with missing helper files", async () => {
    const releaseSmoke = (await import("../tools/release_smoke")) as {
      discoverPackageScriptHelperFiles: (repoRoot: string) => string[];
    };
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-missing-helper-test-"));

    try {
      mkdirSync(join(tempRoot, "tools"), { recursive: true });
      writeFileSync(
        join(tempRoot, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "missing:helper": "bun tools/missing_helper.ts --flag",
              "not-a-helper": "echo tools/also_missing.ts",
            },
          },
          null,
          2,
        ),
      );

      expect(() =>
        releaseSmoke.discoverPackageScriptHelperFiles(tempRoot),
      ).toThrow(
        "Package script helper file is missing or not a file: tools/missing_helper.ts",
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("release helper smoke validates packed fuzz repro JSON output", () => {
    const releaseSmokeSource = readFileSync(
      join(import.meta.dir, "../tools/release_smoke.ts"),
      "utf8",
    );

    expect(releaseSmokeSource).toContain(
      "check packed npm CLI fuzz artifact repro JSON",
    );
    expect(releaseSmokeSource).toContain('["run", "fuzz:repro", "--"');
    expect(releaseSmokeSource).toContain("--json");
    expect(releaseSmokeSource).toContain("schemaVersion");
    expect(releaseSmokeSource).toContain("bun run fuzz -- --iterations");
    expect(releaseSmokeSource).toContain(
      "check packed npm CLI CI triage helper",
    );
    expect(releaseSmokeSource).toContain(
      "check packed npm CLI CI triage JSON",
    );
    expect(releaseSmokeSource).toContain("parseCiTriageReport");
    expect(releaseSmokeSource).toContain("run.headSha");
    expect(releaseSmokeSource).toContain("checkout.status");
  });

  test("release helper smoke validates packed CI timeout repro contracts", () => {
    const releaseSmokeSource = readFileSync(
      join(import.meta.dir, "../tools/release_smoke.ts"),
      "utf8",
    );

    expect(releaseSmokeSource).toContain(
      "check packed npm CLI CI triage timeout JSON",
    );
    expect(releaseSmokeSource).toContain("Package timeout metadata");
    expect(releaseSmokeSource).toContain(
      "BPL_PACKAGE_TOOL_TIMEOUT_MS=300000 bun test tests/PackageManager.test.ts",
    );
    expect(releaseSmokeSource).toContain(
      'BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS=30000 bun test tests/CLI.test.ts -t "package IR verification"',
    );
    expect(releaseSmokeSource).toContain(
      "BPL_OBJECT_SYMBOL_TIMEOUT_MS=30000 bun test tests/ObjectFileParser.test.ts",
    );
  });

  test("CI-safe tests keep release helper smoke focused", () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(packageJson.scripts["test:ci"]).toContain(
      "! -name 'ReleaseSmoke.test.ts'",
    );
    expect(packageJson.scripts["test:ci"]).not.toContain(
      "! -name 'ReleaseHelperSmoke.test.ts'",
    );
    expect(packageJson.scripts["release:check"]).toContain(
      "bun run release:smoke",
    );
  });

  test("release smoke guards packed wasm doctor JSON contract", async () => {
    const releaseSmoke = (await import("../tools/release_smoke")) as {
      assertWasmDoctorUnavailableContract?: (report: unknown) => void;
    };
    const assertWasmDoctorUnavailableContract =
      releaseSmoke.assertWasmDoctorUnavailableContract;

    expect(typeof assertWasmDoctorUnavailableContract).toBe("function");
    if (typeof assertWasmDoctorUnavailableContract !== "function") {
      return;
    }

    const report = {
      schemaVersion: 1,
      check: "toolchain",
      success: true,
      checks: [
        {
          name: "wasm linker",
          ok: false,
          detail: "missing-wasm-ld: command not found",
          required: false,
          code: "BPL_WASM_LINKER_UNAVAILABLE",
          candidates: ["/tmp/missing-wasm-ld", "wasm-ld"],
          environment: {
            WASM_LD: "/tmp/missing-wasm-ld",
            BPL_REQUIRE_WASM_LD: null,
          },
          recommendedCommands: ["BPL_REQUIRE_WASM_LD=1 bun run test:wasm"],
          hint:
            "missing wasm linker support is an optional prerequisite skip, not a successful wasm execution",
        },
      ],
    };

    expect(() => assertWasmDoctorUnavailableContract(report)).not.toThrow();
    expect(() =>
      assertWasmDoctorUnavailableContract({
        ...report,
        checks: [{ ...report.checks[0], candidates: [] }],
      }),
    ).toThrow("wasm linker check missing checked candidates");
  });

  test("release smoke validates packed package install JSON output", () => {
    const releaseSmokeSource = readFileSync(
      join(import.meta.dir, "../tools/release_smoke.ts"),
      "utf8",
    );

    expect(releaseSmokeSource).toContain(
      "check packed npm CLI package install JSON",
    );
    expect(releaseSmokeSource).toContain("parsePackageInstallReport");
    expect(releaseSmokeSource).toContain('check: "package-install"');
  });

  test("release manifest records checksums for shipped artifacts", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-release-manifest-test-"));

    try {
      writeReleaseFixture(tempRoot);

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
      expect(byPath.get("tools/ci_triage.ts")).toMatchObject({
        kind: "helper",
        sha256: createHash("sha256").update("ci triage helper\n").digest("hex"),
      });
      expect(byPath.get("tools/fuzz_artifact_repro.ts")).toMatchObject({
        kind: "helper",
        sha256: createHash("sha256")
          .update(
            'import "../compiler/common/PathSafety";\nfuzz artifact repro helper\n',
          )
          .digest("hex"),
      });
      expect(byPath.get("tools/release_manifest.ts")).toMatchObject({
        kind: "helper",
        sha256: createHash("sha256")
          .update(
            'import "../compiler/common/PathSafety";\nrelease manifest helper\n',
          )
          .digest("hex"),
      });
      expect(byPath.get("tools/fuzz_script_wrapper.ts")).toMatchObject({
        kind: "helper",
        sha256: createHash("sha256")
          .update("fuzz script wrapper\n")
          .digest("hex"),
      });
      expect(byPath.get("compiler/common/PathSafety.ts")).toMatchObject({
        kind: "helper",
        sha256: createHash("sha256")
          .update("path safety helper\n")
          .digest("hex"),
      });
      expect(byPath.get("bpl-v3-9.9.9.tgz")).toMatchObject({
        kind: "npm-package",
        npmIntegrity: "sha512-test",
        npmShasum: "abc123",
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("release manifest rejects symlinked shipped artifacts", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-release-artifact-link-test-"),
    );

    try {
      writeReleaseFixture(tempRoot);
      const outsideRuntime = join(tempRoot, "outside-runtime.ll");
      writeFileSync(outsideRuntime, "outside runtime\n");
      rmSync(join(tempRoot, "lib", "runtime.ll"));
      symlinkSync(outsideRuntime, join(tempRoot, "lib", "runtime.ll"), "file");

      expect(() =>
        createReleaseManifest({
          repoRoot: tempRoot,
          generatedAt: "2026-05-29T00:00:00.000Z",
        }),
      ).toThrow(/Release artifact is a symbolic link/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("release manifest rejects symlinked helper tool artifacts", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-helper-artifact-link-test-"),
    );

    try {
      writeReleaseFixture(tempRoot);
      const outsideHelper = join(tempRoot, "outside-helper.ts");
      writeFileSync(outsideHelper, "outside helper\n");
      rmSync(join(tempRoot, "tools", "ci_triage.ts"));
      symlinkSync(
        outsideHelper,
        join(tempRoot, "tools", "ci_triage.ts"),
        "file",
      );

      expect(() =>
        createReleaseManifest({
          repoRoot: tempRoot,
          generatedAt: "2026-05-29T00:00:00.000Z",
        }),
      ).toThrow(/Package script helper file is missing or not a file/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("release smoke rejects symlinked standalone compiler artifacts", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-release-binary-link-test-"),
    );

    try {
      const outsideBinary = join(tempRoot, "outside-bpl");
      const linkPath = join(tempRoot, "bpl");
      writeFileSync(outsideBinary, "standalone compiler\n");
      symlinkSync(outsideBinary, linkPath, "file");

      expect(() => assertStandaloneCompilerArtifact(linkPath)).toThrow(
        /Standalone compiler is a symbolic link/,
      );

      rmSync(linkPath);
      symlinkSync(join(tempRoot, "missing-bpl"), linkPath, "file");
      expect(() => assertStandaloneCompilerArtifact(linkPath)).toThrow(
        /Standalone compiler is a symbolic link/,
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("release smoke reports malformed standalone compiler paths cleanly", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-release-binary-parent-file-test-"),
    );

    try {
      const parentFile = join(tempRoot, "not-a-dir");
      const binaryPath = join(parentFile, "bpl");
      writeFileSync(parentFile, "not a directory\n");

      let errorMessage = "";
      try {
        assertStandaloneCompilerArtifact(binaryPath);
      } catch (error: unknown) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      expect(errorMessage).toContain("Standalone compiler was not built");
      expect(errorMessage).toContain(binaryPath);
      expect(errorMessage).not.toContain("ENOTDIR");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("release smoke discovers dedicated wasm example files dynamically", () => {
    const repoRoot = join(import.meta.dir, "..");
    const wasmExampleDirs = readdirSync(join(repoRoot, "examples"))
      .filter(
        (name) =>
          name.startsWith("wasm_") &&
          existsSync(join(repoRoot, "examples", name, "main.bpl")),
      )
      .sort();
    const expectedFiles = wasmExampleDirs.flatMap((name) => [
      `examples/${name}/main.bpl`,
      `examples/${name}/test_config.json`,
    ]);

    expect(discoverDedicatedWasmExampleFiles(repoRoot)).toEqual(expectedFiles);
    expect(expectedFiles).toContain(
      "examples/wasm_hosted_transform/main.bpl",
    );
  });

  test("release manifest refuses symlinked output paths", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-release-output-link-test-"),
    );

    try {
      writeReleaseFixture(tempRoot);
      const targetPath = join(tempRoot, "outside-manifest.json");
      const linkPath = join(tempRoot, "dist", "release-manifest.json");
      mkdirSync(join(tempRoot, "dist"));
      writeFileSync(targetPath, "original\n");
      symlinkSync(targetPath, linkPath, "file");

      expect(() =>
        writeReleaseManifest(linkPath, {
          repoRoot: tempRoot,
          generatedAt: "2026-05-29T00:00:00.000Z",
        }),
      ).toThrow(/Release manifest output is a symbolic link/);
      expect(readFileSync(targetPath, "utf8")).toBe("original\n");

      rmSync(linkPath);
      symlinkSync(join(tempRoot, "missing-manifest.json"), linkPath, "file");
      expect(() =>
        writeReleaseManifest(linkPath, {
          repoRoot: tempRoot,
          generatedAt: "2026-05-29T00:00:00.000Z",
        }),
      ).toThrow(/Release manifest output is a symbolic link/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("release manifest refuses output paths through symlinked ancestors", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-release-output-ancestor-link-test-"),
    );

    try {
      writeReleaseFixture(tempRoot);
      const realRoot = join(tempRoot, "real-root");
      const linkedRoot = join(tempRoot, "linked-root");
      const realNested = join(realRoot, "nested");
      const outPath = join(linkedRoot, "nested", "release-manifest.json");

      mkdirSync(realNested, { recursive: true });
      symlinkSync(realRoot, linkedRoot, "dir");

      expect(() =>
        writeReleaseManifest(outPath, {
          repoRoot: tempRoot,
          generatedAt: "2026-05-29T00:00:00.000Z",
        }),
      ).toThrow(/Release manifest output parent contains a symbolic link/);
      expect(existsSync(join(realNested, "release-manifest.json"))).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("release manifest rejects output paths below file parents", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-release-output-parent-file-test-"),
    );

    try {
      writeReleaseFixture(tempRoot);
      const parentFile = join(tempRoot, "not-a-dir");
      const outPath = join(parentFile, "release-manifest.json");
      writeFileSync(parentFile, "not a directory\n");

      let errorMessage = "";
      try {
        writeReleaseManifest(outPath, {
          repoRoot: tempRoot,
          generatedAt: "2026-05-29T00:00:00.000Z",
        });
      } catch (error: unknown) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      expect(errorMessage).toContain(
        "Release manifest output parent is not a directory",
      );
      expect(errorMessage).toContain(parentFile);
      expect(errorMessage).not.toContain("ENOTDIR");
      expect(readFileSync(parentFile, "utf8")).toBe("not a directory\n");
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

function writeReleaseFixture(tempRoot: string): void {
  mkdirSync(join(tempRoot, "lib"), { recursive: true });
  writeFileSync(
    join(tempRoot, "package.json"),
    JSON.stringify(
      {
        name: "bpl-v3",
        version: "9.9.9",
        license: "Apache-2.0",
        bin: { bpl: "./bpl" },
        scripts: {
          "ci:triage": "bun tools/ci_triage.ts",
          "release:manifest": "bun tools/release_manifest.ts --out dist/release-manifest.json --pack-npm",
          fuzz: "bun tools/fuzz_script_wrapper.ts run",
          "fuzz:promote": "bun tools/fuzz_script_wrapper.ts promote",
          "fuzz:replay": "bun tools/fuzz_script_wrapper.ts replay",
          "fuzz:repro": "bun tools/fuzz_artifact_repro.ts",
        },
      },
      null,
      2,
    ),
  );
  mkdirSync(join(tempRoot, "tools"), { recursive: true });
  mkdirSync(join(tempRoot, "compiler", "common"), { recursive: true });
  writeFileSync(join(tempRoot, "bpl"), "standalone compiler\n");
  writeFileSync(join(tempRoot, "tools", "ci_triage.ts"), "ci triage helper\n");
  writeFileSync(
    join(tempRoot, "tools", "fuzz_script_wrapper.ts"),
    "fuzz script wrapper\n",
  );
  writeFileSync(
    join(tempRoot, "tools", "fuzz_artifact_repro.ts"),
    'import "../compiler/common/PathSafety";\nfuzz artifact repro helper\n',
  );
  writeFileSync(
    join(tempRoot, "tools", "release_manifest.ts"),
    'import "../compiler/common/PathSafety";\nrelease manifest helper\n',
  );
  writeFileSync(
    join(tempRoot, "compiler", "common", "PathSafety.ts"),
    "path safety helper\n",
  );
  writeFileSync(join(tempRoot, "lib", "runtime.ll"), "runtime ir\n");
  writeFileSync(join(tempRoot, "lib", "runtime_wasm.ll"), "wasm runtime ir\n");
  writeFileSync(
    join(tempRoot, "lib", "runtime_wasm_host.ll"),
    "wasm host runtime ir\n",
  );
  writeFileSync(join(tempRoot, "lib", "runtime_support.o"), "runtime support\n");
}
