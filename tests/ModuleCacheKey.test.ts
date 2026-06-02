import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { createModuleCacheContent } from "../compiler/middleend/ModuleCacheKey";
import {
  ModuleResolver,
  type ModuleInfo,
} from "../compiler/middleend/ModuleResolver";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function resolveAndCheckModules(entryPath: string): ModuleInfo[] {
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
    module.checked = true;

    if (module.path.endsWith("primitives.bpl")) {
      typeChecker.injectPrimitivesFromModule(module.path);
    }
  }

  const errors = [
    ...typeChecker.getErrors(),
    ...typeChecker.getLinkerSymbolTable().verifySymbols(),
  ];
  expect(errors).toHaveLength(0);

  return modules;
}

function moduleCacheContentForEntry(entryPath: string): string {
  const modules = resolveAndCheckModules(entryPath);
  const entryModule = modules[modules.length - 1];
  expect(entryModule).toBeDefined();

  return createModuleCacheContent(modules, entryModule!);
}

describe("Module cache key", () => {
  it("includes transitive namespace-imported ABI type providers", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-module-cache-key-"));
    const mainPath = join(tempDir, "main.bpl");
    const apiPath = join(tempDir, "api.bpl");
    const typesPath = join(tempDir, "types.bpl");

    try {
      writeFileSync(
        typesPath,
        [
          "export [Token];",
          "",
          "struct Token {",
          "  value: int,",
          "}",
        ].join("\n"),
      );
      writeFileSync(
        apiPath,
        [
          'import * as Types from "./types.bpl";',
          "export useToken;",
          "",
          "frame useToken(token: Types.Token) ret int {",
          "  return token.value;",
          "}",
        ].join("\n"),
      );
      writeFileSync(
        mainPath,
        [
          'import [Token] from "./types.bpl";',
          'import useToken from "./api.bpl";',
          "",
          "frame main() ret int {",
          "  local token: Token;",
          "  token.value = 42;",
          "  return useToken(token);",
          "}",
        ].join("\n"),
      );

      const modules = resolveAndCheckModules(mainPath);
      const mainModule = modules.find((module) => module.path === mainPath);
      expect(mainModule).toBeDefined();

      const cacheContent = createModuleCacheContent(modules, mainModule!);

      expect(cacheContent).toContain(`interface=${apiPath}`);
      expect(cacheContent).toContain(`interface=${typesPath}`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps downstream keys stable when dependency private bodies change", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-module-cache-key-"));
    const mainPath = join(tempDir, "main.bpl");
    const apiPath = join(tempDir, "api.bpl");

    const writeApi = (privateValue: number) => {
      writeFileSync(
        apiPath,
        [
          "export value;",
          "",
          "frame privateValue() ret int {",
          `  return ${privateValue};`,
          "}",
          "",
          "frame value(input: int) ret int {",
          "  return input + privateValue();",
          "}",
        ].join("\n"),
      );
    };

    try {
      writeFileSync(
        mainPath,
        [
          'import value from "./api.bpl";',
          "",
          "frame main() ret int {",
          "  return value(40);",
          "}",
        ].join("\n"),
      );

      writeApi(1);
      const firstContent = moduleCacheContentForEntry(mainPath);

      writeApi(2);
      const secondContent = moduleCacheContentForEntry(mainPath);

      expect(secondContent).toBe(firstContent);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("changes downstream keys when dependency exports change", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-module-cache-key-"));
    const mainPath = join(tempDir, "main.bpl");
    const apiPath = join(tempDir, "api.bpl");

    const writeApi = (exportsExtraFunction: boolean) => {
      writeFileSync(
        apiPath,
        [
          "export value;",
          ...(exportsExtraFunction ? ["export extra;"] : []),
          "",
          "frame value(input: int) ret int {",
          "  return input + 1;",
          "}",
          "",
          "frame extra(input: int) ret int {",
          "  return input - 1;",
          "}",
        ].join("\n"),
      );
    };

    try {
      writeFileSync(
        mainPath,
        [
          'import value from "./api.bpl";',
          "",
          "frame main() ret int {",
          "  return value(40);",
          "}",
        ].join("\n"),
      );

      writeApi(false);
      const firstContent = moduleCacheContentForEntry(mainPath);

      writeApi(true);
      const secondContent = moduleCacheContentForEntry(mainPath);

      expect(secondContent).not.toBe(firstContent);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
