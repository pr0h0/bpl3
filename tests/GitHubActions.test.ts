import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  CI_SAFE_EXCLUDED_TEST_FILES,
  CI_SAFE_FIXED_TEST_FILES,
  createTestCiPlan,
} from "../tools/test_ci";

const WORKFLOW_DIR = join(import.meta.dir, "../.github/workflows");
const MAINTAINED_ACTION_MAJOR_VERSIONS: Record<string, number> = {
  "actions/checkout": 6,
  "actions/upload-artifact": 4,
  "oven-sh/setup-bun": 2,
};

function readWorkflow(name: string): string {
  return readFileSync(join(WORKFLOW_DIR, name), "utf8");
}

function listWorkflowNames(): string[] {
  return readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
}

function extractActionUses(workflow: string): Array<{
  action: string;
  version: string;
}> {
  return [...workflow.matchAll(/^\s*uses:\s*([^@\s]+)@([^\s#]+)/gm)].map(
    (match) => ({
      action: match[1]!,
      version: match[2]!,
    }),
  );
}

describe("GitHub Actions workflows", () => {
  test("compiler workflows keep JavaScript actions on maintained Node 24-compatible versions", () => {
    for (const workflowName of listWorkflowNames()) {
      const workflow = readWorkflow(workflowName);

      expect(workflow).toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true");

      for (const { action, version } of extractActionUses(workflow)) {
        expect(MAINTAINED_ACTION_MAJOR_VERSIONS[action]).toBeDefined();
        expect(version).toMatch(/^v\d+$/);
        expect(Number(version.slice(1))).toBeGreaterThanOrEqual(
          MAINTAINED_ACTION_MAJOR_VERSIONS[action]!,
        );
      }
    }
  });

  test("nightly compiler fuzz workflow runs long fuzz and uploads crash artifacts", () => {
    const workflow = readWorkflow("compiler-fuzz.yml");
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("actions/checkout@v6");
    expect(workflow).not.toContain("actions/checkout@v4");
    expect(workflow).toContain("oven-sh/setup-bun@v2");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("npm ci --prefix vscode-ext");
    expect(workflow).toContain("bun run build:runtime");
    expect(workflow).toContain("bun run check");
    expect(workflow).toContain("bun run lint");
    expect(workflow).toContain("Run workflow contract tests");
    expect(workflow).toContain("bun test tests/GitHubActions.test.ts");
    expect(workflow).toContain("bun run fuzz:long");
    expect(workflow).toContain("bun run fuzz:differential");
    expect(workflow).toContain("FUZZ_SEEDS");
    expect(workflow).toContain("0x5eed1234,0xc0ffee,0xbad5eed");
    expect(workflow).toContain("FUZZ_DIFFERENTIAL_SEEDS");
    expect(workflow).toContain("0xd1ff0,0xd1ff1,0xd1ff2");
    expect(workflow).toContain('FUZZ_MINIMIZE: "1"');
    expect(workflow).toContain("FUZZ_MINIMIZE_PASSES");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("fuzz/crashes");
    expect(workflow).toContain("if: always()");
    expect(packageJson.scripts["fuzz:long"]).toContain("FUZZ_SEEDS");
    expect(packageJson.scripts["fuzz:differential"]).toContain(
      "FUZZ_DIFFERENTIAL=1",
    );
    expect(packageJson.scripts["fuzz:differential"]).toContain(
      "FUZZ_DIFFERENTIAL_ITERATIONS:-48",
    );
    expect(packageJson.scripts["fuzz:differential"]).toContain(
      "FUZZ_PROGRESS=${FUZZ_DIFFERENTIAL_PROGRESS:-12}",
    );
    expect(packageJson.scripts["fuzz:long"]).not.toContain(
      "FUZZ_DIFFERENTIAL_PROGRESS",
    );
    expect(packageJson.scripts["fuzz:replay"]).toContain(
      "tools/fuzz_script_wrapper.ts replay",
    );
    expect(packageJson.scripts["fuzz:validate-artifacts"]).toBe(
      "bun test tests/FuzzFailureArtifactCorpus.test.ts",
    );

    const buildRuntimeIndex = workflow.indexOf("Build runtime support");
    const typeCheckIndex = workflow.indexOf("Type check");
    const lintIndex = workflow.indexOf("Lint");
    const workflowContractIndex = workflow.indexOf(
      "Run workflow contract tests",
    );
    const runFuzzIndex = workflow.indexOf("Run deterministic compiler fuzz");
    const differentialIndex = workflow.indexOf(
      "Run deterministic differential compiler fuzz",
    );
    const minimizeIndex = workflow.indexOf("Minimize fuzz crash artifacts");
    const uploadIndex = workflow.indexOf("Upload fuzz crash artifacts");

    expect(typeCheckIndex).toBeGreaterThan(buildRuntimeIndex);
    expect(lintIndex).toBeGreaterThan(typeCheckIndex);
    expect(workflowContractIndex).toBeGreaterThan(lintIndex);
    expect(runFuzzIndex).toBeGreaterThan(workflowContractIndex);
    expect(runFuzzIndex).toBeGreaterThan(buildRuntimeIndex);
    expect(differentialIndex).toBeGreaterThan(runFuzzIndex);
    expect(minimizeIndex).toBeGreaterThan(differentialIndex);
    expect(minimizeIndex).toBeGreaterThan(runFuzzIndex);
    expect(uploadIndex).toBeGreaterThan(minimizeIndex);
    expect(workflow).toContain("if: failure()");
    expect(workflow).toContain("shopt -s nullglob");
    expect(workflow).toContain('for metadata in "$FUZZ_CRASH_DIR"/*.json; do');
    expect(workflow).toContain(
      'bun run fuzz:replay -- --metadata "$metadata" --minimize --out "$out"',
    );
  });

  test("compiler correctness workflow runs cross-platform toolchain matrix coverage", () => {
    const workflow = readWorkflow("compiler-correctness.yml");
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(workflow).toContain("name: Compiler Correctness");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("fail-fast: false");
    expect(workflow).toContain("ubuntu-24.04");
    expect(workflow).toContain("macos-15");
    expect(workflow).toContain("windows-latest");
    expect(workflow).toContain("ubuntu-clang-18");
    expect(workflow).toContain("macos-brew-llvm");
    expect(workflow).toContain("runtime_build: debug");
    expect(workflow).toContain("runtime_build: release");
    expect(workflow).toContain(
      "BPL_RUNTIME_BUILD: ${{ matrix.runtime_build }}",
    );
    expect(workflow).toContain("CC: ${{ matrix.cc }}");
    expect(workflow).toContain("actions/checkout@v6");
    expect(workflow).not.toContain("actions/checkout@v4");
    expect(workflow).toContain("oven-sh/setup-bun@v2");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("npm ci --prefix vscode-ext");
    expect(workflow).toContain("bun run check");
    expect(workflow).toContain("bun run lint");
    expect(workflow).toContain("bun run test:correctness");
    expect(workflow).toContain("bun run test:sanitizers");
    expect(workflow).toContain("Windows parser/typecheck/codegen smoke");
    expect(workflow).toContain("bun run test:codegen-cross-platform");
    expect(workflow).toContain(
      "sudo apt-get install -y clang llvm lld libclang-rt-dev clang-18 llvm-18 lld-18 libclang-rt-18-dev",
    );
    expect(workflow).toContain(
      "Install WebAssembly toolchain (macOS Apple clang)",
    );
    expect(workflow).toContain("Configure WebAssembly toolchain");
    expect(workflow).toContain("BPL_WASM_CC=$(brew --prefix llvm)/bin/clang");
    expect(workflow).toContain("WASM_LD=$(command -v wasm-ld)");
    expect(workflow).toContain("brew install llvm lld");
    expect(workflow).toContain('echo "$(brew --prefix lld)/bin"');
    expect(workflow).toContain("WASM_LD=$(brew --prefix lld)/bin/wasm-ld");
    expect(workflow).toContain('"$WASM_LD" --version');
    expect(workflow).toContain('"${BPL_WASM_CC:-clang}" --version');
    expect(workflow).not.toContain(
      "wasm-ld --version || wasm-ld-18 --version || true",
    );
    expect(workflow).toContain("Run WebAssembly runtime tests");
    expect(workflow).toContain('BPL_REQUIRE_WASM_LD: "1"');
    expect(workflow).toContain("bun run test:wasm");
    expect(workflow).toContain("Run CI-safe test suite");
    expect(workflow).toContain("if: matrix.ci_safe == true");
    expect(workflow).toContain("Validate saved fuzz failure artifacts");
    expect(workflow).toContain("bun run fuzz:validate-artifacts");
    expect(packageJson.scripts["test:correctness"]).toContain(
      "bun run build:runtime && bun test",
    );
    expect(packageJson.scripts["test:correctness"]).toContain(
      "CompilerCorrectnessCorpus.test.ts",
    );
    expect(packageJson.scripts["test:correctness"]).toContain(
      "FuzzRegressionCorpus.test.ts",
    );
    expect(packageJson.scripts["test:correctness"]).toContain(
      "FuzzDifferentialRegressionCorpus.test.ts",
    );
    expect(packageJson.scripts["test:correctness"]).toContain(
      "CompilerCorrectnessSeededFuzz.test.ts",
    );
    expect(packageJson.scripts["test:correctness"]).toContain(
      "CompilerRuntimeFailureSemantics.test.ts",
    );
    expect(packageJson.scripts["test:correctness"]).toContain(
      "LlvmVerifier.test.ts",
    );
    expect(packageJson.scripts["test:correctness"]).toContain(
      "FuzzFailureArtifactCorpus.test.ts",
    );
    expect(packageJson.scripts["test:correctness"]).toContain(
      "WasmRuntime.test.ts",
    );
    expect(packageJson.scripts["test:correctness"]).toContain(
      "WasmCompatibilitySweep.test.ts",
    );
    expect(packageJson.scripts["test:wasm"]).toContain("WasmRuntime.test.ts");
    expect(packageJson.scripts["test:wasm"]).toContain(
      "WasmToolchain.test.ts",
    );
    expect(packageJson.scripts["test:wasm"]).toContain(
      "PlaygroundWasmToolchain.test.ts",
    );
    expect(packageJson.scripts["test:wasm"]).toContain(
      "PlaygroundWasmHostAdapter.test.ts",
    );
    expect(packageJson.scripts["test:wasm"]).toContain(
      "PlaygroundBrowserWasmRuntime.test.ts",
    );
    expect(packageJson.scripts["test:wasm"]).toContain(
      "PlaygroundStaticAssets.test.ts",
    );
    expect(packageJson.scripts["test:wasm"]).toContain(
      "PlaygroundWasmExamples.test.ts",
    );
    expect(packageJson.scripts["test:wasm"]).toContain(
      "WasmHostImportContract.test.ts",
    );
    expect(packageJson.scripts["test:wasm"]).toContain(
      "WasmHostedPrintfRuntime.test.ts",
    );
    expect(packageJson.scripts["test:sanitizers"]).toContain(
      "CompilerSanitizerRuntime.test.ts",
    );
    expect(packageJson.scripts["test:codegen-cross-platform"]).toContain(
      "CrossPlatformCodegen.test.ts",
    );
    expect(packageJson.scripts["test:codegen-cross-platform"]).toContain(
      "CodeGen_SignedOverflow.test.ts",
    );
    expect(packageJson.scripts["test:codegen-cross-platform"]).toContain(
      "CodeGen_RawPointerInbounds.test.ts",
    );
    expect(packageJson.scripts["test:codegen-cross-platform"]).toContain(
      "GoldenLLVMShapes.test.ts",
    );
  });

  test("compiler correctness workflow runs a broad CI-safe test suite before correctness", () => {
    const workflow = readWorkflow("compiler-correctness.yml");
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(packageJson.scripts["test:ci"]).toBe("bun tools/test_ci.ts");
    expect(CI_SAFE_FIXED_TEST_FILES).toEqual([
      "tests/PlaygroundExampleContracts.test.ts",
      "tests/Integration.test.ts",
      "tests/PlaygroundExamples.test.ts",
    ]);
    expect(
      createTestCiPlan().map((step) => [step.command, ...step.args]),
    ).toEqual(
      expect.arrayContaining([
        ["bun", "run", "build:runtime"],
        [
          "bun",
          "test",
          "tests/PlaygroundExampleContracts.test.ts",
          "tests/Integration.test.ts",
          "tests/PlaygroundExamples.test.ts",
        ],
        ["bun", "run", "test:vscode-ext"],
      ]),
    );
    expect(packageJson.scripts["test:vscode-ext"]).toBe(
      "npm test --prefix vscode-ext",
    );
    expect(CI_SAFE_EXCLUDED_TEST_FILES).toContain("fuzz.test.ts");
    expect(CI_SAFE_EXCLUDED_TEST_FILES).toContain(
      "CompilerCorrectnessCorpus.test.ts",
    );
    expect(CI_SAFE_EXCLUDED_TEST_FILES).toContain(
      "FuzzDifferentialRegressionCorpus.test.ts",
    );
    expect(CI_SAFE_EXCLUDED_TEST_FILES).toContain(
      "CompilerSanitizerRuntime.test.ts",
    );
    expect(CI_SAFE_EXCLUDED_TEST_FILES).toContain("ReleaseSmoke.test.ts");
    expect(CI_SAFE_EXCLUDED_TEST_FILES).not.toContain(
      "ReleaseHelperSmoke.test.ts",
    );
    expect(CI_SAFE_EXCLUDED_TEST_FILES).not.toContain(
      "PackageHelperJsonContracts.test.ts",
    );
    expect(CI_SAFE_EXCLUDED_TEST_FILES).not.toContain(
      "PackageJsonFailureContracts.test.ts",
    );
    const ciSafeUnitArgs = createTestCiPlan()
      .find((step) => step.name === "Run CI-safe unit tests")
      ?.args.join(" ");
    expect(ciSafeUnitArgs).toContain("tests/StdlibCExterns.test.ts");
    expect(ciSafeUnitArgs).toContain("tests/ExampleExterns.test.ts");
    expect(
      existsSync(join(import.meta.dir, "ReleaseHelperSmoke.test.ts")),
    ).toBe(true);
    expect(
      existsSync(join(import.meta.dir, "PackageHelperJsonContracts.test.ts")),
    ).toBe(true);
    expect(
      existsSync(join(import.meta.dir, "PackageJsonFailureContracts.test.ts")),
    ).toBe(true);
    expect(packageJson.scripts["release:smoke"]).toBe(
      "bun tools/release_smoke.ts",
    );
    expect(packageJson.scripts["release:check"]).toContain(
      "bun run release:cli-registry",
    );
    expect(packageJson.scripts["release:check"]).toContain(
      "bun run release:smoke",
    );

    expect(workflow).toContain("Run CI-safe test suite");
    expect(workflow).toContain("bun run test:ci");
    expect(workflow).toContain("npm ci --prefix vscode-ext");

    const typecheckIndex = workflow.indexOf("Type check");
    const lintIndex = workflow.indexOf("Lint");
    const ciSuiteIndex = workflow.indexOf("Run CI-safe test suite");
    const correctnessIndex = workflow.indexOf("Run compiler correctness tests");

    expect(lintIndex).toBeGreaterThan(typecheckIndex);
    expect(ciSuiteIndex).toBeGreaterThan(typecheckIndex);
    expect(ciSuiteIndex).toBeGreaterThan(lintIndex);
    expect(correctnessIndex).toBeGreaterThan(ciSuiteIndex);
  });

  test("VS Code extension package test script type-checks tests before Bun", () => {
    const extensionPackageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../vscode-ext/package.json"), "utf8"),
    );

    expect(extensionPackageJson.scripts["compile:test"]).toBe(
      "tsc --project tsconfig.test.json",
    );
    expect(extensionPackageJson.scripts.test).toBe(
      "npm run compile:test && bun test ./src/test",
    );
    expect(extensionPackageJson.dependencies).toHaveProperty(
      "vscode-languageserver-textdocument",
    );
  });

  test("sanitizer runtime tests have an explicit timeout for slower CI runners", () => {
    const sanitizerTest = readFileSync(
      join(import.meta.dir, "CompilerSanitizerRuntime.test.ts"),
      "utf8",
    );
    const timeoutEnv = readFileSync(
      join(import.meta.dir, "../compiler/common/Env.ts"),
      "utf8",
    );

    expect(sanitizerTest).toContain("SANITIZER_RUNTIME_TEST_TIMEOUT_MS");
    expect(sanitizerTest).toContain("getSanitizerRuntimeTestTimeoutMs");
    expect(sanitizerTest).toContain(
      "const sanitizerSupport = checkBplSanitizerSupport();",
    );
    expect(sanitizerTest).toContain(
      "const sanitizerTest = sanitizerSupport.supported ? test : test.skip;",
    );
    expect(sanitizerTest).toContain("sanitizerTest(");
    expect(sanitizerTest).toContain("SANITIZER_RUNTIME_TEST_TIMEOUT_MS,\n  );");
    expect(timeoutEnv).toContain("SANITIZER_RUNTIME_TEST_TIMEOUT_MS: 30000");
  });
});
