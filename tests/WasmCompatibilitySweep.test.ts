import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "fs";
import { tmpdir } from "os";
import { join, relative, resolve } from "path";
import {
  WASM_COMPATIBILITY_MATRIX,
  WASM_FREESTANDING_EXAMPLES,
  WASM_HOSTED_EXAMPLES,
  type WasmCompatibilityEntry,
  type WasmCompatibilityMode,
} from "./helpers/wasmCompatibilityMatrix";

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

const EXPECTED_MODES: WasmCompatibilityMode[] = [
  "wasm-freestanding",
  "wasm-hosted",
  "blocked-by-host-api",
  "native-only",
];

type WasmBuildClassification =
  | "ok"
  | "host-api"
  | "target-specific-source"
  | "compile-or-type-error"
  | "linker-unavailable"
  | "other-build-failure";
interface WasmBuildResult {
  classification: WasmBuildClassification;
  imports: string[];
}

const HOST_API_IMPORTS = new Set([
  "accept",
  "bind",
  "close",
  "connect",
  "exec",
  "fclose",
  "fopen",
  "fork",
  "fread",
  "fwrite",
  "getenv",
  "listen",
  "localtime",
  "mmap",
  "munmap",
  "open",
  "read",
  "setenv",
  "socket",
  "system",
  "tcgetattr",
  "tcsetattr",
  "time",
  "wait",
  "write",
]);

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

function buildWasmExample(
  entryOrFile: WasmCompatibilityEntry | string,
): WasmBuildResult {
  const file =
    typeof entryOrFile === "string" ? entryOrFile : entryOrFile.file;
  const mode =
    typeof entryOrFile === "string" ? "wasm-freestanding" : entryOrFile.mode;
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-sweep-"));
  const wasmPath = join(dir, "main.wasm");
  const buildArgs = [
    BPL_CLI,
    "build",
    resolve(process.cwd(), file),
    "--target",
    "wasm32-unknown-unknown",
    "-o",
    wasmPath,
  ];

  if (mode === "wasm-hosted" || mode === "blocked-by-host-api") {
    buildArgs.push("--wasm-runtime", "host");
  }

  try {
    const result = spawnSync("bun", buildArgs, {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
      maxBuffer: 1024 * 1024 * 16,
    });

    const classification = classifyWasmBuildResult({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    if (classification !== "ok" || !existsSync(wasmPath)) {
      return { classification, imports: [] };
    }

    const module = new WebAssembly.Module(readFileSync(wasmPath));
    const imports = WebAssembly.Module.imports(module).map(
      (imported) => imported.name,
    );
    return { classification, imports };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("WebAssembly compatibility sweep", () => {
  const standaloneWasmLinker = findStandaloneWasmLinker();
  const wasmIt = standaloneWasmLinker ? it : it.skip;
  const requireWasmLinker = /^(1|true)$/i.test(
    process.env.BPL_REQUIRE_WASM_LD ?? "",
  );

  it("has a standalone wasm linker when required by CI", () => {
    if (requireWasmLinker && !standaloneWasmLinker) {
      throw new Error(
        [
          "BPL_REQUIRE_WASM_LD=1 requires a wasm linker.",
          `Checked candidates: ${WASM_LINKER_CANDIDATES.join(", ")}`,
          "Install LLVM lld or set WASM_LD to a working wasm-ld binary.",
        ].join("\n"),
      );
    }
  });

  it("discovers all example entrypoints and validates the wasm compatibility matrix", () => {
    const examples = findExampleEntrypoints();
    const matrixFiles = new Set<string>();
    const modes = new Set<WasmCompatibilityMode>();

    expect(examples.length).toBeGreaterThan(100);
    for (const entry of WASM_COMPATIBILITY_MATRIX) {
      expect(entry.reason.length).toBeGreaterThan(10);
      expect(examples).toContain(entry.file);
      expect(matrixFiles.has(entry.file)).toBe(false);
      matrixFiles.add(entry.file);
      modes.add(entry.mode);
    }

    for (const mode of EXPECTED_MODES) {
      expect(modes.has(mode)).toBe(true);
    }

    for (const file of examples.filter((example) =>
      example.split("/").some((part) => part.startsWith("wasm_")),
    )) {
      expect(matrixFiles.has(file)).toBe(true);
    }
  });

  wasmIt("builds the wasm-compatible example set and classifies representative unsupported examples", () => {
    for (const entry of [
      ...WASM_FREESTANDING_EXAMPLES,
      ...WASM_HOSTED_EXAMPLES,
    ]) {
      expect(buildWasmExample(entry).classification).toBe("ok");
    }

    for (const entry of WASM_COMPATIBILITY_MATRIX) {
      if (entry.mode === "blocked-by-host-api") {
        const result = buildWasmExample(entry);
        expect(["host-api", "ok"]).toContain(result.classification);
        if (result.classification === "ok") {
          expect(
            result.imports.some((importName) => HOST_API_IMPORTS.has(importName)),
          ).toBe(true);
        }
      } else if (entry.mode === "native-only") {
        expect(buildWasmExample(entry).classification).toBe(
          "target-specific-source",
        );
      }
    }
  }, 60_000);
});
