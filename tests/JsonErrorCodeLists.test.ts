import { describe, expect, test } from "bun:test";

import {
  CLI_JSON_ERROR_CODE_LISTS,
  CLI_JSON_ERROR_CODES,
} from "../cli/JsonErrorCodes";

describe("CLI JSON error-code list exports", () => {
  test("keeps exported JSON diagnostic code lists stable and machine-readable", () => {
    expect(CLI_JSON_ERROR_CODE_LISTS.map((list) => list.name)).toEqual([
      "bindgen",
      "build",
      "check",
      "clean",
      "completion",
      "docs",
      "doctor",
      "format",
      "lint",
      "project-new",
      "package-init",
      "package-uninstall",
      "package-cache",
      "package-install",
      "package-archive",
      "package-manifest",
      "package-resolver",
      "module-resolver",
      "run-script",
      "sanitizer-runtime",
      "wasm-linker",
    ]);

    const flattenedCodes: string[] = [];
    for (const { name, codes } of CLI_JSON_ERROR_CODE_LISTS) {
      expect(codes.length, `${name} exports at least one code`).toBeGreaterThan(
        0,
      );
      expect([...new Set(codes)], `${name} has no duplicate codes`).toEqual([
        ...codes,
      ]);
      for (const code of codes) {
        expect(code, `${name} uses stable BPL_* codes`).toMatch(
          /^BPL_[A-Z0-9_]+$/,
        );
        flattenedCodes.push(code);
      }
    }

    expect([...CLI_JSON_ERROR_CODES].sort()).toEqual(
      [...new Set(flattenedCodes)].sort(),
    );
  });
});
