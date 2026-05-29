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

function findStandaloneWasmLinker(): string | undefined {
  return WASM_LINKER_CANDIDATES.find((candidate) => {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    return result.status === 0;
  });
}

const standaloneWasmLinker = findStandaloneWasmLinker();
const wasmIt = standaloneWasmLinker ? it : it.skip;

async function compileWasm(source: string): Promise<WasmExports> {
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-runtime-"));
  const sourcePath = join(dir, "main.bpl");
  const wasmPath = join(dir, "main.wasm");
  writeFileSync(sourcePath, source);

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
        cwd: dir,
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
    const exports = await compileWasm(`
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

  wasmIt("runs freestanding string helpers through runtime_wasm", async () => {
    const exports = await compileWasm(`
extern strlen(value: string) ret long;
extern strcmp(left: string, right: string) ret int;

frame main() ret int {
    local len: long = strlen("bpl");
    local same: int = strcmp("bpl", "bpl");
    local different: int = strcmp("bpl", "bpm");
    if (same != 0) {
        return 1000;
    }
    if (different >= 0) {
        return 2000;
    }
    return cast<int>(len);
}
`);

    expect(getMain(exports)(0, 0)).toBe(3);
  });

  wasmIt("runs freestanding allocation helpers through runtime_wasm", async () => {
    const exports = await compileWasm(`
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
    const exports = await compileWasm(`
frame main() ret int {
    local zero: int = 0;
    return 10 / zero;
}
`);

    expect(() => getMain(exports)(0, 0)).toThrow(WebAssembly.RuntimeError);
  });
});
