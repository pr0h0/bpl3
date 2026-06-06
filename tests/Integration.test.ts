import { afterAll, describe, expect, it } from "bun:test";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  createLimiter,
  formatIntegrationExitCodeMismatch,
  formatIntegrationTimeout,
  getIntegrationJobs,
  runProcess,
} from "./helpers/integrationRunner";
import {
  readIntegrationExampleConfig,
  validateIntegrationExampleConfigFile,
} from "./helpers/integrationConfig";

const EXAMPLES_DIR = path.join(process.cwd(), "examples");
const BPL_CLI = path.join(process.cwd(), "index.ts");
const DEFAULT_EXAMPLE_TIMEOUT_MS = 30_000;
const INTEGRATION_TEST_TIMEOUT_MS = 30 * 60 * 1000;
const INTEGRATION_ARTIFACTS_DIR = path.join(
  os.tmpdir(),
  "bpl-integration-artifacts",
);
const INTEGRATION_RUN_ARTIFACTS_DIR = path.join(
  INTEGRATION_ARTIFACTS_DIR,
  `run-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);
const PACKAGE_DEPENDENCY_EXAMPLE = "package_transitive_dependency/app";
const X86_ONLY_EXAMPLES = new Set([
  "asm_clobbers",
  "asm_flavors",
  "asm_flavors_test",
  "asm_test",
  "asm_x86_test",
  "bug111_asm_underscore",
  "feature_showcase",
]);
const LINUX_ONLY_EXAMPLES = new Set(["memory_allocators"]);
const PACKAGE_DEPENDENCY_FIXTURE_FILES = [
  "examples/package_transitive_dependency/app/main.bpl",
  "examples/package_transitive_dependency/app/bpl.json",
  "examples/package_transitive_dependency/app/test_config.json",
  "examples/package_transitive_dependency/packages/math-core/bpl.json",
  "examples/package_transitive_dependency/packages/math-core/index.bpl",
  "examples/package_transitive_dependency/packages/math-extra/bpl.json",
  "examples/package_transitive_dependency/packages/math-extra/index.bpl",
  "examples/package_transitive_dependency/packages/math-extra/features/direct.bpl",
  "examples/package_transitive_dependency/packages/math-extra/features/increment/index.bpl",
] as const;
const runLimited = createLimiter(getIntegrationJobs());

// Helper to find example directories
function getExampleDirectories(dir = EXAMPLES_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    // Use lstatSync to avoid crashing on broken symlinks
    let stat;
    try {
      stat = fs.lstatSync(fullPath);
    } catch (e) {
      continue;
    }

    if (
      stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      file !== "node_modules" &&
      file !== "bpl_modules"
    ) {
      if (fs.existsSync(path.join(fullPath, "main.bpl"))) {
        results.push(path.relative(EXAMPLES_DIR, fullPath));
      }
      results = results.concat(getExampleDirectories(fullPath));
    }
  }
  return results.sort();
}

function getExampleArtifactOutputPath(example: string): string {
  const safeExampleName = example.replace(/[^A-Za-z0-9._-]+/g, "_");
  const exampleFingerprint = createHash("sha256")
    .update(example)
    .digest("hex")
    .slice(0, 12);
  return path.join(
    INTEGRATION_RUN_ARTIFACTS_DIR,
    `${safeExampleName}-${exampleFingerprint}`,
    "main",
  );
}

function prepareExampleArtifactOutput(example: string): string {
  const outputPath = getExampleArtifactOutputPath(example);
  const outputDir = path.dirname(outputPath);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  return outputPath;
}

function readExampleMainSource(example: string): string {
  const relativePath = path.join("examples", example, "main.bpl");
  expectProjectFileExists(relativePath, `main source for ${example}`);
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

function cleanupExampleArtifactOutput(outputPath: string): void {
  fs.rmSync(path.dirname(outputPath), { recursive: true, force: true });
}

function readExampleConfig(configFile: string) {
  return readIntegrationExampleConfig(
    configFile,
    path.relative(process.cwd(), configFile),
  );
}

function expectProjectFileExists(relativePath: string, context: string): void {
  const normalizedPath = relativePath.split(path.sep).join("/");
  expect(
    fs.existsSync(path.join(process.cwd(), relativePath)),
    `${context}: missing fixture file ${normalizedPath}`,
  ).toBe(true);
}

function expectSourceImport(
  source: string,
  importLine: string,
  importMode: string,
): void {
  expect(
    source.includes(importLine),
    `package dependency example must keep ${importMode} import: ${importLine}`,
  ).toBe(true);
}

function findInvalidExampleConfigErrors(examples: string[]): string[] {
  const errors: string[] = [];

  for (const example of examples) {
    const configFile = path.join(EXAMPLES_DIR, example, "test_config.json");
    if (!fs.existsSync(configFile)) continue;

    errors.push(
      ...validateIntegrationExampleConfigFile(
        configFile,
        path.relative(process.cwd(), configFile),
      ),
    );
  }

  return errors.sort();
}

function findExampleArtifactDirectoryCollisions(
  examples: string[],
  getOutputPath: (example: string) => string = getExampleArtifactOutputPath,
): string[] {
  const examplesByArtifactDir = new Map<string, string[]>();

  for (const example of examples) {
    const artifactDir = path.dirname(getOutputPath(example));
    const mappedExamples = examplesByArtifactDir.get(artifactDir) || [];
    mappedExamples.push(example);
    examplesByArtifactDir.set(artifactDir, mappedExamples);
  }

  return [...examplesByArtifactDir.entries()]
    .filter(([, mappedExamples]) => mappedExamples.length > 1)
    .map(
      ([artifactDir, mappedExamples]) =>
        `${artifactDir}: ${mappedExamples.join(", ")}`,
    );
}

describe("Integration Tests", () => {
  const examples = getExampleDirectories();
  const testOnly: string[] = [""].filter(Boolean); // Specify example names to test only

  afterAll(() => {
    fs.rmSync(INTEGRATION_RUN_ARTIFACTS_DIR, {
      recursive: true,
      force: true,
    });
  });

  it("includes package dependency example coverage in CI-safe integration tests", () => {
    expect(examples).toContain(PACKAGE_DEPENDENCY_EXAMPLE);
  });

  it("keeps package dependency fixture files present", () => {
    for (const relativePath of PACKAGE_DEPENDENCY_FIXTURE_FILES) {
      expectProjectFileExists(relativePath, "package dependency integration");
    }
  });

  it("keeps package dependency example explicit source-file import coverage", () => {
    expectSourceImport(
      readExampleMainSource(PACKAGE_DEPENDENCY_EXAMPLE),
      'import identity from "math-extra/features/direct.bpl";',
      "explicit source-file",
    );
  });

  it("keeps package dependency example extensionless directory import coverage", () => {
    expectSourceImport(
      readExampleMainSource(PACKAGE_DEPENDENCY_EXAMPLE),
      'import increment from "math-extra/features/increment";',
      "extensionless directory-index",
    );
  });

  it("keeps package dependency example artifacts outside the tracked examples tree", () => {
    const outputPath = getExampleArtifactOutputPath(PACKAGE_DEPENDENCY_EXAMPLE);

    expect(outputPath).toContain(
      path.join(os.tmpdir(), "bpl-integration-artifacts"),
    );
    expect(path.relative(EXAMPLES_DIR, outputPath).startsWith("..")).toBe(true);
    expect(path.basename(outputPath)).toBe("main");
  });

  it("uses a run-unique artifact root for integration outputs", () => {
    const outputPath = getExampleArtifactOutputPath(PACKAGE_DEPENDENCY_EXAMPLE);

    expect(outputPath).toContain(`run-${process.pid}-`);
  });

  it("keeps nested and underscore example artifact paths distinct", () => {
    expect(getExampleArtifactOutputPath("enum_imports/destructuring")).not.toBe(
      getExampleArtifactOutputPath("enum_imports_destructuring"),
    );
    expect(getExampleArtifactOutputPath("enum_imports/wildcard")).not.toBe(
      getExampleArtifactOutputPath("enum_imports_wildcard"),
    );
  });

  it("keeps artifact directories unique across all discovered examples", () => {
    expect(findExampleArtifactDirectoryCollisions(examples)).toEqual([]);
  });

  it("keeps example test configs valid for the integration harness", () => {
    expect(findInvalidExampleConfigErrors(examples)).toEqual([]);
  });

  it("reports colliding example names when artifact directories overlap", () => {
    const collisions = findExampleArtifactDirectoryCollisions(
      ["enum_imports/destructuring", "enum_imports_destructuring"],
      (example) =>
        path.join(
          INTEGRATION_RUN_ARTIFACTS_DIR,
          example.replace(/[^A-Za-z0-9._-]+/g, "_"),
          "main",
        ),
    );

    expect(collisions).toEqual([
      `${path.join(
        INTEGRATION_RUN_ARTIFACTS_DIR,
        "enum_imports_destructuring",
      )}: enum_imports/destructuring, enum_imports_destructuring`,
    ]);
  });

  it("cleans prepared integration artifact directories", () => {
    const outputPath = prepareExampleArtifactOutput(
      "package_transitive_dependency/app-cleanup",
    );
    const outputDir = path.dirname(outputPath);

    fs.writeFileSync(outputPath, "stale binary");
    fs.writeFileSync(`${outputPath}.ll`, "stale ir");
    cleanupExampleArtifactOutput(outputPath);

    expect(fs.existsSync(outputDir)).toBe(false);
  });

  for (const example of examples) {
    const exampleDir = path.join(EXAMPLES_DIR, example);
    const relativeMainFile = path.relative(
      process.cwd(),
      path.join(exampleDir, "main.bpl"),
    );
    const configFile = path.join(exampleDir, "test_config.json");

    if (
      fs.existsSync(path.join(exampleDir, "main.bpl")) &&
      fs.existsSync(configFile)
    ) {
      const config = readExampleConfig(configFile);

      const shouldSkip =
        config.skipCompilation ||
        (process.arch !== "x64" && X86_ONLY_EXAMPLES.has(example)) ||
        (process.platform !== "linux" && LINUX_ONLY_EXAMPLES.has(example)) ||
        (testOnly.length > 0 && !testOnly.includes(example));

      if (shouldSkip) {
        it.skip(`should run example: ${example}`, () => {});
        continue;
      }

      // For debugging, enable DWARF generation
      if (false) {
        if (!config.args) {
          config.args = [];
        }
        config.args.push("--dwarf");
      }

      it.concurrent(
        `should run example: ${example}`,
        async () => {
          const timeout = Math.max(
            config.timeout || DEFAULT_EXAMPLE_TIMEOUT_MS,
            DEFAULT_EXAMPLE_TIMEOUT_MS,
          );

          // Prepare command
          // Use the same CLI path as cmp.sh, but run it asynchronously so examples can overlap.
          const artifactOutputPath = prepareExampleArtifactOutput(example);
          const command = process.execPath;
          const args = [
            BPL_CLI,
            "-o",
            artifactOutputPath,
            "run",
            relativeMainFile,
            ...config.args,
          ];
          const result = await (async () => {
            try {
              return await runLimited(() =>
                runProcess(command, args, {
                  env: {
                    ...process.env,
                    BPL_HOME: process.cwd(), // Set BPL_HOME to current directory for stdlib resolution
                    ...config.env,
                  },
                  input: config.input,
                  timeout,
                }),
              );
            } finally {
              cleanupExampleArtifactOutput(artifactOutputPath);
            }
          })();

          const output = result.stdout + result.stderr;
          if (result.timedOut) {
            throw new Error(
              formatIntegrationTimeout({
                example,
                timeoutMs: timeout,
                command,
                args,
                stdout: result.stdout,
                stderr: result.stderr,
              }),
            );
          }

          // Check exit code
          // cmp.sh returns the exit code of the program
          // But if compilation fails, it returns 1.
          // We assume the example should compile and run successfully (exit code 0) unless specified otherwise in config
          const exitCode = config.exitCode;
          if (result.status !== exitCode) {
            throw new Error(
              formatIntegrationExitCodeMismatch({
                example,
                expectedStatus: exitCode,
                actualStatus: result.status,
                signal: result.signal,
                command,
                args,
                stdout: result.stdout,
                stderr: result.stderr,
              }),
            );
          }

          // Check output
          // cmp.sh appends "Program exited with code X"
          // We should filter that out or check if output contains expected output.
          // The user's hello world prints "Hello, World!\n"
          // cmp.sh prints "Program exited with code 0\n"

          if (config.expectedOutput) {
            if (Array.isArray(config.expectedOutput)) {
              config.expectedOutput.forEach((expectedLine: string) => {
                expect(output).toContain(expectedLine);
              });
            } else if (typeof config.expectedOutput === "string") {
              expect(output).toContain(config.expectedOutput);
            }
          }
        },
        INTEGRATION_TEST_TIMEOUT_MS,
      );
    }
  }
});
