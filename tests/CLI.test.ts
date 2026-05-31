import { describe, expect, it } from "bun:test";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  expectJsonStdoutReport,
  parseJsonObjectStdout,
} from "./helpers/cliJson";
import { writeNodeCommandShim } from "./helpers/executableShim";

const BPL_CLI = path.join(process.cwd(), "index.ts");

type DoctorCheck = {
  name: string;
  ok: boolean;
  required?: boolean;
  detail?: string;
  hint?: string;
  code?: string;
  candidates?: string[];
  environment?: Record<string, string | null>;
  recommendedCommands?: string[];
};

type DoctorReport = {
  version: string;
  platform: {
    os: string;
    arch: string;
  };
  checks: DoctorCheck[];
};

function runCLI(args: string[]) {
  return spawnSync("bun", [BPL_CLI, ...args], {
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1" }, // Disable color for easier assertion
  });
}

function expectDoctorJsonReport(
  result: SpawnSyncReturns<string>,
  expected: { status: number; success?: boolean },
): DoctorReport {
  return expectJsonStdoutReport<DoctorReport>(result, {
    status: expected.status,
    check: "toolchain",
    success: expected.success,
  });
}

function linkBplHomeFixture(
  bplHome: string,
  options: { excludeLibEntries?: Set<string> } = {},
): void {
  const libDir = path.join(bplHome, "lib");
  fs.mkdirSync(libDir, { recursive: true });
  fs.symlinkSync(
    path.join(process.cwd(), "grammar"),
    path.join(bplHome, "grammar"),
    "dir",
  );

  for (const entry of fs.readdirSync(path.join(process.cwd(), "lib"))) {
    if (options.excludeLibEntries?.has(entry)) continue;
    const realPath = path.join(process.cwd(), "lib", entry);
    const linkPath = path.join(libDir, entry);
    fs.symlinkSync(
      realPath,
      linkPath,
      fs.statSync(realPath).isDirectory() ? "dir" : "file",
    );
  }
}

function writeNodePathShim(directory: string): void {
  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(directory, "node.cmd"),
      `@echo off\r\n"${process.execPath}" %*\r\n`,
    );
    return;
  }

  fs.symlinkSync(process.execPath, path.join(directory, "node"), "file");
}

describe("CLI Tests", () => {
  it("should lint files and report errors", () => {
    const lintFile = path.join(process.cwd(), "examples/lint_test/main.bpl");
    const result = runCLI(["lint", lintFile]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Struct 'bad_struct_name' should be PascalCase",
    );
    expect(result.stderr).toContain(
      "Function 'bad_function_name' should be camelCase",
    );
    expect(result.stderr).toContain("[L001]");
  });

  it("should report enhanced errors with codes", () => {
    const errorFile = path.join(process.cwd(), "examples/error_test/main.bpl");
    const result = runCLI([errorFile]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("error[E001]");
    expect(result.stderr).toContain("Type mismatch");
    expect(result.stderr).toContain("cannot assign *i8 to i32");
  });

  it("should reject invalid optimization levels for eval input", () => {
    const result = runCLI([
      "--eval",
      "frame main() ret int { return 0; }",
      "-O",
      "fast",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid optimization level "fast"');
    expect(result.stderr).toContain("Use one of: 0, 1, 2, 3");
  });

  it("should reject invalid cache job counts for eval input", () => {
    const result = runCLI([
      "--eval",
      "frame main() ret int { return 0; }",
      "--jobs",
      "0",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid jobs count "0"');
    expect(result.stderr).toContain("positive integer greater than zero");
  });

  it("should reject invalid emit modes for eval input", () => {
    const result = runCLI([
      "--eval",
      "frame main() ret int { return 0; }",
      "--emit",
      "garbage",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid emit type "garbage"');
    expect(result.stderr).toContain("llvm, ast, tokens, formatted");
  });

  it("should apply explicit color flags to diagnostics", () => {
    const source = 'frame main() { local x: int = "bad"; }';
    const env: Record<string, string | undefined> = { ...process.env };
    delete env.NO_COLOR;

    const color = spawnSync("bun", [BPL_CLI, "--eval", source, "--color"], {
      encoding: "utf-8",
      env,
    });
    const noColor = spawnSync(
      "bun",
      [BPL_CLI, "--eval", source, "--no-color"],
      {
        encoding: "utf-8",
        env,
      },
    );

    expect(color.status).toBe(1);
    expect(color.stderr).toContain("\x1b[");
    expect(noColor.status).toBe(1);
    expect(noColor.stderr).not.toContain("\x1b[");
  });

  it("should apply explicit color flags to check diagnostics", () => {
    const tempFile = path.join(process.cwd(), "tests/temp_check_color.bpl");
    const env: Record<string, string | undefined> = { ...process.env };
    delete env.NO_COLOR;

    try {
      fs.writeFileSync(tempFile, 'frame main() { local x: int = "bad"; }');

      const color = spawnSync("bun", [BPL_CLI, "check", tempFile, "--color"], {
        encoding: "utf-8",
        env,
      });
      const noColor = spawnSync(
        "bun",
        [BPL_CLI, "check", tempFile, "--no-color"],
        {
          encoding: "utf-8",
          env,
        },
      );

      expect(color.status).toBe(1);
      expect(color.stderr).toContain("\x1b[");
      expect(noColor.status).toBe(1);
      expect(noColor.stderr).not.toContain("\x1b[");
    } finally {
      fs.rmSync(tempFile, { force: true });
    }
  });

  it("should print phase timing output when requested", () => {
    const result = spawnSync(
      "bun",
      [
        BPL_CLI,
        "--eval",
        "frame main() ret int { return 0; }",
        "--emit",
        "ast",
        "--time",
        "--no-color",
      ],
      {
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Lexing:");
    expect(result.stdout).toContain("Parsing:");
    expect(result.stdout).toContain('"kind": "Program"');
  });

  it("should label stdin diagnostics as stdin", () => {
    const result = spawnSync("bun", [BPL_CLI, "--stdin"], {
      input: ['frame main() {', '    local x: int = "bad";', "}"].join("\n"),
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("error[E001][<stdin>:2:5]");
    expect(result.stderr).not.toContain("stdin-42069");
  });

  it("should reject invalid wasm runtime modes before writing output", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-invalid-wasm-runtime-"),
    );
    const sourceFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "main");
    const llvmFile = `${outputFile}.ll`;

    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }");

    try {
      const result = runCLI([
        sourceFile,
        "--target",
        "wasm32-unknown-unknown",
        "--wasm-runtime",
        "banana",
        "-o",
        outputFile,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid wasm runtime mode "banana"');
      expect(result.stderr).toContain("freestanding, host");
      expect(fs.existsSync(llvmFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should compile with --dwarf flag and generate debug metadata", () => {
    const dwarfFile = path.join(process.cwd(), "examples/dwarf_test/main.bpl");
    // We use --emit llvm to avoid running the binary, just check compilation
    const result = runCLI([dwarfFile, "--dwarf", "--emit", "llvm"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("LLVM IR written to");

    // Check for debug metadata in the generated LLVM IR file
    const irFile = dwarfFile.replace(".bpl", ".ll");
    expect(fs.existsSync(irFile)).toBe(true);
    const irContent = fs.readFileSync(irFile, "utf-8");

    // Check for basic DWARF metadata
    expect(irContent).toContain("!llvm.dbg.cu");
    expect(irContent).toContain("!DICompileUnit");
    expect(irContent).toContain("!DIFile");
    expect(irContent).toContain('filename: "main.bpl"');
  });

  it("should not enter module mode for import words in comments", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-import-word-"));
    const sourceFile = path.join(tempDir, "main.bpl");
    const llvmFile = path.join(tempDir, "main.ll");

    fs.writeFileSync(
      sourceFile,
      ["# import fake from nowhere", "frame helper() ret int { return 0; }"].join(
        "\n",
      ),
    );

    try {
      const result = runCLI(["build", sourceFile, "--emit", "llvm"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Missing entry point function 'main'");
      expect(result.stderr).not.toContain("undefined reference to `main'");
      expect(fs.existsSync(llvmFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should honor build subcommand emit modes", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-build-emit-"));
    const sourceFile = path.join(tempDir, "main.bpl");
    const llvmFile = path.join(tempDir, "main.ll");
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");

    try {
      const result = runCLI(["build", sourceFile, "--emit", "ast"]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('"kind": "Program"');
      expect(fs.existsSync(llvmFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should emit frontend views without resolving imports", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-emit-import-"));
    const sourceFile = path.join(tempDir, "main.bpl");
    fs.writeFileSync(
      sourceFile,
      [
        'import missing from "./missing.bpl";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    try {
      const tokens = runCLI(["build", sourceFile, "--emit", "tokens"]);
      expect(tokens.status).toBe(0);
      expect(tokens.stdout).toContain('"type": "Import"');
      expect(tokens.stderr).not.toContain("Failed to resolve import");

      const ast = runCLI(["build", sourceFile, "--emit", "ast"]);
      expect(ast.status).toBe(0);
      expect(ast.stdout).toContain('"kind": "Import"');
      expect(ast.stderr).not.toContain("Failed to resolve import");

      const formatted = runCLI(["build", sourceFile, "--emit", "formatted"]);
      expect(formatted.status).toBe(0);
      expect(formatted.stdout).toContain('import missing from "./missing.bpl";');
      expect(formatted.stdout).not.toContain("define i32 @main");
      expect(formatted.stderr).not.toContain("Failed to resolve import");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject unsafe std imports without writing build artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-unsafe-std-"));
    const sourceFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "unsafe-std-app");
    const llvmFile = `${outputFile}.ll`;
    fs.writeFileSync(
      sourceFile,
      [
        'import escaped from "std/../outside-std-lib.bpl";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    try {
      const checkResult = runCLI(["check", sourceFile]);
      expect(checkResult.status).toBe(1);
      expect(checkResult.stderr).toContain("Unsafe standard library import");
      expect(checkResult.stderr).toContain("std/../outside-std-lib.bpl");
      expect(checkResult.stderr).toContain("empty, '.', or '..'");

      const buildResult = runCLI([
        "build",
        sourceFile,
        "--emit",
        "llvm",
        "-o",
        outputFile,
      ]);
      expect(buildResult.status).toBe(1);
      expect(buildResult.stderr).toContain("Unsafe standard library import");
      expect(fs.existsSync(llvmFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should preserve missing relative import diagnostics across CLI modes", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-missing-import-"),
    );
    const sourceFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "missing-import-app");
    const llvmFile = `${outputFile}.ll`;
    const importSource = "./missing/util.bpl";
    const resolvedImportPath = path.resolve(tempDir, importSource);
    fs.writeFileSync(
      sourceFile,
      [
        `import helper from "${importSource}";`,
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    try {
      const expectMissingImportDiagnostic = (message: string) => {
        expect(message).toContain(`Module not found: ${importSource}`);
        expect(message).toContain(resolvedImportPath);
      };

      const checkResult = runCLI(["check", sourceFile]);
      expect(checkResult.status).toBe(1);
      expectMissingImportDiagnostic(checkResult.stderr);

      const checkJsonResult = runCLI(["check", "--json", sourceFile]);
      expect(checkJsonResult.status).toBe(1);
      const checkJsonReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        totalFiles: number;
        errorCount: number;
        files: Array<{
          file: string;
          success: boolean;
          diagnostics: Array<{
            message: string;
            location: { file: string; start: { line: number; column: number } };
          }>;
        }>;
      }>(checkJsonResult);
      expect(checkJsonReport).toMatchObject({
        schemaVersion: 1,
        check: "check",
        success: false,
        totalFiles: 1,
        errorCount: 1,
        files: [
          {
            file: sourceFile,
            success: false,
            diagnostics: [
              {
                location: {
                  file: sourceFile,
                  start: { line: 1, column: 1 },
                },
              },
            ],
          },
        ],
      });
      expectMissingImportDiagnostic(
        checkJsonReport.files[0]!.diagnostics[0]!.message,
      );

      const buildResult = runCLI([
        "build",
        sourceFile,
        "--emit",
        "llvm",
        "-o",
        outputFile,
      ]);
      expect(buildResult.status).toBe(1);
      expectMissingImportDiagnostic(buildResult.stderr);
      expect(fs.existsSync(llvmFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should preserve package resolver diagnostics across import build modes", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-package-diagnostic-"),
    );
    const sourceFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "badpkg-app");
    const llvmFile = `${outputFile}.ll`;
    const cachedOutputFile = path.join(tempDir, "badpkg-cache-app");
    const packageDir = path.join(tempDir, "bpl_modules", "badpkg");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "different-name",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(packageDir, "index.bpl"),
      [
        "frame value() ret int {",
        "    return 1;",
        "}",
        "export value;",
      ].join("\n"),
    );
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "badpkg";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    try {
      const expectPackageDiagnostic = (stderr: string) => {
        expect(stderr).toContain("invalid bpl.json");
        expect(stderr).toContain("manifest name 'different-name'");
        expect(stderr).toContain("requested package 'badpkg'");
        expect(stderr).toContain("Searched paths:");
      };

      const checkResult = runCLI(["check", sourceFile]);
      expect(checkResult.status).toBe(1);
      expectPackageDiagnostic(checkResult.stderr);

      const buildResult = runCLI([
        "build",
        sourceFile,
        "--emit",
        "llvm",
        "-o",
        outputFile,
      ]);
      expect(buildResult.status).toBe(1);
      expectPackageDiagnostic(buildResult.stderr);
      expect(fs.existsSync(llvmFile)).toBe(false);

      const cachedResult = runCLI([
        "build",
        sourceFile,
        "--cache",
        "-o",
        cachedOutputFile,
      ]);
      expect(cachedResult.status).toBe(1);
      expectPackageDiagnostic(cachedResult.stderr);
      expect(fs.existsSync(cachedOutputFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should preserve invalid package import name diagnostics across CLI modes", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-package-name-diagnostic-"),
    );
    const sourceFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "badpkg-name-app");
    const llvmFile = `${outputFile}.ll`;
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "Bad_Name";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    try {
      const expectPackageNameDiagnostic = (stderr: string) => {
        expect(stderr).toContain("Module not found: Bad_Name");
        expect(stderr).toContain(
          "Package import names must use lowercase letters, digits, and hyphens only.",
        );
      };

      const checkResult = runCLI(["check", sourceFile]);
      expect(checkResult.status).toBe(1);
      expectPackageNameDiagnostic(checkResult.stderr);

      const buildResult = runCLI([
        "build",
        sourceFile,
        "--emit",
        "llvm",
        "-o",
        outputFile,
      ]);
      expect(buildResult.status).toBe(1);
      expectPackageNameDiagnostic(buildResult.stderr);
      expect(fs.existsSync(llvmFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should link runtime stack helpers for optimized emitted LLVM builds", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-emit-link-"));
    const sourceFile = path.join(tempDir, "main.bpl");
    const llvmFile = path.join(tempDir, "main-O3.ll");
    const executableFile = path.join(tempDir, "main-O3");
    fs.writeFileSync(
      sourceFile,
      [
        "extern printf(fmt: string, ...);",
        "frame main() ret int {",
        '    printf("runtime-linked\\n");',
        "    return 0;",
        "}",
      ].join("\n"),
    );

    try {
      const result = runCLI([
        "build",
        sourceFile,
        "-O",
        "3",
        "--emit",
        "llvm",
        "-o",
        llvmFile,
      ]);

      expect(result.status).toBe(0);
      expect(fs.existsSync(llvmFile)).toBe(true);
      expect(fs.existsSync(executableFile)).toBe(true);
      expect(result.stderr).not.toContain("__bpl_enter_stack_frame");
      expect(result.stderr).not.toContain("undefined reference");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should let inherited optimization reach the run subcommand", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-opt-"));
    const sourceFile = path.join(tempDir, "main.bpl");
    fs.writeFileSync(
      sourceFile,
      [
        "extern printf(fmt: string, ...);",
        "frame main() ret int {",
        '    printf("run-optimized\\n");',
        "    return 0;",
        "}",
      ].join("\n"),
    );

    try {
      const result = runCLI(["-O", "3", "run", "-v", sourceFile]);
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain(" -O3 ");
      expect(output).not.toContain(" -O0 ");
      expect(output).toContain("run-optimized");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should validate entry points before linking module builds", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-module-entry-"),
    );
    const sourceFile = path.join(tempDir, "main.bpl");
    const libFile = path.join(tempDir, "lib.bpl");

    fs.writeFileSync(
      libFile,
      ["export helper;", "frame helper() ret int { return 0; }"].join("\n"),
    );
    fs.writeFileSync(
      sourceFile,
      [
        'import helper from "./lib.bpl";',
        "frame notMain() ret int { return helper(); }",
      ].join("\n"),
    );

    try {
      const uncached = runCLI(["build", sourceFile, "--emit", "llvm"]);
      expect(uncached.status).toBe(1);
      expect(uncached.stderr).toContain("Missing entry point function 'main'");
      expect(uncached.stderr).not.toContain("undefined reference to `main'");

      const cached = runCLI(["build", sourceFile, "--cache"]);
      expect(cached.status).toBe(1);
      expect(cached.stderr).toContain("Missing entry point function 'main'");
      expect(cached.stderr).not.toContain("undefined reference to `main'");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject directories as compile inputs", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-dir-input-"));
    const sourceDir = path.join(tempDir, "src");
    fs.mkdirSync(sourceDir);

    try {
      const result = runCLI(["build", sourceDir]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Input path is not a file");
      expect(result.stderr).toContain(sourceDir);
      expect(result.stderr).not.toContain("EISDIR");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject symbolic links as compile inputs", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-link-input-"));
    const sourceFile = path.join(tempDir, "main.bpl");
    const linkedSourceFile = path.join(tempDir, "linked.bpl");
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");
    fs.symlinkSync(sourceFile, linkedSourceFile, "file");

    try {
      const result = runCLI(["build", linkedSourceFile]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Input path is a symbolic link");
      expect(result.stderr).toContain(linkedSourceFile);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject compile output paths that are directories before writing artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-output-dir-"));
    const sourceFile = path.join(tempDir, "main.bpl");
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");

    try {
      const result = runCLI(["build", sourceFile, "-o", tempDir]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Output path is a directory");
      expect(result.stderr).not.toContain("Is a directory");
      expect(result.stderr).not.toContain("EISDIR");
      expect(fs.existsSync(`${tempDir}.ll`)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject compile output paths whose parent directory is missing", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-output-parent-"));
    const sourceFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "missing", "app");
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");

    try {
      const result = runCLI([
        "build",
        sourceFile,
        "--emit",
        "llvm",
        "-o",
        outputFile,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Output directory not found");
      expect(result.stderr).not.toContain("ENOENT");
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject compile output paths whose parent path is a file", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-output-parent-file-"),
    );
    const sourceFile = path.join(tempDir, "main.bpl");
    const parentFile = path.join(tempDir, "not-a-dir");
    const outputFile = path.join(parentFile, "app");
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");
    fs.writeFileSync(parentFile, "not a directory\n");

    try {
      const result = runCLI([
        "build",
        sourceFile,
        "--emit",
        "llvm",
        "-o",
        outputFile,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Output parent path is not a directory");
      expect(result.stderr).not.toContain("ENOTDIR");
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject compile output paths whose parent path is a symbolic link", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-output-parent-link-"),
    );
    const sourceFile = path.join(tempDir, "main.bpl");
    const realParentDir = path.join(tempDir, "real-parent");
    const linkedParentDir = path.join(tempDir, "linked-parent");
    const outputFile = path.join(linkedParentDir, "app");
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");
    fs.mkdirSync(realParentDir);
    fs.symlinkSync(realParentDir, linkedParentDir, "dir");

    try {
      const result = runCLI([
        "build",
        sourceFile,
        "--emit",
        "llvm",
        "-o",
        outputFile,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Output parent path is a symbolic link");
      expect(result.stderr).toContain(linkedParentDir);
      expect(result.stderr).not.toContain("ENOENT");
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject compile output paths that are symbolic links before writing artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-output-link-"));
    const sourceFile = path.join(tempDir, "main.bpl");
    const outputBase = path.join(tempDir, "app");
    const outputLl = `${outputBase}.ll`;
    const targetLl = path.join(tempDir, "target.ll");
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");
    fs.symlinkSync(targetLl, outputLl, "file");

    try {
      const result = runCLI([
        "build",
        sourceFile,
        "--emit",
        "llvm",
        "-o",
        outputBase,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Output path is a symbolic link");
      expect(result.stderr).toContain(outputLl);
      expect(result.stderr).not.toContain("ENOENT");
      expect(fs.existsSync(targetLl)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should report missing native runtime support before linking", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-runtime-missing-"),
    );
    const bplHome = path.join(tempDir, "bpl-home");
    const libDir = path.join(bplHome, "lib");
    const sourceFile = path.join(tempDir, "main.bpl");
    fs.mkdirSync(libDir, { recursive: true });
    fs.symlinkSync(
      path.join(process.cwd(), "grammar"),
      path.join(bplHome, "grammar"),
      "dir",
    );

    for (const entry of fs.readdirSync(path.join(process.cwd(), "lib"))) {
      if (entry === "runtime_support.o") continue;
      const realPath = path.join(process.cwd(), "lib", entry);
      const linkPath = path.join(libDir, entry);
      fs.symlinkSync(
        realPath,
        linkPath,
        fs.statSync(realPath).isDirectory() ? "dir" : "file",
      );
    }
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");

    try {
      const astOnly = spawnSync(
        "bun",
        [BPL_CLI, "build", sourceFile, "--emit", "ast"],
        {
          encoding: "utf-8",
          env: {
            ...process.env,
            BPL_HOME: bplHome,
            NO_COLOR: "1",
          },
        },
      );
      expect(astOnly.status).toBe(0);
      expect(astOnly.stdout).toContain('"kind": "Program"');

      const result = spawnSync("bun", [BPL_CLI, "build", sourceFile], {
        encoding: "utf-8",
        env: {
          ...process.env,
          BPL_HOME: bplHome,
          NO_COLOR: "1",
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Runtime support object not found");
      expect(result.stderr).not.toContain("undefined reference");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject directories in source analysis commands", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-analysis-dir-"),
    );
    const sourceDir = path.join(tempDir, "src");
    fs.mkdirSync(sourceDir);

    try {
      const check = runCLI(["check", "--json", sourceDir]);
      expect(check.status).toBe(1);
      expect(
        parseJsonObjectStdout<{
          files: Array<{ file: string; success: boolean; error: string }>;
        }>(check).files[0],
      ).toEqual({
        file: sourceDir,
        success: false,
        error: "Input path is not a file",
      });

      const lint = runCLI(["lint", "--json", sourceDir]);
      expect(lint.status).toBe(1);
      expect(
        parseJsonObjectStdout<{
          files: Array<{ file: string; success: boolean; error: string }>;
        }>(lint).files[0],
      ).toEqual({
        file: sourceDir,
        success: false,
        error: "Input path is not a file",
      });

      const format = runCLI(["format", sourceDir]);
      expect(format.status).toBe(1);
      expect(format.stderr).toContain("Input path is not a file");
      expect(format.stderr).not.toContain("EISDIR");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject symlinked files in source analysis commands", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-analysis-link-"),
    );
    const sourceFile = path.join(tempDir, "main.bpl");
    const linkedFile = path.join(tempDir, "linked.bpl");
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");
    fs.symlinkSync(sourceFile, linkedFile, "file");

    try {
      const check = runCLI(["check", "--json", linkedFile]);
      expect(check.status).toBe(1);
      expect(
        parseJsonObjectStdout<{
          files: Array<{ file: string; success: boolean; error: string }>;
        }>(check).files[0],
      ).toEqual({
        file: linkedFile,
        success: false,
        error: "Input path is a symbolic link",
      });

      const lint = runCLI(["lint", "--json", linkedFile]);
      expect(lint.status).toBe(1);
      expect(
        parseJsonObjectStdout<{
          files: Array<{ file: string; success: boolean; error: string }>;
        }>(lint).files[0],
      ).toEqual({
        file: linkedFile,
        success: false,
        error: "Input path is a symbolic link",
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject invalid documentation inputs without writing output", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-docs-input-"));
    const outputFile = path.join(tempDir, "docs.md");
    const mainFile = path.join(tempDir, "main.bpl");
    fs.writeFileSync(mainFile, 'import missing from "./missing.bpl";\n');

    try {
      const missingInput = spawnSync(
        "bun",
        [BPL_CLI, "docs", path.join(tempDir, "missing.bpl"), "-o", outputFile],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      expect(missingInput.status).toBe(1);
      expect(missingInput.stderr).toContain("Documentation input not found");
      expect(fs.existsSync(outputFile)).toBe(false);

      const directoryInput = spawnSync(
        "bun",
        [BPL_CLI, "docs", tempDir, "-o", outputFile],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      expect(directoryInput.status).toBe(1);
      expect(directoryInput.stderr).toContain(
        "Documentation input is not a file",
      );
      expect(fs.existsSync(outputFile)).toBe(false);

      const linkedFile = path.join(tempDir, "linked.bpl");
      fs.symlinkSync(mainFile, linkedFile, "file");
      const symlinkInput = spawnSync(
        "bun",
        [BPL_CLI, "docs", linkedFile, "-o", outputFile],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      expect(symlinkInput.status).toBe(1);
      expect(symlinkInput.stderr).toContain(
        "Documentation input is a symbolic link",
      );
      expect(fs.existsSync(outputFile)).toBe(false);

      const missingImport = spawnSync(
        "bun",
        [BPL_CLI, "docs", mainFile, "-o", outputFile],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      expect(missingImport.status).toBe(1);
      expect(missingImport.stderr).toContain("Documentation input not found");
      expect(missingImport.stderr).toContain("missing.bpl");
      expect(fs.existsSync(outputFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject documentation output paths that are directories", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-docs-output-"));
    const mainFile = path.join(tempDir, "main.bpl");
    fs.writeFileSync(mainFile, "frame main() ret int { return 0; }\n");

    try {
      const result = spawnSync("bun", [BPL_CLI, "docs", mainFile, "-o", tempDir], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Output path is a directory");
      expect(result.stderr).not.toContain("EISDIR");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should format files", () => {
    // Create a temporary unformatted file
    const tempFile = path.join(process.cwd(), "tests/temp_format.bpl");
    const unformatted = "frame  main ( )  ret  int { return 0 ; }";

    try {
      fs.writeFileSync(tempFile, unformatted);

      const result = runCLI(["format", tempFile]);
      expect(result.status).toBe(0);
      // Formatter should output formatted code to stdout
      expect(result.stdout).toContain("frame main() ret int {");
      expect(result.stdout).toContain("    return 0;");
      expect(result.stdout).toContain("}");
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it("should format files in write mode atomically", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-format-write-"));
    const tempFile = path.join(tempDir, "main.bpl");
    const unformatted = "frame  main ( )  ret  int { return 0 ; }";

    try {
      fs.writeFileSync(tempFile, unformatted);
      if (process.platform !== "win32") {
        fs.chmodSync(tempFile, 0o640);
      }

      const result = runCLI(["format", "--write", tempFile]);

      expect(result.status).toBe(0);
      expect(fs.readFileSync(tempFile, "utf-8")).toContain(
        "frame main() ret int {",
      );
      if (process.platform !== "win32") {
        expect(fs.statSync(tempFile).mode & 0o777).toBe(0o640);
      }
      expect(
        fs
          .readdirSync(tempDir)
          .some(
            (file) => file.startsWith(".main.bpl.") && file.endsWith(".tmp"),
          ),
      ).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should check formatting without rewriting files", () => {
    const tempFile = path.join(process.cwd(), "tests/temp_format_check.bpl");
    const unformatted = "frame  main ( )  ret  int { return 0 ; }";

    try {
      fs.writeFileSync(tempFile, unformatted);

      const result = runCLI(["format", "--check", tempFile]);

      expect(result.status).toBe(1);
      expect(result.stderr + result.stdout).toContain("not formatted");
      expect(fs.readFileSync(tempFile, "utf-8")).toBe(unformatted);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it("should reject symlinked files when formatting in write mode", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-format-link-"));
    const targetFile = path.join(tempDir, "target.bpl");
    const linkedFile = path.join(tempDir, "linked.bpl");
    const unformatted = "frame  main ( )  ret  int { return 0 ; }";
    fs.writeFileSync(targetFile, unformatted);
    fs.symlinkSync(targetFile, linkedFile, "file");

    try {
      const preview = runCLI(["format", linkedFile]);
      expect(preview.status).toBe(0);
      expect(preview.stdout).toContain("frame main() ret int {");

      const write = runCLI(["format", "--write", linkedFile]);
      expect(write.status).toBe(1);
      expect(write.stderr).toContain("Input path is a symbolic link");
      expect(write.stderr).toContain(linkedFile);
      expect(fs.readFileSync(targetFile, "utf-8")).toBe(unformatted);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should report clean results as JSON without deleting on dry run", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-clean-json-"));
    const buildDir = path.join(tempDir, "build");
    fs.mkdirSync(buildDir);
    fs.writeFileSync(path.join(tempDir, "main.ll"), "; test ir");
    fs.writeFileSync(path.join(buildDir, "keep.txt"), "artifact");
    fs.writeFileSync(path.join(buildDir, "generated.o"), "object");
    fs.writeFileSync(path.join(tempDir, "main.bpl"), "frame main() {}");

    try {
      const dryRun = spawnSync(
        "bun",
        [BPL_CLI, "clean", "--dry-run", "--json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      expect(dryRun.status).toBe(0);
      const dryRunReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        dryRun: boolean;
        count: number;
        entries: Array<{ path: string; type: string }>;
      }>(dryRun);
      expect(dryRunReport).toMatchObject({
        schemaVersion: 1,
        check: "clean",
        success: true,
        dryRun: true,
        count: 2,
      });
      expect(dryRunReport.entries).toContainEqual({
        path: "main.ll",
        type: "file",
      });
      expect(dryRunReport.entries).toContainEqual({
        path: "build/",
        type: "directory",
      });
      expect(fs.existsSync(path.join(tempDir, "main.ll"))).toBe(true);
      expect(fs.existsSync(buildDir)).toBe(true);

      const clean = spawnSync("bun", [BPL_CLI, "clean", "--json"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });
      expect(clean.status).toBe(0);
      const cleanReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        dryRun: boolean;
        count: number;
      }>(clean);
      expect(cleanReport).toMatchObject({
        schemaVersion: 1,
        check: "clean",
        success: true,
      });
      expect(cleanReport.dryRun).toBe(false);
      expect(cleanReport.count).toBe(2);
      expect(fs.existsSync(path.join(tempDir, "main.ll"))).toBe(false);
      expect(fs.existsSync(buildDir)).toBe(false);
      expect(fs.existsSync(path.join(tempDir, "main.bpl"))).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should report reserved clean cache paths using their actual file kind", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-clean-kind-"));
    const cacheFile = path.join(tempDir, ".bpl-cache");
    const buildFile = path.join(tempDir, "build");
    const distLink = path.join(tempDir, "dist");
    fs.writeFileSync(cacheFile, "not a directory");
    fs.writeFileSync(buildFile, "not a directory");
    fs.symlinkSync(path.join(tempDir, "missing-dist"), distLink, "dir");

    try {
      const dryRun = spawnSync(
        "bun",
        [BPL_CLI, "clean", "--dry-run", "--json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      expect(dryRun.status).toBe(0);
      const dryRunReport = JSON.parse(dryRun.stdout);
      expect(dryRunReport.entries).toContainEqual({
        path: ".bpl-cache",
        type: "file",
      });
      expect(dryRunReport.entries).toContainEqual({
        path: "build",
        type: "file",
      });
      expect(dryRunReport.entries).toContainEqual({
        path: "dist",
        type: "symlink",
      });
      expect(dryRunReport.entries).not.toContainEqual({
        path: ".bpl-cache/",
        type: "directory",
      });
      expect(fs.existsSync(cacheFile)).toBe(true);
      expect(fs.existsSync(buildFile)).toBe(true);
      expect(fs.lstatSync(distLink).isSymbolicLink()).toBe(true);

      const clean = spawnSync("bun", [BPL_CLI, "clean", "--json"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(clean.status).toBe(0);
      expect(fs.existsSync(cacheFile)).toBe(false);
      expect(fs.existsSync(buildFile)).toBe(false);
      expect(() => fs.lstatSync(distLink)).toThrow();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should remove artifact symlinks without touching their targets", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-clean-link-"));
    const outsideTarget = path.join(tempDir, "outside-target.txt");
    const artifactLink = path.join(tempDir, "main.ll");
    fs.writeFileSync(outsideTarget, "; keep target");
    fs.symlinkSync(outsideTarget, artifactLink, "file");

    try {
      const dryRun = spawnSync(
        "bun",
        [BPL_CLI, "clean", "--dry-run", "--json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      expect(dryRun.status).toBe(0);
      expect(JSON.parse(dryRun.stdout).entries).toContainEqual({
        path: "main.ll",
        type: "symlink",
      });
      expect(fs.lstatSync(artifactLink).isSymbolicLink()).toBe(true);

      const clean = spawnSync("bun", [BPL_CLI, "clean", "--json"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });
      expect(clean.status).toBe(0);
      expect(() => fs.lstatSync(artifactLink)).toThrow();
      expect(fs.readFileSync(outsideTarget, "utf-8")).toBe("; keep target");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should refuse to clean through symlinked working-tree parents", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-clean-parent-link-"),
    );
    const realRoot = path.join(tempDir, "real-root");
    const linkedRoot = path.join(tempDir, "linked-root");
    const realProject = path.join(realRoot, "project");
    const linkedProject = path.join(linkedRoot, "project");
    const buildDir = path.join(realProject, "build");
    const artifact = path.join(realProject, "main.ll");
    const buildArtifact = path.join(buildDir, "generated.o");

    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(artifact, "; keep ir");
    fs.writeFileSync(buildArtifact, "keep object");
    fs.symlinkSync(realRoot, linkedRoot, "dir");

    try {
      const clean = spawnSync("bun", ["--cwd", linkedProject, BPL_CLI, "clean"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(clean.status).toBe(1);
      expect(clean.stderr).toContain(
        "Clean working directory path contains a symbolic link",
      );
      expect(clean.stderr).toContain(linkedRoot);
      expect(fs.readFileSync(artifact, "utf-8")).toBe("; keep ir");
      expect(fs.readFileSync(buildArtifact, "utf-8")).toBe("keep object");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should report clean symlinked working-tree parent failures as JSON", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-clean-parent-link-json-"),
    );
    const realRoot = path.join(tempDir, "real-root");
    const linkedRoot = path.join(tempDir, "linked-root");
    const realProject = path.join(realRoot, "project");
    const linkedProject = path.join(linkedRoot, "project");
    const artifact = path.join(realProject, "main.ll");

    fs.mkdirSync(realProject, { recursive: true });
    fs.writeFileSync(artifact, "; keep ir");
    fs.symlinkSync(realRoot, linkedRoot, "dir");

    try {
      const clean = spawnSync(
        "bun",
        ["--cwd", linkedProject, BPL_CLI, "clean", "--dry-run", "--json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      expect(clean.status).toBe(1);
      expect(clean.stderr).toBe("");
      const report = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        dryRun: boolean;
        count: number;
        entries: Array<{ path: string; type: string }>;
        error: string;
      }>(clean);
      expect(report).toMatchObject({
        schemaVersion: 1,
        check: "clean",
        success: false,
        dryRun: true,
        count: 0,
        entries: [],
      });
      expect(report.error).toContain(
        "Clean working directory path contains a symbolic link",
      );
      expect(report.error).toContain(linkedRoot);
      expect(fs.readFileSync(artifact, "utf-8")).toBe("; keep ir");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should not remove git-tracked files during clean", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-clean-tracked-"),
    );
    const buildDir = path.join(tempDir, "build");
    fs.mkdirSync(buildDir);

    const trackedLl = path.join(tempDir, "runtime.ll");
    const trackedBuildFile = path.join(buildDir, "keep.txt");
    const untrackedObject = path.join(tempDir, "generated.o");
    const untrackedBuildObject = path.join(buildDir, "generated.o");

    fs.writeFileSync(trackedLl, "; tracked runtime ir");
    fs.writeFileSync(trackedBuildFile, "tracked artifact");
    fs.writeFileSync(untrackedObject, "object");
    fs.writeFileSync(untrackedBuildObject, "object");

    try {
      const init = spawnSync("git", ["init"], {
        cwd: tempDir,
        encoding: "utf-8",
      });
      expect(init.status).toBe(0);

      const add = spawnSync("git", ["add", "runtime.ll", "build/keep.txt"], {
        cwd: tempDir,
        encoding: "utf-8",
      });
      expect(add.status).toBe(0);

      const clean = spawnSync("bun", [BPL_CLI, "clean", "--json"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(clean.status).toBe(0);
      const cleanReport = JSON.parse(clean.stdout);
      expect(cleanReport.entries).toContainEqual({
        path: "build/generated.o",
        type: "file",
      });
      expect(cleanReport.entries).toContainEqual({
        path: "generated.o",
        type: "file",
      });
      expect(cleanReport.entries).not.toContainEqual({
        path: "build/",
        type: "directory",
      });
      expect(fs.existsSync(trackedLl)).toBe(true);
      expect(fs.existsSync(trackedBuildFile)).toBe(true);
      expect(fs.existsSync(untrackedObject)).toBe(false);
      expect(fs.existsSync(untrackedBuildObject)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should refuse to clean git repositories when tracked files cannot be listed", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-clean-git-failure-"),
    );
    const fakeBin = path.join(tempDir, "bin");
    const artifact = path.join(tempDir, "main.ll");

    fs.mkdirSync(path.join(tempDir, ".git"));
    fs.mkdirSync(fakeBin);
    fs.writeFileSync(artifact, "; tracked-looking ir");
    writeNodeCommandShim(path.join(fakeBin, "git"), [
      'console.error("fatal: simulated git failure");',
      "process.exit(1);",
    ]);

    try {
      const clean = spawnSync("bun", [BPL_CLI, "clean", "--json"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          NO_COLOR: "1",
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
        },
      });

      expect(clean.status).toBe(1);
      expect(clean.stderr).toBe("");
      expect(
        parseJsonObjectStdout<{ success: boolean; error: string }>(clean),
      ).toMatchObject({
        success: false,
        error:
          "Could not determine git-tracked files; refusing to clean in a git repository.",
      });
      expect(fs.existsSync(artifact)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should time out hanging git tracked-file probes during clean", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-clean-git-timeout-"),
    );
    const fakeBin = path.join(tempDir, "bin");
    const artifact = path.join(tempDir, "main.ll");

    fs.mkdirSync(path.join(tempDir, ".git"));
    fs.mkdirSync(fakeBin);
    fs.writeFileSync(artifact, "; tracked-looking ir");
    writeNodeCommandShim(path.join(fakeBin, "git"), [
      "setInterval(() => {}, 1000);",
    ]);

    try {
      const clean = spawnSync("bun", [BPL_CLI, "clean", "--json"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          BPL_CLEAN_GIT_TIMEOUT_MS: "100",
          NO_COLOR: "1",
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
        },
      });

      expect(clean.status).toBe(1);
      expect(clean.stderr).toBe("");
      expect(
        parseJsonObjectStdout<{ success: boolean; error: string }>(clean),
      ).toMatchObject({
        success: false,
        error:
          "Could not determine git-tracked files; refusing to clean in a git repository.",
      });
      expect(fs.existsSync(artifact)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should quote forwarded run-script arguments", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-script-"));
    const outputFile = path.join(tempDir, "script-args.txt");
    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify(
        {
          name: "run-script-test",
          version: "1.0.0",
          scripts: {
            capture: `node -e "require('fs').writeFileSync(process.argv[1], process.argv.slice(2).join('|'))" ${JSON.stringify(outputFile)}`,
          },
        },
        null,
        2,
      ),
    );

    try {
      const result = spawnSync(
        "bun",
        [
          BPL_CLI,
          "run-script",
          "capture",
          "hello world",
          "semi;colon",
          "quote'value",
          "",
        ],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      expect(result.status).toBe(0);
      expect(fs.readFileSync(outputFile, "utf-8")).toBe(
        "hello world|semi;colon|quote'value|",
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should preserve option-like and shell metacharacter run-script arguments", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-script-"));
    const outputFile = path.join(tempDir, "script-args.json");
    const forwardedArgs = [
      "--release",
      "-x",
      "",
      "dollar$HOME",
      "`uname`",
      "$(uname)",
      "pipe|value",
      "amp&value",
      "redir>file",
      'quote"double',
      "back\\slash",
      "line\nbreak",
    ];
    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify(
        {
          name: "run-script-arg-hardening",
          version: "1.0.0",
          scripts: {
            capture: `node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))" ${JSON.stringify(outputFile)}`,
          },
        },
        null,
        2,
      ),
    );

    try {
      const result = spawnSync(
        "bun",
        [BPL_CLI, "run-script", "capture", "--", ...forwardedArgs],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(fs.readFileSync(outputFile, "utf-8"))).toEqual(
        forwardedArgs,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should compose run-script PATH without a parent PATH", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-script-"));
    const outputFile = path.join(tempDir, "script-path.txt");
    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify(
        {
          name: "run-script-path-test",
          version: "1.0.0",
          scripts: {
            capturePath: `${JSON.stringify(process.execPath)} -e "require('fs').writeFileSync(process.argv[1], process.env.PATH || '')" ${JSON.stringify(outputFile)}`,
          },
        },
        null,
        2,
      ),
    );

    try {
      const env: Record<string, string | undefined> = {
        ...process.env,
        NO_COLOR: "1",
      };
      delete env.PATH;
      delete env.Path;
      delete env.path;

      const result = spawnSync(
        process.execPath,
        [BPL_CLI, "run-script", "capturePath"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env,
        },
      );

      expect(result.status).toBe(0);
      const scriptPath = fs.readFileSync(outputFile, "utf-8");
      expect(scriptPath).not.toContain("undefined");
      expect(scriptPath.split(path.delimiter)).toEqual([
        path.join(tempDir, "bpl_modules", ".bin"),
        path.join(os.homedir(), ".bpl", "bin"),
        path.join(tempDir, "node_modules", ".bin"),
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should list package scripts as JSON without executing them", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-script-"));
    const outputFile = path.join(tempDir, "should-not-exist.txt");
    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify(
        {
          name: "run-script-list-test",
          version: "1.0.0",
          scripts: {
            build: "bpl build src/main.bpl -o app",
            touch: `node -e "require('fs').writeFileSync('${outputFile}', 'bad')"`,
          },
        },
        null,
        2,
      ),
    );

    try {
      const result = spawnSync(
        "bun",
        [BPL_CLI, "run-script", "--list", "--json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      expect(result.status).toBe(0);
      expect(parseJsonObjectStdout(result)).toEqual({
        schemaVersion: 1,
        check: "run-script-list",
        success: true,
        scripts: [
          { name: "build", command: "bpl build src/main.bpl -o app" },
          {
            name: "touch",
            command: `node -e "require('fs').writeFileSync('${outputFile}', 'bad')"`,
          },
        ],
      });
      expect(fs.existsSync(outputFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should report missing run-script names as JSON", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-script-"));
    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify(
        {
          name: "run-script-missing-test",
          version: "1.0.0",
          scripts: {
            build: "echo build",
          },
        },
        null,
        2,
      ),
    );

    try {
      const jsonResult = spawnSync(
        "bun",
        [BPL_CLI, "run-script", "missing", "--json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      expect(jsonResult.status).toBe(1);
      expect(jsonResult.stderr).toBe("");
      expect(parseJsonObjectStdout(jsonResult)).toEqual({
        schemaVersion: 1,
        check: "run-script",
        success: false,
        error: "Script 'missing' not found in bpl.json",
      });

      const humanResult = spawnSync(
        "bun",
        [BPL_CLI, "run-script", "missing"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      expect(humanResult.status).toBe(1);
      expect(humanResult.stderr).toContain(
        "Script 'missing' not found in bpl.json",
      );
      expect(humanResult.stdout).toContain("Available scripts:");
      expect(humanResult.stdout).toContain("- build: echo build");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject invalid run-script entries", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-script-"));

    try {
      fs.writeFileSync(
        path.join(tempDir, "bpl.json"),
        JSON.stringify({
          name: "run-script-test",
          version: "1.0.0",
          scripts: {
            bad: ["echo", "bad"],
          },
        }),
      );
      const nonString = spawnSync("bun", [BPL_CLI, "run-script", "bad"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(nonString.status).toBe(1);
      expect(nonString.stderr).toContain("must be a non-empty string");

      fs.writeFileSync(
        path.join(tempDir, "bpl.json"),
        JSON.stringify({
          name: "run-script-test",
          version: "1.0.0",
          scripts: {
            empty: "   ",
          },
        }),
      );
      const emptyCommand = spawnSync(
        "bun",
        [BPL_CLI, "run-script", "empty"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      expect(emptyCommand.status).toBe(1);
      expect(emptyCommand.stderr).toContain("must be a non-empty string");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject invalid run-script manifests", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-script-"));

    try {
      fs.mkdirSync(path.join(tempDir, "bpl.json"));
      const directoryManifest = spawnSync(
        "bun",
        [BPL_CLI, "run-script", "--list"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      expect(directoryManifest.status).toBe(1);
      expect(directoryManifest.stderr).toContain("bpl.json is not a file");

      fs.rmSync(path.join(tempDir, "bpl.json"), {
        recursive: true,
        force: true,
      });
      fs.writeFileSync(path.join(tempDir, "bpl.json"), "[]");
      const nonObjectManifest = spawnSync(
        "bun",
        [BPL_CLI, "run-script", "--list"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      expect(nonObjectManifest.status).toBe(1);
      expect(nonObjectManifest.stderr).toContain(
        "bpl.json must contain a JSON object",
      );

      fs.unlinkSync(path.join(tempDir, "bpl.json"));
      const targetManifest = path.join(tempDir, "linked-manifest.json");
      fs.writeFileSync(
        targetManifest,
        JSON.stringify({
          name: "linked-run-script-test",
          version: "1.0.0",
          scripts: {
            linked: "echo should-not-run",
          },
        }),
      );
      fs.symlinkSync(targetManifest, path.join(tempDir, "bpl.json"), "file");
      const symlinkManifest = spawnSync(
        "bun",
        [BPL_CLI, "run-script", "--list"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      expect(symlinkManifest.status).toBe(1);
      expect(symlinkManifest.stderr).toContain("bpl.json is a symbolic link");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject run-script manifests through symlinked working-directory parents", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-run-script-parent-link-"),
    );
    const realRoot = path.join(tempDir, "real-root");
    const linkedRoot = path.join(tempDir, "linked-root");
    const realProject = path.join(realRoot, "project");
    const linkedProject = path.join(linkedRoot, "project");

    try {
      fs.mkdirSync(realProject, { recursive: true });
      fs.writeFileSync(
        path.join(realProject, "bpl.json"),
        JSON.stringify({
          name: "run-script-parent-link",
          version: "1.0.0",
          scripts: {
            linked: "echo should-not-run",
          },
        }),
      );
      fs.symlinkSync(realRoot, linkedRoot, "dir");

      const wrapper = [
        `Object.defineProperty(process, "cwd", { value: () => ${JSON.stringify(linkedProject)} });`,
        `process.argv = [process.argv[0], "bpl", "run-script", "--list", "--json"];`,
        `await import(${JSON.stringify(BPL_CLI)});`,
      ].join("\n");
      const result = spawnSync("bun", ["-e", wrapper], {
        cwd: process.cwd(),
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        schemaVersion: 1,
        check: "run-script-list",
        success: false,
        error: `bpl.json parent path contains a symbolic link: ${linkedRoot}.`,
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should report run-script manifest errors as JSON", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-script-"));

    function runJsonList() {
      return spawnSync("bun", [BPL_CLI, "run-script", "--list", "--json"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });
    }

    function expectJsonError(
      result: ReturnType<typeof runJsonList>,
      error: string,
    ) {
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        schemaVersion: 1,
        check: "run-script-list",
        success: false,
        error,
      });
    }

    try {
      expectJsonError(
        runJsonList(),
        "No bpl.json found in current directory.",
      );

      fs.mkdirSync(path.join(tempDir, "bpl.json"));
      expectJsonError(runJsonList(), "bpl.json is not a file.");

      fs.rmSync(path.join(tempDir, "bpl.json"), {
        recursive: true,
        force: true,
      });
      fs.writeFileSync(path.join(tempDir, "bpl.json"), "{not-json");
      expectJsonError(runJsonList(), "Failed to parse bpl.json");

      fs.writeFileSync(path.join(tempDir, "bpl.json"), "[]");
      expectJsonError(
        runJsonList(),
        "bpl.json must contain a JSON object.",
      );

      fs.unlinkSync(path.join(tempDir, "bpl.json"));
      const targetManifest = path.join(tempDir, "linked-manifest.json");
      fs.writeFileSync(targetManifest, JSON.stringify({ scripts: {} }));
      fs.symlinkSync(targetManifest, path.join(tempDir, "bpl.json"), "file");
      expectJsonError(runJsonList(), "bpl.json is a symbolic link.");

      fs.unlinkSync(path.join(tempDir, "bpl.json"));
      fs.writeFileSync(
        path.join(tempDir, "bpl.json"),
        JSON.stringify({
          scripts: {
            bad: ["echo", "bad"],
          },
        }),
      );
      expectJsonError(
        runJsonList(),
        "Script 'bad' in bpl.json must be a non-empty string",
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should report lint diagnostics as JSON", () => {
    const lintFile = path.join(process.cwd(), "examples/lint_test/main.bpl");
    const result = runCLI(["lint", "--json", lintFile]);

    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.schemaVersion).toBe(1);
    expect(report.check).toBe("lint");
    expect(report.success).toBe(false);
    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.files[0].diagnostics[0]).toMatchObject({
      code: "L001",
      severity: "warning",
      severityLabel: "warning",
    });
    expect(report.files[0].diagnostics[0].location.start.line).toBeGreaterThan(
      0,
    );
  });

  it("should report rich check diagnostics as JSON", () => {
    const tempFile = path.join(process.cwd(), "tests/temp_check_json.bpl");

    try {
      fs.writeFileSync(
        tempFile,
        ["frame main() {", '    local x: i32 = "bad";', "}"].join("\n"),
      );

      const result = runCLI(["check", "--json", tempFile]);

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.schemaVersion).toBe(1);
      expect(report.check).toBe("check");
      expect(report.success).toBe(false);
      expect(report.files[0].diagnostics[0]).toMatchObject({
        code: "E001",
        severity: "error",
        severityLabel: "error",
        source: {
          line: '    local x: i32 = "bad";',
        },
      });
      expect(report.files[0].diagnostics[0].location.start.line).toBe(2);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it("should report import diagnostics as JSON", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-import-json-"),
    );
    const unsafeStdFile = path.join(tempDir, "unsafe_std.bpl");
    const packageFile = path.join(tempDir, "package_import.bpl");
    const invalidNameFile = path.join(tempDir, "invalid_package_name.bpl");
    const packageVersionFile = path.join(tempDir, "package_version_import.bpl");
    const packageDir = path.join(tempDir, "bpl_modules", "badpkg");
    const packageVersionDir = path.join(tempDir, "bpl_modules", "badversion");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.mkdirSync(packageVersionDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "different-name",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(packageVersionDir, "bpl.json"),
      JSON.stringify(
        {
          name: "badversion",
          version: "latest",
          main: "index.bpl",
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(packageDir, "index.bpl"),
      ["frame value() ret int {", "    return 1;", "}", "export value;"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      path.join(packageVersionDir, "index.bpl"),
      ["frame value() ret int {", "    return 1;", "}", "export value;"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      unsafeStdFile,
      [
        'import escaped from "std/../outside-std-lib.bpl";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      packageFile,
      [
        'import value from "badpkg";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      invalidNameFile,
      [
        'import value from "Bad_Name";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      packageVersionFile,
      [
        'import value from "badversion";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    try {
      const result = runCLI([
        "check",
        "--json",
        unsafeStdFile,
        packageFile,
        invalidNameFile,
        packageVersionFile,
      ]);

      expect(result.status).toBe(1);
      const report = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        totalFiles: number;
        errorCount: number;
        files: Array<{
          file: string;
          success: boolean;
          diagnostics: Array<{
            severity: string;
            message: string;
            hint: string;
            location: {
              file: string;
              start: { line: number; column: number };
            };
            source?: { line: string };
          }>;
        }>;
      }>(result);
      expect(report.schemaVersion).toBe(1);
      expect(report.check).toBe("check");
      expect(report.success).toBe(false);
      expect(report.totalFiles).toBe(4);
      expect(report.errorCount).toBe(4);

      const reportsByFile = new Map(report.files.map((file) => [file.file, file]));
      const unsafeStdDiagnostic = reportsByFile.get(
        unsafeStdFile,
      )?.diagnostics[0];
      expect(unsafeStdDiagnostic).toMatchObject({
        severity: "error",
        message: "Unsafe standard library import: std/../outside-std-lib.bpl",
        hint: "Use std/<path> without empty, '.', or '..' path segments.",
        location: {
          file: unsafeStdFile,
          start: { line: 1, column: 1 },
        },
        source: {
          line: 'import escaped from "std/../outside-std-lib.bpl";',
        },
      });

      const packageDiagnostic = reportsByFile.get(
        packageFile,
      )?.diagnostics[0];
      expect(packageDiagnostic?.message).toContain("invalid bpl.json");
      expect(packageDiagnostic?.message).toContain(
        "manifest name 'different-name'",
      );
      expect(packageDiagnostic?.hint).toContain("Searched paths:");
      expect(packageDiagnostic?.location).toMatchObject({
        file: packageFile,
        start: { line: 1, column: 1 },
      });

      const invalidNameDiagnostic = reportsByFile.get(
        invalidNameFile,
      )?.diagnostics[0];
      expect(invalidNameDiagnostic?.message).toContain(
        "Package import names must use lowercase letters, digits, and hyphens only.",
      );
      expect(invalidNameDiagnostic?.hint).toContain(
        "Package import names must use lowercase letters, digits, and hyphens only.",
      );
      expect(invalidNameDiagnostic?.location).toMatchObject({
        file: invalidNameFile,
        start: { line: 1, column: 1 },
      });

      const packageVersionDiagnostic = reportsByFile.get(
        packageVersionFile,
      )?.diagnostics[0];
      expect(packageVersionDiagnostic?.message).toContain(
        "manifest version must use X.Y.Z semantic version format",
      );
      expect(packageVersionDiagnostic?.hint).toContain(
        "manifest version must use X.Y.Z semantic version format",
      );
      expect(packageVersionDiagnostic?.location).toMatchObject({
        file: packageVersionFile,
        start: { line: 1, column: 1 },
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should count missing files in check JSON totals", () => {
    const missingFile = path.join(
      process.cwd(),
      "tests/does-not-exist-check.bpl",
    );
    const result = runCLI(["check", "--json", missingFile]);

    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.schemaVersion).toBe(1);
    expect(report.check).toBe("check");
    expect(report.success).toBe(false);
    expect(report.totalFiles).toBe(1);
    expect(report.errorCount).toBe(1);
    expect(report.files).toEqual([
      {
        file: missingFile,
        success: false,
        error: "File not found",
      },
    ]);
  });

  it("should scaffold library projects with package-friendly defaults", () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), "tests/temp_new-"));
    const projectName = "sample-lib";
    const projectDir = path.join(tempDir, projectName);

    try {
      const result = spawnSync(
        "bun",
        [BPL_CLI, "new", projectName, "--template", "library", "--no-git"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      expect(result.status).toBe(0);
      expect(fs.existsSync(path.join(projectDir, "bpl.json"))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, "src", "index.bpl"))).toBe(
        true,
      );
      expect(
        fs.existsSync(path.join(projectDir, "examples", "usage.bpl")),
      ).toBe(true);

      const manifest = JSON.parse(
        fs.readFileSync(path.join(projectDir, "bpl.json"), "utf-8"),
      );
      expect(manifest.main).toBe("src/index.bpl");
      expect(manifest.type).toBe("library");

      const source = fs.readFileSync(
        path.join(projectDir, "src", "index.bpl"),
        "utf-8",
      );
      expect(source).toContain("export add;");
      expect(source).toContain("frame add(left: int, right: int) ret int");

      const readme = fs.readFileSync(
        path.join(projectDir, "README.md"),
        "utf-8",
      );
      expect(readme).toContain("bpl pack");
      expect(readme).toContain("bpl check src/index.bpl");
      expect(
        fs
          .readdirSync(tempDir)
          .some((entry) => entry.startsWith(`.${projectName}.staging-`)),
      ).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject invalid project names before scaffolding", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-new-invalid-"));
    const outsideDir = path.join(tempDir, "outside");

    try {
      const badPackageName = spawnSync(
        "bun",
        [BPL_CLI, "new", "Bad_Name", "--no-git"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      expect(badPackageName.status).toBe(1);
      expect(badPackageName.stderr).toContain("Invalid project name: Bad_Name");
      expect(fs.existsSync(path.join(tempDir, "Bad_Name"))).toBe(false);

      const pathLikeName = spawnSync(
        "bun",
        [BPL_CLI, "new", "../outside", "--no-git"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      expect(pathLikeName.status).toBe(1);
      expect(pathLikeName.stderr).toContain(
        "Invalid project name. Use a package name, not a path.",
      );
      expect(fs.existsSync(outsideDir)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject existing non-directory project paths before scaffolding", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-new-collision-"));
    const fileName = "taken-file";
    const linkName = "taken-link";
    const filePath = path.join(tempDir, fileName);
    const linkPath = path.join(tempDir, linkName);
    fs.writeFileSync(filePath, "not a project directory");
    fs.symlinkSync(path.join(tempDir, "missing-target"), linkPath, "file");

    try {
      const fileCollision = spawnSync(
        "bun",
        [BPL_CLI, "new", fileName, "--no-git"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      expect(fileCollision.status).toBe(1);
      expect(fileCollision.stderr).toContain(
        "Project path already exists and is not a directory",
      );
      expect(fileCollision.stderr).toContain(filePath);
      expect(fileCollision.stderr).not.toContain("EEXIST");

      const linkCollision = spawnSync(
        "bun",
        [BPL_CLI, "new", linkName, "--no-git"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      expect(linkCollision.status).toBe(1);
      expect(linkCollision.stderr).toContain(
        "Project path already exists as a symbolic link",
      );
      expect(linkCollision.stderr).toContain(linkPath);
      expect(linkCollision.stderr).not.toContain("EEXIST");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should honor BPL_CC when skipping unavailable package IR verification", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-pack-no-cc-"));
    const verifyTmpDir = path.join(tempDir, "tmp");
    fs.mkdirSync(verifyTmpDir);
    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify(
        {
          name: "missing-cc-pack",
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
      const missingCompiler = path.join(tempDir, "definitely-missing-clang");
      const result = spawnSync("bun", [BPL_CLI, "pack"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          BPL_CC: missingCompiler,
          CC: "clang",
          TMPDIR: verifyTmpDir,
          TMP: verifyTmpDir,
          TEMP: verifyTmpDir,
          NO_COLOR: "1",
        },
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("Skipping IR verification");
      expect(result.stderr).toContain(missingCompiler);
      expect(result.stderr).toContain("command not found");
      expect(result.stderr).not.toContain("ENOENT");
      expect(
        fs.existsSync(path.join(tempDir, "missing-cc-pack-1.0.0.tgz")),
      ).toBe(true);
      expect(
        fs
          .readdirSync(verifyTmpDir)
          .filter((entry) => entry.startsWith("bpl-pack-verify-")),
      ).toEqual([]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should time out hanging package IR verification drivers", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-pack-timeout-"));
    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify(
        {
          name: "timeout-cc-pack",
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
    const hangingCompiler = writeNodeCommandShim(
      path.join(tempDir, "hanging-cc"),
      ["setInterval(() => {}, 1000);"],
    );

    try {
      const result = spawnSync("bun", [BPL_CLI, "pack"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          BPL_CC: hangingCompiler,
          BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS: "100",
          NO_COLOR: "1",
        },
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("Skipping IR verification");
      expect(result.stderr).toContain(hangingCompiler);
      expect(result.stderr).toContain("timed out");
      expect(result.stderr).not.toContain("ETIMEDOUT");
      expect(fs.existsSync(path.join(tempDir, "timeout-cc-pack-1.0.0.tgz"))).toBe(
        true,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should honor CC when building native binaries", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-build-cc-"));
    const sourceFile = path.join(tempDir, "main.bpl");
    const missingCc = path.join(tempDir, "definitely-missing-cc");
    fs.writeFileSync(
      sourceFile,
      ["frame main() ret int {", "    return 0;", "}"].join("\n"),
    );

    try {
      const result = spawnSync("bun", [BPL_CLI, "build", sourceFile], {
        cwd: tempDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          CC: missingCc,
          NO_COLOR: "1",
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `Failed to compile LLVM IR with ${missingCc}`,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should generate BPL extern declarations from simple C headers", () => {
    const tempHeader = path.join(process.cwd(), "tests/temp_bindgen.h");
    fs.writeFileSync(
      tempHeader,
      [
        "int puts(const char *s);",
        "void free(void *ptr);",
        "void *malloc(size_t size);",
        "char *strdup(const char *s);",
        "double pow(double base, double exp);",
        "int printf(const char *fmt, ...);",
        "int abs(int);",
      ].join("\n"),
    );

    try {
      const result = runCLI(["bindgen", tempHeader]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("extern puts(s: string) ret int;");
      expect(result.stdout).toContain("extern free(ptr: *void) ret void;");
      expect(result.stdout).toContain("extern malloc(size: ulong) ret *void;");
      expect(result.stdout).toContain("extern strdup(s: string) ret string;");
      expect(result.stdout).toContain(
        "extern pow(base: double, exp: double) ret double;",
      );
      expect(result.stdout).toContain(
        "extern printf(fmt: string, ...) ret int;",
      );
      expect(result.stdout).toContain("extern abs(arg0: int) ret int;");
    } finally {
      if (fs.existsSync(tempHeader)) fs.unlinkSync(tempHeader);
    }
  });

  it("should decay C array parameters to pointers in generated bindings", () => {
    const tempHeader = path.join(process.cwd(), "tests/temp_bindgen_arrays.h");
    fs.writeFileSync(
      tempHeader,
      [
        "void fill(int values[], unsigned long count);",
        "int sum(const int values[4]);",
        "void fill_matrix(int matrix[2][3]);",
        "void copy_names(const char names[4][8]);",
        "int run(int argc, char *argv[]);",
        "typedef struct Buffer { unsigned char bytes[16]; } Buffer;",
      ].join("\n"),
    );

    try {
      const result = runCLI(["bindgen", tempHeader]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "extern fill(values: *int, count: ulong) ret void;",
      );
      expect(result.stdout).toContain("extern sum(values: *int) ret int;");
      expect(result.stdout).toContain(
        "extern fill_matrix(matrix: *int[3]) ret void;",
      );
      expect(result.stdout).toContain(
        "extern copy_names(names: *char[8]) ret void;",
      );
      expect(result.stdout).toContain(
        "extern run(argc: int, argv: **char) ret int;",
      );
      expect(result.stdout).toContain("struct Buffer {");
      expect(result.stdout).toContain("bytes: u8[16],");
    } finally {
      if (fs.existsSync(tempHeader)) fs.unlinkSync(tempHeader);
    }
  });

  it("should generate typedefs, structs, enums, and constants from C headers", () => {
    const tempHeader = path.join(process.cwd(), "tests/temp_bindgen_rich.h");
    fs.writeFileSync(
      tempHeader,
      [
        "#define ANSWER 42",
        "#define FLAGS 0xFFu",
        "#define FEATURE_BITS 0b1010u",
        "#define FILE_MODE 0755",
        "#define BIG_COUNT 42UL",
        "#define SCALE 1.5f",
        "#define WRAPPED_ANSWER (42u)",
        "#define CAST_LIMIT ((unsigned long)4096)",
        "#define NEGATIVE_LIMIT (-7L)",
        "#define SCIENTIFIC_SCALE (1e-3f)",
        "#define SCIENTIFIC_DOUBLE 1e-3",
        "#define CONTINUED_COUNT \\",
        "  64u",
        '#define WRAPPED_GREETING ("hello")',
        '#define DOC_URL "https://example.test/docs"',
        '#define COMMENT_PATTERN "/*not a comment*/"',
        "#define DEFAULT_MARK 'x'",
        "#define SHIFT_EXPRESSION (1 << 2)",
        "#define MULTI_CHAR 'xy'",
        '#define CONCAT_GREETING "hello" "world"',
        "typedef unsigned int bpl_size;",
        "typedef long unsigned int odd_size;",
        "typedef unsigned \\",
        "  long continued_word;",
        "typedef unsigned long bpl_word, *bpl_word_ptr;",
        "typedef struct Point { int x; double y; } Point;",
        "typedef const char *bpl_cstr;",
        "typedef void *bpl_handle;",
        "typedef struct Point *PointRef;",
        "typedef int (*compare_fn)(const void *left, const void *right);",
        "typedef struct Options { unsigned flags: 3; int (*callback)(int value); int value; } Options;",
        "typedef struct PackedFields { int x, y; char *label, marker; unsigned char bytes[4], tag; } PackedFields;",
        "typedef struct NestedSkip { int tag; union { int i; float f; } value; int tail; } NestedSkip;",
        "typedef struct OuterNamed { int tag; struct InnerHidden { int hidden; } inner; int tail; } OuterNamed;",
        "typedef enum Color { COLOR_RED = 1, COLOR_BLUE = 2 } Color;",
        "Point make_point(int x, double y);",
        "int continued_sum(int left, \\",
        "  int right);",
        "bpl_size measure(Point *point);",
        "bpl_cstr label(PointRef point, bpl_handle user);",
        "void qsort(void *base, size_t count, size_t size, int (*compare)(const void *left, const void *right));",
      ].join("\n"),
    );

    try {
      const result = runCLI(["bindgen", tempHeader]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("global const ANSWER: int = 42;");
      expect(result.stdout).toContain("global const FLAGS: uint = 0xFF;");
      expect(result.stdout).toContain(
        "global const FEATURE_BITS: uint = 0b1010;",
      );
      expect(result.stdout).toContain("global const FILE_MODE: int = 0o755;");
      expect(result.stdout).toContain("global const BIG_COUNT: ulong = 42;");
      expect(result.stdout).toContain("global const SCALE: float = 1.5;");
      expect(result.stdout).toContain(
        "global const WRAPPED_ANSWER: uint = 42;",
      );
      expect(result.stdout).toContain(
        "global const CAST_LIMIT: ulong = 4096;",
      );
      expect(result.stdout).toContain(
        "global const NEGATIVE_LIMIT: long = -7;",
      );
      expect(result.stdout).toContain(
        "global const SCIENTIFIC_SCALE: float = 1e-3;",
      );
      expect(result.stdout).toContain(
        "global const SCIENTIFIC_DOUBLE: double = 1e-3;",
      );
      expect(result.stdout).toContain(
        "global const CONTINUED_COUNT: uint = 64;",
      );
      expect(result.stdout).toContain(
        'global const WRAPPED_GREETING: string = "hello";',
      );
      expect(result.stdout).toContain(
        'global const DOC_URL: string = "https://example.test/docs";',
      );
      expect(result.stdout).toContain(
        'global const COMMENT_PATTERN: string = "/*not a comment*/";',
      );
      expect(result.stdout).toContain("global const DEFAULT_MARK: char = 'x';");
      expect(result.stdout).not.toContain("SHIFT_EXPRESSION");
      expect(result.stdout).not.toContain("MULTI_CHAR");
      expect(result.stdout).not.toContain("CONCAT_GREETING");
      expect(result.stdout).toContain("type bpl_size = uint;");
      expect(result.stdout).toContain("type odd_size = ulong;");
      expect(result.stdout).toContain("type continued_word = ulong;");
      expect(result.stdout).toContain("type bpl_word = ulong;");
      expect(result.stdout).toContain("type bpl_word_ptr = *ulong;");
      expect(result.stdout).toContain("type bpl_cstr = string;");
      expect(result.stdout).toContain("type bpl_handle = *void;");
      expect(result.stdout).toContain("type PointRef = *Point;");
      expect(result.stdout).not.toContain("compare_fn");
      expect(result.stdout).toContain("struct Point {");
      expect(result.stdout).toContain("x: int,");
      expect(result.stdout).toContain("y: double,");
      expect(result.stdout).toContain("struct Options {");
      expect(result.stdout).toContain("value: int,");
      expect(result.stdout).not.toContain("flags:");
      expect(result.stdout).not.toContain("callback:");
      expect(result.stdout).toContain("struct PackedFields {");
      expect(result.stdout).toContain("x: int,");
      expect(result.stdout).toContain("y: int,");
      expect(result.stdout).toContain("label: string,");
      expect(result.stdout).toContain("marker: char,");
      expect(result.stdout).toContain("bytes: u8[4],");
      expect(result.stdout).toContain("tag: u8,");
      expect(result.stdout).toContain("struct NestedSkip {");
      expect(result.stdout).toContain("tag: int,");
      expect(result.stdout).toContain("tail: int,");
      expect(result.stdout).not.toContain("i: int,");
      expect(result.stdout).not.toContain("f: float,");
      expect(result.stdout).not.toContain("struct value {");
      expect(result.stdout).toContain("struct OuterNamed {");
      expect(result.stdout).not.toContain("struct InnerHidden {");
      expect(result.stdout).toContain("enum Color {");
      expect(result.stdout).toContain("COLOR_RED,");
      expect(result.stdout).toContain("COLOR_BLUE,");
      expect(result.stdout).toContain(
        "extern make_point(x: int, y: double) ret Point;",
      );
      expect(result.stdout).toContain(
        "extern continued_sum(left: int, right: int) ret int;",
      );
      expect(result.stdout).toContain(
        "extern measure(point: *Point) ret bpl_size;",
      );
      expect(result.stdout).toContain(
        "extern label(point: PointRef, user: bpl_handle) ret bpl_cstr;",
      );
      expect(result.stdout).not.toContain("qsort");
    } finally {
      if (fs.existsSync(tempHeader)) fs.unlinkSync(tempHeader);
    }
  });

  it("should write bindgen output files through the shared output option", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-bindgen-file-"));
    const tempHeader = path.join(tempDir, "input.h");
    const outputFile = path.join(tempDir, "bindings.bpl");
    fs.writeFileSync(tempHeader, "int puts(const char *s);\n");

    try {
      const result = runCLI(["bindgen", tempHeader, "-o", outputFile]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Bindings written to");
      expect(result.stdout).not.toContain("extern puts");
      expect(fs.readFileSync(outputFile, "utf8")).toContain(
        "extern puts(s: string) ret int;",
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject directories as bindgen inputs", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-bindgen-dir-"));

    try {
      const result = runCLI(["bindgen", tempDir]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Header path is not a file");
      expect(result.stderr).toContain(tempDir);
      expect(result.stderr).not.toContain("EISDIR");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject symbolic links as bindgen inputs", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-bindgen-input-link-"),
    );
    const tempHeader = path.join(tempDir, "input.h");
    const linkHeader = path.join(tempDir, "linked.h");
    fs.writeFileSync(tempHeader, "int puts(const char *s);\n");
    fs.symlinkSync(tempHeader, linkHeader, "file");

    try {
      const linkedResult = runCLI(["bindgen", linkHeader]);

      expect(linkedResult.status).toBe(1);
      expect(linkedResult.stderr).toContain("Header path is a symbolic link");
      expect(linkedResult.stderr).toContain(linkHeader);

      fs.rmSync(linkHeader);
      fs.symlinkSync(path.join(tempDir, "missing.h"), linkHeader, "file");
      const brokenResult = runCLI(["bindgen", linkHeader]);

      expect(brokenResult.status).toBe(1);
      expect(brokenResult.stderr).toContain("Header path is a symbolic link");
      expect(brokenResult.stderr).toContain(linkHeader);
      expect(brokenResult.stderr).not.toContain("ENOENT");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject bindgen inputs through symlinked parent directories", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-bindgen-input-parent-link-"),
    );
    const realRoot = path.join(tempDir, "real-root");
    const linkedRoot = path.join(tempDir, "linked-root");
    const realHeader = path.join(realRoot, "input.h");
    const linkedHeader = path.join(linkedRoot, "input.h");
    fs.mkdirSync(realRoot);
    fs.writeFileSync(realHeader, "int puts(const char *s);\n");
    fs.symlinkSync(realRoot, linkedRoot, "dir");

    try {
      const result = runCLI(["bindgen", linkedHeader]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Header parent path contains a symbolic link",
      );
      expect(result.stderr).toContain(linkedRoot);
      expect(result.stdout).not.toContain("extern puts");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject bindgen output paths that are directories", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-bindgen-output-"));
    const tempHeader = path.join(tempDir, "input.h");
    fs.writeFileSync(tempHeader, "int puts(const char *s);\n");

    try {
      const result = runCLI(["bindgen", tempHeader, "-o", tempDir]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Output path is a directory");
      expect(result.stderr).not.toContain("EISDIR");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject bindgen output paths that are symbolic links", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-bindgen-link-"));
    const tempHeader = path.join(tempDir, "input.h");
    const outputFile = path.join(tempDir, "bindings.bpl");
    const targetFile = path.join(tempDir, "target.bpl");
    fs.writeFileSync(tempHeader, "int puts(const char *s);\n");
    fs.symlinkSync(targetFile, outputFile, "file");

    try {
      const result = runCLI(["bindgen", tempHeader, "-o", outputFile]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Output path is a symbolic link");
      expect(result.stderr).toContain(outputFile);
      expect(result.stderr).not.toContain("ENOENT");
      expect(fs.existsSync(targetFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should advertise the wasm32 target in shell completions", () => {
    const bash = runCLI(["completion", "bash"]);
    const zsh = runCLI(["completion", "zsh"]);

    expect(bash.status).toBe(0);
    expect(zsh.status).toBe(0);
    expect(bash.stdout).toContain("wasm32-unknown-unknown");
    expect(bash.stdout).toContain("wasm32-wasi");
    expect(bash.stdout).toContain("--wasm-runtime");
    expect(zsh.stdout).toContain("wasm32-unknown-unknown");
    expect(zsh.stdout).toContain("wasm32-wasi");
    expect(zsh.stdout).toContain("--wasm-runtime");
    expect(bash.stdout).toContain("doctor");
    expect(zsh.stdout).toContain("doctor:Check local BPL toolchain");
    expect(bash.stdout).toContain("run-script");
    expect(zsh.stdout).toContain("run-script:Run a script defined in bpl.json");
    expect(bash.stdout).toContain('run_script_opts="--list --json"');
    expect(zsh.stdout).toContain(
      "--json[Output machine-readable script list]",
    );
    expect(bash.stdout).toContain("package-cache");
    expect(zsh.stdout).toContain(
      "package-cache:List, verify, repair, and clean cached package archives",
    );
    expect(bash.stdout).toContain("list verify repair clean");
    expect(zsh.stdout).toContain("1:subcommand:(list verify repair clean)");
    expect(bash.stdout).toContain("packages --json");
    expect(zsh.stdout).toContain("1:scope:(packages)");
    expect(bash.stdout).toContain(
      'install_opts="-v --verbose --locked --update --repair-lock --json"',
    );
    expect(zsh.stdout).toContain("--update[Re-resolve bpl.json dependencies");
    expect(zsh.stdout).toContain(
      "--json[Output machine-readable install result]",
    );
    expect(bash.stdout).toContain('list_opts="-v --verbose --tree --json"');
    expect(zsh.stdout).toContain(
      "--json[Output machine-readable installed package data]",
    );
    expect(bash.stdout).toContain("--cache-stats");
    expect(zsh.stdout).toContain("--cache-stats");
    expect(bash.stdout).toContain("--template");
    expect(zsh.stdout).toContain("--template");
    expect(bash.stdout).toContain(
      'clean_opts="-v --verbose --dry-run --json"',
    );
    expect(zsh.stdout).toContain(
      "--json[Output machine-readable cleanup report]",
    );
  });

  it("should report host toolchain diagnostics from doctor as JSON", () => {
    const result = runCLI(["doctor", "--json"]);

    const report = expectDoctorJsonReport(result, {
      status: 0,
      success: true,
    });
    expect(report.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(report.platform.os).toBeTruthy();
    expect(report.platform.arch).toBeTruthy();
    expect(report.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "BPL home",
        "Temporary directory",
        "Runtime IR",
        "Runtime support object",
        "WebAssembly runtime IR",
        "Hosted WebAssembly runtime IR",
        "wasm linker",
        "wasm compiler",
        "object symbol tool",
        "package archive tool",
        "LLVM verifier",
        "native compiler",
      ]),
    );
    expect(
      report.checks.every(
        (check) => check.ok === true || check.required === false,
      ),
    ).toBe(true);
  });

  it("should report invalid temporary directories in doctor diagnostics", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-doctor-tmp-"));
    const tempFile = path.join(tempDir, "not-a-directory");

    try {
      fs.writeFileSync(tempFile, "not a directory");
      const result = spawnSync("bun", [BPL_CLI, "doctor", "--json"], {
        encoding: "utf-8",
        env: {
          ...process.env,
          TMPDIR: tempFile,
          NO_COLOR: "1",
        },
      });

      const report = expectDoctorJsonReport(result, {
        status: 1,
        success: false,
      });
      const tempCheck = report.checks.find(
        (check) => check.name === "Temporary directory",
      );
      expect(tempCheck?.ok).toBe(false);
      expect(tempCheck?.detail).toContain("is not a directory");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should report wrong path kinds in doctor diagnostics", () => {
    const wrongHomeRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-doctor-home-"),
    );
    const fileBplHome = path.join(wrongHomeRoot, "bpl-home");
    const runtimeBplHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-doctor-home-"),
    );

    try {
      fs.writeFileSync(fileBplHome, "not a directory");
      const fileHomeResult = spawnSync("bun", [BPL_CLI, "doctor", "--json"], {
        encoding: "utf-8",
        env: {
          ...process.env,
          BPL_HOME: fileBplHome,
          NO_COLOR: "1",
        },
      });

      const fileHomeReport = expectDoctorJsonReport(fileHomeResult, {
        status: 1,
        success: false,
      });
      const homeCheck = fileHomeReport.checks.find(
        (check) => check.name === "BPL home",
      );
      expect(homeCheck?.ok).toBe(false);
      expect(homeCheck?.detail).toContain("is not a directory");

      fs.mkdirSync(path.join(runtimeBplHome, "lib"), { recursive: true });
      fs.mkdirSync(path.join(runtimeBplHome, "lib", "runtime.ll"));
      const runtimeResult = spawnSync("bun", [BPL_CLI, "doctor", "--json"], {
        encoding: "utf-8",
        env: {
          ...process.env,
          BPL_HOME: runtimeBplHome,
          NO_COLOR: "1",
        },
      });

      const runtimeReport = expectDoctorJsonReport(runtimeResult, {
        status: 1,
        success: false,
      });
      const runtimeCheck = runtimeReport.checks.find(
        (check) => check.name === "Runtime IR",
      );
      expect(runtimeCheck?.ok).toBe(false);
      expect(runtimeCheck?.detail).toContain("is not a file");

      fs.rmSync(path.join(runtimeBplHome, "lib", "runtime.ll"), {
        recursive: true,
        force: true,
      });
      fs.symlinkSync(
        path.join(runtimeBplHome, "lib", "missing-runtime.ll"),
        path.join(runtimeBplHome, "lib", "runtime.ll"),
        "file",
      );
      const brokenRuntimeResult = spawnSync(
        "bun",
        [BPL_CLI, "doctor", "--json"],
        {
          encoding: "utf-8",
          env: {
            ...process.env,
            BPL_HOME: runtimeBplHome,
            NO_COLOR: "1",
          },
        },
      );

      const brokenRuntimeReport = expectDoctorJsonReport(brokenRuntimeResult, {
        status: 1,
        success: false,
      });
      const brokenRuntimeCheck = brokenRuntimeReport.checks.find(
        (check) => check.name === "Runtime IR",
      );
      expect(brokenRuntimeCheck?.ok).toBe(false);
      expect(brokenRuntimeCheck?.detail).toContain("broken symbolic link");
    } finally {
      fs.rmSync(wrongHomeRoot, { recursive: true, force: true });
      fs.rmSync(runtimeBplHome, { recursive: true, force: true });
    }
  });

  it("should report runtime resources through symlinked parents in doctor diagnostics", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-doctor-runtime-parent-link-"),
    );
    const bplHome = path.join(tempDir, "bpl-home");
    const runtimeTarget = path.join(tempDir, "runtime-target");
    const libLink = path.join(bplHome, "lib");

    try {
      fs.mkdirSync(bplHome, { recursive: true });
      fs.mkdirSync(runtimeTarget);
      fs.symlinkSync(
        path.join(process.cwd(), "grammar"),
        path.join(bplHome, "grammar"),
        "dir",
      );
      fs.symlinkSync(runtimeTarget, libLink, "dir");
      for (const entry of [
        "runtime.ll",
        "runtime_support.o",
        "runtime_wasm.ll",
        "runtime_wasm_host.ll",
      ]) {
        fs.writeFileSync(path.join(runtimeTarget, entry), `${entry}\n`);
      }

      const result = spawnSync("bun", [BPL_CLI, "doctor", "--json"], {
        encoding: "utf-8",
        env: {
          ...process.env,
          BPL_HOME: bplHome,
          NO_COLOR: "1",
        },
      });

      const report = expectDoctorJsonReport(result, {
        status: 1,
        success: false,
      });
      const runtimeCheck = report.checks.find(
        (check) => check.name === "Runtime IR",
      );
      expect(runtimeCheck?.ok).toBe(false);
      expect(runtimeCheck?.detail).toContain(
        `parent path contains a symbolic link: ${libLink}`,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should tell users how to repair missing hosted wasm runtime assets", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-doctor-wasm-host-runtime-"),
    );
    const bplHome = path.join(tempDir, "bpl-home");
    linkBplHomeFixture(bplHome, {
      excludeLibEntries: new Set(["runtime_wasm_host.ll"]),
    });

    try {
      const result = spawnSync("bun", [BPL_CLI, "doctor", "--json"], {
        encoding: "utf-8",
        env: {
          ...process.env,
          BPL_HOME: bplHome,
          NO_COLOR: "1",
        },
      });

      const report = expectDoctorJsonReport(result, {
        status: 1,
        success: false,
      });
      const hostedRuntimeCheck = report.checks.find(
        (check) => check.name === "Hosted WebAssembly runtime IR",
      );
      expect(hostedRuntimeCheck?.ok).toBe(false);
      expect(hostedRuntimeCheck?.detail).toContain("runtime_wasm_host.ll");
      expect(hostedRuntimeCheck?.detail).toContain("not found");
      expect(hostedRuntimeCheck?.hint).toContain("bpl doctor");
      expect(hostedRuntimeCheck?.hint).toContain("reinstall BPL");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should honor BPL_CC in doctor diagnostics", () => {
    const missingCompiler = path.join(
      os.tmpdir(),
      "definitely-missing-bpl-cc",
    );
    const result = spawnSync("bun", [BPL_CLI, "doctor", "--json"], {
      encoding: "utf-8",
      env: {
        ...process.env,
        BPL_CC: missingCompiler,
        NO_COLOR: "1",
      },
    });

    const report = expectDoctorJsonReport(result, {
      status: 1,
      success: false,
    });
    const compilerCheck = report.checks.find(
      (check) => check.name === "native compiler",
    );
    expect(compilerCheck?.ok).toBe(false);
    expect(compilerCheck?.detail).toContain(missingCompiler);
    expect(compilerCheck?.detail).toContain("command not found");
    expect(compilerCheck?.detail).not.toContain("ENOENT");
  });

  it("should time out hanging compiler probes in doctor diagnostics", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-doctor-timeout-"),
    );
    const hangingCompiler = writeNodeCommandShim(
      path.join(tempDir, "hanging-cc"),
      ["setTimeout(() => {}, 100000);"],
    );

    try {
      const result = spawnSync("bun", [BPL_CLI, "doctor", "--json"], {
        encoding: "utf-8",
        env: {
          ...process.env,
          BPL_CC: hangingCompiler,
          NO_COLOR: "1",
        },
      });

      const report = expectDoctorJsonReport(result, {
        status: 1,
        success: false,
      });
      const compilerCheck = report.checks.find(
        (check) => check.name === "native compiler",
      );
      expect(compilerCheck?.ok).toBe(false);
      expect(compilerCheck?.detail).toContain(hangingCompiler);
      expect(compilerCheck?.detail).toContain("timed out");
      expect(compilerCheck?.detail).not.toContain("ETIMEDOUT");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should honor BPL_NM in doctor diagnostics", () => {
    const missingTool = path.join(os.tmpdir(), "definitely-missing-bpl-nm");
    const result = spawnSync("bun", [BPL_CLI, "doctor", "--json"], {
      encoding: "utf-8",
      env: {
        ...process.env,
        BPL_NM: missingTool,
        NO_COLOR: "1",
      },
    });

    const report = expectDoctorJsonReport(result, {
      status: 0,
      success: true,
    });
    const symbolToolCheck = report.checks.find(
      (check) => check.name === "object symbol tool",
    );
    expect(symbolToolCheck?.ok).toBe(false);
    expect(symbolToolCheck?.required).toBe(false);
    expect(symbolToolCheck?.detail).toContain(missingTool);
    expect(symbolToolCheck?.detail).toContain("command not found");
    expect(symbolToolCheck?.detail).not.toContain("ENOENT");
  });

  it("should honor BPL_TAR in doctor diagnostics", () => {
    const missingTool = path.join(os.tmpdir(), "definitely-missing-bpl-tar");
    const result = spawnSync("bun", [BPL_CLI, "doctor", "--json"], {
      encoding: "utf-8",
      env: {
        ...process.env,
        BPL_TAR: missingTool,
        NO_COLOR: "1",
      },
    });

    const report = expectDoctorJsonReport(result, {
      status: 0,
      success: true,
    });
    const archiveToolCheck = report.checks.find(
      (check) => check.name === "package archive tool",
    );
    expect(archiveToolCheck?.ok).toBe(false);
    expect(archiveToolCheck?.required).toBe(false);
    expect(archiveToolCheck?.detail).toContain(missingTool);
    expect(archiveToolCheck?.detail).toContain("command not found");
    expect(archiveToolCheck?.detail).not.toContain("ENOENT");
  });

  it("should honor BPL_WASM_CC in doctor diagnostics", () => {
    const missingCompiler = path.join(
      os.tmpdir(),
      "definitely-missing-bpl-wasm-cc",
    );
    const result = spawnSync("bun", [BPL_CLI, "doctor", "--json"], {
      encoding: "utf-8",
      env: {
        ...process.env,
        BPL_WASM_CC: missingCompiler,
        NO_COLOR: "1",
      },
    });

    const report = expectDoctorJsonReport(result, {
      status: 0,
      success: true,
    });
    const compilerCheck = report.checks.find(
      (check) => check.name === "wasm compiler",
    );
    expect(compilerCheck?.ok).toBe(false);
    expect(compilerCheck?.required).toBe(false);
    expect(compilerCheck?.detail).toContain(missingCompiler);
    expect(compilerCheck?.detail).toContain("command not found");
    expect(compilerCheck?.detail).not.toContain("ENOENT");
  });

  it("should report wasm linker prerequisite guidance in doctor diagnostics", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-doctor-wasm-linker-"),
    );
    const bplHome = path.join(tempDir, "bpl-home");
    const toolDir = path.join(tempDir, "tools");
    const missingWasmLd = path.join(toolDir, "missing-wasm-ld");

    try {
      fs.mkdirSync(toolDir, { recursive: true });
      linkBplHomeFixture(bplHome);
      writeNodePathShim(toolDir);
      const okTool = writeNodeCommandShim(path.join(toolDir, "ok-tool"), [
        'console.log("ok-tool 1.0.0");',
        "process.exit(0);",
      ]);
      const doctorEnv = {
        ...process.env,
        BPL_HOME: bplHome,
        BPL_CC: okTool,
        BPL_WASM_CC: okTool,
        BPL_NM: okTool,
        BPL_TAR: okTool,
        WASM_LD: missingWasmLd,
        PATH: toolDir,
        NO_COLOR: "1",
      };

      const result = spawnSync(process.execPath, [BPL_CLI, "doctor", "--json"], {
        encoding: "utf-8",
        env: doctorEnv,
      });

      const report = expectDoctorJsonReport(result, {
        status: 0,
        success: true,
      });
      const linkerCheck = report.checks.find(
        (check) => check.name === "wasm linker",
      );
      expect(linkerCheck).toMatchObject({
        ok: false,
        required: false,
        code: "BPL_WASM_LINKER_UNAVAILABLE",
        environment: {
          WASM_LD: missingWasmLd,
          BPL_REQUIRE_WASM_LD: null,
        },
        recommendedCommands: ["BPL_REQUIRE_WASM_LD=1 bun run test:wasm"],
      });
      expect(linkerCheck?.candidates).toEqual(
        expect.arrayContaining([missingWasmLd, "wasm-ld"]),
      );
      expect(linkerCheck?.hint).toContain("WASM_LD");
      expect(linkerCheck?.hint).toContain("BPL_REQUIRE_WASM_LD=1");

      const textResult = spawnSync(process.execPath, [BPL_CLI, "doctor"], {
        encoding: "utf-8",
        env: doctorEnv,
      });
      expect(textResult.status).toBe(0);
      expect(textResult.stdout).toContain("WARN wasm linker");
      expect(textResult.stdout).toContain("WASM_LD");
      expect(textResult.stdout).toContain("BPL_REQUIRE_WASM_LD=1");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should build a direct wasm artifact for wasm32 targets", () => {
    const tempFile = path.join(process.cwd(), "tests/temp_wasm_build.bpl");
    const wasmFile = path.join(process.cwd(), "tests/temp_wasm_build.wasm");
    const llvmFile = `${wasmFile}.ll`;

    try {
      fs.writeFileSync(tempFile, "frame main() ret int { return 42; }");

      const result = runCLI([
        "build",
        tempFile,
        "--target",
        "wasm32-unknown-unknown",
        "-o",
        wasmFile,
      ]);

      if (result.status !== 0) {
        throw new Error(
          [
            "Expected wasm build to succeed.",
            `status: ${result.status}`,
            `stdout:\n${result.stdout}`,
            `stderr:\n${result.stderr}`,
          ].join("\n"),
        );
      }
      expect(fs.existsSync(wasmFile)).toBe(true);
      expect(fs.readFileSync(wasmFile).subarray(0, 4).toString("binary")).toBe(
        "\0asm",
      );
      expect(fs.existsSync(llvmFile)).toBe(true);
    } finally {
      for (const file of [tempFile, wasmFile, llvmFile]) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
    }
  });

  it("should report missing wasm runtime IR before linking", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-wasm-runtime-"));
    const bplHome = path.join(tempDir, "bpl-home");
    const sourceFile = path.join(tempDir, "main.bpl");
    const wasmFile = path.join(tempDir, "main.wasm");
    linkBplHomeFixture(bplHome, {
      excludeLibEntries: new Set(["runtime_wasm.ll"]),
    });
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");

    try {
      const result = spawnSync(
        "bun",
        [
          BPL_CLI,
          "build",
          sourceFile,
          "--target",
          "wasm32-unknown-unknown",
          "-o",
          wasmFile,
        ],
        {
          encoding: "utf-8",
          env: {
            ...process.env,
            BPL_HOME: bplHome,
            NO_COLOR: "1",
          },
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("WebAssembly runtime IR not found");
      expect(result.stderr).not.toContain("clang");
      expect(fs.existsSync(wasmFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should report missing hosted wasm runtime IR before linking", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-wasm-host-runtime-"),
    );
    const bplHome = path.join(tempDir, "bpl-home");
    const sourceFile = path.join(tempDir, "main.bpl");
    const wasmFile = path.join(tempDir, "main.wasm");
    linkBplHomeFixture(bplHome, {
      excludeLibEntries: new Set(["runtime_wasm_host.ll"]),
    });
    fs.writeFileSync(sourceFile, "frame main() ret int { return 0; }\n");

    try {
      const result = spawnSync(
        "bun",
        [
          BPL_CLI,
          "build",
          sourceFile,
          "--target",
          "wasm32-unknown-unknown",
          "--wasm-runtime",
          "host",
          "-o",
          wasmFile,
        ],
        {
          encoding: "utf-8",
          env: {
            ...process.env,
            BPL_HOME: bplHome,
            NO_COLOR: "1",
          },
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Hosted WebAssembly runtime IR not found");
      expect(result.stderr).not.toContain("clang");
      expect(fs.existsSync(wasmFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should ship wasm runtime symbols required by generated Type vtables", () => {
    const runtime = fs.readFileSync(
      path.join(process.cwd(), "lib/runtime_wasm.ll"),
      "utf-8",
    );

    expect(runtime).toContain(
      "define linkonce_odr i8* @Type_getTypeName_Type_ptr",
    );
    expect(runtime).toContain(
      "define linkonce_odr i8* @Type_toString_Type_ptr",
    );
    expect(runtime).toContain(
      "define linkonce_odr void @Type_destroy_Type_ptr",
    );
  });

  it("should reject cached module output paths that are directories before linking", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-cache-output-"));
    const moduleFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    fs.writeFileSync(
      moduleFile,
      ["export answer;", "frame answer() ret int {", "    return 42;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import answer from "./math.bpl";',
        "frame main() ret int {",
        "    return answer();",
        "}",
      ].join("\n"),
    );

    try {
      const result = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        tempDir,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Output path is a directory");
      expect(result.stderr).not.toContain("Is a directory");
      expect(result.stderr).not.toContain("EISDIR");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject cached module output paths that are symbolic links before linking", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-cache-output-link-"),
    );
    const moduleFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "app");
    const targetFile = path.join(tempDir, "target-app");
    fs.writeFileSync(
      moduleFile,
      ["export answer;", "frame answer() ret int {", "    return 42;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import answer from "./math.bpl";',
        "frame main() ret int {",
        "    return answer();",
        "}",
      ].join("\n"),
    );
    fs.symlinkSync(targetFile, outputFile, "file");

    try {
      const result = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Output path is a symbolic link");
      expect(result.stderr).toContain(outputFile);
      expect(result.stderr).not.toContain("ENOENT");
      expect(fs.existsSync(targetFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject cached module output paths whose parent path is a file", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-cache-output-parent-file-"),
    );
    const moduleFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const parentFile = path.join(tempDir, "not-a-dir");
    const outputFile = path.join(parentFile, "app");
    fs.writeFileSync(
      moduleFile,
      ["export answer;", "frame answer() ret int {", "    return 42;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import answer from "./math.bpl";',
        "frame main() ret int {",
        "    return answer();",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(parentFile, "not a directory\n");

    try {
      const result = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Output parent path is not a directory");
      expect(result.stderr).not.toContain("ENOTDIR");
      expect(fs.existsSync(outputFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject cached module output paths whose parent path is a symbolic link", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-cache-output-parent-link-"),
    );
    const moduleFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const realParentDir = path.join(tempDir, "real-parent");
    const linkedParentDir = path.join(tempDir, "linked-parent");
    const outputFile = path.join(linkedParentDir, "app");
    fs.writeFileSync(
      moduleFile,
      ["export answer;", "frame answer() ret int {", "    return 42;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import answer from "./math.bpl";',
        "frame main() ret int {",
        "    return answer();",
        "}",
      ].join("\n"),
    );
    fs.mkdirSync(realParentDir);
    fs.symlinkSync(realParentDir, linkedParentDir, "dir");

    try {
      const result = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Output parent path is a symbolic link");
      expect(result.stderr).toContain(linkedParentDir);
      expect(result.stderr).not.toContain("ENOENT");
      expect(fs.existsSync(outputFile)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject cached builds when .bpl-cache is not a directory", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-cache-file-"));
    const moduleFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    fs.writeFileSync(path.join(tempDir, ".bpl-cache"), "not a directory");
    fs.writeFileSync(
      moduleFile,
      ["export value;", "frame value() ret int {", "    return 7;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import value from "./math.bpl";',
        "frame main() ret int {",
        "    return value();",
        "}",
      ].join("\n"),
    );

    try {
      const result = runCLI(["build", mainFile, "--cache"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Module cache path is not a directory");
      expect(result.stderr).not.toContain("ENOTDIR");
      expect(result.stderr).not.toContain("EEXIST");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject cached builds when .bpl-cache is a symbolic link", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-cache-link-"));
    const outsideCacheDir = path.join(tempDir, "outside-cache");
    const moduleFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    fs.mkdirSync(outsideCacheDir);
    fs.symlinkSync(outsideCacheDir, path.join(tempDir, ".bpl-cache"), "dir");
    fs.writeFileSync(
      moduleFile,
      ["export value;", "frame value() ret int {", "    return 7;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import value from "./math.bpl";',
        "frame main() ret int {",
        "    return value();",
        "}",
      ].join("\n"),
    );

    try {
      const result = runCLI(["build", mainFile, "--cache"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Module cache path is a symbolic link");
      expect(result.stderr).toContain(path.join(tempDir, ".bpl-cache"));
      expect(fs.existsSync(path.join(outsideCacheDir, "manifest.json"))).toBe(
        false,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject cached builds when the cache manifest path is not a file", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-cache-manifest-dir-"),
    );
    const moduleFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    fs.mkdirSync(path.join(tempDir, ".bpl-cache", "manifest.json"), {
      recursive: true,
    });
    fs.writeFileSync(
      moduleFile,
      ["export value;", "frame value() ret int {", "    return 7;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import value from "./math.bpl";',
        "frame main() ret int {",
        "    return value();",
        "}",
      ].join("\n"),
    );

    try {
      const result = runCLI(["build", mainFile, "--cache"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Module cache manifest path is not a file",
      );
      expect(result.stderr).not.toContain("EISDIR");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should reject cached builds when the cache manifest path is a symbolic link", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-cache-manifest-link-"),
    );
    const cacheDir = path.join(tempDir, ".bpl-cache");
    const manifestFile = path.join(cacheDir, "manifest.json");
    const targetManifest = path.join(tempDir, "outside-manifest.json");
    const moduleFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    fs.mkdirSync(cacheDir);
    fs.writeFileSync(targetManifest, '{"outside":true}');
    fs.symlinkSync(targetManifest, manifestFile, "file");
    fs.writeFileSync(
      moduleFile,
      ["export value;", "frame value() ret int {", "    return 7;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import value from "./math.bpl";',
        "frame main() ret int {",
        "    return value();",
        "}",
      ].join("\n"),
    );

    try {
      const result = runCLI(["build", mainFile, "--cache"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Module cache manifest path is a symbolic link",
      );
      expect(result.stderr).toContain(manifestFile);
      expect(fs.readFileSync(targetManifest, "utf-8")).toBe('{"outside":true}');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should rebuild cached modules when the cache manifest schema is invalid", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-cache-manifest-schema-"),
    );
    const cacheDir = path.join(tempDir, ".bpl-cache");
    const manifestFile = path.join(cacheDir, "manifest.json");
    const moduleFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    fs.mkdirSync(cacheDir);
    fs.writeFileSync(
      manifestFile,
      JSON.stringify({ version: 1, modules: "not a module map" }, null, 2),
    );
    fs.writeFileSync(
      moduleFile,
      ["export value;", "frame value() ret int {", "    return 7;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import value from "./math.bpl";',
        "frame main() ret int {",
        "    return value();",
        "}",
      ].join("\n"),
    );

    try {
      const result = runCLI(["build", mainFile, "--cache", "--cache-stats"]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Executable created:");
      expect(result.stdout).toContain("Cache stats:");
      expect(result.stderr).not.toContain("TypeError");
      const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
      expect(typeof manifest.modules).toBe("object");
      expect(Object.keys(manifest.modules).length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should preserve overloads when building cached modules serially", () => {
    const tempDir = fs.mkdtempSync(
      path.join(process.cwd(), "tests/temp_serial_cache_overload-"),
    );
    const overloadsFile = path.join(tempDir, "overloads.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "serial_cache_overload_app");

    fs.writeFileSync(
      overloadsFile,
      [
        "export choose;",
        "frame choose(value: int) ret int {",
        "    return value + 1;",
        "}",
        "frame choose(value: bool) ret int {",
        "    return value ? 40 : 0;",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import choose from "./overloads.bpl";',
        "frame main() ret int {",
        "    return choose(true) + choose(1);",
        "}",
      ].join("\n"),
    );

    try {
      const result = runCLI(["build", mainFile, "--cache", "-o", outputFile]);

      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain("undefined reference");
      const runResult = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(runResult.status).toBe(42);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should cache and link imported modules as separate parallel objects", () => {
    const tempDir = fs.mkdtempSync(
      path.join(process.cwd(), "tests/temp_parallel_cache-"),
    );
    const constantsFile = path.join(tempDir, "constants.bpl");
    const mathFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "parallel_app");
    const manifestFile = path.join(tempDir, ".bpl-cache", "manifest.json");

    fs.writeFileSync(
      constantsFile,
      ["export seed;", "frame seed() ret int {", "    return 2;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mathFile,
      [
        'import seed from "./constants.bpl";',
        "export answer;",
        "frame answer(base: int) ret int {",
        "    return base + seed();",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import answer from "./math.bpl";',
        "frame main() ret int {",
        "    return answer(40);",
        "}",
      ].join("\n"),
    );

    try {
      const result = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(result.status).toBe(0);
      expect(fs.existsSync(outputFile)).toBe(true);

      const runResult = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(runResult.status).toBe(42);

      const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
      const cachedModulePaths = Object.keys(manifest.modules);
      expect(cachedModulePaths).toContain(constantsFile);
      expect(cachedModulePaths).toContain(mathFile);
      expect(cachedModulePaths).toContain(mainFile);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should use native linker defaults for cached module builds", () => {
    const tempDir = fs.mkdtempSync(
      path.join(process.cwd(), "tests/temp_cache_native_link-"),
    );
    const helperFile = path.join(tempDir, "helper.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "native_link_app");

    fs.writeFileSync(
      helperFile,
      ["export zero;", "frame zero() ret int {", "    return 0;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import zero from "./helper.bpl";',
        "extern cos(x: double) ret double;",
        "frame main() ret int {",
        "    local value: double = cos(0.0);",
        "    return cast<int>(value) + zero();",
        "}",
      ].join("\n"),
    );

    try {
      const result = runCLI(["build", mainFile, "--cache", "-o", outputFile]);

      expect(result.status).toBe(0);
      expect(fs.existsSync(outputFile)).toBe(true);

      const runResult = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(runResult.status).toBe(1);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should forward target CPU and architecture flags to cached builds", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-cache-driver-flags-"),
    );
    const helperFile = path.join(tempDir, "helper.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "driver_flags_app");
    const argsLog = path.join(tempDir, "cc-args.log");
    const fakeCompiler = writeNodeCommandShim(path.join(tempDir, "fake-cc"), [
      'const fs = require("fs");',
      "const args = process.argv.slice(2);",
      `fs.appendFileSync(${JSON.stringify(argsLog)}, args.join("\\n") + "\\n--\\n");`,
      'const outputIndex = args.lastIndexOf("-o");',
      "if (outputIndex >= 0 && args[outputIndex + 1]) {",
      '  fs.writeFileSync(args[outputIndex + 1], "fake output\\n");',
      "}",
    ]);

    fs.writeFileSync(
      helperFile,
      ["export value;", "frame value() ret int {", "    return 42;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import value from "./helper.bpl";',
        "frame main() ret int {",
        "    return value();",
        "}",
      ].join("\n"),
    );
    try {
      const result = spawnSync(
        "bun",
        [
          BPL_CLI,
          "build",
          mainFile,
          "--cache",
          "--cpu",
          "znver4",
          "--march",
          "x86-64-v3",
          "--clang-flag",
          "-fno-vectorize",
          "-o",
          outputFile,
        ],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: {
            ...process.env,
            BPL_CC: fakeCompiler,
            NO_COLOR: "1",
          },
        },
      );

      expect(result.status).toBe(0);
      expect(fs.existsSync(outputFile)).toBe(true);
      const args = fs.readFileSync(argsLog, "utf-8");
      expect(args).toContain("-mcpu=znver4");
      expect(args).toContain("-march=x86-64-v3");
      expect(args).toContain("-fno-vectorize");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should print cache stats for cached parallel builds on request", () => {
    const tempDir = fs.mkdtempSync(
      path.join(process.cwd(), "tests/temp_parallel_cache_stats-"),
    );
    const constantsFile = path.join(tempDir, "constants.bpl");
    const mathFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "parallel_app");

    fs.writeFileSync(
      constantsFile,
      ["export seed;", "frame seed() ret int {", "    return 2;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mathFile,
      [
        'import seed from "./constants.bpl";',
        "export answer;",
        "frame answer(base: int) ret int {",
        "    return base + seed();",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import answer from "./math.bpl";',
        "frame main() ret int {",
        "    return answer(40);",
        "}",
      ].join("\n"),
    );

    try {
      const first = runCLI([
        "build",
        mainFile,
        "--cache",
        "--cache-stats",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(first.status).toBe(0);
      expect(first.stdout).toContain("Cache stats:");
      const firstModules = Number(first.stdout.match(/modules=(\d+)/)?.[1]);
      expect(firstModules).toBeGreaterThanOrEqual(3);
      expect(first.stdout).toContain("hits=0");
      expect(first.stdout).toContain(`misses=${firstModules}`);

      const second = runCLI([
        "build",
        mainFile,
        "--cache",
        "--cache-stats",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(second.status).toBe(0);
      expect(second.stdout).toContain("Cache stats:");
      expect(second.stdout).toContain(`modules=${firstModules}`);
      expect(second.stdout).toContain(`hits=${firstModules}`);
      expect(second.stdout).toContain("misses=0");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should keep unchanged dependency objects cached when only the entry module changes", () => {
    const tempDir = fs.mkdtempSync(
      path.join(process.cwd(), "tests/temp_parallel_cache_precision-"),
    );
    const constantsFile = path.join(tempDir, "constants.bpl");
    const mathFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "parallel_app");
    const manifestFile = path.join(tempDir, ".bpl-cache", "manifest.json");

    const writeMain = (base: number) => {
      fs.writeFileSync(
        mainFile,
        [
          'import answer from "./math.bpl";',
          "frame main() ret int {",
          `    return answer(${base});`,
          "}",
        ].join("\n"),
      );
    };
    const readManifestModules = () =>
      JSON.parse(fs.readFileSync(manifestFile, "utf-8")).modules;

    fs.writeFileSync(
      constantsFile,
      ["export seed;", "frame seed() ret int {", "    return 2;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      mathFile,
      [
        'import seed from "./constants.bpl";',
        "export answer;",
        "frame answer(base: int) ret int {",
        "    return base + seed();",
        "}",
      ].join("\n"),
    );
    writeMain(40);

    try {
      const first = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(first.status).toBe(0);

      const firstRun = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(firstRun.status).toBe(42);

      const firstManifest = readManifestModules();
      const firstConstants = firstManifest[constantsFile];
      const firstMath = firstManifest[mathFile];
      const firstMain = firstManifest[mainFile];
      expect(firstConstants).toBeTruthy();
      expect(firstMath).toBeTruthy();
      expect(firstMain).toBeTruthy();

      writeMain(41);

      const second = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(second.status).toBe(0);

      const secondRun = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(secondRun.status).toBe(43);

      const secondManifest = readManifestModules();
      expect(secondManifest[constantsFile].hash).toBe(firstConstants.hash);
      expect(secondManifest[constantsFile].objectFile).toBe(
        firstConstants.objectFile,
      );
      expect(secondManifest[mathFile].hash).toBe(firstMath.hash);
      expect(secondManifest[mathFile].objectFile).toBe(firstMath.objectFile);
      expect(secondManifest[mainFile].hash).not.toBe(firstMain.hash);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should not recache importers when dependency private helper signatures change", () => {
    const tempDir = fs.mkdtempSync(
      path.join(process.cwd(), "tests/temp_parallel_cache_private-"),
    );
    const mathFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "parallel_app");
    const manifestFile = path.join(tempDir, ".bpl-cache", "manifest.json");

    const writeMath = (extraParam: boolean) => {
      fs.writeFileSync(
        mathFile,
        extraParam
          ? [
              "frame hidden(base: int, bonus: int) ret int {",
              "    return base + bonus;",
              "}",
              "export answer;",
              "frame answer(base: int) ret int {",
              "    return hidden(base, 0) + 2;",
              "}",
            ].join("\n")
          : [
              "frame hidden(base: int) ret int {",
              "    return base;",
              "}",
              "export answer;",
              "frame answer(base: int) ret int {",
              "    return hidden(base) + 2;",
              "}",
            ].join("\n"),
      );
    };
    const readManifestModules = () =>
      JSON.parse(fs.readFileSync(manifestFile, "utf-8")).modules;

    writeMath(false);
    fs.writeFileSync(
      mainFile,
      [
        'import answer from "./math.bpl";',
        "frame main() ret int {",
        "    return answer(40);",
        "}",
      ].join("\n"),
    );

    try {
      const first = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(first.status).toBe(0);

      const firstRun = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(firstRun.status).toBe(42);

      const firstManifest = readManifestModules();
      const firstMath = firstManifest[mathFile];
      const firstMain = firstManifest[mainFile];
      expect(firstMath).toBeTruthy();
      expect(firstMain).toBeTruthy();

      writeMath(true);

      const second = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(second.status).toBe(0);

      const secondRun = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(secondRun.status).toBe(42);

      const secondManifest = readManifestModules();
      expect(secondManifest[mathFile].hash).not.toBe(firstMath.hash);
      expect(secondManifest[mainFile].hash).toBe(firstMain.hash);
      expect(secondManifest[mainFile].objectFile).toBe(firstMain.objectFile);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should not recache importers when dependency private type layouts change", () => {
    const tempDir = fs.mkdtempSync(
      path.join(process.cwd(), "tests/temp_parallel_cache_private_type-"),
    );
    const mathFile = path.join(tempDir, "math.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "parallel_app");
    const manifestFile = path.join(tempDir, ".bpl-cache", "manifest.json");

    const writeMath = (extraField: boolean) => {
      fs.writeFileSync(
        mathFile,
        extraField
          ? [
              "struct Scratch {",
              "    value: int,",
              "    bonus: int,",
              "}",
              "frame hidden(base: int) ret int {",
              "    local scratch: Scratch = Scratch { value: base, bonus: 0 };",
              "    return scratch.value + scratch.bonus;",
              "}",
              "export answer;",
              "frame answer(base: int) ret int {",
              "    return hidden(base) + 2;",
              "}",
            ].join("\n")
          : [
              "struct Scratch {",
              "    value: int,",
              "}",
              "frame hidden(base: int) ret int {",
              "    local scratch: Scratch = Scratch { value: base };",
              "    return scratch.value;",
              "}",
              "export answer;",
              "frame answer(base: int) ret int {",
              "    return hidden(base) + 2;",
              "}",
            ].join("\n"),
      );
    };
    const readManifestModules = () =>
      JSON.parse(fs.readFileSync(manifestFile, "utf-8")).modules;

    writeMath(false);
    fs.writeFileSync(
      mainFile,
      [
        'import answer from "./math.bpl";',
        "frame main() ret int {",
        "    return answer(40);",
        "}",
      ].join("\n"),
    );

    try {
      const first = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(first.status).toBe(0);

      const firstRun = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(firstRun.status).toBe(42);

      const firstManifest = readManifestModules();
      const firstMath = firstManifest[mathFile];
      const firstMain = firstManifest[mainFile];
      expect(firstMath).toBeTruthy();
      expect(firstMain).toBeTruthy();

      writeMath(true);

      const second = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(second.status).toBe(0);

      const secondRun = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(secondRun.status).toBe(42);

      const secondManifest = readManifestModules();
      expect(secondManifest[mathFile].hash).not.toBe(firstMath.hash);
      expect(secondManifest[mainFile].hash).toBe(firstMain.hash);
      expect(secondManifest[mainFile].objectFile).toBe(firstMain.objectFile);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should not recache importers when transitive dependency unrelated exports change", () => {
    const tempDir = fs.mkdtempSync(
      path.join(process.cwd(), "tests/temp_parallel_cache_transitive-"),
    );
    const leafFile = path.join(tempDir, "leaf.bpl");
    const middleFile = path.join(tempDir, "middle.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "parallel_app");
    const manifestFile = path.join(tempDir, ".bpl-cache", "manifest.json");

    const writeLeaf = (changedExtraExport: boolean) => {
      fs.writeFileSync(
        leafFile,
        changedExtraExport
          ? [
              "export helper;",
              "export extra;",
              "frame helper(base: int) ret int {",
              "    return base + 1;",
              "}",
              "frame extra(value: int, bonus: int) ret int {",
              "    return value + bonus + 2;",
              "}",
            ].join("\n")
          : [
              "export helper;",
              "export extra;",
              "frame helper(base: int) ret int {",
              "    return base + 1;",
              "}",
              "frame extra(value: int) ret int {",
              "    return value + 2;",
              "}",
            ].join("\n"),
      );
    };
    const readManifestModules = () =>
      JSON.parse(fs.readFileSync(manifestFile, "utf-8")).modules;

    writeLeaf(false);
    fs.writeFileSync(
      middleFile,
      [
        'import helper from "./leaf.bpl";',
        "export answer;",
        "frame answer(base: int) ret int {",
        "    return helper(base) + 1;",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import answer from "./middle.bpl";',
        "frame main() ret int {",
        "    return answer(40);",
        "}",
      ].join("\n"),
    );

    try {
      const first = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(first.status).toBe(0);

      const firstRun = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(firstRun.status).toBe(42);

      const firstManifest = readManifestModules();
      const firstLeaf = firstManifest[leafFile];
      const firstMain = firstManifest[mainFile];
      expect(firstLeaf).toBeTruthy();
      expect(firstMain).toBeTruthy();

      writeLeaf(true);

      const second = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(second.status).toBe(0);

      const secondRun = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(secondRun.status).toBe(42);

      const secondManifest = readManifestModules();
      expect(secondManifest[leafFile].hash).not.toBe(firstLeaf.hash);
      expect(secondManifest[mainFile].hash).toBe(firstMain.hash);
      expect(secondManifest[mainFile].objectFile).toBe(firstMain.objectFile);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should recache importers when transitive dependency types are exposed through direct ABI", () => {
    const tempDir = fs.mkdtempSync(
      path.join(process.cwd(), "tests/temp_parallel_cache_transitive_type-"),
    );
    const leafFile = path.join(tempDir, "leaf.bpl");
    const middleFile = path.join(tempDir, "middle.bpl");
    const mainFile = path.join(tempDir, "main.bpl");
    const outputFile = path.join(tempDir, "parallel_app");
    const manifestFile = path.join(tempDir, ".bpl-cache", "manifest.json");

    const writeLeaf = (extraField: boolean) => {
      fs.writeFileSync(
        leafFile,
        extraField
          ? [
              "export [Leaf];",
              "export makeLeaf;",
              "struct Leaf {",
              "    value: int,",
              "    bonus: int,",
              "}",
              "frame makeLeaf() ret Leaf {",
              "    return Leaf { value: 7, bonus: 1 };",
              "}",
            ].join("\n")
          : [
              "export [Leaf];",
              "export makeLeaf;",
              "struct Leaf {",
              "    value: int,",
              "}",
              "frame makeLeaf() ret Leaf {",
              "    return Leaf { value: 7 };",
              "}",
            ].join("\n"),
      );
    };
    const readManifestModules = () =>
      JSON.parse(fs.readFileSync(manifestFile, "utf-8")).modules;

    writeLeaf(false);
    fs.writeFileSync(
      middleFile,
      [
        'import [Leaf], makeLeaf from "./leaf.bpl";',
        "export forward;",
        "frame forward() ret Leaf {",
        "    return makeLeaf();",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      mainFile,
      [
        'import forward from "./middle.bpl";',
        "frame main() ret int {",
        "    forward();",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    try {
      const first = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(first.status).toBe(0);

      const firstRun = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(firstRun.status).toBe(0);

      const firstManifest = readManifestModules();
      const firstLeaf = firstManifest[leafFile];
      const firstMain = firstManifest[mainFile];
      expect(firstLeaf).toBeTruthy();
      expect(firstMain).toBeTruthy();

      writeLeaf(true);

      const second = runCLI([
        "build",
        mainFile,
        "--cache",
        "--jobs",
        "2",
        "-o",
        outputFile,
      ]);

      expect(second.status).toBe(0);

      const secondRun = spawnSync(outputFile, [], { encoding: "utf-8" });
      expect(secondRun.status).toBe(0);

      const secondManifest = readManifestModules();
      expect(secondManifest[leafFile].hash).not.toBe(firstLeaf.hash);
      expect(secondManifest[mainFile].hash).not.toBe(firstMain.hash);
      expect(secondManifest[mainFile].objectFile).not.toBe(
        firstMain.objectFile,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
