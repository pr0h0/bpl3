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
      "Use std/<path> without empty, '.', or '..' path segments.",
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

  test("reports module path diagnostic codes in JSON-mode check and build diagnostics", () => {
    const missingFile = path.join(tempDir, "missing_module_import.bpl");
    const missingOutput = path.join(tempDir, "missing-module-app");
    const unsafeStdFile = path.join(tempDir, "unsafe_std_check.bpl");
    const symlinkDir = path.join(tempDir, "broken-module-symlink");
    const symlinkFile = path.join(symlinkDir, "main.bpl");
    const brokenCandidate = path.join(symlinkDir, "linked.bpl");
    const fallbackCandidate = path.join(symlinkDir, "linked.x");
    fs.mkdirSync(symlinkDir, { recursive: true });

    fs.writeFileSync(
      missingFile,
      [
        'import value from "./does_not_exist.bpl";',
        "frame main() ret int {",
        "    return 0;",
        "}",
      ].join("\n"),
    );
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
      "Use std/<path> without empty, '.', or '..' path segments.",
    );
    expect(unsafeStdCheck.stderr).toBe("");

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
    expect(diagnostic.code).toBe("BPL_PACKAGE_MANIFEST_INVALID");
    expect(diagnostic.source?.preview).toContain(
      'import value from "pkg-math";',
    );
    expect(diagnostic?.message).toContain("invalid bpl.json");
    expect(diagnostic?.message).toContain(linkedManifest);
    expect(diagnostic?.message).not.toContain(outsideManifest);
    expect(diagnostic?.hint).toContain("invalid bpl.json");
    expect(diagnostic?.hint).toContain(linkedManifest);
    expect(diagnostic?.hint).not.toContain(outsideManifest);
    expect(result.stderr).toBe("");
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
