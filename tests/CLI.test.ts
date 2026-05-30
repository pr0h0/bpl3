import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
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
    expect(bash.stdout).toContain("package-cache");
    expect(zsh.stdout).toContain("package-cache:List and clean cached package archives");
    expect(bash.stdout).toContain("packages --json");
    expect(zsh.stdout).toContain("1:scope:(packages)");
    expect(bash.stdout).toContain("--repair-lock");
    expect(zsh.stdout).toContain("--update[Re-resolve bpl.json dependencies");
    expect(bash.stdout).toContain("--cache-stats");
    expect(zsh.stdout).toContain("--cache-stats");
    expect(bash.stdout).toContain("--template");
    expect(zsh.stdout).toContain("--template");
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
        "clang",
      ]),
    );
    expect(
      report.checks.every(
        (check: { ok: boolean; required?: boolean }) =>
          check.ok === true || check.required === false,
      ),
    ).toBe(true);
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
