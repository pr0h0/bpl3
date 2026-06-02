import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

type JsonSchemaObject = {
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  additionalProperties?: JsonSchemaObject | boolean;
  propertyNames?: JsonSchemaObject;
  minLength?: number;
  pattern?: string;
  type?: string;
};

const schema = JSON.parse(
  readFileSync(join(import.meta.dir, "..", "bpl-package.schema.json"), "utf8"),
) as JsonSchemaObject;

function propertySchema(name: string): JsonSchemaObject {
  const property = schema.properties?.[name];
  expect(property, `missing schema property '${name}'`).toBeDefined();
  return property!;
}

function objectPropertyNamesSchema(name: string): JsonSchemaObject {
  const property = propertySchema(name);
  expect(property.type).toBe("object");
  expect(
    property.propertyNames,
    `${name} should constrain object keys`,
  ).toBeDefined();
  return property.propertyNames!;
}

function objectValueSchema(name: string): JsonSchemaObject {
  const property = propertySchema(name);
  expect(property.type).toBe("object");
  expect(
    property.additionalProperties,
    `${name} should constrain object values`,
  ).toBeTypeOf("object");
  return property.additionalProperties as JsonSchemaObject;
}

function schemaPattern(contract: JsonSchemaObject, label: string): RegExp {
  expect(contract.pattern, `${label} should declare a pattern`).toBeTypeOf(
    "string",
  );
  return new RegExp(contract.pattern!);
}

describe("Package manifest JSON schema", () => {
  test("mirrors runtime package-relative path validation", () => {
    const pathSchemas = [
      { name: "main", contract: propertySchema("main") },
      { name: "entry", contract: propertySchema("entry") },
      { name: "exports[]", contract: propertySchema("exports").items },
      { name: "bin value", contract: objectValueSchema("bin") },
    ];

    for (const { name, contract } of pathSchemas) {
      expect(contract, `${name} path schema exists`).toBeDefined();
      const pattern = schemaPattern(contract!, name);

      for (const validPath of ["index.bpl", "src/index.bpl", "bin/tool.sh"]) {
        expect(pattern.test(validPath), `${name} accepts ${validPath}`).toBe(
          true,
        );
      }

      for (const invalidPath of [
        "",
        ".",
        "..",
        "/abs/index.bpl",
        "\\abs\\index.bpl",
        "C:/abs/index.bpl",
        "C:\\abs\\index.bpl",
        "src//index.bpl",
        "src/./index.bpl",
        "src/../index.bpl",
        "../index.bpl",
      ]) {
        expect(pattern.test(invalidPath), `${name} rejects ${invalidPath}`).toBe(
          false,
        );
      }
    }
  });

  test("mirrors runtime manifest object-map key and value validation", () => {
    for (const field of ["dependencies", "devDependencies"]) {
      const keyPattern = schemaPattern(objectPropertyNamesSchema(field), field);
      const valuePattern = schemaPattern(objectValueSchema(field), field);

      expect(keyPattern.test("math-core")).toBe(true);
      expect(keyPattern.test("math2")).toBe(true);
      expect(keyPattern.test("Bad_Name")).toBe(false);
      expect(keyPattern.test("")).toBe(false);

      expect(valuePattern.test("1.0.0")).toBe(true);
      expect(valuePattern.test("file:../math-core")).toBe(true);
      expect(valuePattern.test("   ")).toBe(false);
      expect(valuePattern.test("")).toBe(false);
    }

    const scriptKeys = objectPropertyNamesSchema("scripts");
    expect(scriptKeys.minLength).toBe(1);

    const scriptValuePattern = schemaPattern(
      objectValueSchema("scripts"),
      "scripts",
    );
    expect(scriptValuePattern.test("bpl build index.bpl")).toBe(true);
    expect(scriptValuePattern.test("   ")).toBe(false);
    expect(scriptValuePattern.test("")).toBe(false);

    const binCommandPattern = schemaPattern(
      objectPropertyNamesSchema("bin"),
      "bin",
    );
    expect(binCommandPattern.test("tool")).toBe(true);
    expect(binCommandPattern.test("build-tool")).toBe(true);
    expect(binCommandPattern.test("")).toBe(false);
    expect(binCommandPattern.test(".")).toBe(false);
    expect(binCommandPattern.test("..")).toBe(false);
    expect(binCommandPattern.test("../tool")).toBe(false);
    expect(binCommandPattern.test("nested/tool")).toBe(false);
    expect(binCommandPattern.test("nested\\tool")).toBe(false);
  });
});
