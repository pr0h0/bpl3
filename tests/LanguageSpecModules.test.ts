import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics, runSpecModules } from "./helpers/languageSpec";

// Executable checks for LANGUAGE_SPEC.md sections 3 (Func/Lambda C ABI),
// 10 (modules), and 11 (inline assembly).

const LIBRARY_MODULE = `global counter: int = 41;
global hidden: int = 7;
export { MAX_USERS };
export counter;
global const MAX_USERS: int = 100;

struct Config {
    level: int,
}

spec Disposable {
    frame dispose(this: *Self) ret int;
}

type UserId = int;

frame process(c: Config) ret int {
    return c.level + helper();
}

frame helper() ret int {
    return 1;
}

export process;
export [Config];
export [Disposable];
export [UserId];
export undefinedExport;
`;

describe("language specification: modules", () => {
  // spec: R-MOD-1, R-MOD-2, R-MOD-3, R-MOD-5, R-MOD-6, R-MOD-7
  test("exports, import forms, aliases, namespaces, and path resolution", () => {
    const main = `import process, [Config], [Disposable], { MAX_USERS }, counter from "./lib.bpl";
import [UserId] from "./lib.bpl";
import process as run from "./lib.bpl";
import * as lib from "./lib.bpl";
import printf from "std/c.bpl";

struct Resource : Disposable {
    id: int,
    frame dispose(this: *Resource) ret int { return this.id; }
}

frame main() ret int {
    local c: Config = Config { level: 2 };
    local user: UserId = 5;
    local resource: Resource = Resource { id: 3 };
    printf("%d %d %d %d %d %d %d\\n", process(c), MAX_USERS, counter, user, resource.dispose(), run(c), lib.process(c));
    return 0;
}
`;
    const sideEffect = `import "./lib.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    printf("%d\\n", process(Config { level: 4 }));
    return 0;
}
`;
    for (const level of [0, 3] as const) {
      const result = runSpecModules(
        { "lib.bpl": LIBRARY_MODULE, "main.bpl": main },
        "main.bpl",
        level,
      );
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("3 100 41 5 3 3 3\n");

      const imported = runSpecModules(
        { "lib.bpl": LIBRARY_MODULE, "side_effect.bpl": sideEffect },
        "side_effect.bpl",
        level,
      );
      expect(imported.exitCode).toBe(0);
      expect(imported.stdout).toBe("5\n");
    }
  }, 120000);

  // spec: R-MOD-1, R-MOD-2, R-MOD-4, R-MOD-5
  test("rejects private symbols, undefined exports, and export syntax outside the grammar", () => {
    const directory = mkdtempSync(join(tmpdir(), "bpl-spec-modules-check-"));
    try {
      writeFileSync(join(directory, "lib.bpl"), LIBRARY_MODULE);
      const cases: Record<string, { source: string; expected: string }> = {
        "private_value.bpl": {
          source:
            'import hidden from "./lib.bpl";\nframe main() ret int { return hidden; }\n',
          expected: "BPL_IMPORT_EXPORT_NOT_FOUND",
        },
        "private_function.bpl": {
          source:
            'import helper from "./lib.bpl";\nframe main() ret int { return helper(); }\n',
          expected: "BPL_IMPORT_EXPORT_NOT_FOUND",
        },
        "missing_module.bpl": {
          source:
            'import foo from "./nope.bpl";\nframe main() ret int { return foo(); }\n',
          expected: "BPL_MODULE_NOT_FOUND",
        },
        "namespace_private.bpl": {
          source:
            'import * as lib from "./lib.bpl";\nframe main() ret int { return lib.helper(); }\n',
          expected: "Module has no exported member 'helper'",
        },
        "undefined_export.bpl": {
          source:
            'import undefinedExport from "./lib.bpl";\nframe main() ret int { return undefinedExport(); }\n',
          expected: "BPL_IMPORT_EXPORT_NOT_FOUND",
        },
        "inline_export.bpl": {
          source:
            "export frame f() ret int { return 1; }\nframe main() ret int { return f(); }\n",
          expected: "Unexpected syntax",
        },
        "export_list.bpl": {
          source:
            "frame f() ret int { return 1; }\nframe g() ret int { return 2; }\nexport f, g;\nframe main() ret int { return f() + g(); }\n",
          expected: "Unexpected syntax",
        },
      };
      for (const [file, testCase] of Object.entries(cases)) {
        writeFileSync(join(directory, file), testCase.source);
      }
      const result = spawnSync(
        process.execPath,
        [
          resolve(import.meta.dir, "../index.ts"),
          "check",
          ...Object.keys(cases),
          "--json",
        ],
        { cwd: directory, encoding: "utf8", timeout: 120000 },
      );
      const report = JSON.parse(result.stdout) as {
        files: {
          file: string;
          diagnostics?: { code?: string; message?: string }[];
        }[];
      };
      for (const [file, testCase] of Object.entries(cases)) {
        const diagnostics =
          report.files.find((candidate) => candidate.file === file)
            ?.diagnostics ?? [];
        expect(
          diagnostics.some(
            (diagnostic) =>
              diagnostic.code === testCase.expected ||
              (diagnostic.message ?? "").includes(testCase.expected),
          ),
          `${file}: ${JSON.stringify(diagnostics)}`,
        ).toBe(true);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 120000);
});

describe("language specification: C ABI for callables", () => {
  // spec: R-ABI-3
  test("passes a Func to C as a raw function pointer", () => {
    expectCorrectnessSuite([
      {
        name: "func-c-callback",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
extern qsort(base: *void, count: ulong, size: ulong, compare: Func<int>(*void, *void));
frame compareInts(a: *void, b: *void) ret int {
  local x: *int = cast<*int>(a);
  local y: *int = cast<*int>(b);
  return *x - *y;
}
frame main() ret int {
  local values: int[4] = [3, 1, 4, 2];
  qsort(cast<*void>(&values[0]), 4, 4, compareInts);
  printf("%d %d %d %d\\n", values[0], values[1], values[2], values[3]);
  return 0;
}`,
        expectedStdout: "1 2 3 4\n",
      },
    ]);
  }, 120000);

  // spec: R-ABI-4
  test("rejects Lambda values in extern signatures", () => {
    expectCheckDiagnostics([
      {
        name: "lambda-extern-parameter",
        source:
          "extern takes(callback: Lambda<int>(int));\nframe main() ret int { return 0; }\n",
        code: "BPL_EXTERN_ABI_UNSUPPORTED",
      },
    ]);
  }, 120000);
});

describe("language specification: inline assembly", () => {
  // spec: R-ASM-1, R-ASM-2
  test("llvm and raw flavors inject IR with variable interpolation", () => {
    expectCorrectnessSuite([
      {
        name: "llvm-asm",
        validateLlvm: true,
        source: `extern printf(fmt: string, ...);
global g: int = 0;
frame main() ret int {
  local d: int = 0;
  local e: int = 0;
  local f: int = 0;
  local target: int = 1;
  local pointer: *int = &target;
  local slotTarget: int = 0;
  local slotPointer: *int = &slotTarget;
  asm {
    "store i32 5, i32* (d)"
  }
  asm("llvm") {
    store i32 6, i32* (e)
  }
  asm("raw") {
    "store i32 7, i32* (f)"
  }
  asm("llvm") {
    "store i32 8, i32* (g)"
    "store i32 9, i32* (pointer)"
    "%spec_loaded = load i32*, i32** (&slotPointer)"
    "store i32 10, i32* %spec_loaded"
  }
  printf("%d %d %d %d %d %d\\n", d, e, f, g, target, slotTarget);
  return 0;
}`,
        expectedStdout: "5 6 7 8 9 10\n",
      },
    ]);
  }, 120000);

  // spec: R-ASM-3, R-ASM-4, R-ASM-5
  test.skipIf(process.arch !== "x64")(
    "intel and att flavors pass inputs, outputs, addresses, constraints, and clobbers",
    () => {
      expectCorrectnessSuite([
        {
          name: "x86-asm",
          validateLlvm: true,
          source: `extern printf(fmt: string, ...);
frame main() ret int {
  local a: int = 10;
  local b: int = 20;
  local r1: int = 0;
  local r2: int = 0;
  local r3: int = 0;
  local r4: int = 0;
  local r5: int = 0;
  local r6: int = 0;
  asm("intel") {
    mov eax, (a)
    add eax, (b)
    mov (=r1), eax
  }
  asm("x86") {
    "mov eax, (a)"
    "add eax, 1"
    mov (=r2), eax
  }
  asm("att") {
    movl (b), %eax
    addl $2, %eax
    movl %eax, (=r3)
  }
  asm("intel") {
    mov eax, (a: "{ebx}")
    mov (=r4: "={ecx}"), eax
    [ "eax" ]
  }
  asm("intel") {
    mov rax, (&a)
    mov eax, dword ptr [rax]
    inc eax
    mov (=r5), eax
  }
  asm("att") {
    movq (&b), %rax
    movl (%rax), %eax
    movl %eax, (=r6)
  }
  printf("%d %d %d %d %d %d\\n", r1, r2, r3, r4, r5, r6);
  return 0;
}`,
          expectedStdout: "30 11 22 10 11 20\n",
        },
      ]);
    },
    120000,
  );

  // spec: R-ASM-1, R-ASM-6
  test("rejects unknown flavors and undefined operands", () => {
    expectCheckDiagnostics([
      {
        name: "unknown-flavor",
        source:
          'frame main() ret int { local d: int = 0; asm("foo") { "store i32 5, i32* (d)" } return d; }\n',
        message: "Unknown asm flavor 'foo'",
      },
      {
        name: "undefined-operand",
        source:
          'frame main() ret int { asm("intel") { mov eax, (missing) } return 0; }\n',
        message: "Undefined variable 'missing' in asm block",
      },
    ]);
  }, 120000);
});
