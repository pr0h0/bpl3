import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { ModuleResolver } from "../compiler/middleend/ModuleResolver";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function collectModuleTypeErrors(entryPath: string) {
  const modules = new ModuleResolver().resolveModules(entryPath);
  const typeChecker = new TypeChecker({
    skipImportResolution: true,
    collectAllErrors: true,
  });

  for (const module of modules) {
    typeChecker.registerModule(module.path, module.ast);
  }

  const entryModulePath = modules[modules.length - 1]?.path;

  for (const module of modules) {
    typeChecker.setCurrentModulePath(module.path);
    typeChecker.checkProgram(module.ast, module.path, {
      isEntryPoint: module.path === entryModulePath,
    });

    if (module.path.endsWith("primitives.bpl")) {
      typeChecker.injectPrimitivesFromModule(module.path);
    }
  }

  return typeChecker.getErrors();
}

describe("Import idempotency", () => {
  it("allows explicit Error imports alongside the implicit Error import", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-import-idempotency-"));
    const entryPath = join(tempDir, "main.bpl");

    try {
      writeFileSync(
        entryPath,
        [
          'import [Error] from "std/errors.bpl";',
          "",
          "frame main() ret int {",
          "  return 0;",
          "}",
        ].join("\n"),
      );

      const errors = collectModuleTypeErrors(entryPath);

      expect(errors.map((error) => error.message)).not.toContain(
        "Symbol 'Error' is already defined in this scope",
      );
      expect(errors).toHaveLength(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
