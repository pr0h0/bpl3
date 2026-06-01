import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

import {
  CLI_JSON_ERROR_CODE_LISTS,
  CLI_JSON_ERROR_CODES,
} from "../cli/JsonErrorCodes";
import {
  renderCliJsonRegistryShim,
  renderCliJsonRegistryTypes,
} from "../tools/cli_json_registry_shim";

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
      "import-handler",
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

  test("keeps checked-in packed npm CLI registry files generated from implementation exports", () => {
    const cliRegistryShimPath = join(import.meta.dir, "../cli/index.js");
    const cliRegistryTypesPath = join(import.meta.dir, "../cli/index.d.ts");

    expect(readFileSync(cliRegistryShimPath, "utf8")).toBe(
      renderCliJsonRegistryShim(CLI_JSON_ERROR_CODE_LISTS),
    );
    expect(readFileSync(cliRegistryTypesPath, "utf8")).toBe(
      renderCliJsonRegistryTypes(),
    );
  });

  test("runs packed npm CLI registry sync check command", () => {
    const result = spawnSync(
      "bun",
      ["tools/cli_json_registry_shim.ts", "--check"],
      {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("CLI registry shim is in sync");
  });

  test("runs package script CLI registry sync check command", () => {
    const result = spawnSync("bun", ["run", "release:cli-registry"], {
      cwd: join(import.meta.dir, ".."),
      encoding: "utf8",
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("CLI registry shim is in sync");
  });

  test("runs packed npm CLI registry write command without drift", () => {
    const result = spawnSync(
      "bun",
      ["tools/cli_json_registry_shim.ts", "--write"],
      {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("CLI registry shim files updated");
    expect(readFileSync(join(import.meta.dir, "../cli/index.js"), "utf8")).toBe(
      renderCliJsonRegistryShim(CLI_JSON_ERROR_CODE_LISTS),
    );
    expect(
      readFileSync(join(import.meta.dir, "../cli/index.d.ts"), "utf8"),
    ).toBe(renderCliJsonRegistryTypes());
  });

  test("reports CLI registry shim usage diagnostics predictably", () => {
    const help = spawnSync(
      "bun",
      ["tools/cli_json_registry_shim.ts", "--help"],
      {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      },
    );

    expect(help.status).toBe(0);
    expect(help.stdout).toContain(
      "Usage: bun tools/cli_json_registry_shim.ts [--check|--write]",
    );
    expect(help.stderr).toBe("");

    for (const [arg, message] of [
      ["--check=true", "--check does not accept a value"],
      ["--write=true", "--write does not accept a value"],
    ] as const) {
      const result = spawnSync(
        "bun",
        ["tools/cli_json_registry_shim.ts", arg],
        {
          cwd: join(import.meta.dir, ".."),
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(message);
      expect(result.stderr).toContain("Use --help for usage.");
    }

    const unknown = spawnSync(
      "bun",
      ["tools/cli_json_registry_shim.ts", "--unknown"],
      {
        cwd: join(import.meta.dir, ".."),
        encoding: "utf8",
      },
    );

    expect(unknown.status).toBe(2);
    expect(unknown.stdout).toBe("");
    expect(unknown.stderr).toContain("Unknown option --unknown");
    expect(unknown.stderr).toContain(
      "Usage: bun tools/cli_json_registry_shim.ts [--check|--write]",
    );
  });
});
