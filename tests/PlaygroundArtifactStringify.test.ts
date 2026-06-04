import { describe, expect, test } from "bun:test";

import { stringifyPlaygroundAstArtifact } from "../playground/backend/artifactStringify";

describe("Playground artifact stringification", () => {
  test("omits compiler-internal resolved AST links while preserving user-facing fields", () => {
    const declaration = {
      kind: "FunctionDecl",
      name: "main",
      resolvedType: { kind: "FunctionType", params: [], returnType: "int" },
    };
    const expression: any = {
      kind: "Identifier",
      name: "main",
      location: { file: "main.bpl", startLine: 1, startColumn: 1 },
      resolvedDeclaration: declaration,
      resolvedType: { kind: "BasicType", name: "int" },
      literal: 7n,
    };
    expression.self = expression;

    const text = stringifyPlaygroundAstArtifact(expression);

    expect(text).toContain('"kind": "Identifier"');
    expect(text).toContain('"name": "main"');
    expect(text).toContain('"literal": "7"');
    expect(text).toContain('"self": "[Circular]"');
    expect(text).not.toContain("resolvedDeclaration");
    expect(text).not.toContain("resolvedType");
    expect(text).not.toContain('"FunctionDecl"');
  });

  test("keeps playground AST artifacts focused on the primary source file", () => {
    const program = {
      kind: "Program",
      statements: [
        {
          kind: "Extern",
          name: "printf",
          location: { file: "/repo/lib/c.bpl", startLine: 1 },
        },
        {
          kind: "Import",
          module: "std/io.bpl",
          location: { file: "/tmp/main.bpl", startLine: 1 },
        },
        {
          kind: "FunctionDecl",
          name: "main",
          location: { file: "/tmp/main.bpl", startLine: 3 },
        },
      ],
      location: { file: "/tmp/main.bpl", startLine: 1 },
    };

    const text = stringifyPlaygroundAstArtifact(program, {
      sourceFile: "/tmp/main.bpl",
    });

    expect(text).toContain('"kind": "Program"');
    expect(text).toContain('"kind": "Import"');
    expect(text).toContain('"name": "main"');
    expect(text).not.toContain('"printf"');
    expect(text).not.toContain('/repo/lib/c.bpl');
  });
});
