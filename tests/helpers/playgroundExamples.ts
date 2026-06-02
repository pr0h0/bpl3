import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

import type { WasmCompatibilityMode } from "./wasmCompatibilityMatrix";

const PLAYGROUND_EXAMPLES_DIR = resolve(
  import.meta.dir,
  "../../playground/examples",
);

const WASM_COMPATIBILITY_MODES: WasmCompatibilityMode[] = [
  "wasm-freestanding",
  "wasm-hosted",
  "blocked-by-host-api",
  "native-only",
];

const WASM_COMPATIBILITY_MODE_SET = new Set<string>(WASM_COMPATIBILITY_MODES);

export interface PlaygroundWasmMetadata {
  mode: WasmCompatibilityMode;
  reason: string;
  browserRuntime: boolean;
  canonicalMatrixFile?: string;
  expectedReturn?: number;
  expectedStdout?: string;
  expectedStderr?: string;
}

export interface PlaygroundExample {
  order: number;
  title: string;
  snippet: string;
  description: string;
  code: string | string[];
  input?: string;
  args?: string[];
  expectedOutput?: string | string[];
  wasm?: PlaygroundWasmMetadata;
}

export interface PlaygroundExampleWithPath extends PlaygroundExample {
  file: string;
}

export function loadPlaygroundExamples(
  examplesDir: string = PLAYGROUND_EXAMPLES_DIR,
): PlaygroundExampleWithPath[] {
  const examples: PlaygroundExampleWithPath[] = [];
  const errors: string[] = [];

  const files = readdirSync(examplesDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  for (const name of files) {
    const file = `playground/examples/${name}`;
    const absolutePath = join(examplesDir, name);
    let value: unknown;

    try {
      value = JSON.parse(readFileSync(absolutePath, "utf8"));
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : "";
      errors.push(`${file}: invalid JSON in playground example${detail}`);
      continue;
    }

    const validationErrors = validatePlaygroundExampleContract(file, value);
    if (validationErrors.length > 0) {
      errors.push(...validationErrors);
      continue;
    }

    examples.push({ file, ...(value as PlaygroundExample) });
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return examples.sort((left, right) => left.order - right.order);
}

export function validatePlaygroundExampleContract(
  file: string,
  value: unknown,
): string[] {
  if (!isRecord(value)) {
    return [`${file}: playground example must be a JSON object`];
  }

  const errors: string[] = [];

  validateIntegerField(file, "order", value.order, errors);
  validateNonEmptyStringField(file, "title", value.title, errors);
  validateStringField(file, "snippet", value.snippet, errors);
  validateStringField(file, "description", value.description, errors);
  validateCode(file, value.code, errors);
  validateStringField(file, "input", value.input, errors, { optional: true });
  validateStringArrayField(file, "args", value.args, errors);
  validateExpectedOutput(file, value.expectedOutput, errors);
  validateWasmMetadata(file, value.wasm, errors);

  return errors;
}

export function expectedOutputSnippets(
  expectedOutput: string | string[],
): string[] {
  return Array.isArray(expectedOutput) ? expectedOutput : [expectedOutput];
}

function validateCode(
  file: string,
  value: unknown,
  errors: string[],
): void {
  if (typeof value === "string") return;

  if (!Array.isArray(value)) {
    errors.push(`${file}: code must be a string or string array`);
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${file}: code[${index}] must be a string`);
    }
  });
}

function validateExpectedOutput(
  file: string,
  value: unknown,
  errors: string[],
): void {
  if (value === undefined) return;

  if (typeof value === "string") return;

  if (!Array.isArray(value)) {
    errors.push(`${file}: expectedOutput must be a string or string array`);
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${file}: expectedOutput[${index}] must be a string`);
    }
  });
}

function validateWasmMetadata(
  file: string,
  value: unknown,
  errors: string[],
): void {
  if (value === undefined) return;

  if (!isRecord(value)) {
    errors.push(`${file}: wasm must be a JSON object`);
    return;
  }

  if (
    typeof value.mode !== "string" ||
    !WASM_COMPATIBILITY_MODE_SET.has(value.mode)
  ) {
    errors.push(
      `${file}: wasm.mode must be one of ${WASM_COMPATIBILITY_MODES.join(", ")}`,
    );
  }

  validateNonEmptyStringField(file, "wasm.reason", value.reason, errors);
  validateBooleanField(file, "wasm.browserRuntime", value.browserRuntime, errors);
  validateStringField(
    file,
    "wasm.canonicalMatrixFile",
    value.canonicalMatrixFile,
    errors,
    { optional: true },
  );
  validateIntegerField(
    file,
    "wasm.expectedReturn",
    value.expectedReturn,
    errors,
    { optional: true },
  );
  validateStringField(
    file,
    "wasm.expectedStdout",
    value.expectedStdout,
    errors,
    { optional: true },
  );
  validateStringField(
    file,
    "wasm.expectedStderr",
    value.expectedStderr,
    errors,
    { optional: true },
  );
}

function validateStringArrayField(
  file: string,
  fieldName: string,
  value: unknown,
  errors: string[],
): void {
  if (value === undefined) return;

  if (!Array.isArray(value)) {
    errors.push(`${file}: ${fieldName} must be a string array`);
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${file}: ${fieldName}[${index}] must be a string`);
    }
  });
}

function validateIntegerField(
  file: string,
  fieldName: string,
  value: unknown,
  errors: string[],
  options: { optional?: boolean } = {},
): void {
  if (value === undefined && options.optional === true) return;

  if (!Number.isInteger(value)) {
    errors.push(`${file}: ${fieldName} must be an integer`);
  }
}

function validateStringField(
  file: string,
  fieldName: string,
  value: unknown,
  errors: string[],
  options: { optional?: boolean } = {},
): void {
  if (value === undefined && options.optional === true) return;

  if (typeof value !== "string") {
    errors.push(`${file}: ${fieldName} must be a string`);
  }
}

function validateNonEmptyStringField(
  file: string,
  fieldName: string,
  value: unknown,
  errors: string[],
): void {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${file}: ${fieldName} must be a non-empty string`);
  }
}

function validateBooleanField(
  file: string,
  fieldName: string,
  value: unknown,
  errors: string[],
): void {
  if (typeof value !== "boolean") {
    errors.push(`${file}: ${fieldName} must be a boolean`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
