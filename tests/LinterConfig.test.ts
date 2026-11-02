import { expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { LINT_RULE_CODES } from "../compiler/linter/Linter";
import {
  LINTER_CONFIG_FILENAME,
  loadLinterConfig,
  validateLinterConfig,
} from "../compiler/linter/LinterConfig";

const SOURCE = `import printf from "std/c.bpl";

frame Helper() {}

frame main() ret int {
    local x: int = 1;
    if (x > 0) {
    }
    Helper();
    return 0;
}
`;

function withProject(run: (root: string, file: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "bpl-lint-config-"));
  try {
    mkdirSync(join(root, "src"));
    const file = join(root, "src", "main.bpl");
    writeFileSync(file, SOURCE);
    run(root, file);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function lintJson(args: string[]) {
  const result = Bun.spawnSync(
    [process.execPath, resolve("index.ts"), "lint", "--json", ...args],
    {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: "1" },
      timeout: 15000,
    },
  );
  return {
    exitCode: result.exitCode,
    report: JSON.parse(result.stdout.toString()),
  };
}

const codes = (report: {
  files: { diagnostics?: { code: string }[] }[];
}): string[] => (report.files[0]!.diagnostics ?? []).map((d) => d.code).sort();

test("validates and normalizes .bpllint.json", () => {
  expect(validateLinterConfig({})).toEqual({ disable: [] });
  expect(
    validateLinterConfig({ $schema: "x", disable: [" l003 ", "L008"] }),
  ).toEqual({ disable: ["L003", "L008"] });
  expect(() => validateLinterConfig([])).toThrow("expected a JSON object");
  expect(() => validateLinterConfig({ rules: [] })).toThrow(
    "unknown setting 'rules'",
  );
  expect(() => validateLinterConfig({ disable: "L001" })).toThrow(
    "must be an array",
  );
  expect(() => validateLinterConfig({ disable: ["L042"] })).toThrow(
    "unknown lint rule 'L042'",
  );
});

test("finds the nearest configuration above the linted file", () => {
  withProject((root, file) => {
    expect(loadLinterConfig(file)).toEqual({ config: { disable: [] } });
    writeFileSync(join(root, LINTER_CONFIG_FILENAME), '{"disable": ["L001"]}');
    expect(loadLinterConfig(file)).toEqual({
      configPath: join(root, LINTER_CONFIG_FILENAME),
      config: { disable: ["L001"] },
    });
    writeFileSync(join(root, "src", LINTER_CONFIG_FILENAME), "{}");
    expect(loadLinterConfig(file).config.disable).toEqual([]);
    writeFileSync(join(root, "src", LINTER_CONFIG_FILENAME), "{");
    expect(() => loadLinterConfig(file)).toThrow("Invalid lint configuration");
  });
});

test("bpl lint applies the configuration together with --disable", () => {
  withProject((root, file) => {
    expect(codes(lintJson([file]).report)).toEqual(["L001", "L002", "L008"]);
    writeFileSync(
      join(root, LINTER_CONFIG_FILENAME),
      '{"disable": ["L001", "L002"]}',
    );
    expect(codes(lintJson([file]).report)).toEqual(["L008"]);
    const both = lintJson(["--disable", "L008", file]);
    expect(both.exitCode).toBe(0);
    expect(codes(both.report)).toEqual([]);

    writeFileSync(join(root, LINTER_CONFIG_FILENAME), '{"disable": ["L042"]}');
    const invalid = lintJson([file]);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.report.files[0]).toMatchObject({
      success: false,
      errorCode: "BPL_LINT_PROCESSING_ERROR",
    });
    expect(invalid.report.files[0].error).toContain("L042");
  });
}, 60000);

test("the JSON schema accepts exactly the known rule codes", () => {
  const schema = JSON.parse(
    readFileSync(resolve("schemas/bpl-lint.schema.json"), "utf8"),
  );
  const pattern = new RegExp(schema.properties.disable.items.pattern);
  for (const code of LINT_RULE_CODES) {
    expect(pattern.test(code)).toBe(true);
    expect(pattern.test(code.toLowerCase())).toBe(true);
  }
  expect(pattern.test("L000")).toBe(false);
  expect(pattern.test(`L00${LINT_RULE_CODES.length + 1}`)).toBe(false);
});
