import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type * as AST from "../compiler/common/AST";
import { CompilerError } from "../compiler/common/CompilerError";
import {
  type ImportHandlerContext,
  ImportHandler,
} from "../compiler/middleend/ImportHandler";
import { SymbolTable } from "../compiler/middleend/SymbolTable";

interface ImportHandlerInternals {
  moduleResolver: {
    resolveModulePath(importSource: string, fromFile: string): string;
  };
  resolveImportPath(stmt: AST.ImportStmt): { importPath: string };
}

function makeLocation(file: string) {
  return {
    file,
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 1,
  };
}

function makeImport(source: string, file: string): AST.ImportStmt {
  return {
    kind: "Import",
    items: [],
    source,
    location: makeLocation(file),
  };
}

function makeHandlerWithFallbackResolver(): ImportHandlerInternals {
  const globalScope = new SymbolTable();
  const context: ImportHandlerContext = {
    modules: new Map(),
    preLoadedModules: new Map(),
    skipImportResolution: false,
    currentScope: globalScope,
    globalScope,
    hoistDeclaration: () => {},
    checkStatement: () => {},
    defineSymbol: () => {},
  };
  const handler = new ImportHandler(context) as unknown as ImportHandlerInternals;
  handler.moduleResolver = {
    resolveModulePath: () => {
      throw new Error("synthetic resolver failure");
    },
  };
  return handler;
}

function withTemporaryBplHome<T>(bplHome: string, fn: () => T): T {
  const previousBplHome = process.env.BPL_HOME;
  process.env.BPL_HOME = bplHome;
  try {
    return fn();
  } finally {
    if (previousBplHome === undefined) {
      delete process.env.BPL_HOME;
    } else {
      process.env.BPL_HOME = previousBplHome;
    }
  }
}

describe("ImportHandler", () => {
  it("resolves safe backslash explicit std imports during defensive fallback", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "import-handler-fallback-"),
    );
    const libDir = path.join(root, "lib");
    fs.mkdirSync(path.join(libDir, "collections"), { recursive: true });

    try {
      withTemporaryBplHome(root, () => {
        const handler = makeHandlerWithFallbackResolver();
        const mainPath = path.join(root, "src", "main.bpl");
        const resolved = handler.resolveImportPath(
          makeImport("std\\collections\\array.bpl", mainPath),
        );

        expect(resolved.importPath).toBe(
          path.join(libDir, "collections", "array.bpl"),
        );
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects unsafe backslash explicit std imports during defensive fallback", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "import-handler-fallback-"),
    );
    fs.mkdirSync(path.join(root, "lib"), { recursive: true });

    try {
      withTemporaryBplHome(root, () => {
        const handler = makeHandlerWithFallbackResolver();
        const mainPath = path.join(root, "src", "main.bpl");
        let caught: unknown;

        try {
          handler.resolveImportPath(
            makeImport("std\\..\\outside-std-lib.bpl", mainPath),
          );
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(CompilerError);
        const compilerError = caught as CompilerError;
        expect(compilerError.message).toContain(
          "Unsafe standard library import: std\\..\\outside-std-lib.bpl",
        );
        expect(compilerError.hint).toBe(
          "Use std/<path> or std\\<path> without empty, '.', or '..' path segments.",
        );
        expect(compilerError.code).toBe("BPL_IMPORT_STD_PATH_UNSAFE");
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
