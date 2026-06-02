import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import { expectJsonStdoutReport } from "./helpers/cliJson";
import {
  PACKAGE_ARCHIVE_JSON_ERROR_CODES,
  PACKAGE_CACHE_JSON_ERROR_CODES,
  PACKAGE_INIT_JSON_ERROR_CODES,
  PACKAGE_INSTALL_JSON_ERROR_CODES,
  PACKAGE_LIST_JSON_ERROR_CODES,
  PACKAGE_MANIFEST_JSON_ERROR_CODES,
  PACKAGE_UNINSTALL_JSON_ERROR_CODES,
} from "../compiler/middleend/PackageManager";

const BPL_CLI = join(import.meta.dir, "..", "index.ts");

type CommandContext = {
  cwd: string;
  env: NodeJS.ProcessEnv;
};

describe("Package JSON failure contracts", () => {
  test("keeps PackageManager JSON error-code lists stable", () => {
    const lists = [
      { name: "package-init", codes: PACKAGE_INIT_JSON_ERROR_CODES },
      { name: "package-uninstall", codes: PACKAGE_UNINSTALL_JSON_ERROR_CODES },
      { name: "package-cache", codes: PACKAGE_CACHE_JSON_ERROR_CODES },
      { name: "package-install", codes: PACKAGE_INSTALL_JSON_ERROR_CODES },
      { name: "package-list", codes: PACKAGE_LIST_JSON_ERROR_CODES },
      { name: "package-archive", codes: PACKAGE_ARCHIVE_JSON_ERROR_CODES },
      { name: "package-manifest", codes: PACKAGE_MANIFEST_JSON_ERROR_CODES },
    ];

    for (const { name, codes } of lists) {
      expect(codes.length, `${name} exports at least one code`).toBeGreaterThan(
        0,
      );
      expect([...new Set(codes)], `${name} has no duplicate codes`).toEqual([
        ...codes,
      ]);
      for (const code of codes) {
        expect(code, `${name} uses stable BPL_* codes`).toMatch(
          /^BPL_[A-Z0-9_]+$/,
        );
      }
    }

    expect([...PACKAGE_LIST_JSON_ERROR_CODES]).toEqual([
      "BPL_PACKAGE_SEARCH_DIR_SYMLINK",
      "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
      "BPL_PACKAGE_SEARCH_DIR_PARENT_NOT_DIRECTORY",
      "BPL_PACKAGE_SEARCH_DIR_PARENT_SYMLINK",
      "BPL_PACKAGE_DUPLICATE_INSTALLED",
    ]);
  });

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

  test("surfaces stable package-cache version filter error codes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-package-cache-codes-"));

    try {
      const cases: Array<{
        args: string[];
        expectedCheck: string;
        expectedPayload: Record<string, unknown>;
      }> = [
        {
          args: [
            "package-cache",
            "clean",
            "pkg",
            "--package-version",
            "^1.0.0",
            "--dry-run",
            "--json",
          ],
          expectedCheck: "package-cache-clean",
          expectedPayload: {
            removed: [],
            dryRun: true,
          },
        },
        {
          args: [
            "package-cache",
            "repair",
            "pkg",
            "--package-version",
            "latest",
            "--dry-run",
            "--json",
          ],
          expectedCheck: "package-cache-repair",
          expectedPayload: {
            dryRun: true,
            repaired: [],
            unchanged: [],
            issues: [],
          },
        },
        {
          args: [
            "package-cache",
            "clean",
            "pkg",
            "--package-version",
            "01.0.0",
            "--dry-run",
            "--json",
          ],
          expectedCheck: "package-cache-clean",
          expectedPayload: {
            removed: [],
            dryRun: true,
          },
        },
      ];

      for (const testCase of cases) {
        const report = expectJsonStdoutReport(
          runCli(
            testCase.args,
            cleanPackageRoot(tempDir, testCase.expectedCheck),
          ),
          {
            status: 1,
            check: testCase.expectedCheck,
            success: false,
          },
        );
        expect(report).toMatchObject({
          ...testCase.expectedPayload,
          error: expect.stringContaining("Invalid package cache version filter"),
          errorCode: "BPL_PACKAGE_CACHE_VERSION_INVALID",
        });
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("surfaces stable package-cache package filter error codes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-package-cache-name-codes-"));

    try {
      const cases: Array<{
        args: string[];
        expectedCheck: string;
        expectedPayload: Record<string, unknown>;
      }> = [
        {
          args: ["package-cache", "list", "Bad_Name", "--json"],
          expectedCheck: "package-cache-list",
          expectedPayload: { entries: [] },
        },
        {
          args: ["package-cache", "verify", "Bad_Name", "--json"],
          expectedCheck: "package-cache-verify",
          expectedPayload: {
            ok: false,
            entriesChecked: 0,
            issues: [],
          },
        },
        {
          args: [
            "package-cache",
            "clean",
            "Bad_Name",
            "--dry-run",
            "--json",
          ],
          expectedCheck: "package-cache-clean",
          expectedPayload: {
            removed: [],
            dryRun: true,
          },
        },
        {
          args: [
            "package-cache",
            "repair",
            "Bad_Name",
            "--dry-run",
            "--json",
          ],
          expectedCheck: "package-cache-repair",
          expectedPayload: {
            dryRun: true,
            repaired: [],
            unchanged: [],
            issues: [],
          },
        },
      ];

      for (const testCase of cases) {
        const report = expectJsonStdoutReport(
          runCli(
            testCase.args,
            cleanPackageRoot(tempDir, testCase.expectedCheck),
          ),
          {
            status: 1,
            check: testCase.expectedCheck,
            success: false,
          },
        );
        expect(report).toMatchObject({
          ...testCase.expectedPayload,
          error: expect.stringContaining("Invalid package name"),
          errorCode: "BPL_PACKAGE_CACHE_NAME_INVALID",
        });
      }
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
        expectedPayload?: Record<string, unknown>;
      }> = [
        {
          name: "package-with-update",
          args: ["install", "pkg", "--update", "--json"],
          context: cleanPackageRoot(tempDir, "package-with-update"),
          expectedCode: "BPL_PACKAGE_INSTALL_PROJECT_OPTION_WITH_PACKAGE",
          expectedError:
            "--locked, --update, and --repair-lock are project install options",
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
        {
          name: "locked-verify-failed",
          args: ["install", "--locked", "--json"],
          context: lockedVerificationFailureRoot(tempDir),
          expectedCode: "BPL_PACKAGE_LOCK_VERIFY_FAILED",
          expectedError: "Lockfile verification failed",
          expectedPayload: {
            action: "verification-failed",
            packagesChecked: 1,
            issuesFound: 1,
            issueKinds: ["hash-mismatch"],
            issues: [
              {
                packageName: "locked-json-failure",
                kind: "hash-mismatch",
              },
            ],
          },
        },
      ];

      expect(cases.map((testCase) => testCase.expectedCode).sort()).toEqual(
        [...PACKAGE_INSTALL_JSON_ERROR_CODES].sort(),
      );

      for (const testCase of cases) {
        const report = expectJsonStdoutReport(runCli(testCase.args, testCase.context), {
          status: 1,
          check: "package-install",
          success: false,
        });
        expect(report).toMatchObject({
          error: expect.stringContaining(testCase.expectedError),
          errorCode: testCase.expectedCode,
          ...(testCase.expectedPayload ?? {}),
        });
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("surfaces stable package-list error codes and duplicate issue paths", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-package-list-codes-"));

    try {
      const searchDirCases: Array<{
        name: string;
        args: string[];
        context: () => CommandContext;
        expectedCheck: "package-list" | "package-list-tree";
        emptyKey: "packages" | "tree";
        expectedScope: "local" | "global";
        expectedCode: string;
        expectedError: string;
      }> = [
        {
          name: "local-not-directory",
          args: ["list", "--json"],
          context: () => unsafeLocalPackageRoot(tempDir, "local-not-directory"),
          expectedCheck: "package-list",
          emptyKey: "packages",
          expectedScope: "local",
          expectedCode: "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
          expectedError: "Local package directory path is not a directory",
        },
        {
          name: "local-tree-not-directory",
          args: ["list", "--tree", "--json"],
          context: () =>
            unsafeLocalPackageRoot(tempDir, "local-tree-not-directory"),
          expectedCheck: "package-list-tree",
          emptyKey: "tree",
          expectedScope: "local",
          expectedCode: "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
          expectedError: "Local package directory path is not a directory",
        },
        {
          name: "local-symlink",
          args: ["list", "--json"],
          context: () => symlinkedLocalPackageRoot(tempDir, "local-symlink"),
          expectedCheck: "package-list",
          emptyKey: "packages",
          expectedScope: "local",
          expectedCode: "BPL_PACKAGE_SEARCH_DIR_SYMLINK",
          expectedError: "Local package directory path is a symbolic link",
        },
        {
          name: "local-tree-symlink",
          args: ["list", "--tree", "--json"],
          context: () =>
            symlinkedLocalPackageRoot(tempDir, "local-tree-symlink"),
          expectedCheck: "package-list-tree",
          emptyKey: "tree",
          expectedScope: "local",
          expectedCode: "BPL_PACKAGE_SEARCH_DIR_SYMLINK",
          expectedError: "Local package directory path is a symbolic link",
        },
        {
          name: "global-parent-not-directory",
          args: ["list", "--global", "--json"],
          context: () =>
            globalPackageParentFileRoot(tempDir, "global-parent-not-directory"),
          expectedCheck: "package-list",
          emptyKey: "packages",
          expectedScope: "global",
          expectedCode: "BPL_PACKAGE_SEARCH_DIR_PARENT_NOT_DIRECTORY",
          expectedError: "Global package directory parent path is not a directory",
        },
        {
          name: "global-tree-parent-not-directory",
          args: ["list", "--global", "--tree", "--json"],
          context: () =>
            globalPackageParentFileRoot(
              tempDir,
              "global-tree-parent-not-directory",
            ),
          expectedCheck: "package-list-tree",
          emptyKey: "tree",
          expectedScope: "global",
          expectedCode: "BPL_PACKAGE_SEARCH_DIR_PARENT_NOT_DIRECTORY",
          expectedError: "Global package directory parent path is not a directory",
        },
        {
          name: "global-parent-symlink",
          args: ["list", "--global", "--json"],
          context: () =>
            globalPackageParentSymlinkRoot(tempDir, "global-parent-symlink"),
          expectedCheck: "package-list",
          emptyKey: "packages",
          expectedScope: "global",
          expectedCode: "BPL_PACKAGE_SEARCH_DIR_PARENT_SYMLINK",
          expectedError: "Global package directory parent path is a symbolic link",
        },
        {
          name: "global-tree-parent-symlink",
          args: ["list", "--global", "--tree", "--json"],
          context: () =>
            globalPackageParentSymlinkRoot(
              tempDir,
              "global-tree-parent-symlink",
            ),
          expectedCheck: "package-list-tree",
          emptyKey: "tree",
          expectedScope: "global",
          expectedCode: "BPL_PACKAGE_SEARCH_DIR_PARENT_SYMLINK",
          expectedError: "Global package directory parent path is a symbolic link",
        },
      ];

      const searchDirCodes = searchDirCases.map(
        (testCase) => testCase.expectedCode,
      );
      expect([...new Set(searchDirCodes)].sort()).toEqual(
        PACKAGE_LIST_JSON_ERROR_CODES.filter(
          (code) => code !== "BPL_PACKAGE_DUPLICATE_INSTALLED",
        ).sort(),
      );

      for (const testCase of searchDirCases) {
        const report = expectJsonStdoutReport(
          runCli(testCase.args, testCase.context()),
          {
            status: 1,
            check: testCase.expectedCheck,
            success: false,
          },
        );
        expect(report).toMatchObject({
          schemaVersion: 1,
          check: testCase.expectedCheck,
          success: false,
          scope: testCase.expectedScope,
          [testCase.emptyKey]: [],
          error: expect.stringContaining(testCase.expectedError),
          errorCode: testCase.expectedCode,
        });
      }

      const duplicateContext = duplicateInstalledPackageRoot(
        tempDir,
        "duplicate",
        "list-contract-duplicate",
      );
      const duplicateCases: Array<{
        args: string[];
        expectedCheck: "package-list" | "package-list-tree";
        emptyKey: "packages" | "tree";
      }> = [
        {
          args: ["list", "--json"],
          expectedCheck: "package-list",
          emptyKey: "packages",
        },
        {
          args: ["list", "--tree", "--json"],
          expectedCheck: "package-list-tree",
          emptyKey: "tree",
        },
      ];

      for (const testCase of duplicateCases) {
        const report = expectJsonStdoutReport(
          runCli(testCase.args, duplicateContext),
          {
            status: 1,
            check: testCase.expectedCheck,
            success: false,
          },
        );
        expect(report).toMatchObject({
          schemaVersion: 1,
          check: testCase.expectedCheck,
          success: false,
          scope: "local",
          [testCase.emptyKey]: [],
          errorCode: "BPL_PACKAGE_DUPLICATE_INSTALLED",
          issuesFound: 1,
          issueKinds: ["duplicate-installed-package"],
          issues: [
            {
              packageName: "list-contract-duplicate",
              kind: "duplicate-installed-package",
              path: duplicateContext.duplicatePaths.join(", "),
              paths: duplicateContext.duplicatePaths,
            },
          ],
        });
        expect(report.error).toContain(
          "Multiple installed directories declare package 'list-contract-duplicate'",
        );
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

      expect(cases.map((testCase) => testCase.expectedCode).sort()).toEqual(
        [...PACKAGE_ARCHIVE_JSON_ERROR_CODES].sort(),
      );

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

  test("surfaces stable package manifest error codes from install JSON", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-package-manifest-codes-"));

    try {
      const cases: Array<{
        name: string;
        setup: (context: CommandContext) => void;
        expectedCode: string;
        expectedError: string;
      }> = [
        {
          name: "missing-manifest",
          setup: () => {},
          expectedCode: "BPL_PACKAGE_MANIFEST_MISSING",
          expectedError: "No bpl.json found",
        },
        {
          name: "symlink-manifest",
          setup: (context) => {
            const outsideManifest = join(tempDir, "outside-bpl.json");
            writeFileSync(
              outsideManifest,
              JSON.stringify({ name: "pkg", version: "1.0.0" }),
            );
            symlinkSync(outsideManifest, join(context.cwd, "bpl.json"), "file");
          },
          expectedCode: "BPL_PACKAGE_MANIFEST_SYMLINK",
          expectedError: "Invalid package manifest path: symbolic link",
        },
        {
          name: "directory-manifest",
          setup: (context) => mkdirSync(join(context.cwd, "bpl.json")),
          expectedCode: "BPL_PACKAGE_MANIFEST_NOT_FILE",
          expectedError: "Invalid package manifest path",
        },
        {
          name: "invalid-json",
          setup: (context) => writeFileSync(join(context.cwd, "bpl.json"), "{"),
          expectedCode: "BPL_PACKAGE_MANIFEST_PARSE_ERROR",
          expectedError: "Failed to load package manifest",
        },
        {
          name: "array-manifest",
          setup: (context) =>
            writeFileSync(join(context.cwd, "bpl.json"), "[]"),
          expectedCode: "BPL_PACKAGE_MANIFEST_NOT_OBJECT",
          expectedError: "Invalid package manifest",
        },
        {
          name: "missing-name",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({ version: "1.0.0" }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_NAME_MISSING",
          expectedError: "Package manifest missing 'name' field",
        },
        {
          name: "invalid-name",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({ name: "Bad_Name", version: "1.0.0" }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_NAME_INVALID",
          expectedError: "Invalid package name",
        },
        {
          name: "missing-version",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({ name: "missing-version" }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_VERSION_MISSING",
          expectedError: "Package manifest missing 'version' field",
        },
        {
          name: "invalid-version",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({ name: "invalid-version", version: "latest" }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_VERSION_INVALID",
          expectedError: "Invalid version format",
        },
        {
          name: "invalid-main",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({
                name: "invalid-main",
                version: "1.0.0",
                main: "src//index.bpl",
              }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_MAIN_INVALID",
          expectedError: "Invalid package manifest 'main' field",
        },
        {
          name: "invalid-entry",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({
                name: "invalid-entry",
                version: "1.0.0",
                entry: "src//index.bpl",
              }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_ENTRY_INVALID",
          expectedError: "Invalid package manifest 'entry' field",
        },
        {
          name: "invalid-metadata",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({
                name: "invalid-metadata",
                version: "1.0.0",
                description: 42,
              }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_METADATA_INVALID",
          expectedError: "Invalid package manifest 'description' field",
        },
        {
          name: "invalid-exports",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({
                name: "invalid-exports",
                version: "1.0.0",
                exports: ["../outside.bpl"],
              }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_EXPORTS_INVALID",
          expectedError: "Invalid package manifest 'exports' field",
        },
        {
          name: "invalid-keywords",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({
                name: "invalid-keywords",
                version: "1.0.0",
                keywords: [42],
              }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_KEYWORDS_INVALID",
          expectedError: "Invalid package manifest 'keywords' field",
        },
        {
          name: "invalid-repository",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({
                name: "invalid-repository",
                version: "1.0.0",
                repository: { type: "git" },
              }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_REPOSITORY_INVALID",
          expectedError: "Invalid package manifest 'repository' field",
        },
        {
          name: "invalid-dependencies",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({
                name: "invalid-dependencies",
                version: "1.0.0",
                dependencies: { "Bad_Name": "1.0.0" },
              }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_DEPENDENCIES_INVALID",
          expectedError: "Invalid 'dependencies' package name",
        },
        {
          name: "invalid-scripts",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({
                name: "invalid-scripts",
                version: "1.0.0",
                scripts: [],
              }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_SCRIPTS_INVALID",
          expectedError: "Invalid 'scripts' field",
        },
        {
          name: "invalid-bin",
          setup: (context) =>
            writeFileSync(
              join(context.cwd, "bpl.json"),
              JSON.stringify({
                name: "invalid-bin",
                version: "1.0.0",
                bin: [],
              }),
            ),
          expectedCode: "BPL_PACKAGE_MANIFEST_BIN_INVALID",
          expectedError: "Invalid 'bin' field",
        },
      ];

      expect(cases.map((testCase) => testCase.expectedCode).sort()).toEqual(
        [...PACKAGE_MANIFEST_JSON_ERROR_CODES].sort(),
      );

      for (const testCase of cases) {
        const context = cleanPackageRoot(tempDir, testCase.name);
        testCase.setup(context);
        const report = expectJsonStdoutReport(
          runCli(["install", "--json"], context),
          {
            status: 1,
            check: "package-install",
            success: false,
          },
        );

        expect(report).toMatchObject({
          mode: "project",
          target: null,
          error: expect.stringContaining(testCase.expectedError),
          errorCode: testCase.expectedCode,
        });
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("rejects null package manifest object maps in install JSON", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-package-manifest-null-maps-"),
    );

    try {
      const cases: Array<{
        name: string;
        manifestPatch: Record<string, unknown>;
        expectedCode: string;
        expectedError: string;
      }> = [
        {
          name: "null-dependencies",
          manifestPatch: { dependencies: null },
          expectedCode: "BPL_PACKAGE_MANIFEST_DEPENDENCIES_INVALID",
          expectedError: "Invalid 'dependencies' field",
        },
        {
          name: "null-dev-dependencies",
          manifestPatch: { devDependencies: null },
          expectedCode: "BPL_PACKAGE_MANIFEST_DEPENDENCIES_INVALID",
          expectedError: "Invalid 'devDependencies' field",
        },
        {
          name: "null-scripts",
          manifestPatch: { scripts: null },
          expectedCode: "BPL_PACKAGE_MANIFEST_SCRIPTS_INVALID",
          expectedError: "Invalid 'scripts' field",
        },
        {
          name: "null-bin",
          manifestPatch: { bin: null },
          expectedCode: "BPL_PACKAGE_MANIFEST_BIN_INVALID",
          expectedError: "Invalid 'bin' field",
        },
      ];

      for (const testCase of cases) {
        const context = cleanPackageRoot(tempDir, testCase.name);
        writeFileSync(
          join(context.cwd, "bpl.json"),
          JSON.stringify({
            name: testCase.name,
            version: "1.0.0",
            ...testCase.manifestPatch,
          }),
        );

        const report = expectJsonStdoutReport(
          runCli(["install", "--json"], context),
          {
            status: 1,
            check: "package-install",
            success: false,
          },
        );

        expect(report).toMatchObject({
          mode: "project",
          target: null,
          error: expect.stringContaining(testCase.expectedError),
          errorCode: testCase.expectedCode,
        });
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("surfaces malformed dependency source codes from lockfile JSON commands before mutation", () => {
    const tempDir = mkdtempSync(
      join(tmpdir(), "bpl-package-dependency-source-json-"),
    );

    try {
      const cases: Array<{
        name: string;
        args: string[];
        expectedPayload: Record<string, unknown>;
      }> = [
        {
          name: "install-malformed-source",
          args: ["install", "--json"],
          expectedPayload: {
            mode: "project",
            target: null,
            global: false,
            locked: false,
            update: false,
            repairLock: false,
          },
        },
        {
          name: "install-update-malformed-source",
          args: ["install", "--update", "--json"],
          expectedPayload: {
            mode: "project",
            target: null,
            global: false,
            locked: false,
            update: true,
            repairLock: false,
          },
        },
        {
          name: "lock-malformed-source",
          args: ["lock", "--json"],
          expectedPayload: {
            mode: "project",
            target: null,
            global: false,
            locked: false,
            update: true,
            repairLock: false,
          },
        },
      ];

      for (const testCase of cases) {
        const context = cleanPackageRoot(tempDir, testCase.name);
        writeFileSync(
          join(context.cwd, "bpl.json"),
          JSON.stringify({
            name: testCase.name,
            version: "1.0.0",
            dependencies: {
              "malformed-json-source": "^01.0.0",
            },
          }),
        );

        const report = expectJsonStdoutReport(
          runCli(testCase.args, context),
          {
            status: 1,
            check: "package-install",
            success: false,
          },
        );

        expect(report).toMatchObject({
          ...testCase.expectedPayload,
          error: expect.stringContaining(
            "Invalid 'dependencies' source for malformed-json-source",
          ),
          errorCode: "BPL_PACKAGE_MANIFEST_DEPENDENCIES_INVALID",
        });
        expect(existsSync(join(context.cwd, "bpl_modules"))).toBe(false);
        expect(existsSync(join(context.cwd, "bpl.lock"))).toBe(false);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("emits package-install JSON from the lock alias for valid manifests", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-package-lock-json-"));

    try {
      const context = cleanPackageRoot(tempDir, "lock-valid-source");
      writeFileSync(
        join(context.cwd, "bpl.json"),
        JSON.stringify({ name: "lock-valid-source", version: "1.0.0" }),
      );

      const report = expectJsonStdoutReport(runCli(["lock", "--json"], context), {
        status: 0,
        check: "package-install",
        success: true,
      });

      expect(report).toMatchObject({
        mode: "project",
        target: null,
        global: false,
        locked: false,
        update: true,
        repairLock: false,
      });
      expect(
        JSON.parse(readFileSync(join(context.cwd, "bpl.lock"), "utf8")),
      ).toEqual({
        lockfileVersion: 1,
        packages: {},
      });
      expect(existsSync(join(context.cwd, "bpl_modules"))).toBe(false);
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

function symlinkedLocalPackageRoot(root: string, name: string): CommandContext {
  const context = cleanPackageRoot(root, name);
  const realPackageDir = join(root, `${name}-real-bpl-modules`);
  mkdirSync(realPackageDir);
  symlinkSync(realPackageDir, join(context.cwd, "bpl_modules"), "dir");
  return context;
}

function globalPackageParentFileRoot(
  root: string,
  name: string,
): CommandContext {
  const context = cleanPackageRoot(root, name);
  writeFileSync(join(String(context.env.HOME), ".bpl"), "not a directory");
  return context;
}

function globalPackageParentSymlinkRoot(
  root: string,
  name: string,
): CommandContext {
  const context = cleanPackageRoot(root, name);
  const realBplHome = join(root, `${name}-real-bpl-home`);
  mkdirSync(realBplHome);
  symlinkSync(realBplHome, join(String(context.env.HOME), ".bpl"), "dir");
  return context;
}

function duplicateInstalledPackageRoot(
  root: string,
  name: string,
  packageName: string,
): CommandContext & { duplicatePaths: string[] } {
  const context = cleanPackageRoot(root, name);
  writeFileSync(
    join(context.cwd, "bpl.json"),
    JSON.stringify({ name: `${name}-project`, version: "1.0.0" }),
  );

  const duplicatePaths = ["a", "b"].map((suffix) =>
    join(context.cwd, "bpl_modules", `${packageName}-${suffix}`),
  );

  for (const packageDir of duplicatePaths) {
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, "bpl.json"),
      JSON.stringify({ name: packageName, version: "1.0.0", main: "index.bpl" }),
    );
    writeFileSync(join(packageDir, "index.bpl"), "export value;");
  }

  return { ...context, duplicatePaths };
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

function lockedVerificationFailureRoot(root: string): CommandContext {
  const context = projectManifestRoot(root, "locked-json-failure-project");
  const packageName = "locked-json-failure";
  const packageDir = join(context.cwd, "bpl_modules", packageName);
  const sourcePath = join(context.cwd, `${packageName}-1.0.0.tgz`);

  mkdirSync(packageDir, { recursive: true });
  writeFileSync(sourcePath, "reachable lock source");
  writeFileSync(
    join(packageDir, "bpl.json"),
    JSON.stringify({ name: packageName, version: "1.0.0" }),
  );
  writeFileSync(join(packageDir, "index.bpl"), "export actual;\n");
  writeFileSync(
    join(context.cwd, "bpl.lock"),
    JSON.stringify(
      {
        lockfileVersion: 1,
        packages: {
          [packageName]: {
            version: "1.0.0",
            source: sourcePath,
            hash: "definitely-not-the-installed-package-hash",
          },
        },
      },
      null,
      2,
    ),
  );

  return context;
}
