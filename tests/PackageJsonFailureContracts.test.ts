import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import { expectJsonStdoutReport } from "./helpers/cliJson";

const BPL_CLI = join(import.meta.dir, "..", "index.ts");

type CommandContext = {
  cwd: string;
  env: NodeJS.ProcessEnv;
};

describe("Package JSON failure contracts", () => {
  test("inventories package command empty failure shapes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-package-json-failures-"));

    try {
      const cases: Array<{
        name: string;
        args: string[];
        context: () => CommandContext;
        expected: Record<string, unknown>;
      }> = [
        {
          name: "install",
          args: ["install", "--json"],
          context: () => cleanPackageRoot(tempDir, "install"),
          expected: {
            schemaVersion: 1,
            check: "package-install",
            success: false,
            mode: "project",
            target: null,
            global: false,
            locked: false,
            update: false,
            repairLock: false,
          },
        },
        {
          name: "list",
          args: ["list", "--json"],
          context: () => unsafeLocalPackageRoot(tempDir, "list"),
          expected: {
            schemaVersion: 1,
            check: "package-list",
            success: false,
            scope: "local",
            packages: [],
            errorCode: "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
          },
        },
        {
          name: "list-tree",
          args: ["list", "--tree", "--json"],
          context: () => unsafeLocalPackageRoot(tempDir, "list-tree"),
          expected: {
            schemaVersion: 1,
            check: "package-list-tree",
            success: false,
            scope: "local",
            tree: [],
            errorCode: "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
          },
        },
        {
          name: "cache-list",
          args: ["package-cache", "list", "--json"],
          context: () => unsafeCacheRoot(tempDir, "cache-list"),
          expected: {
            schemaVersion: 1,
            check: "package-cache-list",
            success: false,
            entries: [],
            errorCode: "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
          },
        },
        {
          name: "cache-verify",
          args: ["package-cache", "verify", "--json"],
          context: () => unsafeCacheRoot(tempDir, "cache-verify"),
          expected: {
            schemaVersion: 1,
            check: "package-cache-verify",
            success: false,
            ok: false,
            entriesChecked: 0,
            issues: [],
            errorCode: "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
          },
        },
        {
          name: "cache-clean",
          args: [
            "package-cache",
            "clean",
            "pkg",
            "--package-version",
            "^1.0.0",
            "--dry-run",
            "--json",
          ],
          context: () => cleanPackageRoot(tempDir, "cache-clean"),
          expected: {
            schemaVersion: 1,
            check: "package-cache-clean",
            success: false,
            removed: [],
            dryRun: true,
          },
        },
        {
          name: "cache-repair",
          args: [
            "package-cache",
            "repair",
            "pkg",
            "--package-version",
            "latest",
            "--dry-run",
            "--json",
          ],
          context: () => cleanPackageRoot(tempDir, "cache-repair"),
          expected: {
            schemaVersion: 1,
            check: "package-cache-repair",
            success: false,
            dryRun: true,
            repaired: [],
            unchanged: [],
            issues: [],
          },
        },
      ];

      for (const testCase of cases) {
        const context = testCase.context();
        const result = runCli(testCase.args, context);
        const report = expectJsonStdoutReport(result, {
          status: 1,
          check: String(testCase.expected.check),
          success: false,
        });
        expect(report).toMatchObject({
          ...testCase.expected,
          error: expect.any(String),
        });
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("surfaces stable package install error codes when available", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-package-install-codes-"));

    try {
      const lockfileDir = cleanPackageRoot(tempDir, "invalid-lockfile");
      writeFileSync(
        join(lockfileDir.cwd, "bpl.json"),
        JSON.stringify({ name: "invalid-lockfile", version: "1.0.0" }),
      );
      writeFileSync(
        join(lockfileDir.cwd, "bpl.lock"),
        JSON.stringify({ lockfileVersion: 2, packages: {} }),
      );

      const lockfileResult = runCli(
        ["install", "--locked", "--json"],
        lockfileDir,
      );
      const lockfileReport = expectJsonStdoutReport(lockfileResult, {
        status: 1,
        check: "package-install",
        success: false,
      });
      expect(lockfileReport).toMatchObject({
        mode: "project",
        target: null,
        error: expect.stringContaining("Only lockfileVersion 1 is supported"),
        errorCode: "BPL_LOCKFILE_UNSUPPORTED_VERSION",
      });

      const missingPackageResult = runCli(
        ["install", "missing-package", "--json"],
        cleanPackageRoot(tempDir, "missing-package"),
      );
      const missingPackageReport = expectJsonStdoutReport(
        missingPackageResult,
        {
          status: 1,
          check: "package-install",
          success: false,
        },
      );
      expect(missingPackageReport).toMatchObject({
        mode: "package",
        target: "missing-package",
        error: expect.stringContaining("Package not found"),
        errorCode: "BPL_PACKAGE_NOT_FOUND",
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("surfaces stable package install option conflict error codes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-package-option-codes-"));

    try {
      const cases: Array<{
        name: string;
        args: string[];
        context: CommandContext;
        expectedCode: string;
        expectedError: string;
      }> = [
        {
          name: "package-with-update",
          args: ["install", "pkg", "--update", "--json"],
          context: cleanPackageRoot(tempDir, "package-with-update"),
          expectedCode: "BPL_PACKAGE_INSTALL_PROJECT_OPTION_WITH_PACKAGE",
          expectedError: "--update and --repair-lock are project install options",
        },
        {
          name: "locked-update",
          args: ["install", "--locked", "--update", "--json"],
          context: projectManifestRoot(tempDir, "locked-update"),
          expectedCode: "BPL_PACKAGE_INSTALL_LOCKED_UPDATE_CONFLICT",
          expectedError: "Cannot use --locked with --update",
        },
        {
          name: "global-project-install",
          args: ["install", "--global", "--json"],
          context: projectManifestRoot(tempDir, "global-project-install"),
          expectedCode: "BPL_PACKAGE_INSTALL_GLOBAL_PROJECT_CONFLICT",
          expectedError: "Project dependency install cannot be global",
        },
        {
          name: "locked-repair",
          args: ["install", "--locked", "--repair-lock", "--json"],
          context: projectManifestRoot(tempDir, "locked-repair"),
          expectedCode: "BPL_PACKAGE_INSTALL_LOCKED_REPAIR_CONFLICT",
          expectedError: "Cannot use --locked with --repair-lock",
        },
        {
          name: "update-repair",
          args: ["install", "--update", "--repair-lock", "--json"],
          context: projectManifestRoot(tempDir, "update-repair"),
          expectedCode: "BPL_PACKAGE_INSTALL_UPDATE_REPAIR_CONFLICT",
          expectedError: "Cannot use --update with --repair-lock",
        },
      ];

      for (const testCase of cases) {
        const report = expectJsonStdoutReport(runCli(testCase.args, testCase.context), {
          status: 1,
          check: "package-install",
          success: false,
        });
        expect(report).toMatchObject({
          error: expect.stringContaining(testCase.expectedError),
          errorCode: testCase.expectedCode,
        });
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("surfaces stable direct archive path validation error codes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-package-archive-codes-"));

    try {
      const realArchive = join(tempDir, "real-package.tgz");
      writeFileSync(realArchive, "not a real archive");

      const symlinkArchive = join(tempDir, "linked-package.tgz");
      symlinkSync(realArchive, symlinkArchive);

      const realParent = join(tempDir, "real-parent");
      const linkedParent = join(tempDir, "linked-parent");
      mkdirSync(realParent);
      writeFileSync(join(realParent, "parent-package.tgz"), "not a real archive");
      symlinkSync(realParent, linkedParent, "dir");

      const directoryArchive = join(tempDir, "directory-package.tgz");
      mkdirSync(directoryArchive);

      const cases: Array<{
        args: string[];
        expectedCode: string;
        expectedError: string;
      }> = [
        {
          args: ["install", symlinkArchive, "--json"],
          expectedCode: "BPL_PACKAGE_ARCHIVE_SYMLINK",
          expectedError: "Package archive path is a symbolic link",
        },
        {
          args: ["install", join(linkedParent, "parent-package.tgz"), "--json"],
          expectedCode: "BPL_PACKAGE_ARCHIVE_PARENT_SYMLINK",
          expectedError: "Package archive parent path is a symbolic link",
        },
        {
          args: ["install", directoryArchive, "--json"],
          expectedCode: "BPL_PACKAGE_ARCHIVE_NOT_FILE",
          expectedError: "Package archive path is not a file",
        },
      ];

      for (const testCase of cases) {
        const report = expectJsonStdoutReport(
          runCli(testCase.args, cleanPackageRoot(tempDir, testCase.expectedCode)),
          {
            status: 1,
            check: "package-install",
            success: false,
          },
        );
        expect(report).toMatchObject({
          mode: "package",
          error: expect.stringContaining(testCase.expectedError),
          errorCode: testCase.expectedCode,
        });
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function runCli(
  args: string[],
  context: CommandContext,
): SpawnSyncReturns<string> {
  return spawnSync("bun", [BPL_CLI, ...args], {
    cwd: context.cwd,
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1", ...context.env },
  });
}

function unsafeLocalPackageRoot(root: string, name: string): CommandContext {
  const cwd = join(root, name);
  const home = join(root, `${name}-home`);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(join(cwd, "bpl_modules"), "not a directory");
  return { cwd, env: { HOME: home } };
}

function unsafeCacheRoot(root: string, name: string): CommandContext {
  const cwd = join(root, `${name}-cwd`);
  const home = join(root, `${name}-home`);
  const bplHome = join(home, ".bpl");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(bplHome, { recursive: true });
  writeFileSync(join(bplHome, "packages"), "not a directory");
  return { cwd, env: { HOME: home } };
}

function cleanPackageRoot(root: string, name: string): CommandContext {
  const cwd = join(root, `${name}-cwd`);
  const home = join(root, `${name}-home`);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(home, { recursive: true });
  return { cwd, env: { HOME: home } };
}

function projectManifestRoot(root: string, name: string): CommandContext {
  const context = cleanPackageRoot(root, name);
  writeFileSync(
    join(context.cwd, "bpl.json"),
    JSON.stringify({ name, version: "1.0.0" }),
  );
  return context;
}
