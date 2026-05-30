import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const BPL_CLI = path.join(process.cwd(), "index.ts");

function runCLI(args: string[]) {
  return spawnSync("bun", [BPL_CLI, ...args], {
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1" }, // Disable color for easier assertion
  });
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

  it("should reject directories in source analysis commands", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-analysis-dir-"),
    );
    const sourceDir = path.join(tempDir, "src");
    fs.mkdirSync(sourceDir);

    try {
      const check = runCLI(["check", "--json", sourceDir]);
      expect(check.status).toBe(1);
      expect(JSON.parse(check.stdout).files[0]).toEqual({
        file: sourceDir,
        success: false,
        error: "Input path is not a file",
      });

      const lint = runCLI(["lint", "--json", sourceDir]);
      expect(lint.status).toBe(1);
      expect(JSON.parse(lint.stdout).files[0]).toEqual({
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

  it("should format files", () => {
    // Create a temporary unformatted file
    const tempFile = path.join(process.cwd(), "tests/temp_format.bpl");
    const unformatted = "frame  main ( )  ret  int { return 0 ; }";
    fs.writeFileSync(tempFile, unformatted);

    try {
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

  it("should check formatting without rewriting files", () => {
    const tempFile = path.join(process.cwd(), "tests/temp_format_check.bpl");
    const unformatted = "frame  main ( )  ret  int { return 0 ; }";
    fs.writeFileSync(tempFile, unformatted);

    try {
      const result = runCLI(["format", "--check", tempFile]);

      expect(result.status).toBe(1);
      expect(result.stderr + result.stdout).toContain("not formatted");
      expect(fs.readFileSync(tempFile, "utf-8")).toBe(unformatted);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
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
      const dryRunReport = JSON.parse(dryRun.stdout);
      expect(dryRunReport).toMatchObject({
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
      const cleanReport = JSON.parse(clean.stdout);
      expect(cleanReport.dryRun).toBe(false);
      expect(cleanReport.count).toBe(2);
      expect(fs.existsSync(path.join(tempDir, "main.ll"))).toBe(false);
      expect(fs.existsSync(buildDir)).toBe(false);
      expect(fs.existsSync(path.join(tempDir, "main.bpl"))).toBe(true);
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

    fs.writeFileSync(trackedLl, "; tracked runtime ir");
    fs.writeFileSync(trackedBuildFile, "tracked artifact");
    fs.writeFileSync(untrackedObject, "object");

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
      expect(cleanReport.entries).toEqual([
        { path: "generated.o", type: "file" },
      ]);
      expect(fs.existsSync(trackedLl)).toBe(true);
      expect(fs.existsSync(trackedBuildFile)).toBe(true);
      expect(fs.existsSync(untrackedObject)).toBe(false);
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
      expect(JSON.parse(result.stdout)).toEqual({
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

  it("should reject non-string run-script entries", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-script-"));
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

    try {
      const result = spawnSync("bun", [BPL_CLI, "run-script", "bad"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("must be a string");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should report lint diagnostics as JSON", () => {
    const lintFile = path.join(process.cwd(), "examples/lint_test/main.bpl");
    const result = runCLI(["lint", "--json", lintFile]);

    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
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
    fs.writeFileSync(
      tempFile,
      ["frame main() {", '    local x: i32 = "bad";', "}"].join("\n"),
    );

    try {
      const result = runCLI(["check", "--json", tempFile]);

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
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

  it("should count missing files in check JSON totals", () => {
    const missingFile = path.join(
      process.cwd(),
      "tests/does-not-exist-check.bpl",
    );
    const result = runCLI(["check", "--json", missingFile]);

    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
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

  it("should honor BPL_CC when skipping unavailable package IR verification", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-pack-no-cc-"));
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
          NO_COLOR: "1",
        },
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("Skipping IR verification");
      expect(result.stderr).toContain(missingCompiler);
      expect(
        fs.existsSync(path.join(tempDir, "missing-cc-pack-1.0.0.tgz")),
      ).toBe(true);
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

  it("should generate typedefs, structs, enums, and constants from C headers", () => {
    const tempHeader = path.join(process.cwd(), "tests/temp_bindgen_rich.h");
    fs.writeFileSync(
      tempHeader,
      [
        "#define ANSWER 42",
        "typedef unsigned int bpl_size;",
        "typedef struct Point { int x; double y; } Point;",
        "typedef enum Color { COLOR_RED = 1, COLOR_BLUE = 2 } Color;",
        "Point make_point(int x, double y);",
        "bpl_size measure(Point *point);",
      ].join("\n"),
    );

    try {
      const result = runCLI(["bindgen", tempHeader]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("global const ANSWER: int = 42;");
      expect(result.stdout).toContain("type bpl_size = uint;");
      expect(result.stdout).toContain("struct Point {");
      expect(result.stdout).toContain("x: int,");
      expect(result.stdout).toContain("y: double,");
      expect(result.stdout).toContain("enum Color {");
      expect(result.stdout).toContain("COLOR_RED,");
      expect(result.stdout).toContain("COLOR_BLUE,");
      expect(result.stdout).toContain(
        "extern make_point(x: int, y: double) ret Point;",
      );
      expect(result.stdout).toContain(
        "extern measure(point: *Point) ret bpl_size;",
      );
    } finally {
      if (fs.existsSync(tempHeader)) fs.unlinkSync(tempHeader);
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
    expect(bash.stdout).toContain("--repair-lock");
    expect(zsh.stdout).toContain("--update[Re-resolve bpl.json dependencies");
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

    expect(result.status).toBe(0);

    const report = JSON.parse(result.stdout);
    expect(report.success).toBe(true);
    expect(report.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(report.platform.os).toBeTruthy();
    expect(report.platform.arch).toBeTruthy();
    expect(report.checks.map((check: { name: string }) => check.name)).toEqual(
      expect.arrayContaining([
        "BPL home",
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
        (check: { ok: boolean; required?: boolean }) =>
          check.ok === true || check.required === false,
      ),
    ).toBe(true);
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

    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    const compilerCheck = report.checks.find(
      (check: { name: string }) => check.name === "native compiler",
    );
    expect(compilerCheck.ok).toBe(false);
    expect(compilerCheck.detail).toContain(missingCompiler);
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

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    const symbolToolCheck = report.checks.find(
      (check: { name: string }) => check.name === "object symbol tool",
    );
    expect(symbolToolCheck.ok).toBe(false);
    expect(symbolToolCheck.required).toBe(false);
    expect(symbolToolCheck.detail).toContain(missingTool);
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

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    const archiveToolCheck = report.checks.find(
      (check: { name: string }) => check.name === "package archive tool",
    );
    expect(archiveToolCheck.ok).toBe(false);
    expect(archiveToolCheck.required).toBe(false);
    expect(archiveToolCheck.detail).toContain(missingTool);
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

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    const compilerCheck = report.checks.find(
      (check: { name: string }) => check.name === "wasm compiler",
    );
    expect(compilerCheck.ok).toBe(false);
    expect(compilerCheck.required).toBe(false);
    expect(compilerCheck.detail).toContain(missingCompiler);
  });

  it("should build a direct wasm artifact for wasm32 targets", () => {
    const tempFile = path.join(process.cwd(), "tests/temp_wasm_build.bpl");
    const wasmFile = path.join(process.cwd(), "tests/temp_wasm_build.wasm");
    const llvmFile = `${wasmFile}.ll`;

    fs.writeFileSync(tempFile, "frame main() ret int { return 42; }");

    try {
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
