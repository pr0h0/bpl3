import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CompilerError } from "../compiler/common/CompilerError";
import { ModuleResolver } from "../compiler/middleend/ModuleResolver";

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

    expect(() => {
      resolver.resolveModules(mainPath);
    }).toThrow();
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

    const directoryError = captureCompilerError(() => {
      resolver.resolveModules(directoryEntry);
    });
    expect(directoryError.message).toContain("Module path is not a file");
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
      JSON.stringify({ name: "malformed-package-app", version: "1.0.0" }, null, 2),
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
    fs.writeFileSync(path.join(projectPackageDir, "index.bpl"), "export wrong;");
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
      JSON.stringify({ name: "invalid-subpath-app", version: "1.0.0" }, null, 2),
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
      JSON.stringify({ name: "manifest-mismatch-app", version: "1.0.0" }, null, 2),
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

  it("should explain packages with unsafe entrypoints", () => {
    const appDir = path.join(tempDir, "unsafe-entrypoint-app");
    const packageDir = path.join(appDir, "bpl_modules", "broken-package");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "bpl.json"),
      JSON.stringify({ name: "unsafe-entrypoint-app", version: "1.0.0" }, null, 2),
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
