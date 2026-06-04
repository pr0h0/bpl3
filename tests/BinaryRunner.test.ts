import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  compileToBinary,
  getWasmRuntimeMode,
  runExecutable,
} from "../cli/BinaryRunner";
import { writeNodeCommandShim } from "./helpers/executableShim";

describe("BinaryRunner", () => {
  const originalBplHome = process.env.BPL_HOME;
  const originalBplCc = process.env.BPL_CC;
  const originalBplWasmCc = process.env.BPL_WASM_CC;
  const originalPath = process.env.PATH;
  const originalWasmLd = process.env.WASM_LD;
  const originalRequireWasmLd = process.env.BPL_REQUIRE_WASM_LD;
  const originalCompileDriverTimeout =
    process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS;
  const originalWasmLinkerProbeTimeout =
    process.env.BPL_WASM_LINKER_PROBE_TIMEOUT_MS;
  const originalRunTimeout = process.env.BPL_RUN_TIMEOUT_MS;

  test("selects wasm runtime mode from target components and explicit overrides", () => {
    expect(getWasmRuntimeMode({}, "wasm32-unknown-unknown")).toBe(
      "freestanding",
    );
    expect(getWasmRuntimeMode({}, "wasm32-wasi")).toBe("host");
    expect(getWasmRuntimeMode({}, "wasm32-wasip1")).toBe("host");
    expect(getWasmRuntimeMode({}, "wasm32-unknown-emscripten")).toBe("host");
    expect(
      getWasmRuntimeMode({ wasmRuntime: "host" }, "wasm32-unknown-unknown"),
    ).toBe("host");
    expect(
      getWasmRuntimeMode({ wasmRuntime: "freestanding" }, "wasm32-wasi"),
    ).toBe("freestanding");
  });

  test("does not select hosted wasm runtime mode from substring-only components", () => {
    expect(getWasmRuntimeMode({}, "wasm32-notwasi")).toBe("freestanding");
    expect(getWasmRuntimeMode({}, "wasm32-unknown-notemscripten")).toBe(
      "freestanding",
    );
  });

  afterEach(() => {
    if (originalBplHome === undefined) {
      delete process.env.BPL_HOME;
    } else {
      process.env.BPL_HOME = originalBplHome;
    }
    if (originalBplCc === undefined) {
      delete process.env.BPL_CC;
    } else {
      process.env.BPL_CC = originalBplCc;
    }
    if (originalBplWasmCc === undefined) {
      delete process.env.BPL_WASM_CC;
    } else {
      process.env.BPL_WASM_CC = originalBplWasmCc;
    }
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalWasmLd === undefined) {
      delete process.env.WASM_LD;
    } else {
      process.env.WASM_LD = originalWasmLd;
    }
    if (originalRequireWasmLd === undefined) {
      delete process.env.BPL_REQUIRE_WASM_LD;
    } else {
      process.env.BPL_REQUIRE_WASM_LD = originalRequireWasmLd;
    }
    if (originalCompileDriverTimeout === undefined) {
      delete process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS;
    } else {
      process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS = originalCompileDriverTimeout;
    }
    if (originalWasmLinkerProbeTimeout === undefined) {
      delete process.env.BPL_WASM_LINKER_PROBE_TIMEOUT_MS;
    } else {
      process.env.BPL_WASM_LINKER_PROBE_TIMEOUT_MS =
        originalWasmLinkerProbeTimeout;
    }
    if (originalRunTimeout === undefined) {
      delete process.env.BPL_RUN_TIMEOUT_MS;
    } else {
      process.env.BPL_RUN_TIMEOUT_MS = originalRunTimeout;
    }
  });

  test("reports missing LLVM IR inputs before invoking clang", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-binary-input-"));
    const irPath = path.join(tempDir, "missing.ll");

    try {
      process.env.BPL_CC = path.join(tempDir, "missing-cc");

      const result = compileToBinary(irPath, { skipRuntime: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("LLVM IR input not found");
      expect(result.error).toContain(irPath);
      expect(result.error).not.toContain("missing-cc");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports directory LLVM IR inputs before output validation", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-binary-dir-"));
    const irPath = path.join(tempDir, "main.ll");

    try {
      fs.mkdirSync(irPath);

      const result = compileToBinary(irPath, { skipRuntime: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("LLVM IR input is not a file");
      expect(result.error).toContain(irPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports malformed native runtime inputs before invoking clang", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-binary-runner-"));
    const bplHome = path.join(tempDir, "bpl-home");
    const libDir = path.join(bplHome, "lib");
    const irPath = path.join(tempDir, "main.ll");

    try {
      fs.mkdirSync(path.join(libDir, "runtime.ll"), { recursive: true });
      fs.writeFileSync(
        irPath,
        [
          "declare void @__bpl_throw_stack_overflow()",
          "define i32 @main() {",
          "entry:",
          "  call void @__bpl_throw_stack_overflow()",
          "  ret i32 0",
          "}",
          "",
        ].join("\n"),
      );
      process.env.BPL_HOME = bplHome;

      const result = compileToBinary(irPath, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Runtime IR is not a file");
      expect(result.error).toContain(path.join(libDir, "runtime.ll"));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("links native builds with a cached runtime object instead of recompiling runtime.ll", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-runtime-cache-"),
    );
    const bplHome = path.join(tempDir, "bpl-home");
    const libDir = path.join(bplHome, "lib");
    const irPath = path.join(tempDir, "main.ll");
    const compilerLogPath = path.join(tempDir, "compiler.log");
    const fakeCompiler = path.join(tempDir, "fake-cc.js");

    try {
      fs.mkdirSync(libDir, { recursive: true });
      fs.writeFileSync(
        path.join(libDir, "runtime.ll"),
        "define void @__bpl_runtime_stub() { ret void }\n",
      );
      fs.writeFileSync(path.join(libDir, "runtime_support.o"), "obj\n");
      fs.writeFileSync(
        irPath,
        [
          "declare void @__bpl_throw_stack_overflow()",
          "define i32 @main() {",
          "entry:",
          "  call void @__bpl_throw_stack_overflow()",
          "  ret i32 0",
          "}",
          "",
        ].join("\n"),
      );
      writeNodeCommandShim(fakeCompiler, [
        "const fs = require('fs');",
        "const args = process.argv.slice(2);",
        `fs.appendFileSync(${JSON.stringify(compilerLogPath)}, args.join(' ') + '\\n');`,
        "const outputIndex = args.indexOf('-o');",
        "if (outputIndex >= 0) fs.writeFileSync(args[outputIndex + 1], 'out\\n');",
      ]);
      process.env.BPL_HOME = bplHome;
      process.env.BPL_CC = fakeCompiler;

      const result = compileToBinary(irPath, {});

      expect(result.success).toBe(true);
      const invocations = fs
        .readFileSync(compilerLogPath, "utf8")
        .trim()
        .split("\n");
      const runtimeCompileArgs = invocations[0]!;
      const finalLinkArgs = invocations.at(-1)!;
      expect(runtimeCompileArgs).toContain("-ffunction-sections");
      expect(runtimeCompileArgs).toContain("-fdata-sections");
      expect(finalLinkArgs).not.toContain(path.join(libDir, "runtime.ll"));
      expect(finalLinkArgs).toContain(".o");
      expect(finalLinkArgs).toContain(path.join(libDir, "runtime_support.o"));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("skips native runtime files when IR has no BPL runtime references", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-runtime-skip-"),
    );
    const bplHome = path.join(tempDir, "bpl-home");
    const libDir = path.join(bplHome, "lib");
    const irPath = path.join(tempDir, "main.ll");
    const compilerLogPath = path.join(tempDir, "compiler.log");
    const fakeCompiler = path.join(tempDir, "fake-cc.js");

    try {
      fs.mkdirSync(libDir, { recursive: true });
      fs.writeFileSync(
        path.join(libDir, "runtime.ll"),
        "define void @__bpl_runtime_stub() { ret void }\n",
      );
      fs.writeFileSync(path.join(libDir, "runtime_support.o"), "obj\n");
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      writeNodeCommandShim(fakeCompiler, [
        "const fs = require('fs');",
        "const args = process.argv.slice(2);",
        `fs.appendFileSync(${JSON.stringify(compilerLogPath)}, args.join(' ') + '\\n');`,
        "const outputIndex = args.indexOf('-o');",
        "if (outputIndex >= 0) fs.writeFileSync(args[outputIndex + 1], 'out\\n');",
      ]);
      process.env.BPL_HOME = bplHome;
      process.env.BPL_CC = fakeCompiler;

      const result = compileToBinary(irPath, {});

      expect(result.success).toBe(true);
      const invocations = fs
        .readFileSync(compilerLogPath, "utf8")
        .trim()
        .split("\n");
      expect(invocations).toHaveLength(1);
      const finalLinkArgs = invocations[0]!;
      expect(finalLinkArgs).not.toContain(path.join(libDir, "runtime.ll"));
      expect(finalLinkArgs).not.toContain(".o");
      expect(finalLinkArgs).not.toContain(path.join(libDir, "runtime_support.o"));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("keeps native runtime files when IR references BPL runtime helpers", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-runtime-keep-"),
    );
    const bplHome = path.join(tempDir, "bpl-home");
    const libDir = path.join(bplHome, "lib");
    const irPath = path.join(tempDir, "main.ll");
    const compilerLogPath = path.join(tempDir, "compiler.log");
    const fakeCompiler = path.join(tempDir, "fake-cc.js");

    try {
      fs.mkdirSync(libDir, { recursive: true });
      fs.writeFileSync(
        path.join(libDir, "runtime.ll"),
        "define void @__bpl_runtime_stub() { ret void }\n",
      );
      fs.writeFileSync(path.join(libDir, "runtime_support.o"), "obj\n");
      fs.writeFileSync(
        irPath,
        [
          "declare void @__bpl_throw_stack_overflow()",
          "define i32 @main() {",
          "entry:",
          "  call void @__bpl_throw_stack_overflow()",
          "  ret i32 0",
          "}",
          "",
        ].join("\n"),
      );
      writeNodeCommandShim(fakeCompiler, [
        "const fs = require('fs');",
        "const args = process.argv.slice(2);",
        `fs.appendFileSync(${JSON.stringify(compilerLogPath)}, args.join(' ') + '\\n');`,
        "const outputIndex = args.indexOf('-o');",
        "if (outputIndex >= 0) fs.writeFileSync(args[outputIndex + 1], 'out\\n');",
      ]);
      process.env.BPL_HOME = bplHome;
      process.env.BPL_CC = fakeCompiler;

      const result = compileToBinary(irPath, {});

      expect(result.success).toBe(true);
      const finalLinkArgs = fs
        .readFileSync(compilerLogPath, "utf8")
        .trim()
        .split("\n")
        .at(-1)!;
      expect(finalLinkArgs).not.toContain(path.join(libDir, "runtime.ll"));
      expect(finalLinkArgs).toContain(".o");
      expect(finalLinkArgs).toContain(path.join(libDir, "runtime_support.o"));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("rejects native runtime inputs reached through symlinked parent directories", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-runtime-parent-link-"),
    );
    const bplHome = path.join(tempDir, "bpl-home");
    const runtimeTarget = path.join(tempDir, "runtime-target");
    const libLink = path.join(bplHome, "lib");
    const irPath = path.join(tempDir, "main.ll");

    try {
      fs.mkdirSync(bplHome, { recursive: true });
      fs.mkdirSync(runtimeTarget);
      fs.symlinkSync(runtimeTarget, libLink, "dir");
      fs.writeFileSync(
        path.join(runtimeTarget, "runtime.ll"),
        "define void @__bpl_runtime_stub() { ret void }\n",
      );
      fs.writeFileSync(path.join(runtimeTarget, "runtime_support.o"), "obj\n");
      fs.writeFileSync(
        irPath,
        [
          "declare void @__bpl_throw_stack_overflow()",
          "define i32 @main() {",
          "entry:",
          "  call void @__bpl_throw_stack_overflow()",
          "  ret i32 0",
          "}",
          "",
        ].join("\n"),
      );
      process.env.BPL_HOME = bplHome;
      process.env.BPL_CC = path.join(tempDir, "missing-cc");

      const result = compileToBinary(irPath, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        `Runtime IR parent path contains a symbolic link: ${libLink}`,
      );
      expect(result.error).not.toContain("missing-cc");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports broken native runtime symlinks before invoking clang", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-runtime-broken-link-"),
    );
    const bplHome = path.join(tempDir, "bpl-home");
    const libDir = path.join(bplHome, "lib");
    const irPath = path.join(tempDir, "main.ll");

    try {
      fs.mkdirSync(libDir, { recursive: true });
      fs.symlinkSync(
        path.join(libDir, "missing-runtime.ll"),
        path.join(libDir, "runtime.ll"),
        "file",
      );
      fs.writeFileSync(path.join(libDir, "runtime_support.o"), "obj\n");
      fs.writeFileSync(
        irPath,
        [
          "declare void @__bpl_throw_stack_overflow()",
          "define i32 @main() {",
          "entry:",
          "  call void @__bpl_throw_stack_overflow()",
          "  ret i32 0",
          "}",
          "",
        ].join("\n"),
      );
      process.env.BPL_HOME = bplHome;
      process.env.BPL_CC = path.join(tempDir, "missing-cc");

      const result = compileToBinary(irPath, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Runtime IR is a broken symbolic link");
      expect(result.error).toContain(path.join(libDir, "runtime.ll"));
      expect(result.error).not.toContain("missing-cc");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports missing link object inputs before invoking clang", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-binary-object-"));
    const irPath = path.join(tempDir, "main.ll");
    const missingObjectPath = path.join(tempDir, "missing.o");

    try {
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.BPL_CC = path.join(tempDir, "missing-cc");

      const result = compileToBinary(irPath, {
        skipRuntime: true,
        object: missingObjectPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Link object input not found");
      expect(result.error).toContain(missingObjectPath);
      expect(result.error).not.toContain("missing-cc");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports directory link object inputs before invoking clang", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-object-dir-"),
    );
    const irPath = path.join(tempDir, "main.ll");
    const objectPath = path.join(tempDir, "object.o");

    try {
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      fs.mkdirSync(objectPath);

      const result = compileToBinary(irPath, {
        skipRuntime: true,
        object: objectPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Link object input is not a file");
      expect(result.error).toContain(objectPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports missing sysroot inputs before invoking clang", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-sysroot-"),
    );
    const irPath = path.join(tempDir, "main.ll");
    const sysrootPath = path.join(tempDir, "missing-sysroot");

    try {
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.BPL_CC = path.join(tempDir, "missing-cc");

      const result = compileToBinary(irPath, {
        skipRuntime: true,
        sysroot: sysrootPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Sysroot input not found");
      expect(result.error).toContain(sysrootPath);
      expect(result.error).not.toContain("missing-cc");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports file library search paths before invoking clang", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-libpath-"),
    );
    const irPath = path.join(tempDir, "main.ll");
    const libPath = path.join(tempDir, "not-a-directory");

    try {
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      fs.writeFileSync(libPath, "not a directory\n");
      process.env.BPL_CC = path.join(tempDir, "missing-cc");

      const result = compileToBinary(irPath, {
        skipRuntime: true,
        libPath,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Library search path input is not a directory",
      );
      expect(result.error).toContain(libPath);
      expect(result.error).not.toContain("missing-cc");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports compiler driver spawn failures", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-binary-cc-"));
    const irPath = path.join(tempDir, "main.ll");
    const missingCompiler = path.join(tempDir, "missing-cc");

    try {
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.BPL_CC = missingCompiler;

      const result = compileToBinary(irPath, { skipRuntime: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to compile LLVM IR");
      expect(result.error).toContain(missingCompiler);
      expect(result.error).toContain("command not found");
      expect(result.error).not.toContain("ENOENT");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("times out hanging compiler drivers", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-timeout-"),
    );
    const irPath = path.join(tempDir, "main.ll");

    try {
      const hangingCompiler = writeNodeCommandShim(
        path.join(tempDir, "hanging-cc"),
        ["setInterval(() => {}, 1000);"],
      );
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.BPL_CC = hangingCompiler;
      process.env.BPL_COMPILE_DRIVER_TIMEOUT_MS = "100";

      const result = compileToBinary(irPath, { skipRuntime: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to compile LLVM IR");
      expect(result.error).toContain(hangingCompiler);
      expect(result.error).toContain("timed out");
      expect(result.error).not.toContain("ETIMEDOUT");
      expect(
        fs
          .readdirSync(tempDir)
          .some((entry) => entry.startsWith(".main.") && entry.endsWith(".tmp")),
      ).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("preserves existing executables when compiler output fails", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-partial-"),
    );
    const irPath = path.join(tempDir, "program.ll");
    const execPath = path.join(tempDir, "program");

    try {
      const fakeCompiler = writeNodeCommandShim(path.join(tempDir, "fake-cc"), [
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        'const outputIndex = args.lastIndexOf("-o") + 1;',
        "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
        'fs.writeFileSync(args[outputIndex], "partial executable\\n");',
        'process.stderr.write("simulated linker failure\\n");',
        "process.exit(1);",
      ]);
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      fs.writeFileSync(execPath, "existing executable\n");
      process.env.BPL_CC = fakeCompiler;

      const result = compileToBinary(irPath, { skipRuntime: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("simulated linker failure");
      expect(fs.readFileSync(execPath, "utf-8")).toBe("existing executable\n");
      expect(
        fs
          .readdirSync(tempDir)
          .some(
            (entry) => entry.startsWith(".program.") && entry.endsWith(".tmp"),
          ),
      ).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("preserves existing executable permissions when replacing output", () => {
    if (process.platform === "win32") {
      return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-binary-mode-"));
    const irPath = path.join(tempDir, "program.ll");
    const execPath = path.join(tempDir, "program");

    try {
      const fakeCompiler = writeNodeCommandShim(path.join(tempDir, "fake-cc"), [
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        'const outputIndex = args.lastIndexOf("-o") + 1;',
        "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
        'fs.writeFileSync(args[outputIndex], "replacement executable\\n");',
      ]);
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      fs.writeFileSync(execPath, "existing executable\n");
      fs.chmodSync(execPath, 0o755);
      process.env.BPL_CC = fakeCompiler;

      const result = compileToBinary(irPath, { skipRuntime: true });

      expect(result.success).toBe(true);
      expect(fs.readFileSync(execPath, "utf-8")).toBe(
        "replacement executable\n",
      );
      expect(fs.statSync(execPath).mode & 0o777).toBe(0o755);
      expect(
        fs
          .readdirSync(tempDir)
          .some(
            (entry) => entry.startsWith(".program.") && entry.endsWith(".tmp"),
          ),
      ).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("cleans temporary executable directories after compiler failures", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-temp-dir-"),
    );
    const irPath = path.join(tempDir, "program.ll");

    try {
      const fakeCompiler = writeNodeCommandShim(path.join(tempDir, "fake-cc"), [
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        'const outputIndex = args.lastIndexOf("-o") + 1;',
        "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
        "fs.mkdirSync(args[outputIndex]);",
        'process.stderr.write("simulated output directory failure\\n");',
        "process.exit(1);",
      ]);
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.BPL_CC = fakeCompiler;

      const result = compileToBinary(irPath, { skipRuntime: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain("simulated output directory failure");
      expect(
        fs
          .readdirSync(tempDir)
          .some(
            (entry) => entry.startsWith(".program.") && entry.endsWith(".tmp"),
          ),
      ).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("rejects successful compiler drivers that create executable directories", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-success-dir-"),
    );
    const irPath = path.join(tempDir, "program.ll");
    const execPath = path.join(tempDir, "program");

    try {
      const fakeCompiler = writeNodeCommandShim(path.join(tempDir, "fake-cc"), [
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        'const outputIndex = args.lastIndexOf("-o") + 1;',
        "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
        "fs.mkdirSync(args[outputIndex]);",
      ]);
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.BPL_CC = fakeCompiler;

      const result = compileToBinary(irPath, { skipRuntime: true });

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Compiler driver did not create executable output",
      );
      expect(fs.existsSync(execPath)).toBe(false);
      expect(
        fs
          .readdirSync(tempDir)
          .some(
            (entry) => entry.startsWith(".program.") && entry.endsWith(".tmp"),
          ),
      ).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("honors BPL_WASM_CC when compiling wasm targets", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-binary-wasm-"));
    const irPath = path.join(tempDir, "program.ll");
    const outputPath = path.join(tempDir, "program.wasm");
    const argsLogPath = path.join(tempDir, "wasm-cc-args.log");

    try {
      const fakeWasmCompiler = writeNodeCommandShim(
        path.join(tempDir, "fake-wasm-cc"),
        [
          'const fs = require("fs");',
          "const args = process.argv.slice(2);",
          `fs.writeFileSync(${JSON.stringify(argsLogPath)}, args.join("\\n"));`,
          'const outputIndex = args.lastIndexOf("-o") + 1;',
          "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
          'fs.writeFileSync(args[outputIndex], "wasm-bytes\\n");',
        ],
      );
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.BPL_CC = path.join(tempDir, "missing-native-cc");
      process.env.BPL_WASM_CC = fakeWasmCompiler;

      const result = compileToBinary(irPath, {
        skipRuntime: true,
        target: "wasm32-unknown-unknown",
      });

      expect(result.success).toBe(true);
      expect(result.executablePath).toBe(outputPath);
      expect(fs.readFileSync(outputPath, "utf-8")).toBe("wasm-bytes\n");
      const args = fs.readFileSync(argsLogPath, "utf-8").split("\n");
      expect(args).toContain("-target");
      expect(args).toContain("wasm32-unknown-unknown");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("normalizes PATH-resolved wasm linker names for clang fuse-ld", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-wasm-fuse-ld-"),
    );
    const irPath = path.join(tempDir, "program.ll");
    const outputPath = path.join(tempDir, "program.wasm");
    const argsLogPath = path.join(tempDir, "wasm-cc-args.log");

    try {
      const fakeWasmLd = writeNodeCommandShim(path.join(tempDir, "wasm-ld"), [
        "console.log('LLD 18.0.0');",
      ]);
      const fakeWasmCompiler = writeNodeCommandShim(
        path.join(tempDir, "fake-wasm-cc"),
        [
          'const fs = require("fs");',
          "const args = process.argv.slice(2);",
          `fs.writeFileSync(${JSON.stringify(argsLogPath)}, args.join("\\n"));`,
          'const outputIndex = args.lastIndexOf("-o") + 1;',
          "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
          'fs.writeFileSync(args[outputIndex], "wasm-bytes\\n");',
        ],
      );
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.PATH = [tempDir, originalPath ?? ""].filter(Boolean).join(
        path.delimiter,
      );
      process.env.WASM_LD = "wasm-ld";
      process.env.BPL_WASM_CC = fakeWasmCompiler;

      const result = compileToBinary(irPath, {
        skipRuntime: true,
        target: "wasm32-unknown-unknown",
      });

      expect(result.success).toBe(true);
      expect(result.executablePath).toBe(outputPath);
      const args = fs.readFileSync(argsLogPath, "utf-8").split("\n");
      expect(args).toContain(`-fuse-ld=${fakeWasmLd}`);
      expect(args).not.toContain("-fuse-ld=wasm-ld");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("links hosted wasm runtime only when target defaults or options require it", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-wasm-runtime-mode-"),
    );
    const bplHome = path.join(tempDir, "bpl-home");
    const libDir = path.join(bplHome, "lib");
    const irPath = path.join(tempDir, "program.ll");
    const argsLogPath = path.join(tempDir, "wasm-cc-args.log");
    const runtimeWasmPath = path.join(libDir, "runtime_wasm.ll");
    const runtimeWasmHostPath = path.join(libDir, "runtime_wasm_host.ll");

    try {
      fs.mkdirSync(libDir, { recursive: true });
      fs.writeFileSync(runtimeWasmPath, "wasm runtime ir\n");
      fs.writeFileSync(runtimeWasmHostPath, "hosted wasm runtime ir\n");
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");

      process.env.BPL_HOME = bplHome;
      process.env.WASM_LD = writeNodeCommandShim(
        path.join(tempDir, "fake-wasm-ld"),
        ["console.log('LLD 18.0.0');"],
      );
      process.env.BPL_WASM_CC = writeNodeCommandShim(
        path.join(tempDir, "fake-wasm-cc"),
        [
          'const fs = require("fs");',
          "const args = process.argv.slice(2);",
          `fs.writeFileSync(${JSON.stringify(argsLogPath)}, args.join("\\n"));`,
          'const outputIndex = args.lastIndexOf("-o") + 1;',
          "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
          'fs.writeFileSync(args[outputIndex], "wasm-bytes\\n");',
        ],
      );

      const defaultResult = compileToBinary(irPath, {
        target: "wasm32-wasi",
      });

      expect(defaultResult.success).toBe(true);
      let args = fs.readFileSync(argsLogPath, "utf-8").split("\n");
      expect(args).toContain(runtimeWasmPath);
      expect(args).toContain(runtimeWasmHostPath);

      const freestandingResult = compileToBinary(irPath, {
        output: path.join(tempDir, "freestanding.wasm"),
        target: "wasm32-wasi",
        wasmRuntime: "freestanding",
      });

      expect(freestandingResult.success).toBe(true);
      args = fs.readFileSync(argsLogPath, "utf-8").split("\n");
      expect(args).toContain(runtimeWasmPath);
      expect(args).not.toContain(runtimeWasmHostPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports missing required wasm linker before invoking the compiler", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-require-wasm-"),
    );
    const irPath = path.join(tempDir, "program.ll");
    const argsLogPath = path.join(tempDir, "wasm-cc-args.log");

    try {
      const fakeWasmCompiler = writeNodeCommandShim(
        path.join(tempDir, "fake-wasm-cc"),
        [
          'const fs = require("fs");',
          `fs.writeFileSync(${JSON.stringify(argsLogPath)}, "invoked\\n");`,
        ],
      );
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.BPL_WASM_CC = fakeWasmCompiler;
      process.env.BPL_REQUIRE_WASM_LD = "1";
      process.env.WASM_LD = path.join(tempDir, "missing-wasm-ld");

      const result = compileToBinary(irPath, {
        skipRuntime: true,
        target: "wasm32-unknown-unknown",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "BPL_REQUIRE_WASM_LD=1 requires a wasm linker",
      );
      expect(result.error).toContain(
        `Checked candidates: ${process.env.WASM_LD}`,
      );
      expect(result.error).not.toContain("wasm-ld,");
      expect(fs.existsSync(argsLogPath)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("times out hanging wasm linker probes before invoking the compiler", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-binary-wasm-link-timeout-"),
    );
    const irPath = path.join(tempDir, "program.ll");
    const argsLogPath = path.join(tempDir, "wasm-cc-args.log");

    try {
      fs.writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
      process.env.WASM_LD = writeNodeCommandShim(
        path.join(tempDir, "hanging-wasm-ld"),
        ["setInterval(() => {}, 1000);"],
      );
      process.env.BPL_REQUIRE_WASM_LD = "1";
      process.env.BPL_WASM_LINKER_PROBE_TIMEOUT_MS = "100";
      process.env.BPL_WASM_CC = writeNodeCommandShim(
        path.join(tempDir, "fake-wasm-cc"),
        [
          'const fs = require("fs");',
          `fs.writeFileSync(${JSON.stringify(argsLogPath)}, "invoked");`,
        ],
      );

      const result = compileToBinary(irPath, {
        skipRuntime: true,
        target: "wasm32-unknown-unknown",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("requires a wasm linker");
      expect(fs.existsSync(argsLogPath)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("reports executable spawn failures", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-missing-"));
    const missingExecutable = path.join(tempDir, "missing-program");

    try {
      const result = runExecutable(missingExecutable);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain("Executable not found");
      expect(result.error).toContain(missingExecutable);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("times out hanging executable runs when requested", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-timeout-"));

    try {
      const hangingExecutable = writeNodeCommandShim(
        path.join(tempDir, "hanging-program"),
        ["setInterval(() => {}, 1000);"],
      );
      process.env.BPL_RUN_TIMEOUT_MS = "100";

      const result = runExecutable(hangingExecutable);

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain("Executable timed out");
      expect(result.error).toContain(hangingExecutable);
      expect(result.error).not.toContain("ETIMEDOUT");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
