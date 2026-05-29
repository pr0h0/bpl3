import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join, relative, resolve } from "path";

const BPL_CLI = resolve(__dirname, "../index.ts");
const EXAMPLES_DIR = resolve(__dirname, "../examples");
const WASM_LINKER_CANDIDATES = [
  process.env.WASM_LD,
  "wasm-ld",
  "wasm-ld-18",
  "wasm-ld-17",
  "wasm-ld-16",
  "ld.lld",
].filter((candidate): candidate is string => Boolean(candidate));

const KNOWN_WASM_COMPATIBLE = [
  "examples/bug_043_lambda_inference/main.bpl",
  "examples/bug_044_generic_recursion/main.bpl",
  "examples/enum_complex_match/main.bpl",
  "examples/enum_exhaustiveness/main.bpl",
  "examples/enum_imports/wildcard/main.bpl",
  "examples/enum_imports_wildcard/main.bpl",
  "examples/enum_methods_simple/main.bpl",
  "examples/enum_mixed_variants/main.bpl",
  "examples/enum_struct_variants/main.bpl",
  "examples/enum_test/all_variants/main.bpl",
  "examples/enum_test/data_variants/main.bpl",
  "examples/enum_test/enum_return/main.bpl",
  "examples/enum_test/simple_tuple/main.bpl",
  "examples/enum_test/unit_only/main.bpl",
  "examples/lint_test/main.bpl",
  "examples/wasm_control_flow/main.bpl",
  "examples/wasm_lambdas_generics/main.bpl",
  "examples/wasm_memory_strings/main.bpl",
  "examples/wasm_memory_intrinsics/main.bpl",
  "examples/wasm_stdlib_array/main.bpl",
  "examples/wasm_stdlib_bitset/main.bpl",
];

type WasmBuildClassification =
  | "ok"
  | "host-api"
  | "target-specific-source"
  | "compile-or-type-error"
  | "linker-unavailable"
  | "other-build-failure";

function findStandaloneWasmLinker(): string | undefined {
  return WASM_LINKER_CANDIDATES.find((candidate) => {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    return result.status === 0;
  });
}

function findExampleEntrypoints(dir = EXAMPLES_DIR): string[] {
  const results: string[] = [];

  for (const name of readdirSync(dir)) {
    if (name === "bpl_modules" || name === "node_modules") {
      continue;
    }

    const fullPath = join(dir, name);
    const stat = statSync(fullPath);
    if (!stat.isDirectory()) {
      continue;
    }

    const mainFile = join(fullPath, "main.bpl");
    if (existsSync(mainFile)) {
      results.push(relative(process.cwd(), mainFile));
    }

    results.push(...findExampleEntrypoints(fullPath));
  }

  return results.sort();
}

function classifyWasmBuildResult(result: {
  status: number | null;
  stdout: string;
  stderr: string;
}): WasmBuildClassification {
  if (result.status === 0) {
    return "ok";
  }

  const output = `${result.stdout}\n${result.stderr}`;
  if (/wasm linker.*unavailable|unable to find.*wasm|ENOENT.*(wasm-ld|ld\.lld)/i.test(output)) {
    return "linker-unavailable";
  }
  if (
    /undefined symbol: (printf|fprintf|sprintf|snprintf|dprintf|fopen|fclose|fread|fwrite|socket|bind|listen|accept|connect|read|write|open|close|getenv|setenv|system|fork|exec|wait|dladdr|mmap|munmap|tcgetattr|tcsetattr|time|localtime)/.test(
      output,
    )
  ) {
    return "host-api";
  }
  if (
    /inline asm|invalid operand|invalid type for inline asm|unknown register|unsupported.*target|builtin_return_address/i.test(
      output,
    )
  ) {
    return "target-specific-source";
  }
  if (
    /error\[|Type mismatch|Undefined|Cannot|Expected|Parse|Lexer|Semantic|Type checking failed|Compilation failed/i.test(
      output,
    )
  ) {
    return "compile-or-type-error";
  }

  return "other-build-failure";
}

function buildWasmExample(file: string): WasmBuildClassification {
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-sweep-"));
  const wasmPath = join(dir, "main.wasm");

  try {
    const result = spawnSync(
      "bun",
      [
        BPL_CLI,
        "build",
        resolve(process.cwd(), file),
        "--target",
        "wasm32-unknown-unknown",
        "-o",
        wasmPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
        maxBuffer: 1024 * 1024 * 16,
      },
    );

    return classifyWasmBuildResult({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("WebAssembly compatibility sweep", () => {
  const standaloneWasmLinker = findStandaloneWasmLinker();
  const wasmIt = standaloneWasmLinker ? it : it.skip;

  it("discovers all example entrypoints and tracks known wasm-compatible examples", () => {
    const examples = findExampleEntrypoints();

    expect(examples.length).toBeGreaterThan(100);
    for (const file of KNOWN_WASM_COMPATIBLE) {
      expect(examples).toContain(file);
    }
  });

  wasmIt("builds the wasm-compatible example set and classifies representative unsupported examples", () => {
    for (const file of KNOWN_WASM_COMPATIBLE) {
      expect(buildWasmExample(file)).toBe("ok");
    }

    expect(buildWasmExample("examples/stdlib_fs/main.bpl")).toBe("host-api");
    expect(buildWasmExample("examples/asm_test/main.bpl")).toBe(
      "target-specific-source",
    );
  }, 60_000);
});
