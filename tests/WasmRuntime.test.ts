import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const BPL_CLI = resolve(__dirname, "../index.ts");
const WASM_LINKER_CANDIDATES = [
  process.env.WASM_LD,
  "wasm-ld",
  "wasm-ld-18",
  "wasm-ld-17",
  "wasm-ld-16",
  "ld.lld",
].filter((candidate): candidate is string => Boolean(candidate));

type MainExport = (argc: number, argv: number) => number;
type WasmExports = Record<string, unknown>;
interface WasmExampleCase {
  file: string;
  expectedReturn: number;
}

const WASM_EXAMPLE_CORPUS: WasmExampleCase[] = [
  { file: "examples/bug_043_lambda_inference/main.bpl", expectedReturn: 0 },
  { file: "examples/bug_044_generic_recursion/main.bpl", expectedReturn: 0 },
  { file: "examples/enum_complex_match/main.bpl", expectedReturn: 99 },
  { file: "examples/enum_exhaustiveness/main.bpl", expectedReturn: 27 },
  { file: "examples/enum_imports/wildcard/main.bpl", expectedReturn: 100 },
  { file: "examples/enum_imports_wildcard/main.bpl", expectedReturn: 100 },
  { file: "examples/enum_methods_simple/main.bpl", expectedReturn: 0 },
  { file: "examples/enum_mixed_variants/main.bpl", expectedReturn: 33 },
  { file: "examples/enum_struct_variants/main.bpl", expectedReturn: 58 },
  { file: "examples/enum_test/all_variants/main.bpl", expectedReturn: 6 },
  { file: "examples/enum_test/data_variants/main.bpl", expectedReturn: 0 },
  { file: "examples/enum_test/enum_return/main.bpl", expectedReturn: 2 },
  { file: "examples/enum_test/simple_tuple/main.bpl", expectedReturn: 0 },
  { file: "examples/enum_test/unit_only/main.bpl", expectedReturn: 0 },
  { file: "examples/lint_test/main.bpl", expectedReturn: 0 },
  { file: "examples/wasm_control_flow/main.bpl", expectedReturn: 0 },
  { file: "examples/wasm_lambdas_generics/main.bpl", expectedReturn: 0 },
  { file: "examples/wasm_memory_strings/main.bpl", expectedReturn: 0 },
];

function findStandaloneWasmLinker(): string | undefined {
  return WASM_LINKER_CANDIDATES.find((candidate) => {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    return result.status === 0;
  });
}

const standaloneWasmLinker = findStandaloneWasmLinker();
const wasmIt = standaloneWasmLinker ? it : it.skip;

async function compileWasmSource(source: string): Promise<WasmExports> {
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-runtime-"));
  const sourcePath = join(dir, "main.bpl");
  writeFileSync(sourcePath, source);

  try {
    return await compileWasmFile(sourcePath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function compileWasmFile(sourcePath: string): Promise<WasmExports> {
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-output-"));
  const wasmPath = join(dir, "main.wasm");

  try {
    const result = spawnSync(
      "bun",
      [
        BPL_CLI,
        "build",
        sourcePath,
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

    if (result.status !== 0) {
      throw new Error(
        [
          "Expected wasm build to succeed.",
          `status: ${result.status}`,
          result.stdout ? `stdout:\n${result.stdout}` : "",
          result.stderr ? `stderr:\n${result.stderr}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    expect(existsSync(wasmPath)).toBe(true);
    const bytes = readFileSync(wasmPath);
    expect(bytes.subarray(0, 4).toString("binary")).toBe("\0asm");

    const instantiated = await WebAssembly.instantiate(bytes, {});
    const instance =
      instantiated instanceof WebAssembly.Instance
        ? instantiated
        : instantiated.instance;
    return instance.exports as WasmExports;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function getMain(exports: WasmExports): MainExport {
  const main = exports.main;
  if (typeof main !== "function") {
    throw new Error("Standalone wasm module did not export main.");
  }
  return main as MainExport;
}

describe("WebAssembly runtime execution", () => {
  wasmIt("executes exported main from a standalone wasm artifact", async () => {
    const exports = await compileWasmSource(`
frame main() ret int {
    local total: int = 0;
    loop (local i: int = 0; i < 7; i = i + 1) {
        total = total + i;
    }
    return total * 2;
}
`);

    expect(getMain(exports)(0, 0)).toBe(42);
  });

  wasmIt("executes a mixed feature program as standalone wasm", async () => {
    const exports = await compileWasmSource(`
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(value: string) ret long;

struct Pair {
    left: int,
    right: int,

    frame sum(this: *Pair) ret int {
        return this.left + this.right;
    }
}

struct Box<T> {
    value: T,
}

enum Step {
    Add(int),
    Scale { factor: int },
    Stop,
}

frame fib(n: int) ret int {
    if (n < 2) {
        return n;
    }
    return fib(n - 1) + fib(n - 2);
}

frame apply(step: Step, value: int) ret int {
    return match (step) {
        Step.Add(amount) => value + amount,
        Step.Scale { factor: f } => value * f,
        Step.Stop => value,
    };
}

frame main() ret int {
    local pair: Pair = Pair { left: 8, right: 13 };
    local boxed: Box<int> = Box<int> { value: pair.sum() };
    local transform: Lambda<int>(int) = |x: int| {
        return x * 2 + 1;
    };
    local values: int[4] = [1, 2, 3, 4];
    local total: int = 0;

    loop (local i: int = 0; i < 4; i = i + 1) {
        total = total + values[i];
    }

    local raw: *i8 = cast<*i8>(malloc(4));
    raw[0] = cast<i8>(5);
    raw[1] = cast<i8>(7);
    local bytes: int = cast<int>(raw[0]) + cast<int>(raw[1]);
    free(cast<*void>(raw));

    local stepped: int = apply(Step.Scale { factor: 3 }, boxed.value);
    local added: int = apply(Step.Add(4), stepped);
    local stopped: int = apply(Step.Stop, added);

    return transform(total) + stopped + fib(6) + bytes + cast<int>(strlen("wasm"));
}
`);

    expect(getMain(exports)(0, 0)).toBe(112);
  });

  wasmIt("runs freestanding string helpers through runtime_wasm", async () => {
    const exports = await compileWasmSource(`
extern strlen(value: string) ret long;
extern strcmp(left: string, right: string) ret int;
extern strcpy(dest: string, src: string) ret string;
extern strcat(dest: string, src: string) ret string;
extern strncmp(left: string, right: string, count: long) ret int;
extern atoi(value: string) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

frame main() ret int {
    local buffer: string = cast<string>(malloc(32));
    strcpy(buffer, "bp");
    strcat(buffer, "l");

    if (strlen(buffer) != 3) {
        free(cast<*void>(buffer));
        return 1000;
    }
    if (strcmp(buffer, "bpl") != 0) {
        free(cast<*void>(buffer));
        return 2000;
    }
    if (strncmp(buffer, "bpm", 2) != 0) {
        free(cast<*void>(buffer));
        return 3000;
    }
    if (strncmp(buffer, "bpa", 3) <= 0) {
        free(cast<*void>(buffer));
        return 4000;
    }
    if (atoi(" -42xyz") != -42) {
        free(cast<*void>(buffer));
        return 5000;
    }

    free(cast<*void>(buffer));
    return 3;
}
`);

    expect(getMain(exports)(0, 0)).toBe(3);
  });

  wasmIt("runs freestanding allocation helpers through runtime_wasm", async () => {
    const exports = await compileWasmSource(`
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

frame main() ret int {
    local raw: *i8 = cast<*i8>(malloc(8));
    raw[0] = cast<i8>(40);
    raw[1] = cast<i8>(2);
    local total: int = cast<int>(raw[0]) + cast<int>(raw[1]);
    free(cast<*void>(raw));
    return total;
}
`);

    expect(getMain(exports)(0, 0)).toBe(42);
  });

  wasmIt("routes checked runtime failures to wasm traps", async () => {
    const exports = await compileWasmSource(`
frame main() ret int {
    local zero: int = 0;
    return 10 / zero;
}
`);

    expect(() => getMain(exports)(0, 0)).toThrow(WebAssembly.RuntimeError);
  });

  for (const testCase of WASM_EXAMPLE_CORPUS) {
    wasmIt(
      `executes wasm-compatible example: ${testCase.file}`,
      async () => {
        const exports = await compileWasmFile(
          resolve(process.cwd(), testCase.file),
        );
        expect(getMain(exports)(0, 0)).toBe(testCase.expectedReturn);
      },
    );
  }
});
