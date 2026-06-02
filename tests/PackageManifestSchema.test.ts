import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import {
  expectPackageManifestConformsToSchema,
  type JsonObject,
} from "./helpers/packageManifestSchema";

type JsonSchemaObject = {
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
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
  test("documents optional editor schema URI metadata", () => {
    expect(propertySchema("$schema").type).toBe("string");
  });

  test("validates tracked package manifests", () => {
    const trackedManifests = spawnSync("git", ["ls-files", "**/bpl.json"], {
      encoding: "utf8",
    });

    expect(trackedManifests.status).toBe(0);

    const packageManifestPaths = trackedManifests.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((filePath) => filePath !== "vscode-ext/snippets/bpl.json");

    expect(packageManifestPaths).toContain("packages/bpl-express/bpl.json");
    expect(packageManifestPaths).toContain(
      "examples/package_transitive_dependency/app/bpl.json",
    );

    for (const manifestPath of packageManifestPaths) {
      const manifest = JSON.parse(
        readFileSync(manifestPath, "utf8"),
      ) as JsonObject;
      expectPackageManifestConformsToSchema(manifest, manifestPath);
    }
  });

  test("rejects leading-zero semantic version segments", () => {
    const versionPattern = schemaPattern(propertySchema("version"), "version");

    for (const version of ["0.0.0", "1.2.3", "10.20.30"]) {
      expect(versionPattern.test(version), `version accepts ${version}`).toBe(
        true,
      );
    }

    for (const version of ["01.0.0", "1.02.0", "1.0.03"]) {
      expect(versionPattern.test(version), `version rejects ${version}`).toBe(
        false,
      );
      expect(() =>
        expectPackageManifestConformsToSchema(
          {
            name: "leading-zero-version",
            version,
          },
          "leading-zero-version",
        ),
      ).toThrow(/version matches/);
    }
  });

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

  test("requires repository type and url when repository metadata is present", () => {
    const repositorySchema = propertySchema("repository");
    expect(repositorySchema.type).toBe("object");
    expect(repositorySchema.required).toEqual(["type", "url"]);

    expect(() =>
      expectPackageManifestConformsToSchema(
        {
          name: "missing-repository-url",
          version: "1.0.0",
          repository: { type: "git" },
        },
        "missing-repository-url",
      ),
    ).toThrow(/repository\.url is required/);

    expect(() =>
      expectPackageManifestConformsToSchema(
        {
          name: "missing-repository-type",
          version: "1.0.0",
          repository: { url: "https://example.com/repo.git" },
        },
        "missing-repository-type",
      ),
    ).toThrow(/repository\.type is required/);

    expectPackageManifestConformsToSchema(
      {
        name: "valid-repository",
        version: "1.0.0",
        repository: {
          type: "git",
          url: "https://example.com/repo.git",
        },
      },
      "valid-repository",
    );
  });
});
