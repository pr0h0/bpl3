import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
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
  discoverPackageScriptHelperReferences,
  discoverPackageScriptHelperFiles,
  discoverPackedToolPayloadFiles,
  findUnaccountedPackedToolPayloadFiles,
  formatUnaccountedPackedToolPayloadDiagnostics,
  writeReleaseManifest,
} from "../tools/release_manifest";
import {
  assertStandaloneCompilerArtifact,
  discoverDedicatedWasmExampleFiles,
} from "../tools/release_smoke";
import { CI_SAFE_EXCLUDED_TEST_FILES } from "../tools/test_ci";

function releaseSmokeSource(): string {
  return readFileSync(
    join(import.meta.dir, "../tools/release_smoke.ts"),
    "utf8",
  );
}

function releaseSmokeTestSource(): string {
  return readFileSync(
    join(import.meta.dir, "ReleaseSmoke.test.ts"),
    "utf8",
  );
}

function expectSourceContainsSnippets(
  sourceLabel: string,
  source: string,
  snippets: readonly string[],
): void {
  const missingSnippets = snippets.filter(
    (snippet) => !source.includes(snippet),
  );

  if (missingSnippets.length > 0) {
    throw new Error(
      [
        `Missing source snippets in ${sourceLabel}:`,
        ...missingSnippets.map((snippet) => `- ${snippet}`),
      ].join("\n"),
    );
  }
}

function expectReleaseSmokeSourceContains(snippets: readonly string[]): void {
  expectSourceContainsSnippets(
    "tools/release_smoke.ts",
    releaseSmokeSource(),
    snippets,
  );
}

function expectReleaseSmokeTestSourceContains(snippets: readonly string[]): void {
  expectSourceContainsSnippets(
    "tests/ReleaseSmoke.test.ts",
    releaseSmokeTestSource(),
    snippets,
  );
}

describe("Release metadata", () => {
  test("source snippet helper reports concise missing-snippet diagnostics", () => {
    let thrown: unknown;

    try {
      expectSourceContainsSnippets(
        "large-source.ts",
        "short source SOURCE_BODY_SENTINEL",
        ["missing release source snippet"],
      );
    } catch (error) {
      thrown = error;
    }

    const message = String(thrown);
    expect(message).toContain("Missing source snippets in large-source.ts");
    expect(message).toContain("missing release source snippet");
    expect(message).not.toContain("SOURCE_BODY_SENTINEL");
  });

  test("package metadata exposes a release check and stable CLI entrypoint", () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(packageJson.name).toBe("bpl-v3");
    expect(packageJson.private).toBe(false);
    expect(packageJson.license).toBe("Apache-2.0");
    expect(packageJson.main).toBeUndefined();
    expect(packageJson.bin).toEqual({ bpl: "./bpl" });
    expect(packageJson.exports?.["./cli"]).toEqual({
      types: "./cli/index.d.ts",
      import: "./cli/index.js",
      require: "./cli/index.js",
      default: "./cli/index.js",
    });
    expect(packageJson.files).toEqual(
      expect.arrayContaining([
        "bpl",
        "bpl-wrapper.sh",
        "cli/index.d.ts",
        "cli/index.js",
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
      "bun run release:cli-registry",
    );
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
    expect(packageJson.scripts["release:cli-registry"]).toBe(
      "bun tools/cli_json_registry_shim.ts --check",
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
      ["release:cli-registry", "tools/cli_json_registry_shim.ts"],
      ["test:ci", "tools/test_ci.ts"],
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

  test("package helper script inventory stays aligned with package files", () => {
    const repoRoot = join(import.meta.dir, "..");
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    );
    const helperReferences = discoverPackageScriptHelperReferences(repoRoot);

    expect(
      helperReferences.map(({ scriptName, helperPath }) => [
        scriptName,
        helperPath,
      ]),
    ).toEqual([
      ["ci:triage", "tools/ci_triage.ts"],
      ["fuzz", "tools/fuzz_script_wrapper.ts"],
      ["fuzz:differential", "tools/fuzz_script_wrapper.ts"],
      ["fuzz:long", "tools/fuzz_script_wrapper.ts"],
      ["fuzz:promote", "tools/fuzz_script_wrapper.ts"],
      ["fuzz:replay", "tools/fuzz_script_wrapper.ts"],
      ["fuzz:repro", "tools/fuzz_artifact_repro.ts"],
      ["release:cli-registry", "tools/cli_json_registry_shim.ts"],
      ["release:manifest", "tools/release_manifest.ts"],
      ["release:smoke", "tools/release_smoke.ts"],
      ["test:ci", "tools/test_ci.ts"],
    ]);

    expect(discoverPackageScriptHelperFiles(repoRoot)).toEqual([
      "tools/ci_triage.ts",
      "tools/cli_json_registry_shim.ts",
      "tools/fuzz_artifact_repro.ts",
      "tools/fuzz_script_wrapper.ts",
      "tools/release_manifest.ts",
      "tools/release_smoke.ts",
      "tools/test_ci.ts",
    ]);

    const unpackedHelpers = helperReferences.filter(
      ({ helperPath }) =>
        !isIncludedInPackageFiles(helperPath, packageJson.files),
    );
    expect(unpackedHelpers).toEqual([]);
  });

  test("packed tools payload stays owned by package helper scripts", () => {
    const repoRoot = join(import.meta.dir, "..");

    expect(discoverPackedToolPayloadFiles(repoRoot)).toEqual([
      "tools/ci_triage.ts",
      "tools/cli_json_registry_shim.ts",
      "tools/fuzz_artifact_repro.ts",
      "tools/fuzz_script_wrapper.ts",
      "tools/release_manifest.ts",
      "tools/release_smoke.ts",
      "tools/test_ci.ts",
    ]);

    const unaccounted = findUnaccountedPackedToolPayloadFiles(repoRoot);

    expect(formatUnaccountedPackedToolPayloadDiagnostics(unaccounted)).toBe("");
  });

  test("packed tools payload diagnostics name unowned files", () => {
    expect(
      formatUnaccountedPackedToolPayloadDiagnostics([
        "tools/test_only_helper.ts",
        "tools/local_debug_probe.ts",
      ]),
    ).toBe(
      [
        "Unaccounted packed tools payload:",
        "- tools/local_debug_probe.ts",
        "- tools/test_only_helper.ts",
        "Move test-only helpers under tests/helpers or add an explicit release ownership rule.",
      ].join("\n"),
    );
  });

  test("package helper dependency inventory is explicit and narrow", () => {
    const repoRoot = join(import.meta.dir, "..");
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    );
    const releaseManifestSource = readFileSync(
      join(repoRoot, "tools/release_manifest.ts"),
      "utf8",
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
    expect(releaseManifestSource).toContain("formatReleaseManifestHelp");
    expect(releaseManifestSource).not.toContain("../compiler/backend");
    expect(releaseManifestSource).not.toContain("../compiler/frontend");
    expect(releaseManifestSource).not.toContain("../compiler/middleend");
  });

  test("release smoke keeps playground helper assets source-only", () => {
    const repoRoot = join(import.meta.dir, "..");
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    );
    const sourceOnlyHelperFiles = [
      "playground/frontend/wasmHostAdapter.js",
      "playground/frontend/browserWasmRuntime.js",
      "playground/backend/processRunner.ts",
      "playground/backend/nativeExecution.ts",
      "playground/backend/wasmToolchain.ts",
    ];

    for (const helperFile of sourceOnlyHelperFiles) {
      expect(existsSync(join(repoRoot, helperFile))).toBe(true);
      expect(isIncludedInPackageFiles(helperFile, packageJson.files)).toBe(
        false,
      );
    }

    expectReleaseSmokeSourceContains([
      "playground/frontend/wasmHostAdapter.js",
      "playground/frontend/browserWasmRuntime.js",
      "playground/backend/processRunner.ts",
      "playground/backend/nativeExecution.ts",
      "playground/backend/wasmToolchain.ts",
      "npm tarball includes source-only files",
    ]);
  });

  test("package helper dependency discovery accepts extension and index import forms", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-helper-deps-test-"));

    try {
      mkdirSync(join(tempRoot, "tools"), { recursive: true });
      mkdirSync(join(tempRoot, "compiler", "common"), { recursive: true });
      mkdirSync(join(tempRoot, "shared"), { recursive: true });
      writeFileSync(
        join(tempRoot, "package.json"),
        JSON.stringify(
          {
            scripts: {
              explicit: "bun tools/explicit.ts",
              index: "bun tools/index_user.ts",
            },
          },
          null,
          2,
        ),
      );
      writeFileSync(
        join(tempRoot, "tools", "explicit.ts"),
        'import "../compiler/common/PathSafety.ts";\n',
      );
      writeFileSync(
        join(tempRoot, "tools", "index_user.ts"),
        'import { helper } from "../shared";\n',
      );
      writeFileSync(join(tempRoot, "compiler", "common", "PathSafety.ts"), "");
      writeFileSync(join(tempRoot, "shared", "index.ts"), "");

      expect(
        discoverPackageHelperDependencyFiles(
          tempRoot,
          ["tools/explicit.ts", "tools/index_user.ts"],
          [
            {
              importedBy: ["tools/explicit.ts"],
              path: "compiler/common/PathSafety.ts",
              reason: "explicit extension fixture",
            },
            {
              importedBy: ["tools/index_user.ts"],
              path: "shared/index.ts",
              reason: "directory index fixture",
            },
          ],
        ),
      ).toEqual(["compiler/common/PathSafety.ts", "shared/index.ts"]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("package helper dependency discovery reports importer and dependency for missing imports", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-helper-deps-missing-"));

    try {
      mkdirSync(join(tempRoot, "tools"), { recursive: true });
      mkdirSync(join(tempRoot, "shared"), { recursive: true });
      writeFileSync(
        join(tempRoot, "tools", "bad.ts"),
        'import "./other";\n',
      );
      writeFileSync(join(tempRoot, "shared", "index.ts"), "");

      expect(() =>
        discoverPackageHelperDependencyFiles(
          tempRoot,
          ["tools/bad.ts"],
          [
            {
              importedBy: ["tools/bad.ts"],
              path: "shared/index.ts",
              reason: "missing import fixture",
            },
          ],
        ),
      ).toThrow(
        /Package helper dependency importer does not import the declared dependency\.[\s\S]*dependency: shared\/index\.ts[\s\S]*importer: tools\/bad\.ts[\s\S]*expected import:/,
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
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
        "Package script helper file is missing or not a file: tools/missing_helper.ts (referenced by script missing:helper)",
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("release helper smoke validates packed fuzz repro JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI fuzz artifact repro JSON",
      '["run", "fuzz:repro", "--"',
      "--json",
      "schemaVersion",
      "bun run fuzz -- --iterations",
      "check packed npm CLI fuzz artifact repro flag value usage errors",
      "--json=true",
      "check packed npm CLI fuzz artifact repro empty input usage errors",
      "--input=",
      "check packed npm CLI fuzz artifact repro conflicting input usage errors",
      "Pass artifact path either positionally or with --input, not both.",
      "check packed npm CLI fuzz runner boolean usage errors",
      "minimize must be a boolean value",
      "check packed npm CLI fuzz runner empty value usage errors",
      "--iterations requires a non-empty value",
      "check packed npm CLI CI triage helper",
      "check packed npm CLI CI triage JSON",
      "check packed npm CLI CI triage inline JSON",
      "--jobs-json=ci-triage-jobs.json",
      "--run=26695335269",
      "--repo=pr0h0/bpl3",
      "check packed npm CLI CI triage flag value usage errors",
      "--json=true",
      "--json does not accept a value",
      "check packed npm CLI CI triage empty value usage errors",
      "--jobs-json=",
      "Missing value for --jobs-json",
      "bun test tests/TestCiRunner.test.ts",
      "bun tools/test_ci.ts --list",
      "check packed npm CLI CI triage root build no-input JSON",
      "check packed npm CLI registry subpath import",
      "check packed npm CLI registry TypeScript declarations",
      "BPL_BUILD_NO_INPUTS",
      'bun test tests/CLIJsonParseability.test.ts -t "root build JSON no-input"',
      'bun test tests/CLI.test.ts -t "no-input compile"',
      "parseCiTriageReport",
      "run.headSha",
      "checkout.status",
    ]);
  });

  test("release helper smoke validates packed CI timeout repro contracts", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI CI triage timeout JSON",
      "Package timeout metadata",
      "CLI JSON timeout metadata",
      "BPL_PACKAGE_TOOL_TIMEOUT_MS=300000 bun test tests/PackageManager.test.ts",
      'BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS=30000 bun test tests/CLI.test.ts -t "package IR verification"',
      "BPL_OBJECT_SYMBOL_TIMEOUT_MS=30000 bun test tests/ObjectFileParser.test.ts",
      'bun test tests/CLIJsonParseability.test.ts -t "module path diagnostic codes|missing explicit std imports"',
    ]);
  });

  test("release helper smoke validates packed CI sanitizer repro contracts", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI doctor sanitizer JSON",
      '["doctor", "sanitizer", "--json"]',
      "assertSanitizerDoctorContract",
      "check packed npm CLI CI triage sanitizer JSON",
      "Sanitizer timeout metadata",
      "bun run test:sanitizers",
      "bun test tests/CompilerSanitizerRuntime.test.ts",
      "bun index.ts doctor sanitizer --json",
    ]);
  });

  test("release helper smoke validates packed CI JSON-code mapping repro contracts", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI CI triage JSON-code mappings",
      "BPL_PACKAGE_ARCHIVE_NOT_FILE",
      "BPL_WASM_LINKER_UNAVAILABLE",
      "Standard library module not found: std/missing.bpl",
      "bun test tests/PackageJsonFailureContracts.test.ts",
      "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
      'bun test tests/ModuleResolver.test.ts -t "missing explicit std"',
      'bun test tests/CLI.test.ts -t "missing explicit std"',
      'bun test tests/CLIJsonParseability.test.ts -t "missing explicit std imports"',
      'bun test tests/MarkdownDocs.test.ts -t "std namespace isolation"',
    ]);
  });

  test("release smoke validates packed package import diagnostic codes", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI package import diagnostic code JSON",
      "check packed npm CLI package global search symlink JSON",
      "check packed npm CLI package local search non-directory JSON",
      "check packed npm CLI package workspace search non-directory JSON",
      "check packed npm CLI package global search non-directory JSON",
      "check packed npm CLI package import malformed manifest JSON",
      "check packed npm CLI package explicit source import JSON",
      "check packed npm CLI package directory index import JSON",
      "runPackedPackageImportDiagnosticCodeSmoke",
      "BPL_PACKAGE_MANIFEST_MISSING",
      "BPL_PACKAGE_SEARCH_DIR_SYMLINK",
      "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
      "Global package directory path is a symbolic link",
      "Global package directory path is not a directory",
      "package search directory is not a directory",
      "Move the symlink out of the way",
      "BPL_PACKAGE_MANIFEST_PARSE_ERROR",
      "manifest is not valid JSON",
      "pkg-math/features/add.bpl",
      "pkg-math/features/increment",
      '["check", "--json", "main.bpl"]',
      "parseCheckReport",
    ]);
  });

  test("release smoke stdout guards packed package subpath import labels", () => {
    expectReleaseSmokeTestSourceContains([
      "release smoke: check packed npm CLI package explicit source import JSON",
      "release smoke: check packed npm CLI package directory index import JSON",
    ]);
  });

  test("release smoke validates packed build validation error codes", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI build validation JSON",
      "runPackedBuildValidationJsonSmoke",
      "BPL_BUILD_OUTPUT_PARENT_NOT_FOUND",
      "BPL_BUILD_UNSUPPORTED_TARGET",
      "mips64-unknown-bpl",
      "parseBuildFailureReport",
      "--json",
      "--emit",
    ]);
  });

  test("release smoke validates packed root build no-input error codes", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI root build no-input JSON",
      "runPackedBuildNoInputJsonSmoke",
      "BPL_BUILD_NO_INPUTS",
      "No input files specified.",
      '["--json"]',
      "parseBuildFailureReport",
    ]);
  });

  test("release smoke validates packed clean validation error codes", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI clean validation JSON",
      "runPackedCleanValidationJsonSmoke",
      "BPL_CLEAN_GIT_TRACKED_UNAVAILABLE",
      "parseCleanFailureReport",
      '["clean", "--json"]',
      "fatal: simulated git failure",
    ]);
  });

  test("release smoke validates packed run-script validation error codes", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI run-script failure JSON",
      "runPackedRunScriptFailureJsonSmoke",
      "BPL_RUN_SCRIPT_MANIFEST_NOT_FOUND",
      "parseRunScriptFailureReport",
      '["run-script", "--list", "--json"]',
    ]);
  });

  test("release smoke validates packed check and lint validation error codes", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI check/lint validation JSON",
      "runPackedSourceAnalysisValidationJsonSmoke",
      "BPL_CHECK_INPUT_NOT_FILE",
      "BPL_LINT_INPUT_SYMLINK",
      "parseCheckReport",
      "parseLintReport",
      '["check", "--json"',
      '["lint", "--json"',
    ]);
  });

  test("release smoke validates packed format JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI format JSON",
      "runPackedFormatJsonSmoke",
      "parseFormatReport",
      'check: "format"',
      "BPL_FORMAT_NOT_FORMATTED",
      '["format", "--check", "--json"',
    ]);
  });

  test("release smoke validates packed bindgen JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI bindgen JSON",
      "runPackedBindgenJsonSmoke",
      "parseBindgenReport",
      'check: "bindgen"',
      "BPL_BINDGEN_OUTPUT_DIRECTORY",
      '["bindgen", "--json"',
    ]);
  });

  test("release smoke validates packed docs JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI docs JSON",
      "runPackedDocsJsonSmoke",
      "parseDocsReport",
      'check: "docs"',
      "BPL_DOCS_OUTPUT_DIRECTORY",
      '["docs", "--json"',
    ]);
  });

  test("release smoke validates packed completion JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI completion JSON",
      "check packed npm CLI completion unsupported-shell JSON",
      "runPackedCompletionJsonSmoke",
      "parseCompletionReport",
      'check: "completion"',
      "BPL_COMPLETION_SHELL_UNSUPPORTED",
      '["completion", "bash", "--json"]',
      '["completion", "fish", "--json"]',
    ]);
  });

  test("release smoke validates packed version JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI version JSON",
      "runPackedVersionJsonSmoke",
      "parseVersionReport",
      'check: "version"',
      '["--version", "--json"]',
      '["--json", "--version"]',
    ]);
  });

  test("release smoke validates packed forced-color JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI forced-color version JSON",
      "check packed npm CLI forced-color check failure JSON",
      "check packed npm CLI forced-color build failure JSON",
      "runPackedJsonColorPuritySmoke",
      "assertJsonValueHasNoAnsi",
      '["--color", "--version", "--json"]',
      '["build", "bad.bpl", "--json", "--color"]',
    ]);
  });

  test("release smoke validates packed CLI help output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI help output",
      "runPackedHelpSmoke",
      '["--help"]',
      '["build", "--help"]',
      '["check", "--help"]',
      '["package-cache", "--help"]',
    ]);
  });

  test("release smoke validates packed check and lint no-input error codes", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI check/lint no-input JSON",
      "runPackedSourceAnalysisNoInputJsonSmoke",
      "BPL_CHECK_NO_INPUTS",
      "BPL_LINT_NO_INPUTS",
      "parseCheckReport",
      "parseLintReport",
      '["check", "--json"]',
      '["lint", "--json"]',
    ]);
  });

  test("release smoke guards packed sanitizer doctor JSON contract", async () => {
    const releaseSmoke = (await import("../tools/release_smoke")) as {
      assertSanitizerDoctorContract?: (report: unknown) => void;
    };
    const assertSanitizerDoctorContract =
      releaseSmoke.assertSanitizerDoctorContract;

    expect(typeof assertSanitizerDoctorContract).toBe("function");
    if (typeof assertSanitizerDoctorContract !== "function") {
      return;
    }

    const report = {
      schemaVersion: 1,
      check: "toolchain",
      success: true,
      checks: [
        {
          id: "sanitizer-runtime-support",
          name: "sanitizer runtime support",
          ok: false,
          detail: "clang: cannot find libclang_rt.asan-x86_64.a",
          required: false,
          code: "BPL_SANITIZER_RUNTIME_UNAVAILABLE",
          environment: {
            BPL_CC: "/tmp/clang",
            CC: null,
          },
          recommendedCommands: [
            "bun run test:sanitizers",
            "bun test tests/CompilerSanitizerRuntime.test.ts",
          ],
          hint:
            "Install compiler-rt runtime support for ASan/UBSan and libclang_rt.",
        },
      ],
    };

    expect(() => assertSanitizerDoctorContract(report)).not.toThrow();
    expect(() =>
      assertSanitizerDoctorContract({
        ...report,
        checks: [
          {
            ...report.checks[0],
            recommendedCommands: ["bun run test:sanitizers"],
          },
        ],
      }),
    ).toThrow(
      "sanitizer check missing repro command: bun test tests/CompilerSanitizerRuntime.test.ts",
    );
  });

  test("CI-safe tests keep release helper smoke focused", () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(packageJson.scripts["test:ci"]).toBe("bun tools/test_ci.ts");
    expect(CI_SAFE_EXCLUDED_TEST_FILES).toContain("ReleaseSmoke.test.ts");
    expect(CI_SAFE_EXCLUDED_TEST_FILES).not.toContain(
      "ReleaseHelperSmoke.test.ts",
    );
    expect(packageJson.scripts["release:check"]).toContain(
      "bun run release:cli-registry",
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

  test("release smoke validates packed doctor scope JSON error code", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI doctor failure JSON",
      "BPL_DOCTOR_SCOPE_UNKNOWN",
      "parseDoctorFailureReport",
      "errorCode",
    ]);
  });

  test("release smoke validates packed package install JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI package install JSON",
      "parsePackageInstallReport",
      'check: "package-install"',
    ]);
  });

  test("release smoke validates packed package pack JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI package pack JSON",
      "runPackedPackagePackJsonSmoke",
      "parsePackagePackReport",
      'check: "package-pack"',
      "BPL_PACKAGE_MANIFEST_MISSING",
      '["pack", missingManifestDir, "--json"]',
    ]);
  });

  test("release smoke validates packed package init JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI package init JSON",
      "runPackedPackageInitJsonSmoke",
      "parsePackageInitReport",
      'check: "package-init"',
      "BPL_PACKAGE_INIT_NAME_INVALID",
      "BPL_PACKAGE_INIT_MANIFEST_EXISTS",
      '["init", "Bad_Name", "--json"]',
    ]);
  });

  test("release smoke validates packed bpl new JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI bpl new JSON",
      "runPackedProjectNewJsonSmoke",
      "parseProjectNewReport",
      'check: "project-new"',
      "BPL_NEW_TEMPLATE_INVALID",
      "BPL_NEW_PATH_EXISTS_DIRECTORY",
      "release-smoke-new-json",
      "--no-git",
    ]);
  });

  test("release smoke validates packed package uninstall JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI package uninstall JSON",
      "runPackedPackageUninstallJsonSmoke",
      "parsePackageUninstallReport",
      'check: "package-uninstall"',
      "BPL_PACKAGE_UNINSTALL_NOT_INSTALLED",
      '["remove", "missing-release-smoke-uninstall", "--json"]',
    ]);
  });

  test("release smoke validates packed package manifest validation error codes", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI package manifest validation JSON",
      "runPackedPackageManifestValidationJsonSmoke",
      "BPL_PACKAGE_MANIFEST_MISSING",
      "BPL_PACKAGE_MANIFEST_MAIN_INVALID",
      '["install", "--json"]',
      "parsePackageInstallReport",
    ]);
  });

  test("release smoke validates packed global package list JSON output", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI global package list JSON",
      "check packed npm CLI global package list tree JSON",
      "runPackedPackageListJsonSmoke",
      "parsePackageListReport",
      "parsePackageListTreeReport",
      '["list", "--global", "--json"]',
      '["list", "--global", "--tree", "--json"]',
    ]);
  });

  test("release smoke validates packed package-cache validation error codes", () => {
    expectReleaseSmokeSourceContains([
      "check packed npm CLI package-cache validation JSON",
      "check packed npm CLI package-cache maintenance JSON",
      "runPackedPackageCacheMaintenanceJsonSmoke",
      "runPackedPackageCacheValidationJsonSmoke",
      "runPackedPackageCacheNameValidationJsonSmoke",
      "BPL_PACKAGE_CACHE_VERSION_INVALID",
      "BPL_PACKAGE_CACHE_NAME_INVALID",
      '["package-cache", "list", "Bad_Name", "--json"]',
      '["package-cache", "verify", "Bad_Name", "--json"]',
      '["package-cache", "clean", "Bad_Name", "--dry-run", "--json"]',
      '["package-cache", "repair", "Bad_Name", "--dry-run", "--json"]',
      '["package-cache", "clean", "--dry-run", "--json"]',
      '["package-cache", "repair", "--dry-run", "--json"]',
      '["package-cache", "clean", "pkg", "--package-version", "^1.0.0", "--dry-run", "--json"]',
      '["package-cache", "repair", "pkg", "--package-version", "latest", "--dry-run", "--json"]',
      "parsePackageCacheListReport",
      "parsePackageCacheVerifyReport",
      "parsePackageCacheCleanReport",
      "parsePackageCacheRepairReport",
    ]);
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
      expect(byPath.get("tools/release_smoke.ts")).toMatchObject({
        kind: "helper",
        sha256: createHash("sha256")
          .update("release smoke helper\n")
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

  test("release manifest fixture discovers helper references with script names", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-release-ref-fixture-"));

    try {
      writeReleaseFixture(tempRoot);

      expect(
        discoverPackageScriptHelperReferences(tempRoot).map(
          ({ scriptName, helperPath }) => [scriptName, helperPath],
        ),
      ).toEqual([
        ["ci:triage", "tools/ci_triage.ts"],
        ["fuzz", "tools/fuzz_script_wrapper.ts"],
        ["fuzz:differential", "tools/fuzz_script_wrapper.ts"],
        ["fuzz:long", "tools/fuzz_script_wrapper.ts"],
        ["fuzz:promote", "tools/fuzz_script_wrapper.ts"],
        ["fuzz:replay", "tools/fuzz_script_wrapper.ts"],
        ["fuzz:repro", "tools/fuzz_artifact_repro.ts"],
        ["release:manifest", "tools/release_manifest.ts"],
        ["release:smoke", "tools/release_smoke.ts"],
      ]);
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

  test("release manifest CLI reports usage errors before running release steps", () => {
    const cases: Array<[string[], string]> = [
      [["--unknown"], "Unknown release manifest option: --unknown"],
      [["--out"], "Missing value for --out"],
      [["--out", "--pack-npm"], "Missing value for --out"],
      [["--out="], "Missing value for --out"],
      [["--repo-root"], "Missing value for --repo-root"],
      [["--repo-root", "--pack-npm"], "Missing value for --repo-root"],
      [["--repo-root="], "Missing value for --repo-root"],
      [["--pack-npm=true"], "--pack-npm does not accept a value"],
    ];

    for (const [args, expectedError] of cases) {
      const result = spawnSync("bun", ["tools/release_manifest.ts", ...args], {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(expectedError);
      expect(result.stderr).not.toContain("npm pack failed");
      expect(result.stderr).not.toContain("Release manifest written");
    }
  });

  test("release manifest CLI accepts inline option values", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-release-manifest-inline-test-"),
    );

    try {
      writeReleaseFixture(tempRoot);
      const manifestPath = join(tempRoot, "dist", "inline-manifest.json");
      const result = spawnSync(
        "bun",
        [
          "tools/release_manifest.ts",
          `--repo-root=${tempRoot}`,
          `--out=${manifestPath}`,
        ],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(
        `Release manifest written to ${manifestPath}`,
      );
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      expect(manifest.package).toMatchObject({
        name: "bpl-v3",
        version: "9.9.9",
      });
      expect(
        manifest.artifacts.map((artifact: { path: string }) => artifact.path),
      ).toContain("lib/runtime_wasm_host.ll");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("release manifest CLI prints help without running release steps", () => {
    const result = spawnSync("bun", ["tools/release_manifest.ts", "--help"], {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Usage: bun tools/release_manifest.ts [--out file] [--repo-root dir] [--pack-npm]",
    );
    expect(result.stdout).toContain("--out file");
    expect(result.stdout).toContain("--repo-root dir");
    expect(result.stdout).toContain("--pack-npm");
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("Release manifest written");
    expect(result.stderr).not.toContain("npm pack failed");
  });
});

function isIncludedInPackageFiles(
  filePath: string,
  packageFiles: readonly string[],
): boolean {
  return packageFiles.some(
    (entry) => filePath === entry || filePath.startsWith(`${entry}/`),
  );
}

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
          "release:smoke": "bun tools/release_smoke.ts",
          "release:manifest": "bun tools/release_manifest.ts --out dist/release-manifest.json --pack-npm",
          fuzz: "bun tools/fuzz_script_wrapper.ts run",
          "fuzz:long": "FUZZ_ITERATIONS=100000 bun tools/fuzz_script_wrapper.ts run",
          "fuzz:differential": "FUZZ_DIFFERENTIAL=1 bun tools/fuzz_script_wrapper.ts run",
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
    join(tempRoot, "tools", "release_smoke.ts"),
    "release smoke helper\n",
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
