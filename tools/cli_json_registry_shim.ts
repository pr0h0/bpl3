import { readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

import {
  CLI_JSON_ERROR_CODE_LISTS,
  type CliJsonErrorCodeList,
} from "../cli/JsonErrorCodes";

const CLI_REGISTRY_SHIM_PATH = "cli/index.js";
const CLI_REGISTRY_TYPES_PATH = "cli/index.d.ts";
const INLINE_CODES_MAX_LENGTH = 81;

export interface CliJsonRegistryShimCheckResult {
  ok: boolean;
  mismatches: readonly string[];
}

export function renderCliJsonRegistryShim(
  lists: readonly CliJsonErrorCodeList[],
): string {
  return [
    '"use strict";',
    "",
    "const CLI_JSON_ERROR_CODE_LISTS = [",
    ...lists.flatMap(renderCliJsonRegistryList),
    "];",
    "",
    "const CLI_JSON_ERROR_CODES = [",
    "  ...new Set(CLI_JSON_ERROR_CODE_LISTS.flatMap((list) => list.codes)),",
    "];",
    "",
    "exports.CLI_JSON_ERROR_CODE_LISTS = CLI_JSON_ERROR_CODE_LISTS;",
    "exports.CLI_JSON_ERROR_CODES = CLI_JSON_ERROR_CODES;",
    "",
  ].join("\n");
}

export function renderCliJsonRegistryTypes(): string {
  return [
    "export interface CliJsonErrorCodeList {",
    "  name: string;",
    "  codes: readonly string[];",
    "}",
    "",
    "export declare const CLI_JSON_ERROR_CODE_LISTS: readonly CliJsonErrorCodeList[];",
    "export declare const CLI_JSON_ERROR_CODES: readonly string[];",
    "",
  ].join("\n");
}

export function checkCliJsonRegistryShim(
  repoRoot = process.cwd(),
): CliJsonRegistryShimCheckResult {
  const mismatches: string[] = [];
  const expectedFiles = expectedCliJsonRegistryFiles();

  for (const [relativePath, expected] of expectedFiles) {
    const actual = readFileSync(join(repoRoot, relativePath), "utf8");
    if (actual !== expected) {
      mismatches.push(relativePath);
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
  };
}

export function writeCliJsonRegistryShim(repoRoot = process.cwd()): void {
  for (const [relativePath, contents] of expectedCliJsonRegistryFiles()) {
    writeFileSync(join(repoRoot, relativePath), contents);
  }
}

function expectedCliJsonRegistryFiles(): ReadonlyMap<string, string> {
  return new Map([
    [
      CLI_REGISTRY_SHIM_PATH,
      renderCliJsonRegistryShim(CLI_JSON_ERROR_CODE_LISTS),
    ],
    [CLI_REGISTRY_TYPES_PATH, renderCliJsonRegistryTypes()],
  ]);
}

function renderCliJsonRegistryList(list: CliJsonErrorCodeList): string[] {
  const inlineCodes = `    codes: [${list.codes
    .map((code) => JSON.stringify(code))
    .join(", ")}],`;
  const lines = ["  {", `    name: ${JSON.stringify(list.name)},`];

  if (inlineCodes.length <= INLINE_CODES_MAX_LENGTH) {
    lines.push(inlineCodes);
  } else {
    lines.push(
      "    codes: [",
      ...list.codes.map((code) => `      ${JSON.stringify(code)},`),
      "    ],",
    );
  }

  lines.push("  },");
  return lines;
}

function runCli(args: readonly string[]): number {
  const repoRoot = resolve(process.cwd());
  const mode = args[0] ?? "--check";

  if (mode === "--write") {
    writeCliJsonRegistryShim(repoRoot);
    console.log("CLI registry shim files updated");
    return 0;
  }

  if (mode === "--check") {
    const result = checkCliJsonRegistryShim(repoRoot);
    if (result.ok) {
      console.log("CLI registry shim is in sync");
      return 0;
    }

    console.error(
      `CLI registry shim is stale: ${result.mismatches.join(", ")}`,
    );
    console.error("Run: bun tools/cli_json_registry_shim.ts --write");
    return 1;
  }

  console.error("Usage: bun tools/cli_json_registry_shim.ts [--check|--write]");
  return 2;
}

if (import.meta.main) {
  process.exitCode = runCli(process.argv.slice(2));
}
