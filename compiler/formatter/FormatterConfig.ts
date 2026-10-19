import * as fs from "node:fs";
import * as path from "node:path";
import {
  validateFormatterOptions,
  type FormatterOptions,
} from "./FormatterOptions";

export const FORMATTER_CONFIG_FILENAME = ".bplfmt.json";

export interface LoadedFormatterConfig {
  configPath?: string;
  options: FormatterOptions;
}

function configExists(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile())
      throw new Error(`Formatter configuration is not a file: ${file}`);
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

/** Find the nearest project JSON config, an explicit path, or explicit defaults. */
export function loadFormatterConfig(
  filePath: string,
  selection?: string | boolean,
): LoadedFormatterConfig {
  if (selection === false) return { options: {} };
  let configPath: string | undefined;
  if (typeof selection === "string") {
    configPath = path.resolve(selection);
    if (!configExists(configPath))
      throw new Error(`Formatter configuration not found: ${configPath}`);
  } else {
    let directory = path.dirname(path.resolve(filePath));
    while (true) {
      const candidate = path.join(directory, FORMATTER_CONFIG_FILENAME);
      if (configExists(candidate)) {
        configPath = candidate;
        break;
      }
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  if (!configPath) return { options: {} };
  try {
    const source = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");
    return {
      configPath,
      options: validateFormatterOptions(JSON.parse(source)),
    };
  } catch (error) {
    throw new Error(
      `Invalid formatter configuration '${configPath}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
