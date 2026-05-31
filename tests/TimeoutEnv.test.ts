import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { runExecutable } from "../cli/BinaryRunner";
import { getWasmLinkerProbeTimeoutMs } from "../cli/WasmToolchain";
import { getCompilerDriverTimeoutMs } from "../compiler/common/CompilerDriver";
import {
  getPackageArchiveToolTimeoutMs,
  PackageManager,
} from "../compiler/middleend/PackageManager";
import { ObjectFileParser } from "../compiler/middleend/ObjectFileParser";
import { writeNodeCommandShim } from "./helpers/executableShim";

const BPL_CLI = path.join(process.cwd(), "index.ts");

function captureWarnings(action: () => void): string[] {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };

  try {
    action();
  } finally {
    console.warn = originalWarn;
  }

  return warnings;
}

describe("timeout environment diagnostics", () => {
  const originalCompileDriverTimeout =
    process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS;
  const originalPackageToolTimeout = process.env.BPL_PACKAGE_TOOL_TIMEOUT_MS;
  const originalObjectSymbolTimeout = process.env.BPL_OBJECT_SYMBOL_TIMEOUT_MS;
  const originalRunTimeout = process.env.BPL_RUN_TIMEOUT_MS;
  const originalWasmLinkerProbeTimeout =
    process.env.BPL_WASM_LINKER_PROBE_TIMEOUT_MS;
  const originalBplNm = process.env.BPL_NM;

  afterEach(() => {
    restoreEnv("BPL_COMPILE_DRIVER_TIMEOUT_MS", originalCompileDriverTimeout);
    restoreEnv("BPL_PACKAGE_TOOL_TIMEOUT_MS", originalPackageToolTimeout);
    restoreEnv("BPL_OBJECT_SYMBOL_TIMEOUT_MS", originalObjectSymbolTimeout);
    restoreEnv("BPL_RUN_TIMEOUT_MS", originalRunTimeout);
    restoreEnv("BPL_WASM_LINKER_PROBE_TIMEOUT_MS", originalWasmLinkerProbeTimeout);
    restoreEnv("BPL_NM", originalBplNm);
  });

  test("shared positive-integer timeout env vars warn consistently", () => {
    const cases: Array<{
      name: string;
      envName: string;
      defaultMs: number;
      run: () => number;
    }> = [
      {
        name: "compiler driver",
        envName: "BPL_COMPILE_DRIVER_TIMEOUT_MS",
        defaultMs: 600000,
        run: getCompilerDriverTimeoutMs,
      },
      {
        name: "package archive tool",
        envName: "BPL_PACKAGE_TOOL_TIMEOUT_MS",
        defaultMs: 300000,
        run: getPackageArchiveToolTimeoutMs,
      },
      {
        name: "wasm linker probe",
        envName: "BPL_WASM_LINKER_PROBE_TIMEOUT_MS",
        defaultMs: 5000,
        run: () => getWasmLinkerProbeTimeoutMs(process.env, console.warn),
      },
    ];

    for (const testCase of cases) {
      process.env[testCase.envName] = "0";

      const warnings = captureWarnings(() => {
        expect(testCase.run(), testCase.name).toBe(testCase.defaultMs);
      });

      expect(warnings.join("\n"), testCase.name).toContain(
        `Ignoring invalid ${testCase.envName}=0; expected a positive integer; using ${testCase.defaultMs}ms`,
      );
    }
  });

  test("object symbol timeout invalid values explain the fallback", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-timeout-nm-"));

    try {
      const objectPath = path.join(tempDir, "sample.o");
      fs.writeFileSync(objectPath, "object");
      process.env.BPL_NM = writeNodeCommandShim(path.join(tempDir, "fake-nm"), [
        'console.log("0000000000000000 T exported_symbol");',
      ]);
      process.env.BPL_OBJECT_SYMBOL_TIMEOUT_MS = "0";

      const warnings = captureWarnings(() => {
        const symbols = ObjectFileParser.parseELFObject(objectPath);
        expect(symbols).toContainEqual({
          name: "exported_symbol",
          type: "function",
          isGlobal: true,
        });
      });

      expect(warnings.join("\n")).toContain(
        "Ignoring invalid BPL_OBJECT_SYMBOL_TIMEOUT_MS=0; expected a positive integer; using 30000ms",
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("run timeout invalid values explain that execution proceeds without a timeout", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-timeout-run-"));

    try {
      process.env.BPL_RUN_TIMEOUT_MS = "0";
      const missingExecutable = path.join(tempDir, "missing-program");

      const warnings = captureWarnings(() => {
        const result = runExecutable(missingExecutable);
        expect(result.success).toBe(false);
        expect(result.error).toContain("Executable not found");
      });

      expect(warnings.join("\n")).toContain(
        "Ignoring invalid BPL_RUN_TIMEOUT_MS=0; expected a positive integer; running without timeout",
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("package IR verify timeout invalid values explain the fallback in CLI output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-timeout-pack-"));
    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify(
        {
          name: "timeout-pack",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(tempDir, "index.bpl"),
      ["frame main() ret int {", "    return 0;", "}"].join("\n"),
    );

    try {
      const missingCompiler = path.join(tempDir, "missing-clang");
      const result = spawnSync("bun", [BPL_CLI, "pack"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          BPL_CC: missingCompiler,
          BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS: "0",
          NO_COLOR: "1",
        },
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain(
        "Ignoring invalid BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS=0; expected a positive integer; using 30000ms",
      );
      expect(result.stderr).toContain("Skipping IR verification");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("package archive timeout invalid values explain the fallback while packing", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-timeout-package-manager-"),
    );
    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify(
        {
          name: "archive-timeout-pack",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(tempDir, "index.bpl"),
      ["frame main() ret int {", "    return 0;", "}"].join("\n"),
    );

    try {
      process.env.BPL_PACKAGE_TOOL_TIMEOUT_MS = "0";

      const warnings = captureWarnings(() => {
        new PackageManager(tempDir).pack(tempDir);
      });

      expect(warnings.join("\n")).toContain(
        "Ignoring invalid BPL_PACKAGE_TOOL_TIMEOUT_MS=0; expected a positive integer; using 300000ms",
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("clean git timeout invalid values explain the fallback in CLI output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-timeout-clean-"));
    fs.writeFileSync(path.join(tempDir, "main.ll"), "define i32 @main() { ret i32 0 }\n");

    try {
      const result = spawnSync("bun", [BPL_CLI, "clean", "--dry-run"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          BPL_CLEAN_GIT_TIMEOUT_MS: "0",
          NO_COLOR: "1",
        },
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain(
        "Ignoring invalid BPL_CLEAN_GIT_TIMEOUT_MS=0; expected a positive integer; using 5000ms",
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
