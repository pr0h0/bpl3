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
    expect(workflow).toContain("actions/checkout@v6");
    expect(workflow).not.toContain("actions/checkout@v4");
    expect(workflow).toContain("oven-sh/setup-bun@v2");
    expect(workflow).toContain("bun install --frozen-lockfile");
    expect(workflow).toContain("npm ci --prefix vscode-ext");
    expect(workflow).toContain("bun run check");
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
    expect(packageJson.scripts["fuzz:replay"]).toContain(
      "fuzz/replay_crash.ts",
    );
    expect(packageJson.scripts["fuzz:validate-artifacts"]).toBe(
      "bun test tests/FuzzFailureArtifactCorpus.test.ts",
    );

    const runFuzzIndex = workflow.indexOf("Run deterministic compiler fuzz");
    const differentialIndex = workflow.indexOf(
      "Run deterministic differential compiler fuzz",
    );
    const minimizeIndex = workflow.indexOf("Minimize fuzz crash artifacts");
    const uploadIndex = workflow.indexOf("Upload fuzz crash artifacts");

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
    expect(workflow).toContain("bun run test:correctness");
    expect(workflow).toContain("bun run test:sanitizers");
    expect(workflow).toContain("Windows parser/typecheck/codegen smoke");
    expect(workflow).toContain("bun run test:codegen-cross-platform");
    expect(workflow).toContain(
      "sudo apt-get install -y clang llvm lld libclang-rt-dev clang-18 llvm-18 lld-18 libclang-rt-18-dev",
    );
    expect(workflow).toContain("Install WebAssembly linker (macOS Apple clang)");
    expect(workflow).toContain("Configure WebAssembly linker");
    expect(workflow).toContain("WASM_LD=$(command -v wasm-ld)");
    expect(workflow).toContain("brew install llvm lld");
    expect(workflow).toContain("brew install lld");
    expect(workflow).toContain('echo "$(brew --prefix lld)/bin"');
    expect(workflow).toContain("WASM_LD=$(brew --prefix lld)/bin/wasm-ld");
    expect(workflow).toContain('"$WASM_LD" --version');
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
    const workflowPath = join(
      import.meta.dir,
      "../.github/workflows/compiler-correctness.yml",
    );
    const workflow = readFileSync(workflowPath, "utf8");
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(packageJson.scripts["test:ci"]).toContain("bun run build:runtime");
    expect(packageJson.scripts["test:ci"]).toContain("Integration.test.ts");
    expect(packageJson.scripts["test:ci"]).toContain(
      "PlaygroundExamples.test.ts",
    );
    expect(packageJson.scripts["test:ci"]).toContain("bun run test:vscode-ext");
    expect(packageJson.scripts["test:vscode-ext"]).toBe(
      "npm test --prefix vscode-ext",
    );
    expect(packageJson.scripts["test:ci"]).toContain("! -name 'fuzz.test.ts'");
    expect(packageJson.scripts["test:ci"]).toContain(
      "! -name 'CompilerCorrectnessCorpus.test.ts'",
    );
    expect(packageJson.scripts["test:ci"]).toContain(
      "! -name 'FuzzDifferentialRegressionCorpus.test.ts'",
    );
    expect(packageJson.scripts["test:ci"]).toContain(
      "! -name 'CompilerSanitizerRuntime.test.ts'",
    );
    expect(packageJson.scripts["test:ci"]).toContain(
      "! -name 'ReleaseSmoke.test.ts'",
    );

    expect(workflow).toContain("Run CI-safe test suite");
    expect(workflow).toContain("bun run test:ci");
    expect(workflow).toContain("npm ci --prefix vscode-ext");

    const typecheckIndex = workflow.indexOf("Type check");
    const ciSuiteIndex = workflow.indexOf("Run CI-safe test suite");
    const correctnessIndex = workflow.indexOf("Run compiler correctness tests");

    expect(ciSuiteIndex).toBeGreaterThan(typecheckIndex);
    expect(correctnessIndex).toBeGreaterThan(ciSuiteIndex);
  });

  test("VS Code extension package test script runs Bun tests by directory", () => {
    const extensionPackageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../vscode-ext/package.json"), "utf8"),
    );

    expect(extensionPackageJson.scripts.test).toBe("bun test ./src/test");
    expect(extensionPackageJson.dependencies).toHaveProperty(
      "vscode-languageserver-textdocument",
    );
  });

  test("sanitizer runtime tests have an explicit timeout for slower CI runners", () => {
    const sanitizerTest = readFileSync(
      join(import.meta.dir, "CompilerSanitizerRuntime.test.ts"),
      "utf8",
    );

    expect(sanitizerTest).toContain("SANITIZER_RUNTIME_TEST_TIMEOUT_MS");
    expect(sanitizerTest).toContain("30 * 1000");
  });
});
