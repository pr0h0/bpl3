import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  expectJsonStdoutReport,
  parseJsonObjectStdout,
} from "./helpers/cliJson";
import { writeNodeCommandShim } from "./helpers/executableShim";
import { PACKAGE_DOCS_SMOKE_EXAMPLES } from "./helpers/packageDocsSmokeExamples";

const BPL_CLI = path.join(process.cwd(), "index.ts");

function runCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {},
): SpawnSyncReturns<string> {
  return spawnSync("bun", [BPL_CLI, ...args], {
    cwd: options.cwd,
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1", ...options.env },
    input: options.input,
  });
}

type CheckJsonDiagnostic = {
  severity: string;
  severityLabel: string;
  message: string;
  hint: string;
  code?: string;
  location: {
    file: string;
    start: { line: number; column: number };
  };
  source?: {
    line: string;
    preview: string;
    pointer: string;
  };
  relatedLocations: unknown[];
};

type CheckJsonFailureReport = {
  schemaVersion: number;
  check: string;
  success: boolean;
  totalFiles: number;
  errorCount: number;
  files: Array<{
    file: string;
    success: boolean;
    diagnostics: CheckJsonDiagnostic[];
  }>;
};

function expectSingleCheckJsonDiagnostic(
  result: SpawnSyncReturns<string>,
  sourceFile: string,
  start: { line: number; column: number } = { line: 1, column: 1 },
): CheckJsonDiagnostic {
  expect(result.status).toBe(1);
  const report = parseJsonObjectStdout<CheckJsonFailureReport>(result);

  expect(report).toMatchObject({
    schemaVersion: 1,
    check: "check",
    success: false,
    totalFiles: 1,
    errorCount: 1,
    files: [
      {
        file: sourceFile,
        success: false,
        diagnostics: [
          {
            location: {
              file: sourceFile,
              start,
            },
          },
        ],
      },
    ],
  });

  const diagnostic = report.files[0]?.diagnostics[0];
  expect(diagnostic).toBeDefined();
  expect(diagnostic).toMatchObject({
    severity: "error",
    severityLabel: "error",
    relatedLocations: [],
  });
  expect(diagnostic?.source?.pointer).toContain("^");
  return diagnostic as CheckJsonDiagnostic;
}

function writePackageFixture(
  packageDir: string,
  options: {
    name?: string;
    version?: string;
    main?: string;
    entryPath?: string;
    entrySource?: string | null;
  } = {},
): void {
  const name = options.name ?? "pkg-math";
  const version = options.version ?? "1.0.0";
  const main = options.main ?? "index.bpl";
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, "bpl.json"),
    JSON.stringify({ name, version, main }),
  );

  if (options.entrySource === null) return;

  const relativeEntryPath = options.entryPath ?? main;
  const entryPath = path.join(packageDir, ...relativeEntryPath.split(/[\\/]/));
  fs.mkdirSync(path.dirname(entryPath), { recursive: true });
  fs.writeFileSync(entryPath, options.entrySource ?? "export value;");
}

describe("CLI JSON parseability", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-cli-json-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("keeps representative successful JSON command stdout parseable", () => {
    const buildDir = path.join(tempDir, "build");
    fs.mkdirSync(buildDir);
    fs.writeFileSync(path.join(buildDir, "generated.o"), "object");
    const buildSource = path.join(tempDir, "main.bpl");
    const buildOutput = path.join(tempDir, "json-build-app");
    fs.writeFileSync(buildSource, "frame main() ret int { return 0; }\n");

    const doctor = runCli(["doctor", "--json"]);
    expectJsonStdoutReport(doctor, {
      status: 0,
      check: "toolchain",
      success: true,
    });

    const sanitizerDoctor = runCli(["doctor", "sanitizer", "--json"]);
    expectJsonStdoutReport(sanitizerDoctor, {
      status: 0,
      check: "toolchain",
      success: true,
    });

    const clean = runCli(["clean", "--dry-run", "--json"], { cwd: tempDir });
    expect(clean.status).toBe(0);
    expect(parseJsonObjectStdout(clean)).toMatchObject({
      dryRun: true,
      count: 1,
    });

    const build = runCli(["build", buildSource, "-o", buildOutput, "--json"]);
    expect(build.status).toBe(0);
    expect(parseJsonObjectStdout(build)).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: true,
      file: buildSource,
      emit: "llvm",
      output: {
        llvm: `${buildOutput}.ll`,
        executable: buildOutput,
      },
    });

    const check = runCli(["check", "--json", buildSource]);
    expect(check.status).toBe(0);
    expect(parseJsonObjectStdout(check)).toMatchObject({
      schemaVersion: 1,
      check: "check",
      success: true,
      totalFiles: 1,
      errorCount: 0,
      files: [
        {
          file: buildSource,
          success: true,
        },
      ],
    });

    const lint = runCli(["lint", "--json", buildSource]);
    expect(lint.status).toBe(0);
    expect(parseJsonObjectStdout(lint)).toEqual({
      schemaVersion: 1,
      check: "lint",
      success: true,
      totalFiles: 1,
      errorCount: 0,
      files: [
        {
          file: buildSource,
          success: true,
          diagnostics: [],
        },
      ],
    });
  });

  test("keeps package/import docs examples covered by JSON smoke fixtures", () => {
    const { invalidImport, successExamples } = PACKAGE_DOCS_SMOKE_EXAMPLES;

    expect(successExamples?.map((example) => example.importPath)).toEqual([
      "math-extra/features/direct.bpl",
      "math-extra/features/increment",
    ]);

    for (const successExample of successExamples ?? []) {
      const documentedExample = path.join(
        process.cwd(),
        successExample.sourcePath,
      );
      const documentedSource = fs.readFileSync(documentedExample, "utf8");
      const expectedResolvedPath = path.join(
        process.cwd(),
        successExample.expectedResolvedPath,
      );

      expect(documentedSource, successExample.name).toContain(
        `"${successExample.importPath}"`,
      );
      expect(fs.existsSync(expectedResolvedPath), successExample.name).toBe(
        true,
      );

      const successResult = runCli(["check", "--json", documentedExample]);

      expectJsonStdoutReport(successResult, {
        status: 0,
        check: "check",
        success: true,
      });
    }

    const appDir = path.join(tempDir, invalidImport.workspaceDirName);
    const sourceFile = path.join(appDir, "main.bpl");
    fs.mkdirSync(appDir, { recursive: true });
    writePackageFixture(
      path.join(appDir, "bpl_modules", invalidImport.packageName),
    );
    fs.writeFileSync(
      sourceFile,
      [
        `import value from "${invalidImport.importPath}";`,
        "frame main() ret int { return 0; }",
        "",
      ].join("\n"),
    );

    const invalidImportResult = runCli(["check", "--json", sourceFile], {
      cwd: appDir,
    });
    const diagnostic = expectSingleCheckJsonDiagnostic(
      invalidImportResult,
      sourceFile,
    );

    expect(diagnostic.code).toBe(invalidImport.expectedDiagnosticCode);
    expect(diagnostic.message).toContain(
      invalidImport.expectedMessageSnippet,
    );
  });

  test("keeps check and lint JSON input validation failures parseable with error codes", () => {
    const sourceDir = path.join(tempDir, "source-dir");
    const realSource = path.join(tempDir, "main.bpl");
    const linkedSource = path.join(tempDir, "linked.bpl");
    const missingSource = path.join(tempDir, "missing.bpl");
    fs.mkdirSync(sourceDir);
    fs.writeFileSync(realSource, "frame main() ret int { return 0; }\n");
    fs.symlinkSync(realSource, linkedSource, "file");

    const cases: Array<{
      args: string[];
      check: "check" | "lint";
      file: string;
      error: string;
      errorCode: string;
    }> = [
      {
        args: ["check", "--json", missingSource],
        check: "check",
        file: missingSource,
        error: "File not found",
        errorCode: "BPL_CHECK_INPUT_NOT_FOUND",
      },
      {
        args: ["check", "--json", linkedSource],
        check: "check",
        file: linkedSource,
        error: "Input path is a symbolic link",
        errorCode: "BPL_CHECK_INPUT_SYMLINK",
      },
      {
        args: ["check", "--json", sourceDir],
        check: "check",
        file: sourceDir,
        error: "Input path is not a file",
        errorCode: "BPL_CHECK_INPUT_NOT_FILE",
      },
      {
        args: ["lint", "--json", missingSource],
        check: "lint",
        file: missingSource,
        error: "File not found",
        errorCode: "BPL_LINT_INPUT_NOT_FOUND",
      },
      {
        args: ["lint", "--json", linkedSource],
        check: "lint",
        file: linkedSource,
        error: "Input path is a symbolic link",
        errorCode: "BPL_LINT_INPUT_SYMLINK",
      },
      {
        args: ["lint", "--json", sourceDir],
        check: "lint",
        file: sourceDir,
        error: "Input path is not a file",
        errorCode: "BPL_LINT_INPUT_NOT_FILE",
      },
    ];

    for (const testCase of cases) {
      const report = expectJsonStdoutReport<{
        totalFiles: number;
        errorCount: number;
        files: Array<{
          file: string;
          success: boolean;
          error: string;
          errorCode: string;
        }>;
      }>(runCli(testCase.args), {
        status: 1,
        check: testCase.check,
        success: false,
      });

      expect(report).toMatchObject({
        totalFiles: 1,
        errorCount: 1,
        files: [
          {
            file: testCase.file,
            success: false,
            error: testCase.error,
            errorCode: testCase.errorCode,
          },
        ],
      });
    }
  });

  test("keeps check and lint JSON no-input failures parseable with error codes", () => {
    const cases: Array<{
      args: string[];
      check: "check" | "lint";
      errorCode: string;
    }> = [
      {
        args: ["check", "--json"],
        check: "check",
        errorCode: "BPL_CHECK_NO_INPUTS",
      },
      {
        args: ["lint", "--json"],
        check: "lint",
        errorCode: "BPL_LINT_NO_INPUTS",
      },
    ];

    for (const testCase of cases) {
      const report = expectJsonStdoutReport<{
        totalFiles: number;
        errorCount: number;
        files: unknown[];
        error: string;
        errorCode: string;
      }>(runCli(testCase.args), {
        status: 1,
        check: testCase.check,
        success: false,
      });

      expect(report).toMatchObject({
        totalFiles: 0,
        errorCount: 1,
        files: [],
        error: "No files specified.",
        errorCode: testCase.errorCode,
      });
    }
  });

  test("keeps clean JSON validation failures parseable with error codes", () => {
    const realRoot = path.join(tempDir, "real-root");
    const linkedRoot = path.join(tempDir, "linked-root");
    const realProject = path.join(realRoot, "project");
    const linkedProject = path.join(linkedRoot, "project");
    const artifact = path.join(realProject, "main.ll");

    fs.mkdirSync(realProject, { recursive: true });
    fs.writeFileSync(artifact, "; keep ir");
    fs.symlinkSync(realRoot, linkedRoot, "dir");

    const symlinkedCwdClean = spawnSync(
      "bun",
      ["--cwd", linkedProject, BPL_CLI, "clean", "--dry-run", "--json"],
      {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      },
    );

    expect(symlinkedCwdClean.status).toBe(1);
    expect(symlinkedCwdClean.stderr).toBe("");
    expect(parseJsonObjectStdout(symlinkedCwdClean)).toMatchObject({
      schemaVersion: 1,
      check: "clean",
      success: false,
      dryRun: true,
      count: 0,
      entries: [],
      errorCode: "BPL_CLEAN_WORKDIR_SYMLINK",
      error: expect.stringContaining(
        "Clean working directory path contains a symbolic link",
      ),
    });
    expect(fs.readFileSync(artifact, "utf-8")).toBe("; keep ir");

    const fakeBin = path.join(tempDir, "bin");
    const gitFailureProject = path.join(tempDir, "git-failure-project");
    const gitFailureArtifact = path.join(gitFailureProject, "main.ll");
    fs.mkdirSync(path.join(gitFailureProject, ".git"), { recursive: true });
    fs.mkdirSync(fakeBin);
    fs.writeFileSync(gitFailureArtifact, "; keep git artifact");
    writeNodeCommandShim(path.join(fakeBin, "git"), [
      'console.error("fatal: simulated git failure");',
      "process.exit(1);",
    ]);

    const gitProbeClean = runCli(["clean", "--json"], {
      cwd: gitFailureProject,
      env: {
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    });

    expect(gitProbeClean.status).toBe(1);
    expect(gitProbeClean.stderr).toBe("");
    expect(parseJsonObjectStdout(gitProbeClean)).toMatchObject({
      schemaVersion: 1,
      check: "clean",
      success: false,
      dryRun: false,
      count: 0,
      entries: [],
      errorCode: "BPL_CLEAN_GIT_TRACKED_UNAVAILABLE",
      error:
        "Could not determine git-tracked files; refusing to clean in a git repository.",
    });
    expect(fs.readFileSync(gitFailureArtifact, "utf-8")).toBe(
      "; keep git artifact",
    );
  });

  test("keeps JSON-mode doctor scope failures parseable on stdout", () => {
    const result = runCli(["doctor", "unknown-scope", "--json"]);
    expect(
      expectJsonStdoutReport(result, {
        status: 1,
        check: "doctor",
        success: false,
      }),
    ).toMatchObject({
      error: expect.stringContaining("Unknown doctor scope 'unknown-scope'"),
      errorCode: "BPL_DOCTOR_SCOPE_UNKNOWN",
    });
  });

  test("keeps cached build JSON stdout parseable", () => {
    const helperSource = path.join(tempDir, "helper.bpl");
    const mainSource = path.join(tempDir, "cached-main.bpl");
    const outputFile = path.join(tempDir, "cached-json-app");

    fs.writeFileSync(
      helperSource,
      ["export value;", "frame value() ret int { return 42; }"].join("\n"),
    );
    fs.writeFileSync(
      mainSource,
      [
        'import value from "./helper.bpl";',
        "frame main() ret int {",
        "    return value();",
        "}",
      ].join("\n"),
    );

    const result = runCli([
      "build",
      mainSource,
      "--cache",
      "--json",
      "-o",
      outputFile,
    ]);

    expect(result.status).toBe(0);
    expect(parseJsonObjectStdout(result)).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: true,
      file: mainSource,
      cache: true,
      output: {
        executable: outputFile,
      },
    });
  });

  test("keeps build JSON stdout parseable with invalid compiler driver timeout environment", () => {
    const buildSource = path.join(tempDir, "timeout-build-main.bpl");
    const buildOutput = path.join(tempDir, "timeout-json-build-app");
    fs.writeFileSync(buildSource, "frame main() ret int { return 0; }\n");

    const result = runCli(["build", buildSource, "--json", "-o", buildOutput], {
      env: { BPL_COMPILE_DRIVER_TIMEOUT_MS: "0" },
    });

    const report = expectJsonStdoutReport<{
      file: string;
      output: { llvm: string; executable: string };
    }>(result, {
      status: 0,
      check: "build",
      success: true,
    });
    expect(report.file).toBe(buildSource);
    expect(report.output).toEqual({
      llvm: `${buildOutput}.ll`,
      executable: buildOutput,
    });
    expect(JSON.stringify(report)).not.toContain(
      "Ignoring invalid BPL_COMPILE_DRIVER_TIMEOUT_MS",
    );
    expect(result.stderr).toBe("");
  });

  test("keeps root build JSON no-input failures parseable", () => {
    const report = expectJsonStdoutReport<{
      error: string;
      errorCode: string;
    }>(runCli(["--json"]), {
      status: 1,
      check: "build",
      success: false,
    });

    expect(report).toMatchObject({
      error: "No input files specified.",
      errorCode: "BPL_BUILD_NO_INPUTS",
    });
  });

  test("keeps build JSON object diagnostics parseable with invalid object timeout environment", () => {
    const buildSource = path.join(tempDir, "object-diagnostic-main.bpl");
    const missingObject = path.join(tempDir, "missing.o");
    const fakeObject = path.join(tempDir, "fake.o");
    const missingOutput = path.join(tempDir, "missing-object-app");
    const fakeOutput = path.join(tempDir, "fake-object-app");
    fs.writeFileSync(buildSource, "frame main() ret int { return 0; }\n");
    fs.writeFileSync(fakeObject, "not an object\n");

    const missingResult = runCli(
      [
        "build",
        buildSource,
        "--json",
        "--object",
        missingObject,
        "-o",
        missingOutput,
      ],
      { env: { BPL_OBJECT_SYMBOL_TIMEOUT_MS: "0" } },
    );
    const missingReport = expectJsonStdoutReport<{
      file: string;
      error: string;
    }>(missingResult, {
      status: 1,
      check: "build",
      success: false,
    });
    expect(missingReport.file).toBe(buildSource);
    expect(missingReport.error).toContain("Link object input not found");
    expect(missingReport.error).toContain(missingObject);
    expect(missingReport.error).not.toContain(
      "Ignoring invalid BPL_OBJECT_SYMBOL_TIMEOUT_MS",
    );
    expect(missingResult.stderr).toBe("");

    const fakeResult = runCli(
      [
        "build",
        buildSource,
        "--json",
        "--object",
        fakeObject,
        "-o",
        fakeOutput,
      ],
      { env: { BPL_OBJECT_SYMBOL_TIMEOUT_MS: "0" } },
    );
    const fakeReport = expectJsonStdoutReport<{
      file: string;
      error: string;
    }>(fakeResult, {
      status: 1,
      check: "build",
      success: false,
    });
    expect(fakeReport.file).toBe(buildSource);
    expect(fakeReport.error).toContain("Failed to compile LLVM IR with clang");
    expect(fakeReport.error).toContain(fakeObject);
    expect(fakeReport.error).not.toContain(
      "Ignoring invalid BPL_OBJECT_SYMBOL_TIMEOUT_MS",
    );
    expect(fakeResult.stderr).toBe("");
  });

  test("keeps package command JSON stdout parseable", () => {
    const list = runCli(["list", "--json"], { cwd: tempDir });
    expect(list.status).toBe(0);
    expect(parseJsonObjectStdout(list)).toMatchObject({
      schemaVersion: 1,
      check: "package-list",
      success: true,
      packages: [],
    });

    const listTree = runCli(["list", "--tree", "--json"], { cwd: tempDir });
    expect(listTree.status).toBe(0);
    expect(parseJsonObjectStdout(listTree)).toMatchObject({
      schemaVersion: 1,
      check: "package-list-tree",
      success: true,
      scope: "local",
      tree: [],
    });

    const homeDir = path.join(tempDir, "home");
    fs.mkdirSync(homeDir);
    const cacheList = runCli(["package-cache", "list", "--json"], {
      cwd: tempDir,
      env: { HOME: homeDir },
    });
    expect(cacheList.status).toBe(0);
    expect(parseJsonObjectStdout(cacheList)).toMatchObject({
      schemaVersion: 1,
      check: "package-cache-list",
      success: true,
      entries: [],
    });
  });

  test("keeps package install JSON validation failures parseable", () => {
    const cases: Array<{
      name: string;
      args: string[];
      expected: Record<string, unknown>;
    }> = [
      {
        name: "missing manifest",
        args: ["install", "--json"],
        expected: {
          target: null,
          global: false,
          locked: false,
          update: false,
          repairLock: false,
          error: expect.stringContaining("No bpl.json found"),
        },
      },
      {
        name: "locked update conflict",
        args: ["install", "--locked", "--update", "--json"],
        expected: {
          target: null,
          locked: true,
          update: true,
          repairLock: false,
          error: expect.stringContaining("Cannot use --locked with --update"),
        },
      },
      {
        name: "locked repair conflict",
        args: ["install", "--locked", "--repair-lock", "--json"],
        expected: {
          target: null,
          locked: true,
          update: false,
          repairLock: true,
          error: expect.stringContaining(
            "Cannot use --locked with --repair-lock",
          ),
        },
      },
      {
        name: "update repair conflict",
        args: ["install", "--update", "--repair-lock", "--json"],
        expected: {
          target: null,
          locked: false,
          update: true,
          repairLock: true,
          error: expect.stringContaining(
            "Cannot use --update with --repair-lock",
          ),
        },
      },
      {
        name: "package argument with update mode",
        args: ["install", "missing-package", "--update", "--json"],
        expected: {
          target: "missing-package",
          locked: false,
          update: true,
          repairLock: false,
          error: expect.stringContaining(
            "--update and --repair-lock are project install options",
          ),
        },
      },
    ];

    for (const testCase of cases) {
      const cwd = path.join(tempDir, `install-json-${testCase.name}`);
      fs.mkdirSync(cwd, { recursive: true });

      const result = runCli(testCase.args, { cwd });
      expect(result.status).toBe(1);
      expect(parseJsonObjectStdout(result)).toMatchObject({
        schemaVersion: 1,
        check: "package-install",
        success: false,
        global: false,
        ...testCase.expected,
      });
    }
  });

  test("keeps package install JSON parseable with invalid package timeout environment", () => {
    const tarballPath = path.join(tempDir, "not-a-package.tgz");
    fs.writeFileSync(tarballPath, "not a tarball\n");

    const result = runCli(["install", tarballPath, "--json"], {
      cwd: tempDir,
      env: { BPL_PACKAGE_TOOL_TIMEOUT_MS: "0" },
    });

    const report = expectJsonStdoutReport<{
      target: string;
      error: string;
    }>(result, {
      status: 1,
      check: "package-install",
      success: false,
    });
    expect(report.target).toBe(tarballPath);
    expect(report.error).toContain("Failed to inspect package archive");
    expect(report.error).not.toContain(
      "Ignoring invalid BPL_PACKAGE_TOOL_TIMEOUT_MS",
    );
    expect(result.stderr).toBe("");
  });

  test("keeps package install JSON success stdout parseable", () => {
    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify({ name: "install-json-success", version: "1.0.0" }),
    );

    const result = runCli(["install", "--json"], { cwd: tempDir });
    expect(result.status).toBe(0);
    expect(parseJsonObjectStdout(result)).toEqual({
      schemaVersion: 1,
      check: "package-install",
      success: true,
      mode: "project",
      target: null,
      global: false,
      locked: false,
      update: false,
      repairLock: false,
    });
  });

  test("keeps package install JSON success stdout parseable across package modes", () => {
    const packageDir = path.join(tempDir, "package-source");
    const homeDir = path.join(tempDir, "install-json-home");
    writePackageFixture(packageDir, {
      name: "install-json-package",
      version: "1.0.0",
    });

    const packResult = runCli(["pack"], { cwd: packageDir });
    expect(packResult.status).toBe(0);
    const tarballPath = path.join(packageDir, "install-json-package-1.0.0.tgz");

    const directProject = path.join(tempDir, "direct-project");
    fs.mkdirSync(directProject);
    const directInstall = runCli(["install", tarballPath, "--json"], {
      cwd: directProject,
      env: { HOME: homeDir },
    });
    expect(
      expectJsonStdoutReport(directInstall, {
        status: 0,
        check: "package-install",
        success: true,
      }),
    ).toMatchObject({
      mode: "package",
      target: tarballPath,
      global: false,
      locked: false,
      update: false,
      repairLock: false,
    });

    const globalInstallCwd = path.join(tempDir, "global-install-cwd");
    fs.mkdirSync(globalInstallCwd);
    const globalInstall = runCli(
      ["install", tarballPath, "--global", "--json"],
      {
        cwd: globalInstallCwd,
        env: { HOME: homeDir },
      },
    );
    expect(
      expectJsonStdoutReport(globalInstall, {
        status: 0,
        check: "package-install",
        success: true,
      }),
    ).toMatchObject({
      mode: "package",
      target: tarballPath,
      global: true,
      locked: false,
      update: false,
      repairLock: false,
    });

    const cachedProject = path.join(tempDir, "cached-project");
    fs.mkdirSync(cachedProject);
    const cachedInstall = runCli(
      ["install", "install-json-package", "--json"],
      {
        cwd: cachedProject,
        env: { HOME: homeDir },
      },
    );
    expect(
      expectJsonStdoutReport(cachedInstall, {
        status: 0,
        check: "package-install",
        success: true,
      }),
    ).toMatchObject({
      mode: "package",
      target: "install-json-package",
      global: false,
      locked: false,
      update: false,
      repairLock: false,
    });
  });

  test("keeps package-cache JSON stdout parseable for unsafe cache roots", () => {
    const homeDir = path.join(tempDir, "unsafe-cache-home");
    const bplHomeDir = path.join(homeDir, ".bpl");
    const cacheRoot = path.join(bplHomeDir, "packages");
    fs.mkdirSync(bplHomeDir, { recursive: true });
    fs.writeFileSync(cacheRoot, "not a directory");

    const cacheList = runCli(["package-cache", "list", "--json"], {
      cwd: tempDir,
      env: { HOME: homeDir },
    });
    expect(cacheList.status).toBe(1);
    expect(parseJsonObjectStdout(cacheList)).toMatchObject({
      schemaVersion: 1,
      check: "package-cache-list",
      success: false,
      entries: [],
      errorCode: "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
      error: expect.stringContaining(
        "Global package directory path is not a directory",
      ),
    });

    const cacheVerify = runCli(["package-cache", "verify", "--json"], {
      cwd: tempDir,
      env: { HOME: homeDir },
    });
    expect(cacheVerify.status).toBe(1);
    expect(parseJsonObjectStdout(cacheVerify)).toMatchObject({
      schemaVersion: 1,
      check: "package-cache-verify",
      success: false,
      ok: false,
      entriesChecked: 0,
      issues: [],
      errorCode: "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
      error: expect.stringContaining(
        "Global package directory path is not a directory",
      ),
    });
  });

  test("keeps package list JSON stdout parseable for unsafe package roots", () => {
    const projectDir = path.join(tempDir, "unsafe-list-project");
    const homeDir = path.join(tempDir, "unsafe-list-home");
    fs.mkdirSync(projectDir);
    fs.mkdirSync(homeDir);
    fs.writeFileSync(path.join(projectDir, "bpl_modules"), "not a directory");

    const list = runCli(["list", "--json"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    expect(list.status).toBe(1);
    expect(parseJsonObjectStdout(list)).toMatchObject({
      schemaVersion: 1,
      check: "package-list",
      success: false,
      scope: "local",
      packages: [],
      errorCode: "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
      error: expect.stringContaining(
        "Local package directory path is not a directory",
      ),
    });

    const listTree = runCli(["list", "--tree", "--json"], {
      cwd: projectDir,
      env: { HOME: homeDir },
    });
    expect(listTree.status).toBe(1);
    expect(parseJsonObjectStdout(listTree)).toMatchObject({
      schemaVersion: 1,
      check: "package-list-tree",
      success: false,
      scope: "local",
      tree: [],
      errorCode: "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
      error: expect.stringContaining(
        "Local package directory path is not a directory",
      ),
    });
  });

  test("keeps package-cache maintenance JSON stdout parseable", () => {
    const homeDir = path.join(tempDir, "cache-maintenance-home");
    fs.mkdirSync(homeDir);

    const clean = runCli(["package-cache", "clean", "--dry-run", "--json"], {
      cwd: tempDir,
      env: { HOME: homeDir },
    });
    expect(clean.status).toBe(0);
    expect(parseJsonObjectStdout(clean)).toEqual({
      schemaVersion: 1,
      check: "package-cache-clean",
      success: true,
      removed: [],
      dryRun: true,
    });

    const repair = runCli(["package-cache", "repair", "--dry-run", "--json"], {
      cwd: tempDir,
      env: { HOME: homeDir },
    });
    expect(repair.status).toBe(0);
    expect(parseJsonObjectStdout(repair)).toEqual({
      schemaVersion: 1,
      check: "package-cache-repair",
      success: true,
      dryRun: true,
      repaired: [],
      unchanged: [],
      issues: [],
    });
  });

  test("keeps package-cache maintenance JSON validation failures parseable", () => {
    const homeDir = path.join(tempDir, "cache-maintenance-failure-home");
    fs.mkdirSync(homeDir);

    const cleanInvalidVersion = runCli(
      [
        "package-cache",
        "clean",
        "cache-cli",
        "--package-version",
        "^1.0.0",
        "--dry-run",
        "--json",
      ],
      {
        cwd: tempDir,
        env: { HOME: homeDir },
      },
    );
    expect(cleanInvalidVersion.status).toBe(1);
    expect(parseJsonObjectStdout(cleanInvalidVersion)).toMatchObject({
      schemaVersion: 1,
      check: "package-cache-clean",
      success: false,
      removed: [],
      dryRun: true,
      error: expect.stringContaining("Invalid package cache version filter"),
    });

    const repairInvalidVersion = runCli(
      [
        "package-cache",
        "repair",
        "cache-cli",
        "--package-version",
        "latest",
        "--dry-run",
        "--json",
      ],
      {
        cwd: tempDir,
        env: { HOME: homeDir },
      },
    );
    expect(repairInvalidVersion.status).toBe(1);
    expect(parseJsonObjectStdout(repairInvalidVersion)).toMatchObject({
      schemaVersion: 1,
      check: "package-cache-repair",
      success: false,
      dryRun: true,
      repaired: [],
      unchanged: [],
      issues: [],
      error: expect.stringContaining("Invalid package cache version filter"),
    });

    const unsafeHomeDir = path.join(tempDir, "cache-maintenance-unsafe-home");
    const unsafeBplHomeDir = path.join(unsafeHomeDir, ".bpl");
    const unsafeCacheRoot = path.join(unsafeBplHomeDir, "packages");
    fs.mkdirSync(unsafeBplHomeDir, { recursive: true });
    fs.writeFileSync(unsafeCacheRoot, "not a directory");

    const cleanUnsafeRoot = runCli(
      ["package-cache", "clean", "--dry-run", "--json"],
      {
        cwd: tempDir,
        env: { HOME: unsafeHomeDir },
      },
    );
    expect(cleanUnsafeRoot.status).toBe(1);
    expect(parseJsonObjectStdout(cleanUnsafeRoot)).toMatchObject({
      schemaVersion: 1,
      check: "package-cache-clean",
      success: false,
      removed: [],
      dryRun: true,
      errorCode: "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
      error: expect.stringContaining(
        "Global package directory path is not a directory",
      ),
    });

    const repairUnsafeRoot = runCli(
      ["package-cache", "repair", "--dry-run", "--json"],
      {
        cwd: tempDir,
        env: { HOME: unsafeHomeDir },
      },
    );
    expect(repairUnsafeRoot.status).toBe(1);
    expect(parseJsonObjectStdout(repairUnsafeRoot)).toMatchObject({
      schemaVersion: 1,
      check: "package-cache-repair",
      success: false,
      dryRun: true,
      repaired: [],
      unchanged: [],
      issues: [],
      errorCode: "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
      error: expect.stringContaining(
        "Global package directory path is not a directory",
      ),
    });
  });

  test("keeps package-cache JSON parseable for symlinked cache parents", () => {
    const homeDir = path.join(tempDir, "cache-parent-link-home");
    const realBplHome = path.join(tempDir, "real-bpl-home");
    const linkedBplHome = path.join(homeDir, ".bpl");
    fs.mkdirSync(homeDir);
    fs.mkdirSync(path.join(realBplHome, "packages"), { recursive: true });
    fs.symlinkSync(realBplHome, linkedBplHome, "dir");

    const cases: Array<{
      args: string[];
      check: string;
      expected: Record<string, unknown>;
    }> = [
      {
        args: ["package-cache", "list", "--json"],
        check: "package-cache-list",
        expected: { entries: [] },
      },
      {
        args: ["package-cache", "verify", "--json"],
        check: "package-cache-verify",
        expected: { ok: false, entriesChecked: 0, issues: [] },
      },
      {
        args: ["package-cache", "clean", "--dry-run", "--json"],
        check: "package-cache-clean",
        expected: { removed: [], dryRun: true },
      },
      {
        args: ["package-cache", "repair", "--dry-run", "--json"],
        check: "package-cache-repair",
        expected: { dryRun: true, repaired: [], unchanged: [], issues: [] },
      },
    ];

    for (const testCase of cases) {
      const result = runCli(testCase.args, {
        cwd: tempDir,
        env: { HOME: homeDir },
      });
      const report = expectJsonStdoutReport<{ error: string }>(result, {
        status: 1,
        check: testCase.check,
        success: false,
      });
      expect(report).toMatchObject({
        ...testCase.expected,
        errorCode: "BPL_PACKAGE_SEARCH_DIR_PARENT_SYMLINK",
      });
      expect(report.error).toContain(
        "Global package directory parent path is a symbolic link",
      );
      expect(report.error).toContain(linkedBplHome);
    }
  });

  test("keeps run-script list JSON stdout parseable", () => {
    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify(
        {
          name: "cli-json-run-script",
          version: "1.0.0",
          scripts: {
            check: "bpl check src/main.bpl",
          },
        },
        null,
        2,
      ),
    );

    const result = runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    });
    expect(result.status).toBe(0);
    expect(parseJsonObjectStdout(result)).toEqual({
      schemaVersion: 1,
      check: "run-script-list",
      success: true,
      scripts: [{ name: "check", command: "bpl check src/main.bpl" }],
    });
  });

  test("keeps run-script list JSON failures parseable", () => {
    const result = runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    });
    expect(result.status).toBe(1);
    expect(parseJsonObjectStdout(result)).toMatchObject({
      schemaVersion: 1,
      check: "run-script-list",
      success: false,
      error: expect.stringContaining("No bpl.json found"),
    });
  });

  test("keeps completion JSON stdout parseable", () => {
    const bash = runCli(["completion", "bash", "--json"]);
    expect(bash.status).toBe(0);
    expect(parseJsonObjectStdout<{
      schemaVersion: 1;
      check: "completion";
      success: true;
      shell: "bash";
      script: string;
    }>(bash)).toMatchObject({
      schemaVersion: 1,
      check: "completion",
      success: true,
      shell: "bash",
      script: expect.stringContaining("bpl"),
    });

    const unsupported = runCli(["completion", "fish", "--json"]);
    expect(unsupported.status).toBe(1);
    expect(parseJsonObjectStdout(unsupported)).toMatchObject({
      schemaVersion: 1,
      check: "completion",
      success: false,
      shell: "fish",
      error: expect.stringContaining("Unsupported shell"),
      errorCode: "BPL_COMPLETION_SHELL_UNSUPPORTED",
    });
  });

  test("keeps version JSON stdout parseable", () => {
    for (const args of [
      ["--version", "--json"],
      ["--json", "--version"],
    ]) {
      const result = runCli(args);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(parseJsonObjectStdout(result)).toMatchObject({
        schemaVersion: 1,
        check: "version",
        success: true,
        version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      });
    }
  });

  test("keeps forced-color JSON command output machine-clean", () => {
    const goodSource = path.join(tempDir, "good-color-json.bpl");
    const badSource = path.join(tempDir, "bad-color-json.bpl");
    fs.writeFileSync(goodSource, "frame main() ret int { return 0; }\n");
    fs.writeFileSync(
      badSource,
      'frame main() { local value: int = "not an int"; }\n',
    );

    const version = runCli(["--color", "--version", "--json"]);
    expect(version.status).toBe(0);
    expect(parseJsonObjectStdout(version)).toMatchObject({
      schemaVersion: 1,
      check: "version",
      success: true,
    });

    const checkSuccess = runCli(["check", goodSource, "--json", "--color"]);
    expect(checkSuccess.status).toBe(0);
    expect(parseJsonObjectStdout(checkSuccess)).toMatchObject({
      schemaVersion: 1,
      check: "check",
      success: true,
      files: [{ file: goodSource, success: true }],
    });

    const checkFailure = runCli(["check", badSource, "--json", "--color"]);
    expect(checkFailure.status).toBe(1);
    expect(parseJsonObjectStdout(checkFailure)).toMatchObject({
      schemaVersion: 1,
      check: "check",
      success: false,
      files: [
        {
          file: badSource,
          success: false,
          diagnostics: [
            {
              severityLabel: "error",
              message: expect.stringContaining("Type mismatch"),
            },
          ],
        },
      ],
    });

    const buildFailure = runCli(["build", badSource, "--json", "--color"]);
    expect(buildFailure.status).toBe(1);
    expect(parseJsonObjectStdout(buildFailure)).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: badSource,
      error: expect.stringContaining("Type mismatch"),
      diagnostics: [
        {
          severityLabel: "error",
          message: expect.stringContaining("Type mismatch"),
        },
      ],
    });
  });

  test("keeps run-script JSON validation failures parseable with error codes", () => {
    const assertRunScriptFailure = (
      result: SpawnSyncReturns<string>,
      expected: {
        check: "run-script" | "run-script-list";
        error: string;
        errorCode: string;
      },
    ) => {
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(parseJsonObjectStdout(result)).toMatchObject({
        schemaVersion: 1,
        check: expected.check,
        success: false,
        error: expect.stringContaining(expected.error),
        errorCode: expected.errorCode,
      });
    };

    assertRunScriptFailure(runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    }), {
      check: "run-script-list",
      error: "No bpl.json found",
      errorCode: "BPL_RUN_SCRIPT_MANIFEST_NOT_FOUND",
    });

    fs.mkdirSync(path.join(tempDir, "bpl.json"));
    assertRunScriptFailure(runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    }), {
      check: "run-script-list",
      error: "bpl.json is not a file",
      errorCode: "BPL_RUN_SCRIPT_MANIFEST_NOT_FILE",
    });

    fs.rmSync(path.join(tempDir, "bpl.json"), {
      recursive: true,
      force: true,
    });
    fs.writeFileSync(path.join(tempDir, "bpl.json"), "{not-json");
    assertRunScriptFailure(runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    }), {
      check: "run-script-list",
      error: "Failed to parse bpl.json",
      errorCode: "BPL_RUN_SCRIPT_MANIFEST_INVALID_JSON",
    });

    fs.writeFileSync(path.join(tempDir, "bpl.json"), "[]");
    assertRunScriptFailure(runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    }), {
      check: "run-script-list",
      error: "bpl.json must contain a JSON object",
      errorCode: "BPL_RUN_SCRIPT_MANIFEST_NOT_OBJECT",
    });

    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify({ scripts: [] }),
    );
    assertRunScriptFailure(runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    }), {
      check: "run-script-list",
      error: "'scripts' in bpl.json must be an object",
      errorCode: "BPL_RUN_SCRIPT_SCRIPTS_NOT_OBJECT",
    });

    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify({ scripts: { "": "echo bad" } }),
    );
    assertRunScriptFailure(runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    }), {
      check: "run-script-list",
      error: "'scripts' entries must use non-empty script names",
      errorCode: "BPL_RUN_SCRIPT_NAME_EMPTY",
    });

    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify({ scripts: { bad: ["echo", "bad"] } }),
    );
    assertRunScriptFailure(runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    }), {
      check: "run-script-list",
      error: "Script 'bad' in bpl.json must be a non-empty string",
      errorCode: "BPL_RUN_SCRIPT_COMMAND_NOT_STRING",
    });

    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify({ scripts: { empty: "   " } }),
    );
    assertRunScriptFailure(runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    }), {
      check: "run-script-list",
      error: "Script 'empty' in bpl.json must be a non-empty string",
      errorCode: "BPL_RUN_SCRIPT_COMMAND_EMPTY",
    });

    fs.writeFileSync(
      path.join(tempDir, "bpl.json"),
      JSON.stringify({ scripts: { build: "echo build" } }),
    );
    assertRunScriptFailure(runCli(["run-script", "missing", "--json"], {
      cwd: tempDir,
    }), {
      check: "run-script",
      error: "Script 'missing' not found in bpl.json",
      errorCode: "BPL_RUN_SCRIPT_NOT_FOUND",
    });

    fs.unlinkSync(path.join(tempDir, "bpl.json"));
    const targetManifest = path.join(tempDir, "linked-manifest.json");
    fs.writeFileSync(targetManifest, JSON.stringify({ scripts: {} }));
    fs.symlinkSync(targetManifest, path.join(tempDir, "bpl.json"), "file");
    assertRunScriptFailure(runCli(["run-script", "--list", "--json"], {
      cwd: tempDir,
    }), {
      check: "run-script-list",
      error: "bpl.json is a symbolic link",
      errorCode: "BPL_RUN_SCRIPT_MANIFEST_SYMLINK",
    });
  });

  test("keeps JSON-mode build failures parseable on stdout", () => {
    const badSource = path.join(tempDir, "bad.bpl");
    fs.writeFileSync(
      badSource,
      'frame main() { local value: int = "not an int"; }\n',
    );

    const result = runCli(["build", badSource, "--json"]);
    expect(result.status).toBe(1);
    const report = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      error: string;
      diagnostics: Array<{
        severity: string;
        severityLabel: string;
        message: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
        source?: { line: string };
      }>;
    }>(result);
    expect(report).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: badSource,
      error: expect.stringContaining("Type mismatch"),
      diagnostics: [
        {
          severity: "error",
          severityLabel: "error",
          location: {
            file: badSource,
            start: { line: 1 },
          },
          source: {
            line: 'frame main() { local value: int = "not an int"; }',
          },
        },
      ],
    });
    expect(report.diagnostics[0]?.message).toContain("Type mismatch");
  });

  test("reports import diagnostics in JSON-mode build failures", () => {
    const unsafeStdFile = path.join(tempDir, "unsafe_std.bpl");
    const unsafeStdOutput = path.join(tempDir, "unsafe-std-app");
    const packageFile = path.join(tempDir, "package_import.bpl");
    const packageOutput = path.join(tempDir, "package-app");
    const packageVersionFile = path.join(tempDir, "package_version_import.bpl");
    const packageVersionOutput = path.join(tempDir, "package-version-app");
    const packageDir = path.join(tempDir, "bpl_modules", "badpkg");
    const packageVersionDir = path.join(tempDir, "bpl_modules", "badversion");
    const packageEntrySource = [
      "frame value() ret int {",
      "    return 1;",
      "}",
      "export value;",
    ].join("\n");
    writePackageFixture(packageDir, {
      name: "different-name",
      entrySource: packageEntrySource,
    });
    writePackageFixture(packageVersionDir, {
      name: "badversion",
      version: "latest",
      entrySource: packageEntrySource,
    });
    fs.writeFileSync(
      unsafeStdFile,
      [
        'import escaped from "std/../outside-std-lib.bpl";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      packageFile,
      [
        'import value from "badpkg";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      packageVersionFile,
      [
        'import value from "badversion";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const unsafeStdResult = runCli([
      "build",
      unsafeStdFile,
      "--json",
      "-o",
      unsafeStdOutput,
    ]);
    expect(unsafeStdResult.status).toBe(1);
    const unsafeStdReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        message: string;
        hint: string;
        code?: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
      }>;
    }>(unsafeStdResult);
    expect(unsafeStdReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: unsafeStdFile,
      diagnostics: [
        {
          location: {
            file: unsafeStdFile,
            start: { line: 1, column: 1 },
          },
        },
      ],
    });
    expect(unsafeStdReport.diagnostics[0]?.message).toContain(
      "Unsafe standard library import: std/../outside-std-lib.bpl",
    );
    expect(unsafeStdReport.diagnostics[0]?.code).toBe(
      "BPL_IMPORT_STD_PATH_UNSAFE",
    );
    expect(unsafeStdReport.diagnostics[0]?.hint).toContain(
      "Use std/<path> or std\\<path> without empty, '.', or '..' path segments.",
    );
    expect(fs.existsSync(`${unsafeStdOutput}.ll`)).toBe(false);
    expect(fs.existsSync(unsafeStdOutput)).toBe(false);

    const packageResult = runCli([
      "build",
      packageFile,
      "--json",
      "-o",
      packageOutput,
    ]);
    expect(packageResult.status).toBe(1);
    const packageReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        message: string;
        hint: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
      }>;
    }>(packageResult);
    expect(packageReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: packageFile,
      diagnostics: [
        {
          location: {
            file: packageFile,
            start: { line: 1, column: 1 },
          },
        },
      ],
    });
    expect(packageReport.diagnostics[0]?.message).toContain("invalid bpl.json");
    expect(packageReport.diagnostics[0]?.message).toContain(
      "manifest name 'different-name'",
    );
    expect(packageReport.diagnostics[0]?.hint).toContain("Searched paths:");
    expect(fs.existsSync(`${packageOutput}.ll`)).toBe(false);
    expect(fs.existsSync(packageOutput)).toBe(false);

    const packageVersionResult = runCli([
      "build",
      packageVersionFile,
      "--json",
      "-o",
      packageVersionOutput,
    ]);
    expect(packageVersionResult.status).toBe(1);
    const packageVersionReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        message: string;
        hint: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
      }>;
    }>(packageVersionResult);
    expect(packageVersionReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: packageVersionFile,
      diagnostics: [
        {
          location: {
            file: packageVersionFile,
            start: { line: 1, column: 1 },
          },
        },
      ],
    });
    expect(packageVersionReport.diagnostics[0]?.message).toContain(
      "manifest version must use X.Y.Z semantic version format",
    );
    expect(packageVersionReport.diagnostics[0]?.hint).toContain(
      "manifest version must use X.Y.Z semantic version format",
    );
    expect(fs.existsSync(`${packageVersionOutput}.ll`)).toBe(false);
    expect(fs.existsSync(packageVersionOutput)).toBe(false);
  });

  test("reports missing module path diagnostic codes in JSON-mode check and build diagnostics", () => {
    const missingFile = path.join(tempDir, "missing_module_import.bpl");
    const missingOutput = path.join(tempDir, "missing-module-app");
    fs.writeFileSync(
      missingFile,
      [
        'import value from "./does_not_exist.bpl";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );
    const missingCheck = runCli(["check", "--json", missingFile]);
    const missingDiagnostic = expectSingleCheckJsonDiagnostic(
      missingCheck,
      missingFile,
    );
    expect(missingDiagnostic.code).toBe("BPL_MODULE_NOT_FOUND");
    expect(missingDiagnostic.source?.preview).toContain(
      'import value from "./does_not_exist.bpl";',
    );
    expect(missingDiagnostic.message).toContain("Module not found");
    expect(missingDiagnostic.message).toContain("./does_not_exist.bpl");
    expect(missingDiagnostic.hint).toContain("Check if the file exists.");
    expect(missingCheck.stderr).toBe("");

    const missingBuild = runCli([
      "build",
      missingFile,
      "--json",
      "-o",
      missingOutput,
    ]);
    expect(missingBuild.status).toBe(1);
    expect(missingBuild.stderr).toBe("");
    const missingBuildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
      }>;
    }>(missingBuild);
    expect(missingBuildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: missingFile,
      diagnostics: [
        {
          code: "BPL_MODULE_NOT_FOUND",
          location: {
            file: missingFile,
            start: { line: 1, column: 1 },
          },
        },
      ],
    });
    expect(missingBuildReport.diagnostics[0]?.message).toContain(
      "Module not found",
    );
    expect(missingBuildReport.diagnostics[0]?.hint).toContain(
      "Check if the file exists.",
    );
    expect(fs.existsSync(`${missingOutput}.ll`)).toBe(false);
    expect(fs.existsSync(missingOutput)).toBe(false);
  });

  test("reports unsafe std module path diagnostic codes in JSON-mode check diagnostics", () => {
    const unsafeStdFile = path.join(tempDir, "unsafe_std_check.bpl");
    fs.writeFileSync(
      unsafeStdFile,
      [
        'import escaped from "std/../outside-std-lib.bpl";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const unsafeStdCheck = runCli(["check", "--json", unsafeStdFile]);
    const unsafeStdDiagnostic = expectSingleCheckJsonDiagnostic(
      unsafeStdCheck,
      unsafeStdFile,
    );
    expect(unsafeStdDiagnostic.code).toBe("BPL_IMPORT_STD_PATH_UNSAFE");
    expect(unsafeStdDiagnostic.source?.preview).toContain(
      'import escaped from "std/../outside-std-lib.bpl";',
    );
    expect(unsafeStdDiagnostic.message).toContain(
      "Unsafe standard library import: std/../outside-std-lib.bpl",
    );
    expect(unsafeStdDiagnostic.hint).toContain(
      "Use std/<path> or std\\<path> without empty, '.', or '..' path segments.",
    );
    expect(unsafeStdCheck.stderr).toBe("");
  });

  test("reports symlink module path diagnostic codes in JSON-mode check diagnostics", () => {
    const symlinkDir = path.join(tempDir, "broken-module-symlink");
    const symlinkFile = path.join(symlinkDir, "main.bpl");
    const brokenCandidate = path.join(symlinkDir, "linked.bpl");
    const fallbackCandidate = path.join(symlinkDir, "linked.x");
    fs.mkdirSync(symlinkDir, { recursive: true });
    fs.writeFileSync(
      symlinkFile,
      [
        'import value from "./linked";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );
    fs.symlinkSync(path.join(symlinkDir, "missing-linked.bpl"), brokenCandidate);
    fs.writeFileSync(fallbackCandidate, "export value;\n");

    const symlinkCheck = runCli(["check", "--json", symlinkFile]);
    const symlinkDiagnostic = expectSingleCheckJsonDiagnostic(
      symlinkCheck,
      symlinkFile,
    );
    expect(symlinkDiagnostic.code).toBe("BPL_MODULE_PATH_SYMLINK");
    expect(symlinkDiagnostic.source?.preview).toContain(
      'import value from "./linked";',
    );
    expect(symlinkDiagnostic.message).toContain(
      "Module path is a symbolic link",
    );
    expect(symlinkDiagnostic.message).toContain(brokenCandidate);
    expect(symlinkDiagnostic.hint).toContain(
      "Use a real .bpl file path or repair the symlink target.",
    );
    expect(symlinkCheck.stderr).toBe("");
  });

  test("reports case-mismatch module path diagnostic codes in JSON-mode check diagnostics", () => {
    const caseDir = path.join(tempDir, "case-mismatch-module");
    const caseFile = path.join(caseDir, "main.bpl");
    const realCaseModule = path.join(caseDir, "utils.bpl");
    fs.mkdirSync(caseDir, { recursive: true });
    fs.writeFileSync(
      caseFile,
      [
        'import value from "./Utils";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(realCaseModule, "export value;\n");

    const caseCheck = runCli(["check", "--json", caseFile]);
    const caseDiagnostic = expectSingleCheckJsonDiagnostic(caseCheck, caseFile);
    expect(caseDiagnostic.code).toBe("BPL_MODULE_PATH_CASE_MISMATCH");
    expect(caseDiagnostic.source?.preview).toContain(
      'import value from "./Utils";',
    );
    expect(caseDiagnostic.message).toContain(
      "Module path casing does not match",
    );
    expect(caseDiagnostic.message).toContain(path.join(caseDir, "Utils.bpl"));
    expect(caseDiagnostic.message).toContain(realCaseModule);
    expect(caseDiagnostic.hint).toContain("Use the exact filesystem casing");
    expect(caseCheck.stderr).toBe("");
  });

  test("reports missing explicit std imports in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "missing_explicit_std.bpl");
    const outputFile = path.join(tempDir, "missing-explicit-std-app");
    const packageRoot = path.join(tempDir, "bpl_modules", "std");
    writePackageFixture(packageRoot, {
      name: "std",
      main: "missing.bpl",
      entryPath: "missing.bpl",
      entrySource: [
        "frame shadow() ret int {",
        "    return 7;",
        "}",
        "export shadow;",
      ].join("\n"),
    });
    fs.writeFileSync(
      sourceFile,
      [
        'import "std/missing.bpl";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile);
    expect(checkDiagnostic.code).toBe("BPL_MODULE_NOT_FOUND");
    expect(checkDiagnostic.source?.preview).toContain(
      'import "std/missing.bpl";',
    );
    expect(checkDiagnostic.message).toContain(
      "Standard library module not found: std/missing.bpl",
    );
    expect(checkDiagnostic.hint).toContain(
      "Explicit std/ and std\\ imports do not fall back to package resolution",
    );
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [
        {
          code: "BPL_MODULE_NOT_FOUND",
          location: {
            file: sourceFile,
            start: { line: 1, column: 1 },
          },
        },
      ],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Standard library module not found: std/missing.bpl",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Explicit std/ and std\\ imports do not fall back to package resolution",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports stdlib package-name collisions in JSON-mode check and build diagnostics", () => {
    const homeDir = path.join(tempDir, "home");
    const globalPackageDir = path.join(homeDir, ".bpl", "packages");
    const mismatchedPackageDir = path.join(globalPackageDir, "Math-9.0.0");
    const lowerPackageDir = path.join(globalPackageDir, "math-1.0.0");
    const sourceFile = path.join(tempDir, "stdlib_package_collision.bpl");
    const outputFile = path.join(tempDir, "stdlib-package-collision-app");
    const entrySource = [
      "frame packageMath() ret int {",
      "    return 9;",
      "}",
      "export packageMath;",
    ].join("\n");
    writePackageFixture(mismatchedPackageDir, {
      name: "math",
      version: "9.0.0",
      entrySource,
    });
    writePackageFixture(lowerPackageDir, {
      name: "math",
      version: "1.0.0",
      entrySource,
    });
    fs.writeFileSync(
      sourceFile,
      [
        'import packageMath from "math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile], {
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile);
    expect(checkDiagnostic.code).toBe("BPL_IMPORT_EXPORT_NOT_FOUND");
    expect(checkDiagnostic.source?.preview).toContain(
      'import packageMath from "math";',
    );
    expect(checkDiagnostic.message).toContain(
      "Module 'math' does not export 'packageMath'",
    );
    expect(checkDiagnostic.message).not.toContain(mismatchedPackageDir);
    expect(checkDiagnostic.hint).toContain("Ensure the symbol is exported");
    expect(checkDiagnostic.hint).not.toContain("package root casing");
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile], {
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [
        {
          location: {
            file: sourceFile,
            start: { line: 1, column: 1 },
          },
        },
      ],
    });
    expect(buildReport.diagnostics[0]?.code).toBe(
      "BPL_IMPORT_EXPORT_NOT_FOUND",
    );
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Module 'math' does not export 'packageMath'",
    );
    expect(buildReport.diagnostics[0]?.message).not.toContain(
      mismatchedPackageDir,
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Ensure the symbol is exported",
    );
    expect(buildReport.diagnostics[0]?.hint).not.toContain(
      "package root casing",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports available exports for missing named imports in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "missing_named_export.bpl");
    const helperFile = path.join(tempDir, "missing_named_export_helper.bpl");
    const outputFile = path.join(tempDir, "missing-named-export-app");
    fs.writeFileSync(
      helperFile,
      [
        "frame zeta() ret int {",
        "    return 2;",
        "}",
        "frame alpha() ret int {",
        "    return 1;",
        "}",
        "export zeta;",
        "export alpha;",
      ].join("\n"),
    );
    fs.writeFileSync(
      sourceFile,
      [
        'import missing from "./missing_named_export_helper.bpl";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile);
    expect(checkDiagnostic.code).toBe("BPL_IMPORT_EXPORT_NOT_FOUND");
    expect(checkDiagnostic.message).toContain(
      "Module './missing_named_export_helper.bpl' does not export 'missing'",
    );
    expect(checkDiagnostic.hint).toContain(
      "Ensure the symbol is exported (or defined) in the module.",
    );
    expect(checkDiagnostic.hint).toContain("Available exports: alpha, zeta.");
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [
        {
          code: "BPL_IMPORT_EXPORT_NOT_FOUND",
          location: {
            file: sourceFile,
            start: { line: 1, column: 1 },
          },
        },
      ],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Module './missing_named_export_helper.bpl' does not export 'missing'",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Available exports: alpha, zeta.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("accepts repeated namespace imports in JSON-mode check diagnostics", () => {
    const sourceFile = path.join(tempDir, "repeated_namespace_import.bpl");
    const helperFile = path.join(
      tempDir,
      "repeated_namespace_import_helper.bpl",
    );
    fs.writeFileSync(
      helperFile,
      [
        "export [Thing];",
        "export makeThing;",
        "",
        "struct Thing {",
        "    value: int,",
        "}",
        "",
        "frame makeThing() ret int {",
        "    return 7;",
        "}",
      ].join("\n"),
    );
    fs.writeFileSync(
      sourceFile,
      [
        'import * as Things from "./repeated_namespace_import_helper.bpl";',
        'import * as Things from "./repeated_namespace_import_helper.bpl";',
        "",
        "frame main() ret int {",
        "    local thing: Things.Thing;",
        "    thing.value = Things.makeThing();",
        "    return thing.value;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);

    expect(check.status).toBe(0);
    expect(check.stderr).toBe("");
    expect(parseJsonObjectStdout(check)).toMatchObject({
      schemaVersion: 1,
      check: "check",
      success: true,
      totalFiles: 1,
      errorCount: 0,
      files: [
        {
          file: sourceFile,
          success: true,
        },
      ],
    });
  });

  test("reports duplicate top-level symbols in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "duplicate_top_level_symbol.bpl");
    const outputFile = path.join(tempDir, "duplicate-top-level-symbol-app");
    fs.writeFileSync(
      sourceFile,
      [
        "type Thing = int;",
        "struct Thing {",
        "    value: int,",
        "}",
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile, {
      line: 2,
      column: 1,
    });
    expect(checkDiagnostic.code).toBe("BPL_SYMBOL_ALREADY_DEFINED");
    expect(checkDiagnostic.source?.preview).toContain("struct Thing");
    expect(checkDiagnostic.message).toContain(
      "Symbol 'Thing' is already defined in this scope",
    );
    expect(checkDiagnostic.hint).toContain(
      "Rename this struct or remove the earlier type alias declaration.",
    );
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [
        {
          code: "BPL_SYMBOL_ALREADY_DEFINED",
          location: {
            file: sourceFile,
            start: { line: 2, column: 1 },
          },
        },
      ],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Symbol 'Thing' is already defined in this scope",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Rename this struct or remove the earlier type alias declaration.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports duplicate function signatures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "duplicate_function_signature.bpl");
    const outputFile = path.join(tempDir, "duplicate-function-signature-app");
    fs.writeFileSync(
      sourceFile,
      [
        "frame pick(value: int) ret int { return value; }",
        "frame pick(value: int) ret int { return value + 1; }",
        "frame main() ret int {",
        "    return pick(1);",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile, {
      line: 2,
      column: 1,
    });
    expect(checkDiagnostic.code).toBe("BPL_SYMBOL_ALREADY_DEFINED");
    expect(checkDiagnostic.source?.preview).toContain("frame pick");
    expect(checkDiagnostic.message).toContain(
      "Function 'pick' with this signature is already defined.",
    );
    expect(checkDiagnostic.hint).toContain(
      "Overloads must have different parameter types.",
    );
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
        location: {
          file: string;
          start: { line: number; column: number };
        };
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [
        {
          code: "BPL_SYMBOL_ALREADY_DEFINED",
          location: {
            file: sourceFile,
            start: { line: 2, column: 1 },
          },
        },
      ],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Function 'pick' with this signature is already defined.",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Overloads must have different parameter types.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports duplicate function parameters in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "duplicate_function_parameter.bpl");
    const outputFile = path.join(tempDir, "duplicate-function-parameter-app");
    fs.writeFileSync(
      sourceFile,
      [
        "frame pick(value: int, value: int) ret int {",
        "    return value;",
        "}",
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    expect(check.status).toBe(1);
    const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
    const checkDiagnostic = checkReport.files[0]?.diagnostics[0];
    expect(checkDiagnostic?.code).toBe("BPL_SYMBOL_ALREADY_DEFINED");
    expect(checkDiagnostic?.source?.preview).toContain("frame pick");
    expect(checkDiagnostic?.message).toContain(
      "Duplicate parameter name 'value'",
    );
    expect(checkDiagnostic?.hint).toContain(
      "declared multiple times in function 'pick'",
    );
    expect(checkDiagnostic?.location.start.line).toBe(1);
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_SYMBOL_ALREADY_DEFINED" }],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Duplicate parameter name 'value'",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "declared multiple times in function 'pick'",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports duplicate generic parameters in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "duplicate_generic_parameter.bpl");
    const outputFile = path.join(tempDir, "duplicate-generic-parameter-app");
    fs.writeFileSync(
      sourceFile,
      [
        "frame identity<T, T>(value: T) ret T {",
        "    return value;",
        "}",
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    expect(check.status).toBe(1);
    const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
    const checkDiagnostic = checkReport.files[0]?.diagnostics[0];
    expect(checkDiagnostic?.code).toBe("BPL_SYMBOL_ALREADY_DEFINED");
    expect(checkDiagnostic?.source?.preview).toContain("identity<T, T>");
    expect(checkDiagnostic?.message).toContain(
      "Duplicate generic type parameter 'T'",
    );
    expect(checkDiagnostic?.hint).toContain(
      "declared multiple times in function 'identity'",
    );
    expect(checkDiagnostic?.location.start.line).toBe(1);
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_SYMBOL_ALREADY_DEFINED" }],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Duplicate generic type parameter 'T'",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "declared multiple times in function 'identity'",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports duplicate struct fields in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "duplicate_struct_field.bpl");
    const outputFile = path.join(tempDir, "duplicate-struct-field-app");
    fs.writeFileSync(
      sourceFile,
      [
        "struct Point {",
        "    x: int,",
        "    x: int,",
        "}",
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    expect(check.status).toBe(1);
    const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
    const checkDiagnostic = checkReport.files[0]?.diagnostics[0];
    expect(checkDiagnostic?.code).toBe("BPL_SYMBOL_ALREADY_DEFINED");
    expect(checkDiagnostic?.source?.preview).toContain("x: int");
    expect(checkDiagnostic?.message).toContain(
      "Duplicate field 'x' in struct 'Point'",
    );
    expect(checkDiagnostic?.hint).toContain(
      "defined multiple times in struct 'Point'",
    );
    expect(checkDiagnostic?.location.start.line).toBe(3);
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_SYMBOL_ALREADY_DEFINED" }],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Duplicate field 'x' in struct 'Point'",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "defined multiple times in struct 'Point'",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports duplicate enum variants in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "duplicate_enum_variant.bpl");
    const outputFile = path.join(tempDir, "duplicate-enum-variant-app");
    fs.writeFileSync(
      sourceFile,
      [
        "enum Color {",
        "    Red,",
        "    Red,",
        "}",
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    expect(check.status).toBe(1);
    const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
    const checkDiagnostic = checkReport.files[0]?.diagnostics[0];
    expect(checkDiagnostic?.code).toBe("BPL_SYMBOL_ALREADY_DEFINED");
    expect(checkDiagnostic?.source?.preview).toContain("Red");
    expect(checkDiagnostic?.message).toContain(
      "Duplicate enum variant 'Red' in enum 'Color'",
    );
    expect(checkDiagnostic?.hint).toContain("Enum variants must be unique.");
    expect(checkDiagnostic?.location.start.line).toBe(3);
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_SYMBOL_ALREADY_DEFINED" }],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Duplicate enum variant 'Red' in enum 'Color'",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Enum variants must be unique.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports recursive struct field cycles in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "recursive_struct_field.bpl");
    const outputFile = path.join(tempDir, "recursive-struct-field-app");
    fs.writeFileSync(
      sourceFile,
      [
        "struct Node {",
        "    next: Node,",
        "}",
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile);
    expect(checkDiagnostic.code).toBe("BPL_TYPE_RECURSION_CYCLE");
    expect(checkDiagnostic.source?.preview).toContain("struct Node");
    expect(checkDiagnostic.message).toContain(
      "Struct 'Node' has infinite size due to recursive field types",
    );
    expect(checkDiagnostic.hint).toContain(
      "Recursive cycle detected: Node -> Node",
    );
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_TYPE_RECURSION_CYCLE" }],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Struct 'Node' has infinite size due to recursive field types",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Recursive cycle detected: Node -> Node",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports recursive enum variant cycles in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "recursive_enum_variant.bpl");
    const outputFile = path.join(tempDir, "recursive-enum-variant-app");
    fs.writeFileSync(
      sourceFile,
      [
        "enum Tree {",
        "    Branch(Tree),",
        "    Leaf,",
        "}",
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile);
    expect(checkDiagnostic.code).toBe("BPL_TYPE_RECURSION_CYCLE");
    expect(checkDiagnostic.source?.preview).toContain("enum Tree");
    expect(checkDiagnostic.message).toContain(
      "Enum 'Tree' has infinite size due to recursive variant types",
    );
    expect(checkDiagnostic.hint).toContain(
      "Recursive cycle detected: Tree -> Tree",
    );
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_TYPE_RECURSION_CYCLE" }],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Enum 'Tree' has infinite size due to recursive variant types",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Recursive cycle detected: Tree -> Tree",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports generic type arity failures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "generic_type_arity.bpl");
    const outputFile = path.join(tempDir, "generic-type-arity-app");
    fs.writeFileSync(
      sourceFile,
      [
        "struct Box<T> {",
        "    value: T,",
        "}",
        "frame main() ret int {",
        "    local box: Box<int, bool>;",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile, {
      line: 5,
      column: 16,
    });
    expect(checkDiagnostic.code).toBe("BPL_GENERIC_ARITY_MISMATCH");
    expect(checkDiagnostic.source?.preview).toContain("Box<int, bool>");
    expect(checkDiagnostic.message).toContain(
      "Generic type 'Box' expects 1 type arguments, but got 2.",
    );
    expect(checkDiagnostic.hint).toBe("Check generic argument count.");
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_GENERIC_ARITY_MISMATCH" }],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Generic type 'Box' expects 1 type arguments, but got 2.",
    );
    expect(buildReport.diagnostics[0]?.hint).toBe(
      "Check generic argument count.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports generic alias arity failures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "generic_alias_arity.bpl");
    const outputFile = path.join(tempDir, "generic-alias-arity-app");
    fs.writeFileSync(
      sourceFile,
      [
        "struct Box<T> {",
        "    value: T,",
        "}",
        "type Alias<T> = Box<T>;",
        "frame main() ret int {",
        "    local box: Alias<int, bool>;",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile, {
      line: 6,
      column: 16,
    });
    expect(checkDiagnostic.code).toBe("BPL_GENERIC_ARITY_MISMATCH");
    expect(checkDiagnostic.source?.preview).toContain("Alias<int, bool>");
    expect(checkDiagnostic.message).toContain(
      "Generic type 'Alias' expects 1 type arguments, but got 2.",
    );
    expect(checkDiagnostic.hint).toBe("Check generic argument count.");
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_GENERIC_ARITY_MISMATCH" }],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Generic type 'Alias' expects 1 type arguments, but got 2.",
    );
    expect(buildReport.diagnostics[0]?.hint).toBe(
      "Check generic argument count.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports variable undefined-type failures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "variable_undefined_type.bpl");
    const outputFile = path.join(tempDir, "variable-undefined-type-app");
    fs.writeFileSync(
      sourceFile,
      [
        "frame main() ret int {",
        "    local value: MissingThing;",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    expect(check.status).toBe(1);
    const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
    const checkDiagnostic = checkReport.files[0]?.diagnostics[0];
    expect(checkDiagnostic?.code).toBe("BPL_TYPE_NOT_FOUND");
    expect(checkDiagnostic?.source?.preview).toContain("MissingThing");
    expect(checkDiagnostic?.message).toContain(
      "Undefined type 'MissingThing'",
    );
    expect(checkDiagnostic?.hint).toContain("The type is not defined.");
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_TYPE_NOT_FOUND" }],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Undefined type 'MissingThing'",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "The type is not defined.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports struct field undefined-type failures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "struct_field_undefined_type.bpl");
    const outputFile = path.join(tempDir, "struct-field-undefined-type-app");
    fs.writeFileSync(
      sourceFile,
      [
        "struct Container {",
        "    value: MissingThing,",
        "}",
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    expect(check.status).toBe(1);
    const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
    const checkDiagnostic = checkReport.files[0]?.diagnostics[0];
    expect(checkDiagnostic?.code).toBe("BPL_TYPE_NOT_FOUND");
    expect(checkDiagnostic?.source?.preview).toContain("MissingThing");
    expect(checkDiagnostic?.message).toContain(
      "Undefined type 'MissingThing'",
    );
    expect(checkDiagnostic?.hint).toContain("The type is not defined.");
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_TYPE_NOT_FOUND" }],
    });
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Undefined type 'MissingThing'",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "The type is not defined.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports undefined symbol failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "undefined_value_symbol",
        preview: "return missingValue",
        message: "Undefined symbol 'missingValue'",
        source: [
          "frame main() ret int {",
          "    return missingValue;",
          "}",
        ].join("\n"),
      },
      {
        name: "undefined_call_symbol",
        preview: "return missingCall()",
        message: "Undefined symbol 'missingCall'",
        source: [
          "frame main() ret int {",
          "    return missingCall();",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      const checkDiagnostic = expectSingleCheckJsonDiagnostic(
        check,
        sourceFile,
        {
          line: 2,
          column: 12,
        },
      );
      expect(checkDiagnostic.code).toBe("BPL_SYMBOL_NOT_FOUND");
      expect(checkDiagnostic.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic.message).toContain(testCase.message);
      expect(checkDiagnostic.hint).toContain(
        "Ensure the variable or function is declared before use.",
      );
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
        diagnostics: [{ code: "BPL_SYMBOL_NOT_FOUND" }],
      });
      expect(buildReport.diagnostics).toHaveLength(1);
      expect(buildReport.diagnostics[0]?.message).toContain(testCase.message);
      expect(buildReport.diagnostics[0]?.hint).toContain(
        "Ensure the variable or function is declared before use.",
      );
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 20000);

  test("reports invalid void type failures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "invalid_void_type.bpl");
    const outputFile = path.join(tempDir, "invalid-void-type-app");
    fs.writeFileSync(
      sourceFile,
      [
        "frame main() ret int {",
        "    local _value: void;",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile, {
      line: 2,
      column: 5,
    });
    expect(checkDiagnostic.code).toBe("BPL_VOID_TYPE_INVALID");
    expect(checkDiagnostic.source?.preview).toContain("local _value: void");
    expect(checkDiagnostic.message).toContain(
      "Variable '_value' cannot be void",
    );
    expect(checkDiagnostic.hint).toContain(
      "Use '*void' for void pointers.",
    );
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_VOID_TYPE_INVALID" }],
    });
    expect(buildReport.diagnostics).toHaveLength(1);
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Variable '_value' cannot be void",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Use '*void' for void pointers.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports builtin type redefinition failures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "builtin_type_redefinition.bpl");
    const outputFile = path.join(tempDir, "builtin-type-redefinition-app");
    fs.writeFileSync(
      sourceFile,
      [
        "struct bool {",
        "    value: i1,",
        "}",
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile);
    expect(checkDiagnostic.code).toBe("BPL_BUILTIN_TYPE_REDEFINITION");
    expect(checkDiagnostic.source?.preview).toContain("struct bool");
    expect(checkDiagnostic.message).toContain(
      "Cannot redefine builtin type 'bool'",
    );
    expect(checkDiagnostic.hint).toContain("Builtin type names are reserved.");
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_BUILTIN_TYPE_REDEFINITION" }],
    });
    expect(buildReport.diagnostics).toHaveLength(1);
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Cannot redefine builtin type 'bool'",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Builtin type names are reserved.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports invalid array size failures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "invalid_array_size.bpl");
    const outputFile = path.join(tempDir, "invalid-array-size-app");
    fs.writeFileSync(
      sourceFile,
      [
        "frame main() ret int {",
        "    local _values: int[0];",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile, {
      line: 2,
      column: 20,
    });
    expect(checkDiagnostic.code).toBe("BPL_ARRAY_SIZE_INVALID");
    expect(checkDiagnostic.source?.preview).toContain("int[0]");
    expect(checkDiagnostic.message).toContain(
      "Array size must be greater than zero.",
    );
    expect(checkDiagnostic.hint).toContain(
      "Arrays cannot have zero or negative size.",
    );
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_ARRAY_SIZE_INVALID" }],
    });
    expect(buildReport.diagnostics).toHaveLength(1);
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Array size must be greater than zero.",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Arrays cannot have zero or negative size.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports return type mismatch failures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "return_type_mismatch.bpl");
    const outputFile = path.join(tempDir, "return-type-mismatch-app");
    fs.writeFileSync(
      sourceFile,
      [
        "frame main() ret int {",
        '    return "wrong";',
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile, {
      line: 2,
      column: 5,
    });
    expect(checkDiagnostic.code).toBe("BPL_RETURN_TYPE_MISMATCH");
    expect(checkDiagnostic.source?.preview).toContain('return "wrong"');
    expect(checkDiagnostic.message).toContain(
      "Return type mismatch: expected i32, got *i8",
    );
    expect(checkDiagnostic.hint).toContain(
      "Ensure the returned value matches the function's return type.",
    );
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_RETURN_TYPE_MISMATCH" }],
    });
    expect(buildReport.diagnostics).toHaveLength(1);
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Return type mismatch: expected i32, got *i8",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Ensure the returned value matches the function's return type.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports assignment type mismatch failures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "assignment_type_mismatch.bpl");
    const outputFile = path.join(tempDir, "assignment-type-mismatch-app");
    fs.writeFileSync(
      sourceFile,
      [
        "frame main() ret int {",
        "    local value: int = 1;",
        '    value = "wrong";',
        "    return value;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile, {
      line: 3,
      column: 5,
    });
    expect(checkDiagnostic.code).toBe("BPL_ASSIGNMENT_TYPE_MISMATCH");
    expect(checkDiagnostic.source?.preview).toContain('value = "wrong"');
    expect(checkDiagnostic.message).toContain(
      "Type mismatch in assignment: cannot assign string to i32",
    );
    expect(checkDiagnostic.hint).toContain(
      "The assigned value is not compatible with the target variable's type.",
    );
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_ASSIGNMENT_TYPE_MISMATCH" }],
    });
    expect(buildReport.diagnostics).toHaveLength(1);
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Type mismatch in assignment: cannot assign string to i32",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "The assigned value is not compatible with the target variable's type.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports condition type mismatch failures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "condition_type_mismatch.bpl");
    const outputFile = path.join(tempDir, "condition-type-mismatch-app");
    fs.writeFileSync(
      sourceFile,
      [
        "frame main() ret int {",
        "    if (1) {",
        "        return 1;",
        "    }",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile, {
      line: 2,
      column: 9,
    });
    expect(checkDiagnostic.code).toBe("BPL_CONDITION_TYPE_MISMATCH");
    expect(checkDiagnostic.source?.preview).toContain("if (1)");
    expect(checkDiagnostic.message).toContain(
      "If condition must be boolean, got int",
    );
    expect(checkDiagnostic.hint).toContain(
      "Ensure the condition evaluates to a boolean.",
    );
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_CONDITION_TYPE_MISMATCH" }],
    });
    expect(buildReport.diagnostics).toHaveLength(1);
    expect(buildReport.diagnostics[0]?.message).toContain(
      "If condition must be boolean, got int",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Ensure the condition evaluates to a boolean.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports ternary condition type mismatch failures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(
      tempDir,
      "ternary_condition_type_mismatch.bpl",
    );
    const outputFile = path.join(
      tempDir,
      "ternary-condition-type-mismatch-app",
    );
    fs.writeFileSync(
      sourceFile,
      [
        "frame main() ret int {",
        "    return 1 ? 1 : 0;",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile, {
      line: 2,
      column: 12,
    });
    expect(checkDiagnostic.code).toBe("BPL_CONDITION_TYPE_MISMATCH");
    expect(checkDiagnostic.source?.preview).toContain("return 1 ? 1 : 0");
    expect(checkDiagnostic.message).toContain(
      "Ternary condition must be boolean, got int",
    );
    expect(checkDiagnostic.hint).toContain(
      "Ensure the condition evaluates to a boolean.",
    );
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_CONDITION_TYPE_MISMATCH" }],
    });
    expect(buildReport.diagnostics).toHaveLength(1);
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Ternary condition must be boolean, got int",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Ensure the condition evaluates to a boolean.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports ternary branch type mismatch failures in JSON-mode check and build diagnostics", () => {
    const sourceFile = path.join(tempDir, "ternary_branch_type_mismatch.bpl");
    const outputFile = path.join(tempDir, "ternary-branch-type-mismatch-app");
    fs.writeFileSync(
      sourceFile,
      [
        "frame main() ret int {",
        "    return true ? 1 : \"wrong\";",
        "}",
      ].join("\n"),
    );

    const check = runCli(["check", "--json", sourceFile]);
    const checkDiagnostic = expectSingleCheckJsonDiagnostic(check, sourceFile, {
      line: 2,
      column: 12,
    });
    expect(checkDiagnostic.code).toBe("BPL_TERNARY_BRANCH_TYPE_MISMATCH");
    expect(checkDiagnostic.source?.preview).toContain(
      'return true ? 1 : "wrong"',
    );
    expect(checkDiagnostic.message).toContain(
      "Ternary branches must have compatible types: int vs string",
    );
    expect(checkDiagnostic.hint).toContain(
      "Both branches must return the same type.",
    );
    expect(check.stderr).toBe("");

    const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [{ code: "BPL_TERNARY_BRANCH_TYPE_MISMATCH" }],
    });
    expect(buildReport.diagnostics).toHaveLength(1);
    expect(buildReport.diagnostics[0]?.message).toContain(
      "Ternary branches must have compatible types: int vs string",
    );
    expect(buildReport.diagnostics[0]?.hint).toContain(
      "Both branches must return the same type.",
    );
    expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
    expect(fs.existsSync(outputFile)).toBe(false);
  }, 10000);

  test("reports switch type mismatch failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "switch_value_type_mismatch",
        code: "BPL_SWITCH_VALUE_TYPE_MISMATCH",
        line: 3,
        column: 13,
        preview: "switch (value)",
        message:
          "Switch value must be an integer, string or enum type, got double",
        hint:
          "Ensure the switch expression evaluates to an integer, string or enum.",
        source: [
          "frame main() ret int {",
          "    local value: float = 1.5;",
          "    switch (value) {",
          "        default: {",
          "            return 0;",
          "        }",
          "    }",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "switch_case_type_mismatch",
        code: "BPL_SWITCH_CASE_TYPE_MISMATCH",
        line: 4,
        column: 14,
        preview: 'case "one"',
        message:
          "Case pattern type string not compatible with switch value type i32",
        hint: "Ensure case patterns match the switch value type.",
        source: [
          "frame main() ret int {",
          "    local value: int = 1;",
          "    switch (value) {",
          "        case \"one\": {",
          "            return 1;",
          "        }",
          "        default: {",
          "            return 0;",
          "        }",
          "    }",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      const checkDiagnostic = expectSingleCheckJsonDiagnostic(
        check,
        sourceFile,
        {
          line: testCase.line,
          column: testCase.column,
        },
      );
      expect(checkDiagnostic.code).toBe(testCase.code);
      expect(checkDiagnostic.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic.message).toContain(testCase.message);
      expect(checkDiagnostic.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
        diagnostics: [{ code: testCase.code }],
      });
      expect(buildReport.diagnostics).toHaveLength(1);
      expect(buildReport.diagnostics[0]?.message).toContain(testCase.message);
      expect(buildReport.diagnostics[0]?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 10000);

  test("reports call-site mismatch failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "call_target_not_callable",
        code: "BPL_CALL_TARGET_NOT_CALLABLE",
        line: 4,
        column: 5,
        preview: "box()",
        message: "Type 'Box' is not callable",
        hint: "Only functions or types with __call__ operator can be called.",
        source: [
          "struct Box {}",
          "frame main() ret int {",
          "    local box: Box;",
          "    box();",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "call_argument_count_mismatch",
        code: "BPL_CALL_ARGUMENT_COUNT_MISMATCH",
        line: 3,
        column: 12,
        preview: "take()",
        message: "No matching function for call to 'take' with 0 arguments.",
        hint: "Available overloads:",
        source: [
          "frame take(value: int) ret int { return value; }",
          "frame main() ret int {",
          "    return take();",
          "}",
        ].join("\n"),
      },
      {
        name: "call_argument_type_mismatch",
        code: "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
        line: 3,
        column: 12,
        preview: 'take("wrong")',
        message:
          "No matching function for call to 'take' with provided argument types.",
        hint: "Available overloads:",
        source: [
          "frame take(value: int) ret int { return value; }",
          "frame main() ret int {",
          '    return take("wrong");',
          "}",
        ].join("\n"),
      },
      {
        name: "enum_variant_argument_count_mismatch",
        code: "BPL_ENUM_VARIANT_ARGUMENT_COUNT_MISMATCH",
        line: 6,
        column: 26,
        preview: "Message.Move(1)",
        message: "Enum variant 'Move' expects 2 arguments, but got 1",
        hint: "Usage: Message.Move(",
        source: [
          "enum Message {",
          "    Move(int, int),",
          "    Quit,",
          "}",
          "frame main() ret int {",
          "    local msg: Message = Message.Move(1);",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "enum_variant_argument_type_mismatch",
        code: "BPL_ENUM_VARIANT_ARGUMENT_TYPE_MISMATCH",
        line: 6,
        column: 26,
        preview: 'Message.Move(1, "wrong")',
        message: "Type mismatch for argument 2 of 'Move': expected",
        hint: "Check the variant definition and argument types.",
        source: [
          "enum Message {",
          "    Move(int, int),",
          "    Quit,",
          "}",
          "frame main() ret int {",
          '    local msg: Message = Message.Move(1, "wrong");',
          "    return 0;",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      const checkDiagnostic = expectSingleCheckJsonDiagnostic(
        check,
        sourceFile,
        {
          line: testCase.line,
          column: testCase.column,
        },
      );
      expect(checkDiagnostic.code).toBe(testCase.code);
      expect(checkDiagnostic.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic.message).toContain(testCase.message);
      expect(checkDiagnostic.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
        diagnostics: [{ code: testCase.code }],
      });
      expect(buildReport.diagnostics).toHaveLength(1);
      expect(buildReport.diagnostics[0]?.message).toContain(testCase.message);
      expect(buildReport.diagnostics[0]?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 10000);

  test("reports control-flow misuse failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "break_outside_context",
        code: "BPL_BREAK_OUTSIDE_CONTEXT",
        line: 2,
        column: 5,
        preview: "break;",
        message: "'break' statement outside of loop or switch",
        hint: "Break statements can only be used inside loops or switch statements.",
        source: [
          "frame main() ret int {",
          "    break;",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "continue_outside_loop",
        code: "BPL_CONTINUE_OUTSIDE_LOOP",
        line: 2,
        column: 5,
        preview: "continue;",
        message: "'continue' statement outside of loop",
        hint: "Continue statements can only be used inside loops.",
        source: [
          "frame main() ret int {",
          "    continue;",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "fallthrough_outside_switch",
        code: "BPL_FALLTHROUGH_OUTSIDE_SWITCH",
        line: 2,
        column: 5,
        preview: "fallthrough;",
        message: "'fallthrough' statement outside of switch",
        hint: "Fallthrough statements can only be used inside switch statements.",
        source: [
          "frame main() ret int {",
          "    fallthrough;",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "defer_return_value_invalid",
        code: "BPL_DEFER_RETURN_VALUE_INVALID",
        line: 3,
        column: 9,
        preview: "return 1;",
        message: "Return with value not allowed in defer block",
        hint: "Defer blocks must return void.",
        source: [
          "frame main() ret int {",
          "    defer {",
          "        return 1;",
          "    }",
          "    return 0;",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      const checkDiagnostic = expectSingleCheckJsonDiagnostic(
        check,
        sourceFile,
        {
          line: testCase.line,
          column: testCase.column,
        },
      );
      expect(checkDiagnostic.code).toBe(testCase.code);
      expect(checkDiagnostic.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic.message).toContain(testCase.message);
      expect(checkDiagnostic.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
        diagnostics: [{ code: testCase.code }],
      });
      expect(buildReport.diagnostics).toHaveLength(1);
      expect(buildReport.diagnostics[0]?.message).toContain(testCase.message);
      expect(buildReport.diagnostics[0]?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 10000);

  test("reports binary operator misuse failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "string_concat_unsupported",
        code: "BPL_STRING_CONCAT_UNSUPPORTED",
        line: 2,
        column: 27,
        preview: 'local value: string = "left" + "right"',
        message: "String concatenation with '+' is not supported.",
        hint: "Use 'string_concat(a, b)' or similar helper functions.",
        source: [
          "frame main() ret int {",
          '    local value: string = "left" + "right";',
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "logical_operand_type_mismatch",
        code: "BPL_LOGICAL_OPERAND_TYPE_MISMATCH",
        line: 2,
        column: 26,
        preview: "local result: bool = true && 1",
        message: "Logical operators require boolean operands",
        hint: "Ensure both operands are boolean expressions.",
        source: [
          "frame main() ret int {",
          "    local result: bool = true && 1;",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "comparison_type_mismatch",
        code: "BPL_COMPARISON_TYPE_MISMATCH",
        line: 2,
        column: 26,
        preview: 'local result: bool = 1 < "wrong"',
        message: "Cannot compare int and string",
        hint: "Operands must be of compatible types.",
        source: [
          "frame main() ret int {",
          '    local result: bool = 1 < "wrong";',
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "bitwise_operand_type_mismatch",
        code: "BPL_BITWISE_OPERAND_TYPE_MISMATCH",
        line: 2,
        column: 12,
        preview: "return 1 & 1.5",
        message: "Bitwise operators require integer operands",
        hint: "Ensure both operands are integers.",
        source: [
          "frame main() ret int {",
          "    return 1 & 1.5;",
          "}",
        ].join("\n"),
      },
      {
        name: "modulo_operand_type_mismatch",
        code: "BPL_MODULO_OPERAND_TYPE_MISMATCH",
        line: 2,
        column: 12,
        preview: "return 1 % 1.5",
        message: "Modulo operator requires integer operands",
        hint: "Ensure both operands are integers.",
        source: [
          "frame main() ret int {",
          "    return 1 % 1.5;",
          "}",
        ].join("\n"),
      },
      {
        name: "binary_operand_type_mismatch",
        code: "BPL_BINARY_OPERAND_TYPE_MISMATCH",
        line: 2,
        column: 12,
        preview: 'return 1 + "wrong"',
        message: "Type mismatch: int and string",
        hint: "Ensure operands have compatible types.",
        source: [
          "frame main() ret int {",
          '    return 1 + "wrong";',
          "}",
        ].join("\n"),
      },
      {
        name: "arithmetic_operand_type_mismatch",
        code: "BPL_ARITHMETIC_OPERAND_TYPE_MISMATCH",
        line: 2,
        column: 32,
        preview: "local result: (int, int) = (1, 2) + (3, 4)",
        message: "Operator '+' cannot be applied to types",
        hint: "Arithmetic operators require numeric types.",
        source: [
          "frame main() ret int {",
          "    local result: (int, int) = (1, 2) + (3, 4);",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "pointer_arithmetic_void",
        code: "BPL_POINTER_ARITHMETIC_VOID",
        line: 3,
        column: 25,
        preview: "local next: *void = ptr + 1",
        message: "Cannot perform pointer arithmetic on void pointer",
        hint: "Cast to a sized pointer type first",
        source: [
          "frame main() ret int {",
          "    local ptr: *void = nullptr;",
          "    local next: *void = ptr + 1;",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "pointer_difference_type_mismatch",
        code: "BPL_POINTER_DIFFERENCE_TYPE_MISMATCH",
        line: 4,
        column: 23,
        preview: "local diff: i64 = left - right",
        message: "Cannot compare pointer difference between",
        hint: "Pointer subtraction requires compatible pointee types.",
        source: [
          "frame main() ret int {",
          "    local left: *int = nullptr;",
          "    local right: *float = nullptr;",
          "    local diff: i64 = left - right;",
          "    return 0;",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      const checkDiagnostic = expectSingleCheckJsonDiagnostic(
        check,
        sourceFile,
        {
          line: testCase.line,
          column: testCase.column,
        },
      );
      expect(checkDiagnostic.code).toBe(testCase.code);
      expect(checkDiagnostic.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic.message).toContain(testCase.message);
      expect(checkDiagnostic.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
        diagnostics: [{ code: testCase.code }],
      });
      expect(buildReport.diagnostics).toHaveLength(1);
      expect(buildReport.diagnostics[0]?.message).toContain(testCase.message);
      expect(buildReport.diagnostics[0]?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports unary operator misuse failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "dereference_target_invalid",
        code: "BPL_DEREFERENCE_TARGET_INVALID",
        line: 2,
        column: 12,
        preview: "return *1",
        message: "Cannot dereference non-pointer type int",
        hint: "Dereference requires a pointer type.",
        source: [
          "frame main() ret int {",
          "    return *1;",
          "}",
        ].join("\n"),
      },
      {
        name: "logical_not_operand_type_mismatch",
        code: "BPL_LOGICAL_NOT_OPERAND_TYPE_MISMATCH",
        line: 2,
        column: 26,
        preview: "local result: bool = !1",
        message: "Logical not requires boolean operand",
        hint: "Ensure the operand is a boolean expression.",
        source: [
          "frame main() ret int {",
          "    local result: bool = !1;",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "bitwise_not_operand_type_mismatch",
        code: "BPL_BITWISE_NOT_OPERAND_TYPE_MISMATCH",
        line: 2,
        column: 12,
        preview: "return ~1.5",
        message: "Bitwise not requires integer operand",
        hint: "Ensure the operand is an integer.",
        source: [
          "frame main() ret int {",
          "    return ~1.5;",
          "}",
        ].join("\n"),
      },
      {
        name: "unary_negation_operand_type_mismatch",
        code: "BPL_UNARY_NEGATION_OPERAND_TYPE_MISMATCH",
        line: 2,
        column: 12,
        preview: 'return -"wrong"',
        message: "Unary operator '-' cannot be applied to type 'string'",
        hint: "Negation requires a numeric type.",
        source: [
          "frame main() ret int {",
          '    return -"wrong";',
          "}",
        ].join("\n"),
      },
      {
        name: "unary_plus_unsupported",
        code: "BPL_UNARY_PLUS_UNSUPPORTED",
        line: 2,
        column: 12,
        preview: "return +1",
        message: "Unary plus operator '+' is not supported",
        hint: "Simply remove the '+' prefix.",
        source: [
          "frame main() ret int {",
          "    return +1;",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      const checkDiagnostic = expectSingleCheckJsonDiagnostic(
        check,
        sourceFile,
        {
          line: testCase.line,
          column: testCase.column,
        },
      );
      expect(checkDiagnostic.code).toBe(testCase.code);
      expect(checkDiagnostic.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic.message).toContain(testCase.message);
      expect(checkDiagnostic.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
        diagnostics: [{ code: testCase.code }],
      });
      expect(buildReport.diagnostics).toHaveLength(1);
      expect(buildReport.diagnostics[0]?.message).toContain(testCase.message);
      expect(buildReport.diagnostics[0]?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports index expression misuse failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "array_index_type_mismatch",
        code: "BPL_ARRAY_INDEX_TYPE_MISMATCH",
        line: 3,
        column: 19,
        preview: "return values[1.5]",
        message: "Array index must be an integer, got float",
        hint: "Ensure the index expression evaluates to an integer.",
        source: [
          "frame main() ret int {",
          "    local values: int[3];",
          "    return values[1.5];",
          "}",
        ].join("\n"),
      },
      {
        name: "pointer_index_type_mismatch",
        code: "BPL_POINTER_INDEX_TYPE_MISMATCH",
        line: 4,
        column: 16,
        preview: "return ptr[true]",
        message: "Pointer index must be an integer, got bool",
        hint: "Ensure the index expression evaluates to an integer.",
        source: [
          "frame main() ret int {",
          "    local value: int = 1;",
          "    local ptr: *int = &value;",
          "    return ptr[true];",
          "}",
        ].join("\n"),
      },
      {
        name: "index_target_not_indexable",
        code: "BPL_INDEX_TARGET_NOT_INDEXABLE",
        line: 3,
        column: 12,
        preview: "return value[0]",
        message: "Type 'i32' is not indexable",
        hint: "Only arrays, pointers, or types with __get__ operator can be indexed.",
        source: [
          "frame main() ret int {",
          "    local value: int = 1;",
          "    return value[0];",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      const checkDiagnostic = expectSingleCheckJsonDiagnostic(
        check,
        sourceFile,
        {
          line: testCase.line,
          column: testCase.column,
        },
      );
      expect(checkDiagnostic.code).toBe(testCase.code);
      expect(checkDiagnostic.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic.message).toContain(testCase.message);
      expect(checkDiagnostic.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
        diagnostics: [{ code: testCase.code }],
      });
      expect(buildReport.diagnostics).toHaveLength(1);
      expect(buildReport.diagnostics[0]?.message).toContain(testCase.message);
      expect(buildReport.diagnostics[0]?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports member access misuse failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "static_member_not_found",
        code: "BPL_STATIC_MEMBER_NOT_FOUND",
        line: 5,
        column: 24,
        preview: "local value: int = S.x",
        message: "No static member 'x' found on type 'S'",
        hint: "Ensure the member is static (does not take 'this').",
        source: [
          "struct S {",
          "    x: int,",
          "}",
          "frame main() {",
          "    local value: int = S.x;",
          "}",
        ].join("\n"),
      },
      {
        name: "instance_method_not_compatible",
        code: "BPL_INSTANCE_METHOD_NOT_COMPATIBLE",
        line: 6,
        column: 5,
        preview: "s.staticFunc()",
        message: "No compatible instance method 'staticFunc' found on type 'S'",
        hint: "Static methods must be called on the type, not an instance.",
        source: [
          "struct S {",
          "    frame staticFunc() {}",
          "}",
          "frame main() {",
          "    local s: S;",
          "    s.staticFunc();",
          "}",
        ].join("\n"),
      },
      {
        name: "tuple_index_invalid",
        code: "BPL_TUPLE_INDEX_INVALID",
        line: 3,
        column: 12,
        preview: "return pair.2",
        message: "Invalid tuple index '2'",
        hint: "Valid indices are 0-1",
        source: [
          "frame main() ret int {",
          "    local pair: (int, bool) = (1, true);",
          "    return pair.2;",
          "}",
        ].join("\n"),
      },
      {
        name: "member_not_found",
        code: "BPL_MEMBER_NOT_FOUND",
        line: 6,
        column: 12,
        preview: "return s.y",
        message: "Cannot access member 'y' on type 'S'",
        hint: "Check the type definition for available members.",
        source: [
          "struct S {",
          "    x: int,",
          "}",
          "frame main() ret int {",
          "    local s: S;",
          "    return s.y;",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      const checkDiagnostic = expectSingleCheckJsonDiagnostic(
        check,
        sourceFile,
        {
          line: testCase.line,
          column: testCase.column,
        },
      );
      expect(checkDiagnostic.code).toBe(testCase.code);
      expect(checkDiagnostic.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic.message).toContain(testCase.message);
      expect(checkDiagnostic.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
        diagnostics: [{ code: testCase.code }],
      });
      expect(buildReport.diagnostics).toHaveLength(1);
      expect(buildReport.diagnostics[0]?.message).toContain(testCase.message);
      expect(buildReport.diagnostics[0]?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports expression semantic guard failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "division_by_zero",
        code: "BPL_DIVISION_BY_ZERO",
        line: 2,
        column: 16,
        preview: "return 1 / 0",
        message: "Division by zero",
        hint: "divisor in a division operation cannot be zero",
        source: [
          "frame main() ret int {",
          "    return 1 / 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "modulo_by_zero",
        code: "BPL_DIVISION_BY_ZERO",
        line: 2,
        column: 16,
        preview: "return 1 % 0",
        message: "Division by zero",
        hint: "divisor in a modulo operation cannot be zero",
        source: [
          "frame main() ret int {",
          "    return 1 % 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "shift_count_negative",
        code: "BPL_SHIFT_COUNT_INVALID",
        line: 2,
        column: 17,
        preview: "return 1 << -1",
        message: "Negative shift count",
        hint: "Shift counts must be zero or greater.",
        source: [
          "frame main() ret int {",
          "    return 1 << -1;",
          "}",
        ].join("\n"),
      },
      {
        name: "shift_count_out_of_range",
        code: "BPL_SHIFT_COUNT_INVALID",
        line: 3,
        column: 21,
        preview: "return value << 8",
        message: "Shift count 8 is out of range",
        hint: "Use a shift count smaller than the width of the left operand.",
        source: [
          "frame main() ret int {",
          "    local value: i8 = 1;",
          "    return value << 8;",
          "}",
        ].join("\n"),
      },
      {
        name: "address_of_constant",
        code: "BPL_ADDRESS_OF_CONSTANT",
        line: 3,
        column: 23,
        preview: "local ptr: *int = &value",
        message: "Cannot take address of constant expression.",
        hint: "does not support pointers to constants yet",
        source: [
          "frame main() ret int {",
          "    local const value: int = 1;",
          "    local ptr: *int = &value;",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "address_of_target_invalid",
        code: "BPL_ADDRESS_OF_TARGET_INVALID",
        line: 2,
        column: 23,
        preview: "local ptr: *int = &(1, 2)",
        message: "Cannot take address of",
        hint: "Address-of requires an lvalue.",
        source: [
          "frame main() ret int {",
          "    local ptr: *int = &(1, 2);",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "array_literal_type_mismatch",
        code: "BPL_ARRAY_LITERAL_TYPE_MISMATCH",
        line: 2,
        column: 31,
        preview: 'local values: int[] = [1, "two", 3]',
        message: "Array literal has inconsistent element types",
        hint: "All elements in an array literal must have the same type.",
        source: [
          "frame main() ret int {",
          '    local values: int[] = [1, "two", 3];',
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "cast_integer_to_string",
        code: "BPL_CAST_INTEGER_TO_STRING",
        line: 3,
        column: 26,
        preview: "local text: string = cast<string>(value)",
        message: "Cannot cast integer type 'i32' to 'string'",
        hint: "Use .toString() or similar conversion methods.",
        source: [
          "frame main() ret int {",
          "    local value: int = 123;",
          "    local text: string = cast<string>(value);",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "cast_invalid",
        code: "BPL_CAST_INVALID",
        line: 5,
        column: 22,
        preview: "local box: Box = cast<Box>(1)",
        message: "Cannot cast i32 to Box",
        hint: "This cast is not allowed.",
        source: [
          "struct Box {",
          "    value: int,",
          "}",
          "frame main() ret int {",
          "    local box: Box = cast<Box>(1);",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "sizeof_void_invalid",
        code: "BPL_SIZEOF_VOID_INVALID",
        line: 2,
        column: 22,
        preview: "return cast<int>(sizeof<void>())",
        message: "Cannot take size of void",
        hint: "Void type has no size.",
        source: [
          "frame main() ret int {",
          "    return cast<int>(sizeof<void>());",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      const checkDiagnostic = expectSingleCheckJsonDiagnostic(
        check,
        sourceFile,
        {
          line: testCase.line,
          column: testCase.column,
        },
      );
      expect(checkDiagnostic.code).toBe(testCase.code);
      expect(checkDiagnostic.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic.message).toContain(testCase.message);
      expect(checkDiagnostic.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
        diagnostics: [{ code: testCase.code }],
      });
      expect(buildReport.diagnostics).toHaveLength(1);
      expect(buildReport.diagnostics[0]?.message).toContain(testCase.message);
      expect(buildReport.diagnostics[0]?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports statement semantic guard failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "variable_type_annotation_missing",
        code: "BPL_VARIABLE_TYPE_ANNOTATION_MISSING",
        preview: "local value = []",
        message: "Missing type annotation for variable 'value'",
        hint: "Variables must have explicit type annotations.",
        source: [
          "frame main() ret int {",
          "    local value = [];",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "variable_redeclaration",
        code: "BPL_VARIABLE_REDECLARATION",
        preview: "local value: int = 2",
        message: "Variable 'value' is already declared in this scope",
        hint: "Cannot redeclare 'value' in the same scope.",
        source: [
          "frame main() ret int {",
          "    local value: int = 1;",
          "    local value: int = 2;",
          "    return value;",
          "}",
        ].join("\n"),
      },
      {
        name: "integer_literal_overflow",
        code: "BPL_INTEGER_LITERAL_OVERFLOW",
        preview: "local value: i8 = 128",
        message: "Integer overflow: value 128 does not fit in type i8",
        hint: "Ensure the value is within the range of i8.",
        source: [
          "frame main() ret int {",
          "    local value: i8 = 128;",
          "    return cast<int>(value);",
          "}",
        ].join("\n"),
      },
      {
        name: "assignment_target_constant",
        code: "BPL_ASSIGNMENT_TARGET_CONSTANT",
        preview: "value = 2",
        message: "Cannot assign to constant 'value'",
        hint: "Constants cannot be modified.",
        source: [
          "frame main() ret int {",
          "    local const value: int = 1;",
          "    value = 2;",
          "    return value;",
          "}",
        ].join("\n"),
      },
      {
        name: "assignment_target_invalid",
        code: "BPL_ASSIGNMENT_TARGET_INVALID",
        preview: "(1 + 2) = 3",
        message: "Invalid assignment target",
        hint: "Left-hand side of assignment must be",
        source: [
          "frame main() ret int {",
          "    (1 + 2) = 3;",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "tuple_destructure_target_invalid",
        code: "BPL_TUPLE_DESTRUCTURE_TARGET_INVALID",
        preview: "(a, 1) = (2, 3)",
        message: "Invalid assignment target in tuple destructuring",
        hint: "Tuple elements in assignment must be valid l-values",
        source: [
          "frame main() ret int {",
          "    local a: int = 1;",
          "    (a, 1) = (2, 3);",
          "    return a;",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      expect(check.status).toBe(1);
      const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
      expect(checkReport).toMatchObject({
        schemaVersion: 1,
        check: "check",
        success: false,
        totalFiles: 1,
        errorCount: 1,
        files: [
          {
            file: sourceFile,
            success: false,
          },
        ],
      });
      const checkDiagnostic = checkReport.files[0]?.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(checkDiagnostic).toBeDefined();
      expect(checkDiagnostic?.code).toBe(testCase.code);
      expect(checkDiagnostic?.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic?.message).toContain(testCase.message);
      expect(checkDiagnostic?.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
      });
      const buildDiagnostic = buildReport.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(buildDiagnostic).toBeDefined();
      expect(buildDiagnostic?.message).toContain(testCase.message);
      expect(buildDiagnostic?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports struct literal diagnostics failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "struct_literal_unknown_struct",
        code: "BPL_STRUCT_LITERAL_UNKNOWN_STRUCT",
        preview: "local value: int = Missing { value: 1 }",
        message: "Unknown struct 'Missing'",
        hint: "Ensure the struct is defined.",
        source: [
          "frame main() ret int {",
          "    local value: int = Missing { value: 1 };",
          "    return value;",
          "}",
        ].join("\n"),
      },
      {
        name: "struct_literal_generic_arity",
        code: "BPL_GENERIC_ARITY_MISMATCH",
        preview: "local box: Box<i32> = Box<i32, bool> { value: 1 }",
        message: "Generic type 'Box' expects 1 arguments, but got 2",
        hint: "Provide the correct number of generic arguments.",
        source: [
          "struct Box<T> {",
          "    value: T,",
          "}",
          "frame main() ret int {",
          "    local box: Box<i32> = Box<i32, bool> { value: 1 };",
          "    return box.value;",
          "}",
        ].join("\n"),
      },
      {
        name: "struct_literal_field_missing",
        code: "BPL_STRUCT_LITERAL_FIELD_MISSING",
        preview: "local point: Point = Point { x: 1 }",
        message: "Missing field 'y' in struct literal for 'Point'",
        hint: "Field 'y' is required.",
        source: [
          "struct Point {",
          "    x: i32,",
          "    y: i32,",
          "}",
          "frame main() ret int {",
          "    local point: Point = Point { x: 1 };",
          "    return point.x;",
          "}",
        ].join("\n"),
      },
      {
        name: "struct_literal_field_unknown",
        code: "BPL_STRUCT_LITERAL_FIELD_UNKNOWN",
        preview: "local point: Point = Point { x: 1, y: 2, z: 3 }",
        message: "Unknown field 'z' in struct 'Point'",
        hint: "Check the struct definition for valid fields.",
        source: [
          "struct Point {",
          "    x: i32,",
          "    y: i32,",
          "}",
          "frame main() ret int {",
          "    local point: Point = Point { x: 1, y: 2, z: 3 };",
          "    return point.x;",
          "}",
        ].join("\n"),
      },
      {
        name: "struct_literal_field_type_mismatch",
        code: "BPL_STRUCT_LITERAL_FIELD_TYPE_MISMATCH",
        preview: 'local point: Point = Point { x: "wrong", y: 2 }',
        message: "Type mismatch for field 'x': expected i32, got",
        hint: "Field value must match the declared type.",
        source: [
          "struct Point {",
          "    x: i32,",
          "    y: i32,",
          "}",
          "frame main() ret int {",
          '    local point: Point = Point { x: "wrong", y: 2 };',
          "    return point.x;",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      expect(check.status).toBe(1);
      const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
      expect(checkReport).toMatchObject({
        schemaVersion: 1,
        check: "check",
        success: false,
        totalFiles: 1,
        errorCount: 1,
        files: [
          {
            file: sourceFile,
            success: false,
          },
        ],
      });
      const checkDiagnostic = checkReport.files[0]?.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(checkDiagnostic).toBeDefined();
      expect(checkDiagnostic?.code).toBe(testCase.code);
      expect(checkDiagnostic?.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic?.message).toContain(testCase.message);
      expect(checkDiagnostic?.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
      });
      const buildDiagnostic = buildReport.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(buildDiagnostic).toBeDefined();
      expect(buildDiagnostic?.message).toContain(testCase.message);
      expect(buildDiagnostic?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports enum variant field diagnostics failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "enum_variant_field_unknown_construction",
        code: "BPL_ENUM_VARIANT_FIELD_UNKNOWN",
        preview: "local event: Event = Event.MouseMove { x: 1, y: 2, z: 3 }",
        message: "Unknown field 'z' in variant 'MouseMove'",
        hint: "Check the variant definition.",
        source: [
          "enum Event {",
          "    MouseMove { x: int, y: int },",
          "}",
          "frame main() ret int {",
          "    local event: Event = Event.MouseMove { x: 1, y: 2, z: 3 };",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "enum_variant_field_type_mismatch",
        code: "BPL_ENUM_VARIANT_FIELD_TYPE_MISMATCH",
        preview: 'local event: Event = Event.MouseMove { x: "bad", y: 2 }',
        message: "Type mismatch for field 'x': expected int, got",
        hint: "Field value must match the declared type.",
        source: [
          "enum Event {",
          "    MouseMove { x: int, y: int },",
          "}",
          "frame main() ret int {",
          '    local event: Event = Event.MouseMove { x: "bad", y: 2 };',
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "enum_variant_field_unknown_pattern",
        code: "BPL_ENUM_VARIANT_FIELD_UNKNOWN",
        preview: "Event.MouseMove { x: px, z: pz } => px",
        message: "Unknown field 'z' in variant 'MouseMove'",
        hint: "Check the variant definition.",
        source: [
          "enum Event {",
          "    MouseMove { x: int, y: int },",
          "}",
          "frame main() ret int {",
          "    local event: Event = Event.MouseMove { x: 1, y: 2 };",
          "    return match (event) {",
          "        Event.MouseMove { x: px, z: pz } => px,",
          "    };",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      expect(check.status).toBe(1);
      const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
      expect(checkReport).toMatchObject({
        schemaVersion: 1,
        check: "check",
        success: false,
        totalFiles: 1,
        errorCount: 1,
        files: [
          {
            file: sourceFile,
            success: false,
          },
        ],
      });
      const checkDiagnostic = checkReport.files[0]?.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(checkDiagnostic).toBeDefined();
      expect(checkDiagnostic?.code).toBe(testCase.code);
      expect(checkDiagnostic?.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic?.message).toContain(testCase.message);
      expect(checkDiagnostic?.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
      });
      const buildDiagnostic = buildReport.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(buildDiagnostic).toBeDefined();
      expect(buildDiagnostic?.message).toContain(testCase.message);
      expect(buildDiagnostic?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports intrinsic call diagnostics failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "intrinsic_type_id_generic_arity",
        code: "BPL_INTRINSIC_GENERIC_ARITY_MISMATCH",
        preview: "local id: u64 = __type_id()",
        message: "Intrinsic __type_id requires exactly 1 generic argument",
        hint: "Use __type_id<T>() with exactly one type argument.",
        source: [
          "frame main() ret int {",
          "    local id: u64 = __type_id();",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "intrinsic_type_info_generic_arity",
        code: "BPL_INTRINSIC_GENERIC_ARITY_MISMATCH",
        preview: "__type_info<int, bool>()",
        message: "Intrinsic __type_info requires exactly 1 generic argument",
        hint: "Use __type_info<T>() with exactly one type argument.",
        source: [
          "frame main() ret int {",
          "    __type_info<int, bool>();",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "intrinsic_type_id_value_arguments",
        code: "BPL_INTRINSIC_ARGUMENT_COUNT_MISMATCH",
        preview: "local id: u64 = __type_id<int>(1)",
        message: "Intrinsic __type_id accepts no arguments",
        hint: "Call __type_id<T>() without value arguments.",
        source: [
          "frame main() ret int {",
          "    local id: u64 = __type_id<int>(1);",
          "    return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "intrinsic_type_info_value_arguments",
        code: "BPL_INTRINSIC_ARGUMENT_COUNT_MISMATCH",
        preview: "__type_info<int>(1)",
        message: "Intrinsic __type_info accepts no arguments",
        hint: "Call __type_info<T>() without value arguments.",
        source: [
          "frame main() ret int {",
          "    __type_info<int>(1);",
          "    return 0;",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      expect(check.status).toBe(1);
      const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
      expect(checkReport).toMatchObject({
        schemaVersion: 1,
        check: "check",
        success: false,
        totalFiles: 1,
        errorCount: 1,
        files: [
          {
            file: sourceFile,
            success: false,
          },
        ],
      });
      const checkDiagnostic = checkReport.files[0]?.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(checkDiagnostic).toBeDefined();
      expect(checkDiagnostic?.code).toBe(testCase.code);
      expect(checkDiagnostic?.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic?.message).toContain(testCase.message);
      expect(checkDiagnostic?.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
      });
      const buildDiagnostic = buildReport.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(buildDiagnostic).toBeDefined();
      expect(buildDiagnostic?.message).toContain(testCase.message);
      expect(buildDiagnostic?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports match exhaustiveness diagnostics failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "match_exhaustiveness_missing_variant",
        code: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
        preview: "return match (color) {",
        message: "Non-exhaustive match: missing variants: Blue",
        hint: "Match expressions must handle all enum variants",
        source: [
          "enum Color {",
          "    Red,",
          "    Blue,",
          "}",
          "frame main() ret int {",
          "    local color: Color = Color.Red;",
          "    return match (color) {",
          "        Color.Red => 1,",
          "    };",
          "}",
        ].join("\n"),
      },
      {
        name: "match_exhaustiveness_missing_default",
        code: "BPL_MATCH_EXHAUSTIVENESS_MISMATCH",
        preview: "return match (value) {",
        message: "Non-exhaustive match: missing default case (_)",
        hint: "Type matching requires a default case.",
        source: [
          "frame main() ret int {",
          "    local value: int = 1;",
          "    return match (value) {",
          "        1 => 10,",
          "    };",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      expect(check.status).toBe(1);
      const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
      expect(checkReport).toMatchObject({
        schemaVersion: 1,
        check: "check",
        success: false,
        totalFiles: 1,
        errorCount: 1,
        files: [
          {
            file: sourceFile,
            success: false,
          },
        ],
      });
      const checkDiagnostic = checkReport.files[0]?.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(checkDiagnostic).toBeDefined();
      expect(checkDiagnostic?.code).toBe(testCase.code);
      expect(checkDiagnostic?.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic?.message).toContain(testCase.message);
      expect(checkDiagnostic?.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
      });
      const buildDiagnostic = buildReport.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(buildDiagnostic).toBeDefined();
      expect(buildDiagnostic?.message).toContain(testCase.message);
      expect(buildDiagnostic?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports tuple pattern diagnostics failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "tuple_pattern_type_mismatch",
        code: "BPL_MATCH_TUPLE_PATTERN_TYPE_MISMATCH",
        preview: "(left, right) => left",
        message: "Tuple pattern used on non-tuple type",
        hint: "Expected tuple type, got BasicType",
        source: [
          "frame main() ret int {",
          "    local value: int = 1;",
          "    return match (value) {",
          "        (left, right) => left,",
          "        _ => 0,",
          "    };",
          "}",
        ].join("\n"),
      },
      {
        name: "tuple_pattern_arity_mismatch",
        code: "BPL_MATCH_TUPLE_PATTERN_ARITY_MISMATCH",
        preview: "(left, middle, right) => left",
        message: "Tuple pattern has 3 elements, but type has 2",
        hint: "Pattern and type must have the same number of elements",
        source: [
          "frame main() ret int {",
          "    local pair: (int, int) = (1, 2);",
          "    return match (pair) {",
          "        (left, middle, right) => left,",
          "        _ => 0,",
          "    };",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      expect(check.status).toBe(1);
      const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
      expect(checkReport).toMatchObject({
        schemaVersion: 1,
        check: "check",
        success: false,
        totalFiles: 1,
        errorCount: 1,
        files: [
          {
            file: sourceFile,
            success: false,
          },
        ],
      });
      const checkDiagnostic = checkReport.files[0]?.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(checkDiagnostic).toBeDefined();
      expect(checkDiagnostic?.code).toBe(testCase.code);
      expect(checkDiagnostic?.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic?.message).toContain(testCase.message);
      expect(checkDiagnostic?.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
      });
      const buildDiagnostic = buildReport.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(buildDiagnostic).toBeDefined();
      expect(buildDiagnostic?.message).toContain(testCase.message);
      expect(buildDiagnostic?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports type-query diagnostics failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "type_query_match_enum_not_found",
        code: "BPL_TYPE_QUERY_ENUM_NOT_FOUND",
        preview: "local _ok: bool = match<Missing.Some>(value)",
        message: "Cannot find enum 'Missing'",
        hint:
          "The type 'Missing' in match<Missing.Some> is not a defined enum.",
        source: [
          "frame main() {",
          "    local value: int = 1;",
          "    local _ok: bool = match<Missing.Some>(value);",
          "}",
        ].join("\n"),
      },
      {
        name: "type_query_match_type_not_found",
        code: "BPL_TYPE_QUERY_TYPE_NOT_FOUND",
        preview: "local _ok: bool = match<MissingType>(value)",
        message: "Unknown type 'MissingType'",
        hint: "The type 'MissingType' in match<MissingType> is not defined.",
        source: [
          "frame main() {",
          "    local value: int = 1;",
          "    local _ok: bool = match<MissingType>(value);",
          "}",
        ].join("\n"),
      },
      {
        name: "type_query_is_type_not_found",
        code: "BPL_TYPE_QUERY_TYPE_NOT_FOUND",
        preview: "if (value is MissingType) {}",
        message: "Unknown type: MissingType",
        hint: "Ensure the type is defined.",
        source: [
          "frame main() {",
          "    local value: int = 1;",
          "    if (value is MissingType) {}",
          "}",
        ].join("\n"),
      },
      {
        name: "type_query_is_enum_not_found",
        code: "BPL_TYPE_QUERY_ENUM_NOT_FOUND",
        preview: "if (value is Missing.Some) {}",
        message: "Cannot find enum 'Missing'",
        hint: "The type 'Missing' in 'is' expression is not a defined enum.",
        source: [
          "frame main() {",
          "    local value: int = 1;",
          "    if (value is Missing.Some) {}",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      expect(check.status).toBe(1);
      const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
      expect(checkReport).toMatchObject({
        schemaVersion: 1,
        check: "check",
        success: false,
        totalFiles: 1,
        errorCount: 1,
        files: [
          {
            file: sourceFile,
            success: false,
          },
        ],
      });
      const checkDiagnostic = checkReport.files[0]?.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(checkDiagnostic).toBeDefined();
      expect(checkDiagnostic?.code).toBe(testCase.code);
      expect(checkDiagnostic?.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic?.message).toContain(testCase.message);
      expect(checkDiagnostic?.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
      });
      const buildDiagnostic = buildReport.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(buildDiagnostic).toBeDefined();
      expect(buildDiagnostic?.message).toContain(testCase.message);
      expect(buildDiagnostic?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports function-attribute diagnostics failures in JSON-mode check and build diagnostics", () => {
    const cases = [
      {
        name: "function_attribute_unknown",
        code: "BPL_FUNCTION_ATTRIBUTE_UNKNOWN",
        preview: "@[trace]",
        message: "Unknown function attribute 'trace'",
        hint: "Only compiler-known function attributes are supported.",
        source: ["@[trace]", "frame traced() {}"].join("\n"),
      },
      {
        name: "function_attribute_duplicate",
        code: "BPL_FUNCTION_ATTRIBUTE_DUPLICATE",
        preview: "@[inline, inline]",
        message: "Duplicate function attribute 'inline'",
        hint: "Remove the duplicate attribute.",
        source: ["@[inline, inline]", "frame duplicated() {}"].join("\n"),
      },
      {
        name: "function_attribute_conflict",
        code: "BPL_FUNCTION_ATTRIBUTE_CONFLICT",
        preview: "@[always_inline, noinline]",
        message: "Conflicting function attributes: always_inline, noinline",
        hint: "Remove one of the conflicting attributes.",
        source: [
          "@[always_inline, noinline]",
          "frame conflicted() {}",
        ].join("\n"),
      },
      {
        name: "function_attribute_noreturn_return_type",
        code: "BPL_FUNCTION_ATTRIBUTE_NORETURN_RETURN_TYPE_MISMATCH",
        preview: "@[noreturn]",
        message: "Function attribute 'noreturn' requires a void return type",
        hint: "Use 'ret void' or remove the noreturn attribute.",
        source: [
          "@[noreturn]",
          "frame exits() ret int {",
          "    return 1;",
          "}",
        ].join("\n"),
      },
      {
        name: "function_attribute_auto_destroy_receiver_type",
        code: "BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_RECEIVER_TYPE_MISMATCH",
        preview: "frame destroy(this: *Other) ret void {}",
        message:
          "Function attribute 'auto_destroy' requires receiver type '*Resource'",
        hint: "Change the first parameter to 'this: *Resource'.",
        source: [
          "struct Other {}",
          "",
          "struct Resource {",
          "    @[auto_destroy]",
          "    frame destroy(this: *Other) ret void {}",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const sourceFile = path.join(tempDir, `${testCase.name}.bpl`);
      const outputFile = path.join(tempDir, `${testCase.name}-app`);
      fs.writeFileSync(sourceFile, testCase.source);

      const check = runCli(["check", "--json", sourceFile]);
      expect(check.status).toBe(1);
      const checkReport = parseJsonObjectStdout<CheckJsonFailureReport>(check);
      expect(checkReport).toMatchObject({
        schemaVersion: 1,
        check: "check",
        success: false,
        totalFiles: 1,
        errorCount: 1,
        files: [
          {
            file: sourceFile,
            success: false,
          },
        ],
      });
      const checkDiagnostic = checkReport.files[0]?.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(checkDiagnostic).toBeDefined();
      expect(checkDiagnostic?.code).toBe(testCase.code);
      expect(checkDiagnostic?.source?.preview).toContain(testCase.preview);
      expect(checkDiagnostic?.message).toContain(testCase.message);
      expect(checkDiagnostic?.hint).toContain(testCase.hint);
      expect(check.stderr).toBe("");

      const build = runCli(["build", sourceFile, "--json", "-o", outputFile]);
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const buildReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          code?: string;
          message: string;
          hint: string;
        }>;
      }>(build);
      expect(buildReport).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file: sourceFile,
      });
      const buildDiagnostic = buildReport.diagnostics.find(
        (diagnostic) => diagnostic.code === testCase.code,
      );
      expect(buildDiagnostic).toBeDefined();
      expect(buildDiagnostic?.message).toContain(testCase.message);
      expect(buildDiagnostic?.hint).toContain(testCase.hint);
      expect(fs.existsSync(`${outputFile}.ll`)).toBe(false);
      expect(fs.existsSync(outputFile)).toBe(false);
    }
  }, 30000);

  test("reports global package root failures in JSON-mode check diagnostics", () => {
    const homeDir = path.join(tempDir, "home");
    const globalPackageDir = path.join(homeDir, ".bpl", "packages");
    const lowerPackageDir = path.join(globalPackageDir, "pkg-math-1.0.0");
    const unsafePackageRoot = path.join(globalPackageDir, "pkg-math-9.0.0");
    const sourceFile = path.join(tempDir, "global_package_import.bpl");
    fs.mkdirSync(lowerPackageDir, { recursive: true });
    fs.writeFileSync(unsafePackageRoot, "not a package directory");
    writePackageFixture(lowerPackageDir);
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "pkg-math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const result = runCli(["check", "--json", sourceFile], {
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    const diagnostic = expectSingleCheckJsonDiagnostic(result, sourceFile);
    expect(diagnostic.code).toBe("BPL_PACKAGE_ROOT_NOT_DIRECTORY");
    expect(diagnostic.source?.preview).toContain(
      'import value from "pkg-math";',
    );
    expect(diagnostic?.message).toContain("invalid package root");
    expect(diagnostic?.message).toContain("not a directory");
    expect(diagnostic?.message).toContain(unsafePackageRoot);
    expect(diagnostic?.hint).toContain("Searched paths:");
    expect(diagnostic?.hint).toContain(unsafePackageRoot);
    expect(diagnostic?.hint).not.toContain(lowerPackageDir);
    expect(result.stderr).toBe("");
  });

  test("reports local package search directory failures in JSON-mode check diagnostics", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const linkedModulesDir = path.join(appDir, "bpl_modules");
    const realModulesDir = path.join(tempDir, "outside-bpl-modules");
    const realPackageDir = path.join(realModulesDir, "pkg-math");
    const workspacePackageDir = path.join(appDir, "packages", "pkg-math");
    const homeDir = path.join(tempDir, "home");
    const globalPackageDir = path.join(homeDir, ".bpl", "packages");
    const globalPackageRoot = path.join(globalPackageDir, "pkg-math-9.0.0");
    const sourceFile = path.join(sourceDir, "local_search_dir_import.bpl");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(realPackageDir, { recursive: true });
    fs.mkdirSync(workspacePackageDir, { recursive: true });
    fs.mkdirSync(globalPackageRoot, { recursive: true });

    for (const [packageDir, version] of [
      [realPackageDir, "1.0.0"],
      [workspacePackageDir, "2.0.0"],
      [globalPackageRoot, "9.0.0"],
    ] as const) {
      writePackageFixture(packageDir, { version });
    }
    fs.symlinkSync(realModulesDir, linkedModulesDir, "dir");
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "pkg-math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const result = runCli(["check", "--json", sourceFile], {
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    const diagnostic = expectSingleCheckJsonDiagnostic(result, sourceFile);
    expect(diagnostic.code).toBe("BPL_PACKAGE_SEARCH_DIR_SYMLINK");
    expect(diagnostic.source?.preview).toContain(
      'import value from "pkg-math";',
    );
    expect(diagnostic?.message).toContain("invalid package search directory");
    expect(diagnostic?.message).toContain("symbolic link");
    expect(diagnostic?.message).toContain(linkedModulesDir);
    expect(diagnostic?.hint).toContain("Searched paths:");
    expect(diagnostic?.hint).toContain(linkedModulesDir);
    expect(diagnostic?.hint).not.toContain(realPackageDir);
    expect(diagnostic?.hint).not.toContain(workspacePackageDir);
    expect(diagnostic?.hint).not.toContain(globalPackageRoot);
    expect(result.stderr).toBe("");
  });

  test("reports workspace package search directory failures in JSON-mode check diagnostics", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const linkedWorkspaceDir = path.join(appDir, "packages");
    const realWorkspaceDir = path.join(tempDir, "outside-workspace-packages");
    const realPackageDir = path.join(realWorkspaceDir, "pkg-math");
    const homeDir = path.join(tempDir, "home");
    const globalPackageDir = path.join(homeDir, ".bpl", "packages");
    const globalPackageRoot = path.join(globalPackageDir, "pkg-math-9.0.0");
    const sourceFile = path.join(sourceDir, "workspace_search_dir_import.bpl");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(realPackageDir, { recursive: true });
    fs.mkdirSync(globalPackageRoot, { recursive: true });

    for (const [packageDir, version] of [
      [realPackageDir, "1.0.0"],
      [globalPackageRoot, "9.0.0"],
    ] as const) {
      writePackageFixture(packageDir, { version });
    }
    fs.symlinkSync(realWorkspaceDir, linkedWorkspaceDir, "dir");
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "pkg-math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const result = runCli(["check", "--json", sourceFile], {
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    const diagnostic = expectSingleCheckJsonDiagnostic(result, sourceFile);
    expect(diagnostic.code).toBe("BPL_PACKAGE_SEARCH_DIR_SYMLINK");
    expect(diagnostic.source?.preview).toContain(
      'import value from "pkg-math";',
    );
    expect(diagnostic?.message).toContain("invalid package search directory");
    expect(diagnostic?.message).toContain("symbolic link");
    expect(diagnostic?.message).toContain(linkedWorkspaceDir);
    expect(diagnostic?.hint).toContain("Searched paths:");
    expect(diagnostic?.hint).toContain(linkedWorkspaceDir);
    expect(diagnostic?.hint).not.toContain(realPackageDir);
    expect(diagnostic?.hint).not.toContain(globalPackageRoot);
    expect(result.stderr).toBe("");
  });

  test("reports global package search directory failures in JSON-mode check diagnostics", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const homeDir = path.join(tempDir, "home");
    const bplHomeDir = path.join(homeDir, ".bpl");
    const linkedGlobalPackageDir = path.join(bplHomeDir, "packages");
    const realGlobalPackageDir = path.join(tempDir, "outside-global-packages");
    const realGlobalPackageRoot = path.join(
      realGlobalPackageDir,
      "pkg-math-9.0.0",
    );
    const sourceFile = path.join(sourceDir, "global_search_dir_import.bpl");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(bplHomeDir, { recursive: true });
    writePackageFixture(realGlobalPackageRoot, { version: "9.0.0" });
    fs.symlinkSync(realGlobalPackageDir, linkedGlobalPackageDir, "dir");
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "pkg-math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const result = runCli(["check", "--json", sourceFile], {
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    const diagnostic = expectSingleCheckJsonDiagnostic(result, sourceFile);
    expect(diagnostic.code).toBe("BPL_PACKAGE_SEARCH_DIR_SYMLINK");
    expect(diagnostic.source?.preview).toContain(
      'import value from "pkg-math";',
    );
    expect(diagnostic?.message).toContain(
      "Global package directory path is a symbolic link",
    );
    expect(diagnostic?.message).toContain("symbolic link");
    expect(diagnostic?.message).toContain(linkedGlobalPackageDir);
    expect(diagnostic?.hint).toContain("Move the symlink out of the way");
    expect(diagnostic?.hint).not.toContain(linkedGlobalPackageDir);
    expect(diagnostic?.hint).not.toContain(realGlobalPackageRoot);
    expect(diagnostic?.message).not.toContain(realGlobalPackageRoot);
    expect(result.stderr).toBe("");
  });

  test("reports package entrypoint symlink failures in JSON-mode check diagnostics", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const packageDir = path.join(appDir, "bpl_modules", "pkg-math");
    const outsideEntrypoint = path.join(tempDir, "outside-index.bpl");
    const linkedEntrypoint = path.join(packageDir, "index.bpl");
    const sourceFile = path.join(sourceDir, "entrypoint_symlink_import.bpl");
    fs.mkdirSync(sourceDir, { recursive: true });
    writePackageFixture(packageDir, { entrySource: null });
    fs.writeFileSync(outsideEntrypoint, "export value;");
    fs.symlinkSync(outsideEntrypoint, linkedEntrypoint, "file");
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "pkg-math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const result = runCli(["check", "--json", sourceFile]);
    const diagnostic = expectSingleCheckJsonDiagnostic(result, sourceFile);
    expect(diagnostic.code).toBe("BPL_PACKAGE_ENTRYPOINT_SYMLINK");
    expect(diagnostic.source?.preview).toContain(
      'import value from "pkg-math";',
    );
    expect(diagnostic?.message).toContain(
      "entrypoint resolves to a symbolic link candidate",
    );
    expect(diagnostic?.message).toContain(linkedEntrypoint);
    expect(diagnostic?.message).not.toContain(outsideEntrypoint);
    expect(diagnostic?.hint).toContain("Searched paths:");
    expect(diagnostic?.hint).toContain(linkedEntrypoint);
    expect(diagnostic?.hint).not.toContain(outsideEntrypoint);
    expect(result.stderr).toBe("");
  });

  test("reports package subpath symlink-parent failures in JSON-mode check diagnostics", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const packageDir = path.join(appDir, "bpl_modules", "pkg-math");
    const outsideFeatureDir = path.join(tempDir, "outside-feature");
    const linkedFeatureDir = path.join(packageDir, "features");
    const sourceFile = path.join(
      sourceDir,
      "subpath_symlink_parent_import.bpl",
    );
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(outsideFeatureDir);
    writePackageFixture(packageDir, { entrySource: "export root;" });
    fs.writeFileSync(path.join(outsideFeatureDir, "add.bpl"), "export value;");
    fs.symlinkSync(outsideFeatureDir, linkedFeatureDir, "dir");
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "pkg-math/features/add";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const result = runCli(["check", "--json", sourceFile]);
    const diagnostic = expectSingleCheckJsonDiagnostic(result, sourceFile);
    expect(diagnostic.code).toBe("BPL_PACKAGE_SUBPATH_SYMLINK");
    expect(diagnostic.source?.preview).toContain(
      'import value from "pkg-math/features/add";',
    );
    expect(diagnostic?.message).toContain(
      "subpath 'features/add' resolves to a symbolic link candidate",
    );
    expect(diagnostic?.message).toContain(linkedFeatureDir);
    expect(diagnostic?.message).not.toContain(outsideFeatureDir);
    expect(diagnostic?.hint).toContain("Searched paths:");
    expect(diagnostic?.hint).toContain(linkedFeatureDir);
    expect(diagnostic?.hint).not.toContain(outsideFeatureDir);
    expect(result.stderr).toBe("");
  });

  test("reports unsafe package entrypoints in JSON-mode check diagnostics", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const packageDir = path.join(appDir, "bpl_modules", "pkg-math");
    const outsideEntrypoint = path.join(appDir, "bpl_modules", "outside.bpl");
    const sourceFile = path.join(sourceDir, "unsafe_entrypoint_import.bpl");
    fs.mkdirSync(sourceDir, { recursive: true });
    writePackageFixture(packageDir, {
      main: "../outside.bpl",
      entrySource: null,
    });
    fs.writeFileSync(outsideEntrypoint, "export value;");
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "pkg-math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const result = runCli(["check", "--json", sourceFile]);
    const diagnostic = expectSingleCheckJsonDiagnostic(result, sourceFile);
    expect(diagnostic.code).toBe("BPL_PACKAGE_ENTRYPOINT_UNSAFE");
    expect(diagnostic.source?.preview).toContain(
      'import value from "pkg-math";',
    );
    expect(diagnostic?.message).toContain("unsafe entrypoint '../outside.bpl'");
    expect(diagnostic?.message).toContain("bpl.json");
    expect(diagnostic?.message).not.toContain(outsideEntrypoint);
    expect(diagnostic?.hint).toContain("unsafe entrypoint '../outside.bpl'");
    expect(diagnostic?.hint).not.toContain(outsideEntrypoint);
    expect(result.stderr).toBe("");
  });

  test("reports package case-mismatch failures in JSON-mode check diagnostics", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const packageDir = path.join(appDir, "bpl_modules", "pkg-math");
    const sourceFile = path.join(sourceDir, "case_mismatch_import.bpl");
    const realSubpath = path.join(packageDir, "features", "Add.bpl");
    const requestedSubpath = path.join(packageDir, "features", "add.bpl");
    fs.mkdirSync(path.dirname(realSubpath), { recursive: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    writePackageFixture(packageDir, { entrySource: "export root;" });
    fs.writeFileSync(realSubpath, "export value;");
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "pkg-math/features/add";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const result = runCli(["check", "--json", sourceFile]);
    const diagnostic = expectSingleCheckJsonDiagnostic(result, sourceFile);
    expect(diagnostic.code).toBe("BPL_PACKAGE_SUBPATH_CASE_MISMATCH");
    expect(diagnostic.source?.preview).toContain(
      'import value from "pkg-math/features/add";',
    );
    expect(diagnostic?.message).toContain(
      "subpath 'features/add' casing does not match",
    );
    expect(diagnostic?.message).toContain(requestedSubpath);
    expect(diagnostic?.message).toContain(realSubpath);
    expect(diagnostic?.hint).toContain("Use the exact filesystem casing");
    expect(diagnostic?.hint).toContain(requestedSubpath);
    expect(diagnostic?.hint).toContain(realSubpath);
    expect(result.stderr).toBe("");
  });

  test("reports seeded package import path failures in JSON-mode check diagnostics", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const packageDir = path.join(appDir, "bpl_modules", "pkg-math");
    const explicitSourceFileDirectory = path.join(
      packageDir,
      "features",
      "shadow.bpl",
    );
    fs.mkdirSync(sourceDir, { recursive: true });
    writePackageFixture(packageDir, { entrySource: "export root;" });
    fs.mkdirSync(path.join(packageDir, "features"), { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "features", "add.bpl"),
      "export value;",
    );
    fs.mkdirSync(explicitSourceFileDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(explicitSourceFileDirectory, "index.bpl"),
      "export shadowed;",
    );

    const seeds = [
      {
        name: "empty subpath segment",
        importPath: "pkg-math//feature",
        expectedCode: "BPL_PACKAGE_IMPORT_INVALID",
        expectedMessage: "Package imports cannot contain empty",
      },
      {
        name: "dot-dot subpath segment",
        importPath: "pkg-math/../secret",
        expectedCode: "BPL_PACKAGE_IMPORT_INVALID",
        expectedMessage: "Package imports cannot contain empty",
      },
      {
        name: "mixed extension path through file",
        importPath: "pkg-math/features/add.bpl/child",
        expectedCode: "BPL_PACKAGE_SUBPATH_NOT_FOUND",
        expectedMessage: "subpath 'features/add.bpl/child' was not found",
      },
      {
        name: "explicit source file shadowed by directory",
        importPath: "pkg-math/features/shadow.bpl",
        expectedCode: "BPL_PACKAGE_SUBPATH_NOT_FOUND",
        expectedMessage:
          "explicit package source-file imports ending in .bpl or .x do not fall back to directory indexes",
      },
    ] as const;

    for (const seed of seeds) {
      const sourceFile = path.join(
        sourceDir,
        `${seed.name.replace(/[^a-z0-9]+/g, "_")}.bpl`,
      );
      fs.writeFileSync(
        sourceFile,
        [
          `import value from "${seed.importPath}";`,
          "frame main() ret int {",
          "    return 0;",
          "}",
        ].join("\n"),
      );

      const result = runCli(["check", "--json", sourceFile]);
      const diagnostic = expectSingleCheckJsonDiagnostic(result, sourceFile);
      expect(diagnostic.code, seed.name).toBe(seed.expectedCode);
      expect(diagnostic.source?.preview, seed.name).toContain(
        `import value from "${seed.importPath}";`,
      );
      expect(diagnostic.message, seed.name).toContain(seed.expectedMessage);
      expect(diagnostic.hint, seed.name).toContain(seed.expectedMessage);
      expect(result.stderr, seed.name).toBe("");
    }
  });

  test("reports package manifest symlink failures in JSON-mode check diagnostics", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const packageDir = path.join(appDir, "bpl_modules", "pkg-math");
    const linkedManifest = path.join(packageDir, "bpl.json");
    const outsideManifest = path.join(tempDir, "outside-bpl.json");
    const sourceFile = path.join(sourceDir, "manifest_symlink_import.bpl");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      outsideManifest,
      JSON.stringify({
        name: "pkg-math",
        version: "1.0.0",
        main: "index.bpl",
      }),
    );
    fs.symlinkSync(outsideManifest, linkedManifest, "file");
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "pkg-math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const result = runCli(["check", "--json", sourceFile]);
    const diagnostic = expectSingleCheckJsonDiagnostic(result, sourceFile);
    expect(diagnostic.code).toBe("BPL_PACKAGE_MANIFEST_SYMLINK");
    expect(diagnostic.source?.preview).toContain(
      'import value from "pkg-math";',
    );
    expect(diagnostic?.message).toContain("invalid bpl.json");
    expect(diagnostic?.message).toContain("manifest path is a symbolic link");
    expect(diagnostic?.message).toContain(linkedManifest);
    expect(diagnostic?.message).not.toContain(outsideManifest);
    expect(diagnostic?.hint).toContain("invalid bpl.json");
    expect(diagnostic?.hint).toContain("manifest path is a symbolic link");
    expect(diagnostic?.hint).toContain(linkedManifest);
    expect(diagnostic?.hint).not.toContain(outsideManifest);
    expect(result.stderr).toBe("");
  });

  test("reports malformed package manifests in JSON-mode check and build diagnostics", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const packageDir = path.join(appDir, "bpl_modules", "pkg-math");
    const manifestPath = path.join(packageDir, "bpl.json");
    const sourceFile = path.join(sourceDir, "malformed_manifest_import.bpl");
    const buildOutput = path.join(tempDir, "malformed-manifest-app");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(manifestPath, "{not-json");
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "pkg-math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const checkDiagnostic = expectSingleCheckJsonDiagnostic(
      runCli(["check", "--json", sourceFile]),
      sourceFile,
    );
    expect(checkDiagnostic.code).toBe("BPL_PACKAGE_MANIFEST_PARSE_ERROR");
    expect(checkDiagnostic.source?.preview).toContain(
      'import value from "pkg-math";',
    );
    expect(checkDiagnostic.message).toContain("invalid bpl.json");
    expect(checkDiagnostic.message).toContain("manifest is not valid JSON");
    expect(checkDiagnostic.message).toContain(manifestPath);
    expect(checkDiagnostic.hint).toContain("manifest is not valid JSON");
    expect(checkDiagnostic.hint).toContain(manifestPath);

    const build = runCli(["build", sourceFile, "--json", "-o", buildOutput]);
    expect(build.status).toBe(1);
    expect(build.stderr).toBe("");
    const buildReport = parseJsonObjectStdout<{
      schemaVersion: number;
      check: string;
      success: boolean;
      file: string;
      diagnostics: Array<{
        code?: string;
        message: string;
        hint: string;
      }>;
    }>(build);
    expect(buildReport).toMatchObject({
      schemaVersion: 1,
      check: "build",
      success: false,
      file: sourceFile,
      diagnostics: [
        {
          code: "BPL_PACKAGE_MANIFEST_PARSE_ERROR",
        },
      ],
    });
    const buildDiagnostic = buildReport.diagnostics[0];
    expect(buildDiagnostic).toBeDefined();
    expect(buildDiagnostic?.message).toContain("manifest is not valid JSON");
    expect(buildDiagnostic?.message).toContain(manifestPath);
    expect(buildDiagnostic?.hint).toContain("manifest is not valid JSON");
    expect(buildDiagnostic?.hint).toContain(manifestPath);
    expect(fs.existsSync(`${buildOutput}.ll`)).toBe(false);
    expect(fs.existsSync(buildOutput)).toBe(false);
  });

  test("reports missing package manifests in JSON-mode check diagnostics", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const localPackageDir = path.join(appDir, "bpl_modules", "pkg-math");
    const localManifest = path.join(localPackageDir, "bpl.json");
    const workspacePackageDir = path.join(appDir, "packages", "pkg-math");
    const homeDir = path.join(tempDir, "home");
    const globalPackageDir = path.join(homeDir, ".bpl", "packages");
    const globalPackageRoot = path.join(globalPackageDir, "pkg-math-9.0.0");
    const sourceFile = path.join(sourceDir, "missing_manifest_import.bpl");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(localPackageDir, { recursive: true });
    fs.writeFileSync(path.join(localPackageDir, "index.bpl"), "export value;");
    writePackageFixture(workspacePackageDir, { version: "2.0.0" });
    writePackageFixture(globalPackageRoot, { version: "9.0.0" });
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "pkg-math";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const result = runCli(["check", "--json", sourceFile], {
      env: { HOME: homeDir, USERPROFILE: homeDir },
    });
    const diagnostic = expectSingleCheckJsonDiagnostic(result, sourceFile);
    expect(diagnostic.code).toBe("BPL_PACKAGE_MANIFEST_MISSING");
    expect(diagnostic.source?.preview).toContain(
      'import value from "pkg-math";',
    );
    expect(diagnostic?.message).toContain("missing bpl.json");
    expect(diagnostic?.message).toContain(localManifest);
    expect(diagnostic?.hint).toContain("missing bpl.json");
    expect(diagnostic?.hint).toContain(localManifest);
    expect(diagnostic?.hint).not.toContain(workspacePackageDir);
    expect(diagnostic?.hint).not.toContain(globalPackageRoot);
    expect(result.stderr).toBe("");
  });

  test("reports package subpath file symlink failures in JSON-mode check diagnostics", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const packageDir = path.join(appDir, "bpl_modules", "pkg-math");
    const featureDir = path.join(packageDir, "features");
    const linkedFeature = path.join(featureDir, "add.bpl");
    const fallbackFeature = path.join(featureDir, "add.x");
    const outsideFeature = path.join(tempDir, "outside-add.bpl");
    const sourceFile = path.join(sourceDir, "subpath_file_symlink_import.bpl");
    fs.mkdirSync(sourceDir, { recursive: true });
    writePackageFixture(packageDir, { entrySource: "export root;" });
    fs.mkdirSync(featureDir);
    fs.writeFileSync(outsideFeature, "export value;");
    fs.symlinkSync(outsideFeature, linkedFeature, "file");
    fs.writeFileSync(fallbackFeature, "export legacy;");
    fs.writeFileSync(
      sourceFile,
      [
        'import value from "pkg-math/features/add";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );

    const result = runCli(["check", "--json", sourceFile]);
    const diagnostic = expectSingleCheckJsonDiagnostic(result, sourceFile);
    expect(diagnostic.code).toBe("BPL_PACKAGE_SUBPATH_SYMLINK");
    expect(diagnostic.source?.preview).toContain(
      'import value from "pkg-math/features/add";',
    );
    expect(diagnostic?.message).toContain(
      "subpath 'features/add' resolves to a symbolic link candidate",
    );
    expect(diagnostic?.message).toContain(linkedFeature);
    expect(diagnostic?.message).not.toContain(outsideFeature);
    expect(diagnostic?.hint).toContain("Searched paths:");
    expect(diagnostic?.hint).toContain(linkedFeature);
    expect(diagnostic?.hint).not.toContain(fallbackFeature);
    expect(diagnostic?.hint).not.toContain(outsideFeature);
    expect(result.stderr).toBe("");
  });

  test("reports virtual source diagnostics in JSON-mode build failures", () => {
    const source = [
      "frame main() {",
      '    local value: int = "not an int";',
      "}",
    ].join("\n");

    const expectVirtualDiagnostic = (
      result: SpawnSyncReturns<string>,
      file: "<eval>" | "<stdin>",
    ) => {
      expect(result.status).toBe(1);
      const report = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        file: string;
        diagnostics: Array<{
          message: string;
          location: {
            file: string;
            start: { line: number; column: number };
          };
          source?: { line: string };
        }>;
      }>(result);
      expect(report).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        file,
        diagnostics: [
          {
            location: {
              file,
              start: { line: 2, column: 5 },
            },
            source: {
              line: '    local value: int = "not an int";',
            },
          },
        ],
      });
      expect(report.diagnostics[0]?.message).toContain("Type mismatch");
    };

    expectVirtualDiagnostic(runCli(["--eval", source, "--json"]), "<eval>");
    expectVirtualDiagnostic(
      runCli(["--stdin", "--json"], { input: source }),
      "<stdin>",
    );
  });

  test("keeps JSON-mode build validation failures parseable on stdout", () => {
    const sourceDir = path.join(tempDir, "source-dir");
    fs.mkdirSync(sourceDir);

    const assertValidationFailure = (
      result: SpawnSyncReturns<string>,
      expectedError: string,
      expectedFile?: string,
      expectedErrorCode?: string,
    ) => {
      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(parseJsonObjectStdout(result)).toMatchObject({
        schemaVersion: 1,
        check: "build",
        success: false,
        ...(expectedFile ? { file: expectedFile } : {}),
        error: expect.stringContaining(expectedError),
        ...(expectedErrorCode ? { errorCode: expectedErrorCode } : {}),
      });
    };

    const inputFailure = runCli(["build", sourceDir, "--json"]);
    assertValidationFailure(
      inputFailure,
      "Input path is not a file",
      sourceDir,
      "BPL_BUILD_INPUT_NOT_FILE",
    );

    const validSource = path.join(tempDir, "valid.bpl");
    const missingSource = path.join(tempDir, "missing.bpl");
    const missingParentOutput = path.join(tempDir, "missing", "app");
    fs.writeFileSync(validSource, "frame main() ret int { return 0; }\n");

    assertValidationFailure(
      runCli(["build", missingSource, "--json"]),
      "File not found",
      missingSource,
      "BPL_BUILD_INPUT_NOT_FOUND",
    );

    const validationCases: Array<[string[], string, string]> = [
      [
        ["build", validSource, "--json", "-O", "debug"],
        "Invalid optimization",
        "BPL_BUILD_INVALID_OPTIMIZATION",
      ],
      [
        ["build", validSource, "--json", "--emit", "bytecode"],
        "Invalid emit",
        "BPL_BUILD_INVALID_EMIT",
      ],
      [
        ["build", validSource, "--json", "--wasm-runtime", "wasi"],
        "Invalid wasm runtime",
        "BPL_BUILD_INVALID_WASM_RUNTIME",
      ],
      [
        ["build", validSource, "--json", "--jobs", "0"],
        "Invalid jobs count",
        "BPL_BUILD_INVALID_JOBS",
      ],
      [
        [
          "build",
          validSource,
          "--json",
          "--emit",
          "llvm",
          "--target",
          "mips64-unknown-bpl",
        ],
        "Unsupported target triple",
        "BPL_BUILD_UNSUPPORTED_TARGET",
      ],
      [
        ["build", validSource, "--json", "--emit", "llvm", "--target", ""],
        'Unsupported target triple ""',
        "BPL_BUILD_UNSUPPORTED_TARGET",
      ],
      [
        [
          "build",
          validSource,
          "--json",
          "--emit",
          "llvm",
          "--target",
          " x86_64-pc-linux-gnu ",
        ],
        'Unsupported target triple " x86_64-pc-linux-gnu "',
        "BPL_BUILD_UNSUPPORTED_TARGET",
      ],
      [
        [
          "build",
          validSource,
          "--json",
          "--emit",
          "llvm",
          "--target",
          "x86_64-unknown-notlinux-gnu",
        ],
        'Unsupported target triple "x86_64-unknown-notlinux-gnu"',
        "BPL_BUILD_UNSUPPORTED_TARGET",
      ],
      [
        [
          "build",
          validSource,
          "--json",
          "--emit",
          "llvm",
          "--target",
          "x86_64--linux",
        ],
        'Unsupported target triple "x86_64--linux"',
        "BPL_BUILD_UNSUPPORTED_TARGET",
      ],
    ];

    for (const [args, expectedError, expectedErrorCode] of validationCases) {
      assertValidationFailure(
        runCli(args),
        expectedError,
        validSource,
        expectedErrorCode,
      );
    }

    const outputFailure = runCli([
      "build",
      validSource,
      "--json",
      "-o",
      missingParentOutput,
    ]);
    assertValidationFailure(
      outputFailure,
      "Output directory not found",
      validSource,
      "BPL_BUILD_OUTPUT_PARENT_NOT_FOUND",
    );
    expect(fs.existsSync(`${missingParentOutput}.ll`)).toBe(false);

    const executableDirectoryOutput = path.join(tempDir, "app-dir");
    fs.mkdirSync(executableDirectoryOutput);
    const executablePathFailure = runCli([
      "build",
      validSource,
      "--json",
      "-o",
      executableDirectoryOutput,
    ]);
    assertValidationFailure(
      executablePathFailure,
      "Output path is a directory",
      validSource,
      "BPL_BUILD_OUTPUT_DIRECTORY",
    );
    expect(fs.existsSync(`${executableDirectoryOutput}.ll`)).toBe(false);
  });
});
