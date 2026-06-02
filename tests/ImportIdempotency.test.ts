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

function collectErrorsForSource(
  source: string,
  extraFiles: Record<string, string> = {},
) {
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-import-idempotency-"));
  const entryPath = join(tempDir, "main.bpl");

  try {
    for (const [name, contents] of Object.entries(extraFiles)) {
      writeFileSync(join(tempDir, name), contents);
    }

    writeFileSync(entryPath, source);
    return collectModuleTypeErrors(entryPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const thingModule = [
  "export [Thing];",
  "export makeThing;",
  "",
  "struct Thing {",
  "  value: int,",
  "}",
  "",
  "frame makeThing() ret int {",
  "  return 7;",
  "}",
].join("\n");

describe("Import idempotency", () => {
  it("allows explicit Error imports alongside the implicit Error import", () => {
    const errors = collectErrorsForSource(
      [
        'import [Error] from "std/errors.bpl";',
        "",
        "frame main() ret int {",
        "  return 0;",
        "}",
      ].join("\n"),
    );

    expect(errors.map((error) => error.message)).not.toContain(
      "Symbol 'Error' is already defined in this scope",
    );
    expect(errors).toHaveLength(0);
  });

  it("allows repeated named imports from the same module", () => {
    const errors = collectErrorsForSource(
      [
        'import [Thing] from "./thing.bpl";',
        'import [Thing] from "./thing.bpl";',
        "",
        "frame main() ret int {",
        "  local thing: Thing;",
        "  thing.value = 3;",
        "  return thing.value;",
        "}",
      ].join("\n"),
      { "thing.bpl": thingModule },
    );

    expect(errors).toHaveLength(0);
  });

  it("allows repeated import-all imports from the same module", () => {
    const errors = collectErrorsForSource(
      [
        'import "./thing.bpl";',
        'import "./thing.bpl";',
        "",
        "frame main() ret int {",
        "  local thing: Thing;",
        "  thing.value = makeThing();",
        "  return thing.value;",
        "}",
      ].join("\n"),
      { "thing.bpl": thingModule },
    );

    expect(errors).toHaveLength(0);
  });

  it("allows repeated alias imports from the same module", () => {
    const errors = collectErrorsForSource(
      [
        'import makeThing as createThing from "./thing.bpl";',
        'import makeThing as createThing from "./thing.bpl";',
        "",
        "frame main() ret int {",
        "  return createThing();",
        "}",
      ].join("\n"),
      { "thing.bpl": thingModule },
    );

    expect(errors).toHaveLength(0);
  });

  it("allows repeated namespace imports from the same module", () => {
    const errors = collectErrorsForSource(
      [
        'import * as Things from "./thing.bpl";',
        'import * as Things from "./thing.bpl";',
        "",
        "frame main() ret int {",
        "  local thing: Things.Thing;",
        "  thing.value = Things.makeThing();",
        "  return thing.value;",
        "}",
      ].join("\n"),
      { "thing.bpl": thingModule },
    );

    expect(errors).toHaveLength(0);
  });

  it("keeps namespace name conflicts diagnostic when declarations differ", () => {
    const errors = collectErrorsForSource(
      [
        'import * as Things from "./thing.bpl";',
        "",
        "struct Things {",
        "  value: int,",
        "}",
        "",
        "frame main() ret int {",
        "  return 0;",
        "}",
      ].join("\n"),
      { "thing.bpl": thingModule },
    );

    expect(errors.map((error) => error.code)).toContain(
      "BPL_SYMBOL_ALREADY_DEFINED",
    );
    expect(errors.map((error) => error.message)).toContain(
      "Symbol 'Things' is already defined in this scope",
    );
  });

  it("keeps real duplicate declarations diagnostic when declarations differ", () => {
    const errors = collectErrorsForSource(
      [
        'import [Thing] from "./thing.bpl";',
        "",
        "struct Thing {",
        "  value: int,",
        "}",
        "",
        "frame main() ret int {",
        "  return 0;",
        "}",
      ].join("\n"),
      { "thing.bpl": thingModule },
    );

    expect(errors.map((error) => error.code)).toContain(
      "BPL_SYMBOL_ALREADY_DEFINED",
    );
    expect(errors.map((error) => error.message)).toContain(
      "Symbol 'Thing' is already defined in this scope",
    );
  });
});
