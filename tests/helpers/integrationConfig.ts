import { readFileSync } from "fs";

export interface IntegrationExampleConfig {
  expectedOutput?: string | string[];
  exitCode: number;
  args: string[];
  env: Record<string, string>;
  input: string;
  timeout?: number;
  skipCompilation: boolean;
}

const SUPPORTED_EXAMPLE_CONFIG_KEYS = new Set([
  "args",
  "description",
  "env",
  "exitCode",
  "expectedOutput",
  "input",
  "name",
  "note",
  "resolution_demo",
  "skip",
  "skip_compilation",
  "timeout",
]);

const LEGACY_EXAMPLE_CONFIG_KEY_REPLACEMENTS = new Map([
  ["expected_output", "expectedOutput"],
]);

export function parseIntegrationExampleConfig(
  configFile: string,
  value: unknown,
): IntegrationExampleConfig {
  const errors = validateIntegrationExampleConfig(configFile, value);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const config = value as Record<string, unknown>;
  return {
    expectedOutput: config.expectedOutput as string | string[] | undefined,
    exitCode: (config.exitCode as number | undefined) ?? 0,
    args: (config.args as string[] | undefined) ?? [],
    env: (config.env as Record<string, string> | undefined) ?? {},
    input: (config.input as string | undefined) ?? "",
    timeout: config.timeout as number | undefined,
    skipCompilation:
      config.skip_compilation === true || config.skip === true,
  };
}

export function readIntegrationExampleConfig(
  configFile: string,
  displayPath: string = configFile,
): IntegrationExampleConfig {
  const value = readIntegrationExampleConfigJson(configFile, displayPath);
  return parseIntegrationExampleConfig(displayPath, value);
}

export function validateIntegrationExampleConfigFile(
  configFile: string,
  displayPath: string = configFile,
): string[] {
  let value: unknown;
  try {
    value = readIntegrationExampleConfigJson(configFile, displayPath);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  return validateIntegrationExampleConfig(displayPath, value);
}

export function validateIntegrationExampleConfig(
  configFile: string,
  value: unknown,
): string[] {
  if (!isRecord(value)) {
    return [`${configFile}: test_config.json must be a JSON object`];
  }

  const errors: string[] = [];

  for (const key of Object.keys(value)) {
    if (!SUPPORTED_EXAMPLE_CONFIG_KEYS.has(key)) {
      errors.push(`${configFile}: unsupported key ${key}`);
      reportNestedLegacyConfigKeys(configFile, key, value[key], errors);
    }
  }

  validateExpectedOutput(configFile, value.expectedOutput, errors);
  validateIntegerField(configFile, "exitCode", value.exitCode, errors);
  validateStringArrayField(configFile, "args", value.args, errors);
  validateEnv(configFile, value.env, errors);
  validateStringField(configFile, "input", value.input, errors);
  validateIntegerField(configFile, "timeout", value.timeout, errors, {
    positive: true,
  });
  validateBooleanField(
    configFile,
    "skip_compilation",
    value.skip_compilation,
    errors,
  );
  validateBooleanField(configFile, "skip", value.skip, errors);

  return errors;
}

function readIntegrationExampleConfigJson(
  configFile: string,
  displayPath: string,
): unknown {
  const source = readFileSync(configFile, "utf-8");

  try {
    return JSON.parse(source);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`${displayPath}: invalid JSON in test_config.json${detail}`);
  }
}

function validateExpectedOutput(
  configFile: string,
  value: unknown,
  errors: string[],
): void {
  if (value === undefined) return;

  if (typeof value === "string") return;

  if (!Array.isArray(value)) {
    errors.push(
      `${configFile}: expectedOutput must be a string or string array`,
    );
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${configFile}: expectedOutput[${index}] must be a string`);
    }
  });
}

function reportNestedLegacyConfigKeys(
  configFile: string,
  path: string,
  value: unknown,
  errors: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      reportNestedLegacyConfigKeys(
        configFile,
        `${path}[${index}]`,
        item,
        errors,
      );
    });
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, item] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    const replacement = LEGACY_EXAMPLE_CONFIG_KEY_REPLACEMENTS.get(key);
    if (replacement) {
      errors.push(
        `${configFile}: unsupported legacy key ${nestedPath}; use ${replacement}`,
      );
    }
    reportNestedLegacyConfigKeys(configFile, nestedPath, item, errors);
  }
}

function validateStringArrayField(
  configFile: string,
  fieldName: string,
  value: unknown,
  errors: string[],
): void {
  if (value === undefined) return;

  if (!Array.isArray(value)) {
    errors.push(`${configFile}: ${fieldName} must be a string array`);
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${configFile}: ${fieldName}[${index}] must be a string`);
    }
  });
}

function validateEnv(
  configFile: string,
  value: unknown,
  errors: string[],
): void {
  if (value === undefined) return;

  if (!isRecord(value)) {
    errors.push(`${configFile}: env must be an object of string values`);
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") {
      errors.push(`${configFile}: env.${key} must be a string`);
    }
  }
}

function validateStringField(
  configFile: string,
  fieldName: string,
  value: unknown,
  errors: string[],
): void {
  if (value === undefined) return;

  if (typeof value !== "string") {
    errors.push(`${configFile}: ${fieldName} must be a string`);
  }
}

function validateIntegerField(
  configFile: string,
  fieldName: string,
  value: unknown,
  errors: string[],
  options: { positive?: boolean } = {},
): void {
  if (value === undefined) return;

  if (typeof value !== "number" || !Number.isInteger(value)) {
    errors.push(`${configFile}: ${fieldName} must be an integer`);
    return;
  }

  if (options.positive && value <= 0) {
    errors.push(`${configFile}: ${fieldName} must be a positive integer`);
  }
}

function validateBooleanField(
  configFile: string,
  fieldName: string,
  value: unknown,
  errors: string[],
): void {
  if (value === undefined) return;

  if (typeof value !== "boolean") {
    errors.push(`${configFile}: ${fieldName} must be a boolean`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
