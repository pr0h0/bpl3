import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CompilerError } from "../compiler/common/CompilerError";
import { ModuleResolver } from "../compiler/middleend/ModuleResolver";

import type * as AST from "../compiler/common/AST";

describe("ModuleResolver", () => {
  // Create temp directory for test files
  const tempDir = path.join(os.tmpdir(), `bpl-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });

    // Create dummy errors.bpl for implicit imports
    fs.writeFileSync(
      path.join(tempDir, "errors.bpl"),
      `
      struct Error {
        message: string,
      }
      export [Error];
      `,
    );
  });

  afterAll(() => {
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("keeps module parsing off the separate grammar lexer hot path", () => {
    const moduleResolverSource = fs.readFileSync(
      path.join(process.cwd(), "compiler/middleend/ModuleResolver.ts"),
      "utf8",
    );
    const importHandlerSource = fs.readFileSync(
      path.join(process.cwd(), "compiler/middleend/ImportHandler.ts"),
      "utf8",
    );

    expect(moduleResolverSource).not.toContain("lexWithGrammar(content");
    expect(moduleResolverSource).not.toContain(
      "new Parser(content, modulePath, tokens)",
    );
    expect(importHandlerSource).not.toContain("lexWithGrammar(content");
    expect(importHandlerSource).not.toContain(
      "new Parser(content, importPath, tokens)",
    );
  });

  it("should resolve a single module without imports", () => {
    const mainPath = path.join(tempDir, "main.bpl");
    fs.writeFileSync(
      mainPath,
      `
      frame main() ret int {
        return 0;
      }
    `,
    );

    const resolver = new ModuleResolver({ stdLibPath: tempDir });
    const modules = resolver.resolveModules(mainPath);

    // Expect 2 modules: errors.bpl (implicit) and main.bpl
    expect(modules.length).toBe(2);
    expect(path.basename(modules[0]!.path)).toBe("errors.bpl");
    expect(modules[1]!.path).toBe(mainPath);
    // main depends on errors.bpl
    expect(modules[1]!.dependencies.size).toBe(1);
  });

  it("does not load primitive wrappers for modules that only import C extern declarations", () => {
    const scopedStdLib = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-module-c-externs-"),
    );
    const mainPath = path.join(scopedStdLib, "main.bpl");
    const stdDir = path.join(scopedStdLib, "std");

    fs.mkdirSync(stdDir, { recursive: true });
    fs.writeFileSync(
      path.join(stdDir, "errors.bpl"),
      [
        "struct Error {",
        "  message: string,",
        "}",
        "export [Error];",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(stdDir, "c.bpl"),
      [
        "export [printf];",
        "extern printf(fmt: string, ...) ret int;",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(stdDir, "primitives.bpl"),
      [
        "export [Int];",
        "struct Int {",
        "  value: int,",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      mainPath,
      [
        'import [printf] from "std/c.bpl";',
        "frame main() ret int {",
        '  printf("hello\\n");',
        "  return 0;",
        "}",
      ].join("\n"),
    );

    try {
      const modules = new ModuleResolver({ stdLibPath: stdDir }).resolveModules(
        mainPath,
      );
      const moduleNames = modules.map((module) => path.basename(module.path));

      expect(moduleNames).toContain("errors.bpl");
      expect(moduleNames).toContain("c.bpl");
      expect(moduleNames).toContain("main.bpl");
      expect(moduleNames).not.toContain("primitives.bpl");
    } finally {
      fs.rmSync(scopedStdLib, { recursive: true, force: true });
    }
  });

  it("loads primitive wrappers when a module mentions a wrapper type", () => {
    const scopedStdLib = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-module-primitive-wrapper-"),
    );
    const mainPath = path.join(scopedStdLib, "main.bpl");
    const stdDir = path.join(scopedStdLib, "std");

    fs.mkdirSync(stdDir, { recursive: true });
    fs.writeFileSync(
      path.join(stdDir, "errors.bpl"),
      [
        "struct Error {",
        "  message: string,",
        "}",
        "export [Error];",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(stdDir, "primitives.bpl"),
      [
        "export [Int];",
        "struct Int {",
        "  value: int,",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      mainPath,
      [
        "frame main() ret int {",
        "  local boxed: Int;",
        "  boxed.value = 42;",
        "  return boxed.value;",
        "}",
      ].join("\n"),
    );

    try {
      const modules = new ModuleResolver({ stdLibPath: stdDir }).resolveModules(
        mainPath,
      );
      const moduleNames = modules.map((module) => path.basename(module.path));

      expect(moduleNames).toContain("errors.bpl");
      expect(moduleNames).toContain("primitives.bpl");
      expect(moduleNames).toContain("main.bpl");
    } finally {
      fs.rmSync(scopedStdLib, { recursive: true, force: true });
    }
  });

  it("preserves module doc comments without pre-lexing tokens", () => {
    const mainPath = path.join(tempDir, "documented_module.bpl");
    fs.writeFileSync(
      mainPath,
      `
      /#
      Adds one to the provided value.
      #/
      frame documented(value: int) ret int {
        return value + 1;
      }
    `,
    );

    const resolver = new ModuleResolver({ stdLibPath: tempDir });
    const modules = resolver.resolveModules(mainPath);
    const mainModule = modules.find((module) => module.path === mainPath);
    const documentedFunction = mainModule?.ast.statements.find(
      (statement): statement is AST.FunctionDecl =>
        statement.kind === "FunctionDecl" && statement.name === "documented",
    );

    expect(documentedFunction?.documentation).toBe(
      "Adds one to the provided value.",
    );
  });

  it("should resolve modules with linear dependencies", () => {
    // Create module A (no dependencies)
    const moduleAPath = path.join(tempDir, "moduleA.bpl");
    fs.writeFileSync(
      moduleAPath,
      `
      struct Point {
        x: int,
        y: int,
      }
    `,
    );

    // Create module B (depends on A)
    const moduleBPath = path.join(tempDir, "moduleB.bpl");
    fs.writeFileSync(
      moduleBPath,
      `
      import [Point] from "./moduleA.bpl";
      
      frame usePoint() ret int {
        local p: Point;
        return 0;
      }
    `,
    );

    // Create main (depends on B)
    const mainPath = path.join(tempDir, "main2.bpl");
    fs.writeFileSync(
      mainPath,
      `
      import [usePoint] from "./moduleB.bpl";
      
      frame main() ret int {
        return usePoint();
      }
    `,
    );

    const resolver = new ModuleResolver({ stdLibPath: tempDir });
    const modules = resolver.resolveModules(mainPath);

    // Should be in order: errors.bpl, A, B, main
    expect(modules.length).toBe(4);
    expect(path.basename(modules[0]!.path)).toBe("errors.bpl");
    expect(path.basename(modules[1]!.path)).toBe("moduleA.bpl");
    expect(path.basename(modules[2]!.path)).toBe("moduleB.bpl");
    expect(path.basename(modules[3]!.path)).toBe("main2.bpl");
  });

  it("should detect circular dependencies", () => {
    // Create module C that imports D
    const moduleCPath = path.join(tempDir, "moduleC.bpl");
    fs.writeFileSync(
      moduleCPath,
      `
      import [funcD] from "./moduleD.bpl";
      
      frame funcC() ret int {
        return funcD();
      }
    `,
    );

    // Create module D that imports C (circular!)
    const moduleDPath = path.join(tempDir, "moduleD.bpl");
    fs.writeFileSync(
      moduleDPath,
      `
      import [funcC] from "./moduleC.bpl";
      
      frame funcD() ret int {
        return funcC();
      }
    `,
    );

    const resolver = new ModuleResolver();

    expect(() => {
      resolver.resolveModules(moduleCPath);
    }).toThrow(/[Cc]ircular/);
  });

  it("should handle diamond dependencies", () => {
    // Common module
    const commonPath = path.join(tempDir, "common.bpl");
    fs.writeFileSync(
      commonPath,
      `
      struct Data {
        value: int,
      }
    `,
    );

    // Left branch
    const leftPath = path.join(tempDir, "left.bpl");
    fs.writeFileSync(
      leftPath,
      `
      import [Data] from "./common.bpl";
      
      frame useLeft(d: Data) ret int {
        return d.value;
      }
    `,
    );

    // Right branch
    const rightPath = path.join(tempDir, "right.bpl");
    fs.writeFileSync(
      rightPath,
      `
      import [Data] from "./common.bpl";
      
      frame useRight(d: Data) ret int {
        return d.value * 2;
      }
    `,
    );

    // Main imports both
    const mainPath = path.join(tempDir, "diamond_main.bpl");
    fs.writeFileSync(
      mainPath,
      `
      import [useLeft] from "./left.bpl";
      import [useRight] from "./right.bpl";
      import [Data] from "./common.bpl";
      
      frame main() ret int {
        local d: Data;
        return useLeft(d) + useRight(d);
      }
    `,
    );

    const resolver = new ModuleResolver({ stdLibPath: tempDir });
    const modules = resolver.resolveModules(mainPath);

    // Common should appear first, then left and right, then main
    // Plus errors.bpl at the very beginning
    expect(modules.length).toBe(5);
    expect(path.basename(modules[0]!.path)).toBe("errors.bpl");
    expect(path.basename(modules[1]!.path)).toBe("common.bpl");
    // Left and right can be in either order
    const lastModule = path.basename(modules[modules.length - 1]!.path);
    expect(lastModule).toBe("diamond_main.bpl");
  });

  it("should fail on missing module", () => {
    const mainPath = path.join(tempDir, "missing_import.bpl");
    fs.writeFileSync(
      mainPath,
      `
      import [Something] from "./does_not_exist.bpl";
      
      frame main() ret int {
        return 0;
      }
    `,
    );

    const resolver = new ModuleResolver();

    const error = captureCompilerError(() => {
      resolver.resolveModules(mainPath);
    });
    expect(error.message).toContain("Module not found");
    expect(error.code).toBe("BPL_MODULE_NOT_FOUND");
  });

  it("should reject missing and directory entry module paths with compiler errors", () => {
    const resolver = new ModuleResolver({ stdLibPath: tempDir });
    const missingEntry = path.join(tempDir, "missing-entry.bpl");
    const directoryEntry = path.join(tempDir, "directory-entry");
    fs.mkdirSync(directoryEntry, { recursive: true });

    const missingError = captureCompilerError(() => {
      resolver.resolveModules(missingEntry);
    });
    expect(missingError.message).toContain("Module file not found");
    expect(missingError.code).toBe("BPL_MODULE_FILE_NOT_FOUND");

    const directoryError = captureCompilerError(() => {
      resolver.resolveModules(directoryEntry);
    });
    expect(directoryError.message).toContain("Module path is not a file");
    expect(directoryError.code).toBe("BPL_MODULE_PATH_NOT_FILE");
  });

  it("should reject broken symlink entry module paths as symlinks", () => {
    const sourceDir = path.join(tempDir, "broken-symlink-entry");
    fs.mkdirSync(sourceDir, { recursive: true });
    const brokenEntry = path.join(sourceDir, "linked-main.bpl");
    fs.symlinkSync(
      path.join(sourceDir, "missing-main.bpl"),
      brokenEntry,
      "file",
    );

    const error = captureCompilerError(() => {
      new ModuleResolver({ stdLibPath: tempDir }).resolveModules(brokenEntry);
    });

    expect(error.message).toContain("Module path is a symbolic link");
    expect(error.code).toBe("BPL_MODULE_PATH_SYMLINK");
  });

  it("should normalize symlinked entry module identities", () => {
    const sourceDir = path.join(tempDir, "symlink-entry");
    fs.mkdirSync(sourceDir, { recursive: true });
    const realEntry = path.join(sourceDir, "main.bpl");
    const linkedEntry = path.join(sourceDir, "linked-main.bpl");
    fs.writeFileSync(realEntry, "frame main() ret int { return 0; }");
    fs.symlinkSync(realEntry, linkedEntry, "file");

    const resolver = new ModuleResolver({ stdLibPath: tempDir });
    const modules = resolver.resolveModules(linkedEntry);
    const entryModule = modules[modules.length - 1]!;

    expect(entryModule.path).toBe(fs.realpathSync(realEntry));
    expect(resolver.getModule(linkedEntry)).toBe(entryModule);
  });

  it("should reject broken symlink import candidates before extension fallback", () => {
    const sourceDir = path.join(tempDir, "broken-symlink-import");
    fs.mkdirSync(sourceDir, { recursive: true });
    const mainPath = path.join(sourceDir, "main.bpl");
    const brokenBplCandidate = path.join(sourceDir, "linked.bpl");
    const legacyFallback = path.join(sourceDir, "linked.x");
    fs.writeFileSync(
      mainPath,
      [
        'import value from "./linked";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );
    fs.symlinkSync(
      path.join(sourceDir, "missing-linked.bpl"),
      brokenBplCandidate,
      "file",
    );
    fs.writeFileSync(legacyFallback, "export value;");

    const error = captureCompilerError(() => {
      new ModuleResolver({ stdLibPath: tempDir }).resolveModules(mainPath);
    });

    expect(error.message).toContain("Module path is a symbolic link");
    expect(error.message).toContain(brokenBplCandidate);
    expect(error.code).toBe("BPL_MODULE_PATH_SYMLINK");
  });

  it("should normalize symlinked import module identities", () => {
    const sourceDir = path.join(tempDir, "symlink-import");
    fs.mkdirSync(sourceDir, { recursive: true });
    const mainPath = path.join(sourceDir, "main.bpl");
    const realModule = path.join(sourceDir, "real-linked.bpl");
    const linkedModule = path.join(sourceDir, "linked.bpl");
    fs.writeFileSync(
      mainPath,
      [
        'import value from "./linked.bpl";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(realModule, "export value;");
    fs.symlinkSync(realModule, linkedModule, "file");

    const modules = new ModuleResolver({ stdLibPath: tempDir }).resolveModules(
      mainPath,
    );

    expect(
      modules.some((module) => module.path === fs.realpathSync(realModule)),
    ).toBe(true);
    expect(modules.some((module) => module.path === linkedModule)).toBe(false);
  });

  it("should prefer .bpl over legacy .x when resolving extensionless imports", () => {
    const sourceDir = path.join(tempDir, "extension-preference");
    fs.mkdirSync(sourceDir, { recursive: true });
    const mainPath = path.join(sourceDir, "main.bpl");
    const bplModule = path.join(sourceDir, "ambiguous.bpl");
    const legacyModule = path.join(sourceDir, "ambiguous.x");
    fs.writeFileSync(mainPath, "frame main() ret int { return 0; }");
    fs.writeFileSync(bplModule, "export bplValue;");
    fs.writeFileSync(legacyModule, "export legacyValue;");

    const resolver = new ModuleResolver({ stdLibPath: tempDir });

    expect(resolver.resolveModulePath("./ambiguous", mainPath)).toBe(bplModule);
  });

  it("should prefer index.bpl over index.x for directory imports", () => {
    const sourceDir = path.join(tempDir, "index-preference");
    const moduleDir = path.join(sourceDir, "ambiguous");
    fs.mkdirSync(moduleDir, { recursive: true });
    const mainPath = path.join(sourceDir, "main.bpl");
    const bplIndex = path.join(moduleDir, "index.bpl");
    const legacyIndex = path.join(moduleDir, "index.x");
    fs.writeFileSync(mainPath, "frame main() ret int { return 0; }");
    fs.writeFileSync(bplIndex, "export bplValue;");
    fs.writeFileSync(legacyIndex, "export legacyValue;");

    const resolver = new ModuleResolver({ stdLibPath: tempDir });

    expect(resolver.resolveModulePath("./ambiguous", mainPath)).toBe(bplIndex);
  });

  it("should reject relative imports that only differ by filesystem casing", () => {
    const sourceDir = path.join(tempDir, "case-mismatch-import");
    fs.mkdirSync(sourceDir, { recursive: true });
    const mainPath = path.join(sourceDir, "main.bpl");
    const realModule = path.join(sourceDir, "utils.bpl");
    fs.writeFileSync(mainPath, "frame main() ret int { return 0; }");
    fs.writeFileSync(realModule, "export value;");

    const error = captureCompilerError(() => {
      new ModuleResolver({ stdLibPath: tempDir }).resolveModulePath(
        "./Utils",
        mainPath,
      );
    });

    expect(error.message).toContain("Module path casing does not match");
    expect(error.message).toContain(path.join(sourceDir, "Utils.bpl"));
    expect(error.message).toContain(realModule);
    expect(error.hint).toContain("Use the exact filesystem casing");
    expect(error.code).toBe("BPL_MODULE_PATH_CASE_MISMATCH");
  });

  it("should skip directory index candidates when resolving directory imports", () => {
    const sourceDir = path.join(tempDir, "directory-index-file-check");
    const moduleDir = path.join(sourceDir, "ambiguous");
    fs.mkdirSync(path.join(moduleDir, "index.bpl"), { recursive: true });
    const mainPath = path.join(sourceDir, "main.bpl");
    const legacyIndex = path.join(moduleDir, "index.x");
    fs.writeFileSync(mainPath, "frame main() ret int { return 0; }");
    fs.writeFileSync(legacyIndex, "export legacyValue;");

    const resolver = new ModuleResolver({ stdLibPath: tempDir });

    expect(resolver.resolveModulePath("./ambiguous", mainPath)).toBe(
      legacyIndex,
    );
  });

  it("should resolve safe explicit std submodule imports", () => {
    const stdLibDir = path.join(tempDir, "safe-std-lib");
    const nestedDir = path.join(stdLibDir, "collections");
    fs.mkdirSync(nestedDir, { recursive: true });
    const stdModule = path.join(nestedDir, "array.bpl");
    const mainPath = path.join(tempDir, "std-safe-main.bpl");
    fs.writeFileSync(stdModule, "export Array;");
    fs.writeFileSync(mainPath, "frame main() ret int { return 0; }");

    const resolver = new ModuleResolver({ stdLibPath: stdLibDir });

    expect(
      resolver.resolveModulePath("std/collections/array.bpl", mainPath),
    ).toBe(stdModule);
    expect(
      resolver.resolveModulePath("std\\collections\\array.bpl", mainPath),
    ).toBe(stdModule);
  });

  it("should resolve bare stdlib module names before same-name packages", () => {
    const appDir = path.join(tempDir, "bare-stdlib-shadow-app");
    const sourceDir = path.join(appDir, "src");
    const stdLibDir = path.join(tempDir, "bare-stdlib-shadow-lib");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const stdMathPath = path.join(stdLibDir, "math.x");
    const packageMathPath = path.join(packageDir, "index.bpl");
    const mainPath = path.join(sourceDir, "main.bpl");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(stdLibDir, { recursive: true });
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(stdMathPath, "export stdMath;");
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(packageMathPath, "export packageMath;");
    fs.writeFileSync(mainPath, "frame main() ret int { return 0; }");

    const resolver = new ModuleResolver({ stdLibPath: stdLibDir });

    expect(resolver.resolveModulePath("math", mainPath)).toBe(stdMathPath);
    expect(resolver.resolveModulePath("math", mainPath)).not.toBe(
      packageMathPath,
    );
  });

  it("should not resolve missing explicit std imports from packages", () => {
    const appDir = path.join(tempDir, "std-package-shadow-app");
    const sourceDir = path.join(appDir, "src");
    const stdPackageDir = path.join(appDir, "bpl_modules", "std");
    const stdLibDir = path.join(tempDir, "std-package-shadow-lib");
    const mainPath = path.join(sourceDir, "main.bpl");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(stdPackageDir, { recursive: true });
    fs.mkdirSync(stdLibDir, { recursive: true });
    fs.writeFileSync(mainPath, "frame main() ret int { return 0; }");
    fs.writeFileSync(
      path.join(stdPackageDir, "bpl.json"),
      JSON.stringify({ name: "std", version: "1.0.0", main: "missing.bpl" }),
    );
    fs.writeFileSync(path.join(stdPackageDir, "missing.bpl"), "export shadow;");

    const resolver = new ModuleResolver({ stdLibPath: stdLibDir });
    const error = captureCompilerError(() => {
      resolver.resolveModulePath("std/missing.bpl", mainPath);
    });

    expect(error.message).toContain(
      "Standard library module not found: std/missing.bpl",
    );
    expect(error.message).toContain(stdLibDir);
    expect(error.hint).toContain("standard library");
    expect(error.code).toBe("BPL_MODULE_NOT_FOUND");
  });

  it("should reject unsafe explicit std import path segments", () => {
    const stdLibDir = path.join(tempDir, "unsafe-std-lib");
    const outsideStdLib = path.join(tempDir, "outside-std-lib.bpl");
    const mainPath = path.join(tempDir, "std-unsafe-main.bpl");
    fs.mkdirSync(stdLibDir, { recursive: true });
    fs.writeFileSync(outsideStdLib, "export escaped;");
    fs.writeFileSync(mainPath, "frame main() ret int { return 0; }");

    const resolver = new ModuleResolver({ stdLibPath: stdLibDir });

    for (const importSource of [
      "std/../outside-std-lib.bpl",
      "std//array.bpl",
      "std/./array.bpl",
      "std/",
      "std\\..\\outside-std-lib.bpl",
      "std\\\\array.bpl",
      "std\\.\\array.bpl",
      "std\\",
    ]) {
      const error = captureCompilerError(() => {
        resolver.resolveModulePath(importSource, mainPath);
      });

      expect(error.message).toContain("Unsafe standard library import");
      expect(error.message).toContain(importSource);
      expect(error.hint).toContain(
        "Use std/<path> or std\\<path> without empty, '.', or '..' path segments.",
      );
      expect(error.code).toBe("BPL_IMPORT_STD_PATH_UNSAFE");
    }
  });

  it("should resolve installed package imports from nested source files independent of cwd", () => {
    const appDir = path.join(tempDir, "package-app");
    const sourceDir = path.join(appDir, "src");
    const packageDir = path.join(appDir, "bpl_modules", "package-math");
    const unrelatedDir = path.join(tempDir, "unrelated-project");
    const shadowPackageDir = path.join(
      unrelatedDir,
      "bpl_modules",
      "package-math",
    );
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(packageDir, { recursive: true });
    fs.mkdirSync(shadowPackageDir, { recursive: true });

    for (const packagePath of [packageDir, shadowPackageDir]) {
      fs.writeFileSync(
        path.join(packagePath, "bpl.json"),
        JSON.stringify(
          {
            name: "package-math",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
    }
    fs.writeFileSync(
      path.join(packageDir, "index.bpl"),
      ["export add;", "frame add() ret int {", "    return 42;", "}"].join(
        "\n",
      ),
    );
    fs.writeFileSync(
      path.join(shadowPackageDir, "index.bpl"),
      ["export wrong;", "frame wrong() ret int {", "    return 0;", "}"].join(
        "\n",
      ),
    );

    const mainPath = path.join(sourceDir, "main.bpl");
    fs.writeFileSync(
      mainPath,
      [
        'import add from "package-math";',
        "frame main() ret int {",
        "    return add();",
        "}",
      ].join("\n"),
    );

    const originalCwd = process.cwd();
    try {
      process.chdir(unrelatedDir);
      const resolver = new ModuleResolver({ stdLibPath: tempDir });
      const modules = resolver.resolveModules(mainPath);

      expect(
        modules.some(
          (module) => module.path === path.join(packageDir, "index.bpl"),
        ),
      ).toBe(true);
      expect(
        modules.some(
          (module) => module.path === path.join(shadowPackageDir, "index.bpl"),
        ),
      ).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("should not create package directories while probing missing package imports", () => {
    const appDir = path.join(tempDir, "read-only-package-app");
    const sourceDir = path.join(appDir, "src");
    const cwdDir = path.join(tempDir, "read-only-package-cwd");
    const cwdModulesDir = path.join(cwdDir, "bpl_modules");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(cwdDir, { recursive: true });

    const mainPath = path.join(sourceDir, "main.bpl");
    fs.writeFileSync(
      mainPath,
      [
        'import value from "missing-package";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const originalCwd = process.cwd();
    try {
      process.chdir(cwdDir);
      const error = captureCompilerError(() => {
        new ModuleResolver({ stdLibPath: tempDir }).resolveModules(mainPath);
      });

      expect(error.message).toContain("Module not found: missing-package");
      expect(fs.existsSync(cwdModulesDir)).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("should not fall back to cwd packages after malformed project package metadata", () => {
    const appDir = path.join(tempDir, "malformed-package-app");
    const sourceDir = path.join(appDir, "src");
    const projectPackageDir = path.join(appDir, "bpl_modules", "shared-math");
    const cwdDir = path.join(tempDir, "malformed-package-cwd");
    const cwdPackageDir = path.join(cwdDir, "bpl_modules", "shared-math");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(projectPackageDir, { recursive: true });
    fs.mkdirSync(cwdPackageDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "bpl.json"),
      JSON.stringify(
        { name: "malformed-package-app", version: "1.0.0" },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(projectPackageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "other-package",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(projectPackageDir, "index.bpl"),
      "export wrong;",
    );
    fs.writeFileSync(
      path.join(cwdPackageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "shared-math",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(cwdPackageDir, "index.bpl"), "export value;");

    const mainPath = path.join(sourceDir, "main.bpl");
    fs.writeFileSync(
      mainPath,
      [
        'import value from "shared-math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const originalCwd = process.cwd();
    try {
      process.chdir(cwdDir);
      const error = captureCompilerError(() => {
        new ModuleResolver({ stdLibPath: tempDir }).resolveModules(mainPath);
      });

      expect(error.message).toContain("manifest name 'other-package'");
      expect(error.hint).toContain(projectPackageDir);
      expect(error.hint).not.toContain(cwdPackageDir);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("should surface case-mismatched global versioned package diagnostics", () => {
    const appDir = path.join(tempDir, "global-version-case-app");
    const globalPackageDir = path.join(
      tempDir,
      "global-version-case-packages",
    );
    const mismatchedPackageDir = path.join(globalPackageDir, "Math-9.0.0");
    const requestedMismatchedPackageDir = path.join(
      globalPackageDir,
      "math-9.0.0",
    );
    const lowerPackageDir = path.join(globalPackageDir, "math-1.0.0");
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(mismatchedPackageDir, { recursive: true });
    fs.mkdirSync(lowerPackageDir, { recursive: true });

    for (const [packageDir, version] of [
      [mismatchedPackageDir, "9.0.0"],
      [lowerPackageDir, "1.0.0"],
    ] as const) {
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify({ name: "math", version, main: "index.bpl" }),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
    }

    const mainPath = path.join(appDir, "main.bpl");
    fs.writeFileSync(
      mainPath,
      [
        'import value from "math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const error = captureCompilerError(() => {
      new ModuleResolver({
        stdLibPath: tempDir,
        packageManagerOptions: { globalPackageDir },
      }).resolveModules(mainPath);
    });

    expect(error.code).toBe("BPL_PACKAGE_ROOT_CASE_MISMATCH");
    expect(error.message).toContain("package root casing does not match");
    expect(error.message).toContain(requestedMismatchedPackageDir);
    expect(error.message).toContain(mismatchedPackageDir);
    expect(error.hint).toContain("Use the exact filesystem casing");
    expect(error.hint).toContain(requestedMismatchedPackageDir);
    expect(error.hint).toContain(mismatchedPackageDir);
    expect(error.hint).not.toContain(lowerPackageDir);
  });

  it("should report searched package paths for unresolved package imports", () => {
    const appDir = path.join(tempDir, "diagnostic-app");
    const sourceDir = path.join(appDir, "src");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "bpl.json"),
      JSON.stringify({ name: "diagnostic-app", version: "1.0.0" }, null, 2),
    );

    const mainPath = path.join(sourceDir, "missing-package.bpl");
    fs.writeFileSync(
      mainPath,
      [
        'import value from "missing-package";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const error = captureCompilerError(() => {
      new ModuleResolver({ stdLibPath: tempDir }).resolveModules(mainPath);
    });

    expect(error.message).toContain("Module not found: missing-package");
    expect(error.hint).toContain("Nearest package root:");
    expect(error.hint).toContain(appDir);
    expect(error.hint).toContain("Searched paths:");
    expect(error.hint).toContain(path.join(appDir, "bpl_modules"));
  });

  it("should explain invalid package import subpaths", () => {
    const appDir = path.join(tempDir, "invalid-subpath-app");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "bpl.json"),
      JSON.stringify(
        { name: "invalid-subpath-app", version: "1.0.0" },
        null,
        2,
      ),
    );

    const mainPath = path.join(appDir, "main.bpl");
    fs.writeFileSync(
      mainPath,
      [
        'import value from "package-math/../secret";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const error = captureCompilerError(() => {
      new ModuleResolver({ stdLibPath: tempDir }).resolveModules(mainPath);
    });

    expect(error.message).toContain("Package imports cannot contain");
    expect(error.hint).toContain("Package imports cannot contain");
  });

  it("should explain invalid package import names", () => {
    const appDir = path.join(tempDir, "invalid-package-name-app");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "bpl.json"),
      JSON.stringify(
        { name: "invalid-package-name-app", version: "1.0.0" },
        null,
        2,
      ),
    );

    const mainPath = path.join(appDir, "main.bpl");
    fs.writeFileSync(
      mainPath,
      [
        'import value from "Bad_Name";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const error = captureCompilerError(() => {
      new ModuleResolver({ stdLibPath: tempDir }).resolveModules(mainPath);
    });

    expect(error.message).toContain("Module not found: Bad_Name");
    expect(error.message).toContain(
      "Package import names must use lowercase letters, digits, and hyphens only.",
    );
    expect(error.hint).toContain(
      "Package import names must use lowercase letters, digits, and hyphens only.",
    );
  });

  it("should explain packages with missing entrypoints", () => {
    const appDir = path.join(tempDir, "missing-entrypoint-app");
    const packageDir = path.join(appDir, "bpl_modules", "broken-package");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "bpl.json"),
      JSON.stringify(
        { name: "missing-entrypoint-app", version: "1.0.0" },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "broken-package",
          version: "1.0.0",
          main: "missing-entry.bpl",
        },
        null,
        2,
      ),
    );

    const mainPath = path.join(appDir, "main.bpl");
    fs.writeFileSync(
      mainPath,
      [
        'import value from "broken-package";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const error = captureCompilerError(() => {
      new ModuleResolver({ stdLibPath: tempDir }).resolveModules(mainPath);
    });

    expect(error.message).toContain("entrypoint was not found");
    expect(error.hint).toContain(path.join(packageDir, "missing-entry.bpl"));
  });

  it("should explain package manifest name mismatches", () => {
    const appDir = path.join(tempDir, "manifest-mismatch-app");
    const packageDir = path.join(appDir, "bpl_modules", "broken-package");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "bpl.json"),
      JSON.stringify(
        { name: "manifest-mismatch-app", version: "1.0.0" },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "other-package",
          version: "1.0.0",
          main: "index.bpl",
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");

    const mainPath = path.join(appDir, "main.bpl");
    fs.writeFileSync(
      mainPath,
      [
        'import value from "broken-package";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const error = captureCompilerError(() => {
      new ModuleResolver({ stdLibPath: tempDir }).resolveModules(mainPath);
    });

    expect(error.message).toContain("manifest name 'other-package'");
    expect(error.hint).toContain("manifest name 'other-package'");
    expect(error.hint).toContain(path.join(packageDir, "bpl.json"));
    expect(error.hint).toContain("Searched paths:");
  });

  it("should explain package manifest version metadata errors", () => {
    const appDir = path.join(tempDir, "manifest-version-app");
    const packageDir = path.join(appDir, "bpl_modules", "broken-package");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "bpl.json"),
      JSON.stringify(
        { name: "manifest-version-app", version: "1.0.0" },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "broken-package",
          version: "latest",
          main: "index.bpl",
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");

    const mainPath = path.join(appDir, "main.bpl");
    fs.writeFileSync(
      mainPath,
      [
        'import value from "broken-package";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const error = captureCompilerError(() => {
      new ModuleResolver({ stdLibPath: tempDir }).resolveModules(mainPath);
    });

    expect(error.message).toContain(
      "manifest version must use X.Y.Z semantic version format",
    );
    expect(error.hint).toContain(
      "manifest version must use X.Y.Z semantic version format",
    );
    expect(error.hint).toContain(path.join(packageDir, "bpl.json"));
    expect(error.hint).toContain("Searched paths:");
  });

  it("should explain packages with unsafe entrypoints", () => {
    const appDir = path.join(tempDir, "unsafe-entrypoint-app");
    const packageDir = path.join(appDir, "bpl_modules", "broken-package");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "bpl.json"),
      JSON.stringify(
        { name: "unsafe-entrypoint-app", version: "1.0.0" },
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: "broken-package",
          version: "1.0.0",
          main: "../outside.bpl",
        },
        null,
        2,
      ),
    );

    const mainPath = path.join(appDir, "main.bpl");
    fs.writeFileSync(
      mainPath,
      [
        'import value from "broken-package";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const error = captureCompilerError(() => {
      new ModuleResolver({ stdLibPath: tempDir }).resolveModules(mainPath);
    });

    expect(error.message).toContain("unsafe entrypoint '../outside.bpl'");
    expect(error.hint).toContain("unsafe entrypoint '../outside.bpl'");
    expect(error.hint).toContain("Searched paths:");
    expect(error.hint).toContain(packageDir);
  });
});

function captureCompilerError(action: () => void): CompilerError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(CompilerError);
    return error as CompilerError;
  }

  throw new Error("Expected action to throw a CompilerError");
}
