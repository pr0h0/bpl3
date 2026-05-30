import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  WASM_FREESTANDING_EXAMPLES,
  WASM_HOSTED_EXAMPLES,
} from "./helpers/wasmCompatibilityMatrix";

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
type WasmImportObject = Record<string, Record<string, unknown>>;
interface WasmExampleCase {
  file: string;
  expectedReturn: number;
}
interface HostedWasmExampleCase extends WasmExampleCase {
  argv: string[];
  expectedStdout: string;
  expectedStderr: string;
}
interface CompileWasmOptions {
  target?: string;
  wasmRuntime?: "freestanding" | "host";
  imports?: WasmImportObject;
}

const WASM_EXAMPLE_CORPUS: WasmExampleCase[] = WASM_FREESTANDING_EXAMPLES.map(
  (entry) => ({
    file: entry.file,
    expectedReturn: entry.expectedReturn ?? 0,
  }),
);
const HOSTED_WASM_EXAMPLE_CORPUS: HostedWasmExampleCase[] =
  WASM_HOSTED_EXAMPLES.map((entry) => ({
    file: entry.file,
    expectedReturn: entry.expectedReturn ?? 0,
    argv: entry.argv ?? [],
    expectedStdout: entry.expectedStdout ?? "",
    expectedStderr: entry.expectedStderr ?? "",
  }));
const REQUIRE_WASM_LINKER = /^(1|true)$/i.test(
  process.env.BPL_REQUIRE_WASM_LD ?? "",
);

function findStandaloneWasmLinker(): string | undefined {
  return WASM_LINKER_CANDIDATES.find((candidate) => {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    return result.status === 0;
  });
}

const standaloneWasmLinker = findStandaloneWasmLinker();
const wasmIt = standaloneWasmLinker ? it : it.skip;

async function compileWasmSource(
  source: string,
  options: CompileWasmOptions = {},
): Promise<WasmExports> {
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-runtime-"));
  const sourcePath = join(dir, "main.bpl");
  writeFileSync(sourcePath, source);

  try {
    return await compileWasmFile(sourcePath, options);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function compileWasmFile(
  sourcePath: string,
  options: CompileWasmOptions = {},
): Promise<WasmExports> {
  const dir = mkdtempSync(join(tmpdir(), "bpl-wasm-output-"));
  const wasmPath = join(dir, "main.wasm");
  const buildArgs = [
    BPL_CLI,
    "build",
    sourcePath,
    "--target",
    options.target ?? "wasm32-unknown-unknown",
    "-o",
    wasmPath,
  ];

  if (options.wasmRuntime) {
    buildArgs.push("--wasm-runtime", options.wasmRuntime);
  }

  try {
    const result = spawnSync("bun", buildArgs, {
      cwd: process.cwd(),
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
      maxBuffer: 1024 * 1024 * 16,
    });

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

    const instantiated: any = await WebAssembly.instantiate(
      bytes,
      (options.imports ?? {}) as any,
    );
    const instance =
      instantiated instanceof WebAssembly.Instance
        ? instantiated
        : instantiated.instance;
    return instance.exports as WasmExports;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

class WasmExit extends Error {
  constructor(readonly code: number) {
    super(`wasm exit(${code})`);
  }
}

function createHostImports(argv: string[] = []) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const encodedArgs = argv.map((arg) => encoder.encode(arg));
  const errors: Array<{
    code: number;
    detail: string | null;
    func: string | null;
    line: number;
    col: number;
  }> = [];
  let exports: WasmExports | undefined;
  let stdout = "";
  let stderr = "";

  function getMemory(): WebAssembly.Memory {
    const memory = exports?.memory;
    if (!(memory instanceof WebAssembly.Memory)) {
      throw new Error("Hosted wasm module did not export memory.");
    }
    return memory;
  }

  function readBytes(ptr: number, len: number): Uint8Array {
    return new Uint8Array(getMemory().buffer, ptr, len);
  }

  function readString(ptr: number): string | null {
    if (ptr === 0) {
      return null;
    }
    const memory = new Uint8Array(getMemory().buffer);
    let end = ptr;
    while (end < memory.length && memory[end] !== 0) {
      end++;
    }
    return decoder.decode(memory.subarray(ptr, end));
  }

  const imports: WasmImportObject = {
    env: {
      __bpl_host_write(fd: number, ptr: number, len: number) {
        const text = decoder.decode(readBytes(ptr, len));
        if (fd === 2) {
          stderr += text;
        } else {
          stdout += text;
        }
      },
      __bpl_host_exit(code: number) {
        throw new WasmExit(code);
      },
      __bpl_host_argc() {
        return encodedArgs.length;
      },
      __bpl_host_argv_len(index: number) {
        return encodedArgs[index]?.length ?? -1;
      },
      __bpl_host_argv_copy(index: number, ptr: number) {
        const arg = encodedArgs[index];
        if (!arg) {
          return;
        }
        readBytes(ptr, arg.length).set(arg);
      },
      __bpl_host_error(
        code: number,
        detailPtr: number,
        funcPtr: number,
        line: number,
        col: number,
      ) {
        errors.push({
          code,
          detail: readString(detailPtr),
          func: readString(funcPtr),
          line,
          col,
        });
      },
    },
  };

  return {
    imports,
    attach(moduleExports: WasmExports) {
      exports = moduleExports;
    },
    stdout: () => stdout,
    stderr: () => stderr,
    errors,
  };
}

function getMain(exports: WasmExports): MainExport {
  const main = exports.main;
  if (typeof main !== "function") {
    throw new Error("Standalone wasm module did not export main.");
  }
  return main as MainExport;
}

describe("WebAssembly runtime execution", () => {
  it("has a standalone wasm linker when required by CI", () => {
    if (REQUIRE_WASM_LINKER && !standaloneWasmLinker) {
      throw new Error(
        [
          "BPL_REQUIRE_WASM_LD=1 requires a wasm linker.",
          `Checked candidates: ${WASM_LINKER_CANDIDATES.join(", ")}`,
          "Install LLVM lld or set WASM_LD to a working wasm-ld binary.",
        ].join("\n"),
      );
    }
  });

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

  wasmIt("runs freestanding memory intrinsics through wasm lowering", async () => {
    const exports = await compileWasmSource(`
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern memset(dest: *void, value: int, size: int) ret *void;
extern memcpy(dest: *void, src: *void, size: int) ret *void;
extern memmove(dest: *void, src: *void, size: int) ret *void;

frame main() ret int {
    local buffer: *i8 = cast<*i8>(malloc(16));
    local copy: *i8 = cast<*i8>(malloc(16));
    local fill: int = 65;
    local size: int = 8;

    if (memset(cast<*void>(buffer), fill, size) != cast<*void>(buffer)) {
        return 1;
    }
    buffer[1] = cast<i8>(66);
    buffer[2] = cast<i8>(67);

    if (memcpy(cast<*void>(copy), cast<*void>(buffer), size) != cast<*void>(copy)) {
        return 2;
    }
    memmove(cast<*void>(copy + 2), cast<*void>(copy), 4);

    local result: int = cast<int>(copy[0]) + cast<int>(copy[1]) + cast<int>(copy[2]) + cast<int>(copy[3]);
    free(cast<*void>(buffer));
    free(cast<*void>(copy));

    if (result != 262) {
        return result;
    }
    return 0;
}
`);

    expect(getMain(exports)(0, 0)).toBe(0);
  });

  wasmIt("routes hosted wasm stdout and exit through host imports", async () => {
    const host = createHostImports();
    const exports = await compileWasmSource(
      `
extern printf(fmt: string, ...) ret int;
extern puts(value: string) ret int;
extern putchar(value: int) ret int;
extern exit(code: int) ret void;

frame main() ret int {
    printf("hello ");
    puts("wasm");
    putchar(33);
    exit(7);
    return 99;
}
`,
      { wasmRuntime: "host", imports: host.imports },
    );
    host.attach(exports);

    let exitCode: number | undefined;
    try {
      getMain(exports)(0, 0);
    } catch (error) {
      expect(error).toBeInstanceOf(WasmExit);
      exitCode = (error as WasmExit).code;
    }
    expect(exitCode).toBe(7);
    expect(host.stdout()).toBe("hello wasm\n!");
  });

  wasmIt("routes hosted wasm stdout and stderr through fd-based imports", async () => {
    const host = createHostImports();
    const exports = await compileWasmSource(
      `
extern dprintf(fd: int, fmt: string, ...) ret int;
extern write(fd: int, buf: *char, count: int) ret int;

frame main() ret int {
    local bang: char = '!';
    local outLen: int = dprintf(1, "stdout line\\n");
    local errLen: int = dprintf(2, "stderr line\\n");
    write(1, &bang, 1);
    if (outLen != 12) {
        return 1;
    }
    if (errLen != 12) {
        return 2;
    }
    return 0;
}
`,
      { wasmRuntime: "host", imports: host.imports },
    );
    host.attach(exports);

    expect(getMain(exports)(0, 0)).toBe(0);
    expect(host.stdout()).toBe("stdout line\n!");
    expect(host.stderr()).toBe("stderr line\n");
  });

  wasmIt("formats hosted wasm printf and dprintf dynamic arguments", async () => {
    const host = createHostImports();
    const exports = await compileWasmSource(
      `
extern printf(fmt: string, ...) ret int;
extern dprintf(fd: int, fmt: string, ...) ret int;

frame main() ret int {
    local name: string = "wasm";
    local marker: char = 'A';
    local outLen: int = printf("%s=%d%c\\n", name, 42, 33);
    local errLen: int = dprintf(2, "err:%d:%s%c\\n", -7, "ok", 63);
    local percentLen: int = printf("literal %% %c\\n", marker);

    if (outLen != 9) {
        return outLen;
    }
    if (errLen != 11) {
        return errLen;
    }
    if (percentLen != 12) {
        return percentLen;
    }
    return 0;
}
`,
      { wasmRuntime: "host", imports: host.imports },
    );
    host.attach(exports);

    expect(getMain(exports)(0, 0)).toBe(0);
    expect(host.stdout()).toBe("wasm=42!\nliteral % A\n");
    expect(host.stderr()).toBe("err:-7:ok?\n");
  });

  wasmIt("routes hosted wasm args through host imports", async () => {
    const host = createHostImports(["program", "left", "right"]);
    const exports = await compileWasmSource(
      `
extern __bpl_argc() ret int;
extern __bpl_argv_get(index: int) ret string;
extern strcmp(left: string, right: string) ret int;

frame main() ret int {
    if (__bpl_argc() != 3) {
        return 1;
    }
    if (strcmp(__bpl_argv_get(1), "left") != 0) {
        return 2;
    }
    if (strcmp(__bpl_argv_get(2), "right") != 0) {
        return 3;
    }
    return 0;
}
`,
      { wasmRuntime: "host", imports: host.imports },
    );
    host.attach(exports);

    expect(getMain(exports)(0, 0)).toBe(0);
  });

  wasmIt("runs hosted wasm argv through stdlib String helpers", async () => {
    const host = createHostImports(["program", "alpha", "beta"]);
    const exports = await compileWasmSource(
      `
import [String] from "std/string.bpl";

extern __bpl_argc() ret int;
extern __bpl_argv_get(index: int) ret string;

frame main() ret int {
    if (__bpl_argc() != 3) {
        return 10;
    }

    local first: String = String.new(__bpl_argv_get(1));
    local second: String = String.new(__bpl_argv_get(2));
    local result: int = first.length * 10 + second.length;
    first.destroy();
    second.destroy();
    return result;
}
`,
      { wasmRuntime: "host", imports: host.imports },
    );
    host.attach(exports);

    expect(getMain(exports)(0, 0)).toBe(54);
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

  wasmIt("reports checked runtime failures through hosted wasm error hooks", async () => {
    const host = createHostImports();
    const exports = await compileWasmSource(
      `
frame main() ret int {
    local zero: int = 0;
    return 10 / zero;
}
`,
      { wasmRuntime: "host", imports: host.imports },
    );
    host.attach(exports);

    expect(() => getMain(exports)(0, 0)).toThrow(WebAssembly.RuntimeError);
    expect(host.errors[0]?.code).toBe(3);
    expect(host.errors[0]?.func).toBe("main");
  });

  for (const testCase of [
    {
      name: "null access",
      code: 2,
      source: `
struct Pair {
    left: int,
}

frame main() ret int {
    local pair: *Pair = nullptr;
    return pair.left;
}
`,
    },
    {
      name: "index out of bounds",
      code: 5,
      source: `
frame main() ret int {
    local values: int[2] = [10, 20];
    return values[2];
}
`,
    },
  ]) {
    wasmIt(`reports hosted wasm checked ${testCase.name} errors`, async () => {
      const host = createHostImports();
      const exports = await compileWasmSource(testCase.source, {
        wasmRuntime: "host",
        imports: host.imports,
      });
      host.attach(exports);

      expect(() => getMain(exports)(0, 0)).toThrow(WebAssembly.RuntimeError);
      expect(host.errors[0]?.code).toBe(testCase.code);
      expect([host.errors[0]?.detail, host.errors[0]?.func]).toContain(
        testCase.name === "null access" ? "pair.left" : "main",
      );
    });
  }

  for (const testCase of HOSTED_WASM_EXAMPLE_CORPUS) {
    wasmIt(`executes hosted wasm-compatible example: ${testCase.file}`, async () => {
      const host = createHostImports(testCase.argv);
      const exports = await compileWasmFile(resolve(process.cwd(), testCase.file), {
        wasmRuntime: "host",
        imports: host.imports,
      });
      host.attach(exports);

      expect(getMain(exports)(0, 0)).toBe(testCase.expectedReturn);
      expect(host.stdout()).toBe(testCase.expectedStdout);
      expect(host.stderr()).toBe(testCase.expectedStderr);
    });
  }

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
