import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import {
  createBasicType,
  createTypeStructDecl,
} from "../compiler/middleend/BuiltinTypes";

describe("BuiltinTypes", () => {
  it("keeps name-only basic type construction on the no-options fast path", () => {
    const source = readFileSync(
      join(import.meta.dir, "../compiler/middleend/BuiltinTypes.ts"),
      "utf8",
    );
    const start = source.indexOf("export function createBasicType(");
    const end = source.indexOf("\n/**", start);
    const functionSource = source.slice(start, end);
    const noOptionsGuard = functionSource.indexOf(
      "if (options === undefined) {",
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(functionSource).toContain("options?: {");
    expect(noOptionsGuard).toBeGreaterThanOrEqual(0);
    expect(functionSource.indexOf("options.genericArgs")).toBeGreaterThan(
      noOptionsGuard,
    );

    const first = createBasicType("i32");
    const second = createBasicType("i32");
    expect(first).toEqual(second);
    expect(first.genericArgs).not.toBe(second.genericArgs);
    expect(first.arrayDimensions).not.toBe(second.arrayDimensions);
  });

  it("shares the fresh Type destroy method void node within one declaration", () => {
    const first = createTypeStructDecl();
    const second = createTypeStructDecl();
    const firstDestroy = first.members.find(
      (member) => member.kind === "FunctionDecl" && member.name === "destroy",
    );
    const secondDestroy = second.members.find(
      (member) => member.kind === "FunctionDecl" && member.name === "destroy",
    );

    expect(firstDestroy?.kind).toBe("FunctionDecl");
    expect(secondDestroy?.kind).toBe("FunctionDecl");
    if (
      firstDestroy?.kind !== "FunctionDecl" ||
      secondDestroy?.kind !== "FunctionDecl" ||
      firstDestroy.resolvedType?.kind !== "FunctionType" ||
      secondDestroy.resolvedType?.kind !== "FunctionType"
    ) {
      throw new Error("Expected Type destroy methods");
    }

    expect(firstDestroy.returnType).toBe(firstDestroy.resolvedType.returnType);
    expect(secondDestroy.returnType).toBe(
      secondDestroy.resolvedType.returnType,
    );
    expect(firstDestroy.returnType).not.toBe(secondDestroy.returnType);
  });
});
