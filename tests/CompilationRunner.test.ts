import { describe, expect, it } from "bun:test";

import {
  shouldInjectNativeRuntimeObjects,
  sourceContainsImportDeclaration,
  sourceMightContainImportDeclaration,
} from "../cli/CompilationRunner";

describe("Compilation runner", () => {
  it("keeps no-import sources off the expensive grammar lexer path", () => {
    expect(
      sourceMightContainImportDeclaration(
        "frame important_value() ret int { return 0; }",
      ),
    ).toBe(false);
    expect(
      sourceContainsImportDeclaration(
        "frame important_value() ret int { return 0; }",
        "test.bpl",
      ),
    ).toBe(false);
  });

  it("keeps real import declarations on the module-resolution path", () => {
    expect(
      sourceMightContainImportDeclaration(
        'import { Error } from "std/errors.bpl";',
      ),
    ).toBe(true);
    expect(
      sourceContainsImportDeclaration(
        'import { Error } from "std/errors.bpl";',
        "test.bpl",
      ),
    ).toBe(true);
  });

  it("pre-injects native runtime objects only for cached module links", () => {
    expect(shouldInjectNativeRuntimeObjects({ O: "3" }, false)).toBe(false);
    expect(shouldInjectNativeRuntimeObjects({ O: "3" }, true)).toBe(false);
    expect(
      shouldInjectNativeRuntimeObjects({ O: "3", cache: true }, false),
    ).toBe(false);
    expect(
      shouldInjectNativeRuntimeObjects({ O: "3", cache: true }, true),
    ).toBe(true);
    expect(
      shouldInjectNativeRuntimeObjects(
        { O: "3", cache: true, emit: "ast" },
        true,
      ),
    ).toBe(false);
  });
});
