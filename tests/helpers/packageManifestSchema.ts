import { expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { BPL_PACKAGE_SCHEMA_URI } from "../../compiler/common/PackageManifestSchema";

export { BPL_PACKAGE_SCHEMA_URI };

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

type JsonSchemaObject = {
  enum?: JsonValue[];
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  items?: JsonSchemaObject;
  additionalProperties?: JsonSchemaObject | boolean;
  propertyNames?: JsonSchemaObject;
  minLength?: number;
  pattern?: string;
  type?: string;
};

const packageManifestSchema = JSON.parse(
  readFileSync(
    join(import.meta.dir, "..", "..", "bpl-package.schema.json"),
    "utf8",
  ),
) as JsonSchemaObject;

export function expectPackageManifestConformsToSchema(
  manifest: JsonObject,
  label: string,
  options: { requireSchemaUri?: boolean } = {},
): void {
  validateJsonSchema(packageManifestSchema, manifest, label);

  if (options.requireSchemaUri) {
    expect(manifest.$schema, `${label} declares package manifest schema`).toBe(
      BPL_PACKAGE_SCHEMA_URI,
    );
  }
}

function validateJsonSchema(
  contract: JsonSchemaObject,
  value: JsonValue,
  path: string,
): void {
  if (contract.type) {
    expect(jsonType(value), `${path} has schema type ${contract.type}`).toBe(
      contract.type,
    );
  }

  if (contract.enum) {
    expect(contract.enum, `${path} is one of the allowed values`).toContain(
      value,
    );
  }

  if (contract.minLength !== undefined) {
    expect(typeof value, `${path} is a string with minLength`).toBe("string");
    expect((value as string).length, `${path} minLength`).toBeGreaterThanOrEqual(
      contract.minLength,
    );
  }

  if (contract.pattern !== undefined) {
    expect(typeof value, `${path} is a string with pattern`).toBe("string");
    expect(
      new RegExp(contract.pattern).test(value as string),
      `${path} matches ${contract.pattern}`,
    ).toBe(true);
  }

  if (contract.type === "object") {
    expect(isJsonObject(value), `${path} is a JSON object`).toBe(true);
    const objectValue = value as JsonObject;

    for (const field of contract.required ?? []) {
      expect(
        Object.hasOwn(objectValue, field),
        `${path}.${field} is required`,
      ).toBe(true);
    }

    for (const [key, childValue] of Object.entries(objectValue)) {
      if (contract.propertyNames) {
        validateJsonSchema(contract.propertyNames, key, `${path}<${key}>`);
      }

      const propertyContract = contract.properties?.[key];
      if (propertyContract) {
        validateJsonSchema(propertyContract, childValue, `${path}.${key}`);
        continue;
      }

      if (
        contract.additionalProperties &&
        typeof contract.additionalProperties === "object"
      ) {
        validateJsonSchema(
          contract.additionalProperties,
          childValue,
          `${path}.${key}`,
        );
      }
    }
  }

  if (contract.type === "array") {
    expect(Array.isArray(value), `${path} is an array`).toBe(true);
    if (!contract.items) return;

    for (const [index, item] of (value as JsonValue[]).entries()) {
      validateJsonSchema(contract.items, item, `${path}[${index}]`);
    }
  }
}

function jsonType(value: JsonValue): string {
  if (Array.isArray(value)) return "array";
  if (isJsonObject(value)) return "object";
  return typeof value;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
