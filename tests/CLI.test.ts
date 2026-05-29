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
      expect(result.stdout).toContain("extern printf(fmt: string, ...) ret int;");
      expect(result.stdout).toContain("extern abs(arg0: int) ret int;");
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
    expect(zsh.stdout).toContain("wasm32-unknown-unknown");
  });
});
