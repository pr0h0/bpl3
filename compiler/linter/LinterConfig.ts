import * as fs from "node:fs";
import * as path from "node:path";
import { LINT_RULE_CODES } from "./Linter";

export const LINTER_CONFIG_FILENAME = ".bpllint.json";

export interface LinterConfig {
  /** Rule codes to skip, upper-cased. */
  disable: string[];
}

export interface LoadedLinterConfig {
  configPath?: string;
  config: LinterConfig;
}

/** Checks a parsed `.bpllint.json` value and normalizes its rule codes. */
export function validateLinterConfig(value: unknown): LinterConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("expected a JSON object");
  }
  for (const key of Object.keys(value)) {
    if (key !== "$schema" && key !== "disable") {
      throw new Error(`unknown setting '${key}'`);
    }
  }
  const disable = (value as { disable?: unknown }).disable;
  if (disable === undefined) return { disable: [] };
  if (!Array.isArray(disable)) {
    throw new Error("'disable' must be an array of rule codes");
  }
  return {
    disable: disable.map((code) => {
      if (typeof code !== "string") {
        throw new Error("'disable' must be an array of rule codes");
      }
      const normalized = code.trim().toUpperCase();
      if (!LINT_RULE_CODES.includes(normalized)) {
        throw new Error(
          `unknown lint rule '${code}'; known rules are ${LINT_RULE_CODES.join(", ")}`,
        );
      }
      return normalized;
    }),
  };
}

function configExists(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile())
      throw new Error(`Lint configuration is not a file: ${file}`);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return false;
    throw error;
  }
}

/**
 * The nearest `.bpllint.json` in the directory of `filePath` or above it, or
 * an empty configuration when there is none. Throws for an invalid file.
 */
export function loadLinterConfig(filePath: string): LoadedLinterConfig {
  let directory = path.dirname(path.resolve(filePath));
  let configPath: string | undefined;
  while (true) {
    const candidate = path.join(directory, LINTER_CONFIG_FILENAME);
    if (configExists(candidate)) {
      configPath = candidate;
      break;
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  if (!configPath) return { config: { disable: [] } };
  try {
    const source = fs.readFileSync(configPath, "utf8").replace(/^﻿/, "");
    return { configPath, config: validateLinterConfig(JSON.parse(source)) };
  } catch (error) {
    throw new Error(
      `Invalid lint configuration '${configPath}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
