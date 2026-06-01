import { describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

import {
  CLI_JSON_ERROR_CODE_LISTS,
  CLI_JSON_ERROR_CODES,
} from "../cli/JsonErrorCodes";

interface JsonErrorCodeListShape {
  name: string;
  codes: readonly string[];
}

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

  test("keeps packed npm CLI registry shim aligned with implementation exports", async () => {
    expect(existsSync(join(import.meta.dir, "../cli/index.js"))).toBe(true);

    const packedCliRegistry = await import("../cli/index.js");
    const packedLists: readonly JsonErrorCodeListShape[] =
      packedCliRegistry.CLI_JSON_ERROR_CODE_LISTS;
    const implementationLists: readonly JsonErrorCodeListShape[] =
      CLI_JSON_ERROR_CODE_LISTS.map(({ name, codes }) => ({
        name,
        codes: [...codes],
      }));

    expect(packedLists).toEqual(implementationLists);
    expect(packedCliRegistry.CLI_JSON_ERROR_CODES).toEqual([
      ...CLI_JSON_ERROR_CODES,
    ]);
  });
});
